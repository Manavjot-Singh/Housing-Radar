#!/usr/bin/env python3
"""Build every data file the Housing Radar needs for any German municipality.

    python scripts/build_municipality.py --name "Celle"
    python scripts/build_municipality.py --ags 08416041 --install

It finds the datasets online, cuts them to the municipality, converts them to the exact
format of src/data/*.json and checks the result against what the app expects.

Every layer falls back through tiers (official -> national -> OpenStreetMap -> empty) and
manifest.json plus the app's Sources page record which tier each layer really came from.
Your own files always win, see the --*-file options. Details: scripts/README-municipality.md

Output goes to data/municipalities/<slug>/ . Only --install copies it into src/data/ .
Requires: pip install numpy pandas scipy shapely pyproj geopandas pyogrio openpyxl
"""
import argparse
import hashlib
import json
import math
import re
import shutil
import sys
import time
import unicodedata
import urllib.error
import warnings
import zipfile
from collections import defaultdict
from datetime import date
from pathlib import Path
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

import numpy as np
import pandas as pd
import pyproj
import shapely
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import dijkstra
from scipy.spatial import cKDTree
from shapely.geometry import LineString, MultiPoint, MultiPolygon, Polygon, box, mapping, shape
from shapely.ops import polygonize, transform, unary_union

warnings.filterwarnings("ignore", category=DeprecationWarning)  # shapely.ops.transform

ROOT = Path(__file__).resolve().parents[1]
CACHE = Path.home() / ".cache" / "housing-radar"
UA = {"User-Agent": "HousingRadar-municipality-builder/1.0"}
TODAY = date.today().strftime("%d.%m.%Y")

# Must stay identical to src/lib/radar.ts. Tile indices may be negative, so these constants
# work nationwide; tiles are ~500 m tall everywhere and 450-560 m wide depending on latitude.
LON0, LAT0, DLON, DLAT = 10.30, 53.10, 0.0075, 0.0045

ZENSUS_URL = "https://www.destatis.de/static/DE/zensus/gitterdaten/"
ZENSUS = {
    "bev": ("Zensus2022_Bevoelkerungszahl.zip", "Bevoelkerungszahl_100m-Gitter.csv"),
    "wf": ("Durchschnittliche_Wohnflaeche_je_Bewohner_in_Gitterzellen.zip", "Flaeche_je_Bewohner_100m-Gitter.csv"),
    "ls": ("Leerstandsquote_in_Gitterzellen.zip", "Leerstandsquote_100m-Gitter.csv"),
    "a65": ("Anteil_ab_65-jaehrige_in_Gitterzellen.zip", "Anteil_ueber_65_100m-Gitter.csv"),
    "geb": ("Gebaeude_nach_Anzahl_der_Wohnungen_im_Gebaeude.zip", "Gebaeude_nach_Anzahl_der_Wohnungen_100m-Gitter.csv"),
    "rm": ("Wohnungen_nach_Zahl_der_Raeume.zip", "Wohnungen_nach_Zahl_der_Raeume_100m-Gitter.csv"),
}
OVERPASS = ["https://lz4.overpass-api.de/api/interpreter", "https://overpass-api.de/api/interpreter",
            "https://z.overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter",
            "https://overpass.private.coffee/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter"]
OVERPASS_DEADLINE = 900  # seconds per query, so an outage ends in a clear message and not a hang
NI_WFS = "https://www.umweltkarten-niedersachsen.de/geoserver/SchutzgebieteNI/wfs"
NI_FLOOD = "https://www.umweltkarten-niedersachsen.de/arcgis/rest/services/Hochwasserschutz_WFS/MapServer/{}/query"
NI_ALKIS = "https://hausumringe-nie.s3.eu-de.cloud-object-storage.appdomain.cloud/gebaeude-ni.zip"
BFN_WFS = "https://geodienste.bfn.de/ogc/wfs/schutzgebiet"
BFG_FLOOD = ("https://geoportal.bafg.de/arcgis3/rest/services/nHWGK_HWRK_live/"
             + quote("Grenzen_der_Überflutungsgebiete_RW_M") + "/MapServer/0/query")
PLANDIGITAL = "https://testportal-plandigital.de/ows/{}/fplan"

STATES = {"01": "Schleswig-Holstein", "02": "Hamburg", "03": "Niedersachsen", "04": "Bremen",
          "05": "Nordrhein-Westfalen", "06": "Hessen", "07": "Rheinland-Pfalz", "08": "Baden-Württemberg",
          "09": "Bayern", "10": "Saarland", "11": "Berlin", "12": "Brandenburg",
          "13": "Mecklenburg-Vorpommern", "14": "Sachsen", "15": "Sachsen-Anhalt", "16": "Thüringen"}

OPTIONAL = ("amenities", "buildings", "landuse", "nature", "flood", "fnp", "commercial")
RADIUS = {"shop": 600, "doc": 600, "pt": 400, "bakery": 600}
BIT = {"shop": 1, "doc": 2, "pt": 4, "bakery": 8}
BREAK_FIELDS = {"wohnflaecheProKopf": (2, 0), "leerstandsquote": (3, 1), "anteil65": (4, 0), "efhAnteil": (5, 0), "raeumeProKopf": (6, 2)}

to3035 = pyproj.Transformer.from_crs(4326, 3035, always_xy=True).transform
to4326 = pyproj.Transformer.from_crs(3035, 4326, always_xy=True).transform
to_m = pyproj.Transformer.from_crs(4326, 25832, always_xy=True).transform
to_w = pyproj.Transformer.from_crs(25832, 4326, always_xy=True).transform


def log(*a):
    print(*a, flush=True)


def warn(*a):
    print("  ! ", *a, flush=True)


# ------------------------------------------------------------------ downloads
def http(url, data=None, timeout=120, retries=3):
    for i in range(retries):
        try:
            with urlopen(Request(url, data=data, headers=UA), timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code in (400, 401, 403, 404) or i == retries - 1:
                raise
            time.sleep(5 * (i + 1))
        except OSError:
            if i == retries - 1:
                raise
            time.sleep(5 * (i + 1))


def http_json(url, data=None, timeout=120, retries=3):
    return json.loads(http(url, data, timeout, retries))


def download(url, path):
    if path.exists() and path.stat().st_size > 0:
        return path
    path.parent.mkdir(parents=True, exist_ok=True)
    log(f"  downloading {path.name} ...")
    tmp = path.with_suffix(path.suffix + ".part")
    with urlopen(Request(url, headers=UA), timeout=120) as r, open(tmp, "wb") as f:
        shutil.copyfileobj(r, f, 1 << 20)
    tmp.replace(path)
    return path


def overpass(query, refresh=False):
    """Overpass is often overloaded: rotate mirrors, back off, and cache each answer."""
    path = CACHE / "overpass" / (hashlib.sha1(query.encode()).hexdigest() + ".json")
    if path.exists() and not refresh:
        return json.loads(path.read_text(encoding="utf-8"))
    last, started = None, time.time()
    for attempt in range(6):
        for url in OVERPASS:
            if time.time() - started > OVERPASS_DEADLINE:
                raise RuntimeError(f"OpenStreetMap servers are not answering ({str(last)[:80]})")
            try:
                d = http_json(url, urlencode({"data": query}).encode(), timeout=330, retries=1)
                remark = d.get("remark", "")
                if "runtime error" in remark or "Query timed out" in remark:  # a partial answer, not data
                    raise RuntimeError(remark)
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(json.dumps(d), encoding="utf-8")
                return d
            except Exception as e:  # noqa: BLE001
                last = e
        wait = 30 * (attempt + 1)
        log(f"  Overpass busy ({str(last)[:80]}), retrying in {wait}s")
        time.sleep(wait)
    raise RuntimeError(f"OpenStreetMap servers are not answering ({str(last)[:80]})")


# ------------------------------------------------------------------ geometry helpers
def ring(pts):
    p = [(q["lon"], q["lat"]) for q in pts]
    return p if len(p) >= 4 else None


def relation_polygon(el):
    """Assembles an OSM multipolygon, including members split over several ways."""
    def part(roles):
        lines = [LineString([(p["lon"], p["lat"]) for p in m["geometry"]]) for m in el.get("members", [])
                 if m["type"] == "way" and m.get("role") in roles and len(m.get("geometry") or []) >= 2]
        return unary_union(list(polygonize(unary_union(lines)))) if lines else Polygon()
    return part(("outer", "")).difference(part(("inner",))).buffer(0)


def element_polygon(el):
    try:
        if el["type"] == "way" and el.get("geometry"):
            r = ring(el["geometry"])
            return Polygon(r).buffer(0) if r else None
        if el["type"] == "relation":
            return relation_polygon(el)
    except Exception:  # noqa: BLE001
        return None
    return None


def polygons_only(g):
    if g.is_empty:
        return Polygon()
    if isinstance(g, (Polygon, MultiPolygon)):
        return g
    parts = [p for p in getattr(g, "geoms", []) if isinstance(p, (Polygon, MultiPolygon))]
    return unary_union(parts) if parts else Polygon()


def read_user_polygons(path, name_field=None):
    """Any GIS file (GeoJSON, Shapefile, GeoPackage, zip) -> [(name, WGS84 geometry)]."""
    import geopandas as gpd
    gdf = gpd.read_file(path)
    gdf = (gdf.set_crs(4326) if gdf.crs is None else gdf.to_crs(4326))
    gdf = gdf[gdf.geometry.notna()]
    names = gdf[name_field].astype(str).tolist() if name_field else [str(i) for i in range(len(gdf))]
    return list(zip(names, [g.buffer(0) for g in gdf.geometry]))


# ------------------------------------------------------------------ 1. municipality + districts
def resolve(args):
    if args.osm_id:
        el = overpass(f'[out:json][timeout:60];relation({int(args.osm_id)});out geom;')["elements"][0]
    elif args.ags:
        ags = args.ags.zfill(8)
        d = overpass(f'[out:json][timeout:60];relation["boundary"="administrative"]["de:amtlicher_gemeindeschluessel"="{ags}"];out geom;')
        el = [e for e in d["elements"] if str(e["tags"].get("admin_level")) in ("6", "7", "8")] or d["elements"]
        if not el:
            sys.exit(f"No municipality with AGS {ags} found in OpenStreetMap.")
        el = el[0]
    else:
        hits = http_json("https://nominatim.openstreetmap.org/search?" + urlencode(
            {"q": args.name, "countrycodes": "de", "format": "jsonv2", "limit": 8}))
        hits = [h for h in hits if h["osm_type"] == "relation" and h["category"] == "boundary"
                and h.get("addresstype") in ("city", "town", "village", "municipality")]
        if not hits:
            sys.exit(f'"{args.name}" not found. Try the 8-digit municipality key with --ags.')
        d = overpass(f'[out:json][timeout:60];relation({hits[0]["osm_id"]});out geom;')
        el = d["elements"][0]
        if len(hits) > 1:
            log("  other matches:", "; ".join(h["display_name"] for h in hits[1:4]), "- use --ags to pick one")
    t = el["tags"]
    ags = t.get("de:amtlicher_gemeindeschluessel")
    if not ags and t.get("de:regionalschluessel"):
        r = t["de:regionalschluessel"]
        ags = r[:5] + r[-3:]
    if not ags:
        sys.exit("OSM relation has no municipality key; pass it with --ags.")
    geom = relation_polygon(el)
    if geom.is_empty:
        sys.exit("Could not assemble the municipality boundary from OSM.")
    return dict(osm_id=el["id"], name=t["name"], ags=ags.zfill(8), state=ags.zfill(8)[:2], geom=geom)


def osm_districts(m):
    """Picks the OSM layer of sub-divisions that covers the municipality best."""
    # Bounding box, not map_to_area: Overpass has no precomputed area for some municipalities,
    # which silently returns nothing. Neighbours are filtered out below by real geometry.
    x0, y0, x1, y1 = m["geom"].bounds
    b = f"({y0},{x0},{y1},{x1})"
    q = f"""[out:json][timeout:180];
(relation["boundary"="administrative"]["admin_level"~"^(9|10|11)$"]["name"]{b};
 relation["place"~"^(suburb|quarter|borough)$"]["name"]{b};
 way["place"~"^(suburb|quarter|borough)$"]["name"]{b};);out geom;"""
    groups = defaultdict(dict)
    city_m = transform(to_m, m["geom"])
    for el in overpass(q)["elements"]:
        g = element_polygon(el)
        if g is None or g.is_empty:
            continue
        gm = polygons_only(transform(to_m, g))
        # area queries also return neighbours that merely touch the border
        if gm.is_empty or gm.intersection(city_m).area < 0.5 * gm.area:
            continue
        t = el["tags"]
        key = f"admin_level={t['admin_level']}" if t.get("boundary") == "administrative" else "place"
        groups[key].setdefault(t["name"], dict(id=el["id"], name=t["name"], geom=g, g3=transform(to3035, g), gm=gm))
    best, best_cover = None, 0
    for key, items in groups.items():
        if len(items) < 3:
            continue
        union = unary_union([d["gm"] for d in items.values()])
        cover = union.intersection(city_m).area / city_m.area
        overlap = sum(d["gm"].area for d in items.values()) / union.area
        log(f"  OSM {key}: {len(items)} districts, covers {cover:.0%}, overlap x{overlap:.2f}")
        if overlap < 1.1 and cover > best_cover:
            best, best_cover = (key, items), cover
    if not best:
        return [], 0
    # Cities mix levels (Lüneburg tags 15 districts level 10 and 2 level 9), so one level can leave
    # holes. Fill them with districts from other levels that mostly cover uncovered ground.
    key, items = best
    chosen = dict(items)
    extras = [d for k, v in groups.items() if k != key for n, d in v.items() if n not in chosen]
    for d in sorted(extras, key=lambda x: -x["gm"].area):
        taken = unary_union([x["gm"] for x in chosen.values()])
        if d["gm"].difference(taken).area >= 0.8 * d["gm"].area:
            chosen[d["name"]] = d
    if len(chosen) > len(items):
        log(f"  added {len(chosen) - len(items)} districts from other levels to fill gaps")
    union = unary_union([d["gm"] for d in chosen.values()])
    return chosen.values(), union.intersection(city_m).area / city_m.area


def voronoi_districts(m):
    """No mapped districts: approximate them around named places. Clearly flagged as approximate."""
    x0, y0, x1, y1 = m["geom"].bounds
    q = f"""[out:json][timeout:120];node["place"~"^(suburb|quarter|neighbourhood|village|hamlet|town|city)$"]["name"]({y0},{x0},{y1},{x1});out;"""
    prio = {"city": 0, "town": 0, "suburb": 1, "quarter": 1, "village": 2, "neighbourhood": 3, "hamlet": 3}
    shapely.prepare(m["geom"])
    els = [e for e in overpass(q)["elements"] if shapely.contains_xy(m["geom"], e["lon"], e["lat"])]
    els = sorted(els, key=lambda e: prio.get(e["tags"]["place"], 9))
    seen, pts = set(), []
    for e in els:
        if e["tags"]["name"] in seen:
            continue
        p = to_m(e["lon"], e["lat"])
        if all(np.hypot(p[0] - q2[0], p[1] - q2[1]) > 700 for _, q2 in pts):
            seen.add(e["tags"]["name"]); pts.append((e, p))
    pts = pts[:30]
    if len(pts) < 3:
        return []
    city_m = transform(to_m, m["geom"])
    cells = shapely.voronoi_polygons(MultiPoint([p for _, p in pts]), extend_to=city_m.buffer(5000))
    out = []
    for e, p in pts:
        c = next((c for c in cells.geoms if c.contains(shapely.Point(p))), None)
        g = c.intersection(city_m) if c is not None else None
        if g is None or g.is_empty:
            continue
        w = transform(to_w, g)
        out.append(dict(id=e["id"], name=e["tags"]["name"], geom=w, g3=transform(to3035, w), gm=g))
    return out


def load_districts(m, args, prov):
    if args.districts_file:
        if not args.district_name_field:
            sys.exit("--districts-file also needs --district-name-field")
        rows = read_user_polygons(args.districts_file, args.district_name_field)
        merged = defaultdict(list)
        for n, g in rows:
            merged[n].append(g)
        D = [dict(id=0, name=n, geom=unary_union(g)) for n, g in merged.items()]
        for d in D:
            d["g3"], d["gm"] = transform(to3035, d["geom"]), transform(to_m, d["geom"])
        prov["districts"] = ("official", f"Your file {Path(args.districts_file).name}")
        return D
    D, cover = osm_districts(m)
    D = list(D)
    if D and cover >= 0.5:
        prov["districts"] = ("osm", f"OpenStreetMap districts ({len(D)}, {cover:.0%} of the area)")
        city_m = transform(to_m, m["geom"])
        rest = polygons_only(city_m.difference(unary_union([d["gm"] for d in D]))).buffer(0)
        if rest.area > 0.01 * city_m.area:  # outer land without a district must not lose its residents
            g = transform(to_w, rest)
            D.append(dict(id=0, name="Übriges Stadtgebiet", geom=g, g3=transform(to3035, g), gm=rest))
            warn(f"OSM districts cover {cover:.0%}; the rest becomes the area 'Übriges Stadtgebiet'.")
            prov["districts"] = ("osm", f"OpenStreetMap districts ({len(D) - 1}) plus one area for the remaining {1 - cover:.0%}")
        return D
    D = voronoi_districts(m)
    if D:
        warn("No usable district boundaries in OSM: built APPROXIMATE areas around named places. "
             "Use --districts-file with the real boundaries if you can.")
        prov["districts"] = ("approximate", f"{len(D)} approximate areas around OSM place names")
        return D
    warn("No districts found: the whole municipality is one district, so district comparisons are empty.")
    prov["districts"] = ("approximate", "Whole municipality as a single area")
    g = m["geom"]
    return [dict(id=m["osm_id"], name=m["name"], geom=g, g3=transform(to3035, g), gm=transform(to_m, g))]


# ------------------------------------------------------------------ 2. census
def num(s):
    """'58,68' -> 58.68; the census marks missing values with an en dash."""
    return pd.to_numeric(s.astype(str).str.replace(",", ".", regex=False), errors="coerce")


def load_census(key, bounds):
    zip_name, member = ZENSUS[key]
    path = download(ZENSUS_URL + zip_name, CACHE / "zensus" / zip_name)
    minx, miny, maxx, maxy = bounds
    with zipfile.ZipFile(path) as z:
        name = next(n for n in z.namelist() if n.endswith(member))
        parts = []
        with z.open(name) as f:
            for chunk in pd.read_csv(f, sep=";", encoding="latin1", dtype=str, chunksize=500_000):
                x, y = chunk["x_mp_100m"].astype(float), chunk["y_mp_100m"].astype(float)
                parts.append(chunk[(x >= minx) & (x <= maxx) & (y >= miny) & (y <= maxy)])
    df = pd.concat(parts)
    df.index = list(zip(df["x_mp_100m"].astype(float), df["y_mp_100m"].astype(float)))
    return df


def build_cells(D):
    bounds = unary_union([d["g3"] for d in D]).bounds
    log("  reading 6 census tables ...")
    t = {k: load_census(k, bounds) for k in ZENSUS}
    keys = list(dict.fromkeys(list(t["bev"].index) + list(t["wf"].index) + list(t["geb"].index)))
    if not keys:
        sys.exit("The census has no cells in this area.")
    xs, ys = np.array([k[0] for k in keys]), np.array([k[1] for k in keys])
    owner = np.full(len(keys), -1)
    for i, d in enumerate(D):  # a cell belongs to the district containing its centre
        shapely.prepare(d["g3"])
        owner[(owner < 0) & shapely.contains_xy(d["g3"], xs, ys)] = i

    def col(df, c):
        s = num(df[c]) if len(df) else pd.Series(dtype=float)
        return {k: (None if pd.isna(v) else float(v)) for k, v in zip(df.index, s)}
    ew, wf, ls, o65 = col(t["bev"], "Einwohner"), col(t["wf"], "durchschnFlaechejeBew"), col(t["ls"], "Leerstandsquote"), col(t["a65"], "AnteilUeber65")
    gc = ["1_Wohnung", "2_Wohnungen", "3bis6_Wohnungen", "7bis12_Wohnungen", "13undmehr_Wohnungen"]
    rc = ["1Raum", "2Raeume", "3Raeume", "4Raeume", "5Raeume", "6Raeume", "7undmehrRaeume"]
    geb = {c: col(t["geb"], c) for c in gc}
    rm = {c: col(t["rm"], c) for c in rc}
    in_geb, in_rm = set(t["geb"].index), set(t["rm"].index)

    cells, agg = [], {d["name"]: dict(ew=0, n=0, w=[0, 0], l=[0, 0], o=[0, 0], r=[0, 0], gt=0, gk=0) for d in D}
    for i, k in enumerate(keys):
        if owner[i] < 0:
            continue
        dn = D[owner[i]]["name"]
        e = ew.get(k) or 0
        w, l, o = wf.get(k), ls.get(k), o65.get(k)
        efh, gt, gk, rooms = None, 0, 0, None
        if k in in_geb:
            parts = [geb[c].get(k) or 0 for c in gc]
            gt = sum(parts)  # parts are perturbed, so their sum beats the published total
            if gt:
                gk = parts[0] + parts[1]
                efh = round(gk / gt * 100)
        if k in in_rm and e > 0:
            vals = [rm[c].get(k) or 0 for c in rc]
            if sum(vals):
                rooms = sum((j + 1) * v for j, v in enumerate(vals)) / e
                rooms = None if rooms > 6 else rooms
        lon, lat = to4326(*k)
        cells.append([round(lon, 5), round(lat, 5), int(e) if e else None, w, l, o, efh, round(rooms, 2) if rooms else None, 0, dn])
        a = agg[dn]
        a["n"] += 1
        a["gt"] += gt; a["gk"] += gk
        if e:
            a["ew"] += e
            for f, v in (("w", w), ("l", l), ("o", o), ("r", rooms)):
                if v is not None:
                    a[f][0] += v * e; a[f][1] += e
    return cells, agg


# ------------------------------------------------------------------ 3. amenities + walking
def fetch_amenities(bbox):
    q = f"""[out:json][timeout:240];(
 nwr["shop"~"^(supermarket|convenience|bakery|pastry)$"]{bbox};
 nwr["amenity"~"^(doctors|clinic)$"]{bbox};
 nwr["healthcare"="doctor"]{bbox};
 node["highway"="bus_stop"]{bbox};
 nwr["railway"~"^(station|halt)$"]{bbox};);out center;"""
    cat = {"shop": [], "doc": [], "pt": [], "bakery": []}
    for e in overpass(q)["elements"]:
        t = e.get("tags", {})
        lon = e.get("lon") or e.get("center", {}).get("lon")
        lat = e.get("lat") or e.get("center", {}).get("lat")
        if lon is None:
            continue
        p = [round(lon, 5), round(lat, 5)]
        if t.get("shop") in ("supermarket", "convenience"):
            cat["shop"].append(p)
        elif t.get("shop") in ("bakery", "pastry"):
            cat["bakery"].append(p)
        elif t.get("amenity") in ("doctors", "clinic") or t.get("healthcare") == "doctor":
            cat["doc"].append(p)
        elif t.get("highway") == "bus_stop" or t.get("railway") in ("station", "halt"):
            cat["pt"].append(p)
    return cat


def walking_reach(cells, pts, bbox):
    """Same method as walking_reach.py: snap to the path network, then shortest path."""
    q = f"""[out:json][timeout:280];way["highway"]["highway"!~"^(motorway|motorway_link|trunk|trunk_link|construction|proposed)$"]["foot"!~"^(no|private)$"]["access"!~"^(no|private)$"]{bbox};(._;>;);out skel;"""
    el = overpass(q)["elements"]
    nodes = [e for e in el if e["type"] == "node"]
    idx = {e["id"]: i for i, e in enumerate(nodes)}
    lons, lats = np.array([e["lon"] for e in nodes]), np.array([e["lat"] for e in nodes])
    xy = np.column_stack(to3035(lons, lats))
    a, b = [], []
    for e in el:
        if e["type"] == "way":
            n = [idx[i] for i in e["nodes"] if i in idx]
            a += n[:-1]; b += n[1:]
    a, b = np.array(a), np.array(b)
    w = np.hypot(*(xy[a] - xy[b]).T)
    N = len(xy)
    tree = cKDTree(xy)
    cxy = np.column_stack(to3035(np.array([c[0] for c in cells]), np.array([c[1] for c in cells])))
    csnap, cnode = tree.query(cxy)
    masks = np.zeros(len(cells), dtype=int)
    for k, r in RADIUS.items():
        if not pts[k]:
            warn(f"No '{k}' amenities mapped in OSM here: that part of the score stays 0.")
            continue
        p = np.column_stack(to3035(*np.array(pts[k]).T))
        s, nd = tree.query(p)
        rows = np.concatenate([a, b, np.full(len(nd), N)])
        cols = np.concatenate([b, a, nd])
        G = coo_matrix((np.concatenate([w, w, s + 0.01]), (rows, cols)), shape=(N + 1, N + 1)).tocsr()
        d = dijkstra(G, directed=True, indices=N, limit=r + 200)
        masks[d[cnode] + csnap <= r] += BIT[k]
    agg = {}
    for c, m in zip(cells, masks):
        c[8] = int(m)
        if c[2]:
            g = agg.setdefault(c[9], [0, 0])
            g[0] += bin(c[8]).count("1") * c[2]; g[1] += c[2]
    return agg


# ------------------------------------------------------------------ 4. buildings
def alkis_ni(D, bbox_m):
    import geopandas as gpd
    path = download(NI_ALKIS, CACHE / "alkis" / "gebaeude-ni.zip")
    log("  reading ALKIS footprints ...")
    gdf = gpd.read_file(path, bbox=bbox_m, engine="pyogrio")
    return gdf.to_crs(25832)


def building_stats(D, m, args, prov, osm_elements):
    """Returns {district: stats}. A building counts for the district containing its centroid."""
    import geopandas as gpd
    minx, miny, maxx, maxy = unary_union([d["gm"] for d in D]).bounds
    gdf, func = None, None
    if args.buildings_file:
        gdf = gpd.read_file(args.buildings_file, bbox=(minx, miny, maxx, maxy) if str(args.buildings_file).lower().endswith(".gpkg") else None).to_crs(25832)
        func = args.buildings_function_field
        prov["buildings"] = ("official", f"Your file {Path(args.buildings_file).name}")
    elif m["state"] == "03" and not args.osm_buildings:
        try:
            gdf = alkis_ni(D, (minx, miny, maxx, maxy))
            func = next((c for c in gdf.columns if c.upper() in ("GFK", "GEBFKT", "GEBAEUDEFK", "FUNKTION")), None)
            prov["buildings"] = ("official", "ALKIS Hausumringe Niedersachsen (LGLN)")
        except Exception as e:  # noqa: BLE001
            warn(f"ALKIS download failed ({e}); using OSM buildings.")
    if gdf is None:
        rows = []
        for e in osm_elements:
            if "building" in e.get("tags", {}):
                g = element_polygon(e)
                if g is not None and not g.is_empty:
                    rows.append((e["tags"]["building"], transform(to_m, g)))
        gdf = gpd.GeoDataFrame({"kind": [r[0] for r in rows]}, geometry=[r[1] for r in rows], crs=25832)
        func = "kind"
        prov["buildings"] = ("osm", f"OpenStreetMap buildings ({len(gdf)})")
        if m["state"] != "03":
            warn(f"Using OSM buildings. For official counts get the ALKIS footprints of {STATES[m['state']]} and pass --buildings-file.")
    pts = gdf.geometry.representative_point()
    xs, ys, areas = pts.x.values, pts.y.values, gdf.geometry.area.values
    res = None
    if func and func in gdf.columns:
        v = gdf[func].astype(str).str.lower()
        res = (v.str.match(r"^(residential|house|detached|apartments|terrace|semidetached_house|bungalow|dormitory|31001_1\d{3}$|1\d{3}(\.0)?$)")).values
    out, total = {}, 0
    assigned = np.zeros(len(gdf), dtype=bool)
    for d in D:
        shapely.prepare(d["gm"])
        mask = shapely.contains_xy(d["gm"], xs, ys) & ~assigned
        assigned |= mask
        total += int(mask.sum())
        fl = float(areas[mask].sum())
        out[d["name"]] = dict(gebaeude=int(mask.sum()), grundflaecheM2=round(fl),
                              wohnGrundflaecheM2=round(float(areas[mask & res].sum())) if res is not None else 0,
                              bebautAnteil=round(fl / d["gm"].area * 100, 1))
    return out


# ------------------------------------------------------------------ 5. exclusion areas
def clip(geoms, city):
    geoms = [g.buffer(0) for g in geoms if g is not None and not g.is_empty]
    return polygons_only(unary_union(geoms).intersection(city)) if geoms else Polygon()


def from_lonlat(features, city):
    """Some services return lat/lon order; if nothing overlaps the city, swap the axes and retry."""
    gs = [shape(f["geometry"]) for f in features if f.get("geometry")]
    a = clip([transform(to_m, g) for g in gs], city)
    if a.is_empty and gs:
        swap = lambda x, y, z=None: (y, x)  # noqa: E731
        a = clip([transform(to_m, transform(swap, g)) for g in gs], city)
    return a


def wfs_ni(typ, bbox):
    return http_json(NI_WFS + "?" + urlencode({
        "service": "WFS", "version": "2.0.0", "request": "GetFeature", "typeNames": typ,
        "bbox": f"{bbox[0]},{bbox[1]},{bbox[2]},{bbox[3]},EPSG:4326", "outputFormat": "application/json"}), timeout=180)["features"]


def wfs_bfn(layer, city):
    minx, miny, maxx, maxy = city.bounds
    d = http_json(BFN_WFS + "?" + urlencode({
        "service": "WFS", "version": "2.0.0", "request": "GetFeature", "typeNames": f"schutzgebiet:{layer}",
        "srsName": "urn:ogc:def:crs:EPSG::25832", "bbox": f"{minx},{miny},{maxx},{maxy},urn:ogc:def:crs:EPSG::25832",
        "outputFormat": "GEOJSON"}), timeout=180)
    return d.get("features", [])


def protected(m, city, bbox, args, prov):
    """Returns (nsg geometry, lsg geometry, nsg feature list for naturschutzgebiete.json)."""
    def named(features, default):
        out = []
        for f in features:
            p = f.get("properties", {})
            nm = p.get("sitename_name_1") or p.get("NAME") or p.get("name") or default
            out.append((nm, f))
        return out

    def geo_features(names_geoms):
        return [(n, {"geometry": mapping(g)}) for n, g in names_geoms]

    def osm_protected():
        """Last resort: mapped nature reserves and IUCN class 5 landscape areas."""
        ob = f"({bbox[1]},{bbox[0]},{bbox[3]},{bbox[2]})"
        els = overpass(f"""[out:json][timeout:180];(way["leisure"="nature_reserve"]{ob};relation["leisure"="nature_reserve"]{ob};
 way["boundary"="protected_area"]["protect_class"="5"]{ob};relation["boundary"="protected_area"]["protect_class"="5"]{ob};);out geom;""")["elements"]
        nsg_out, lsg_out = [], []
        for e in els:
            g = element_polygon(e)
            if g is not None and not g.is_empty:
                (nsg_out if e["tags"].get("leisure") == "nature_reserve" else lsg_out).append((e["tags"].get("name", "Schutzgebiet"), g))
        return geo_features(nsg_out), geo_features(lsg_out)

    # services differ in coordinates: the state WFS and OSM give degrees, BfN gives metres
    nsg_f, lsg_f = [], []
    nsg_deg = lsg_deg = True
    if args.nsg_file:
        nsg_f = geo_features([("Naturschutzgebiet", g) for _, g in read_user_polygons(args.nsg_file)])
        prov["nature"] = ("official", f"Your file {Path(args.nsg_file).name}")
    if m["state"] == "03" and not args.nsg_file:
        try:
            f = wfs_ni("SchutzgebieteNI:ProtectedSites_IUCN_HabitatSpeciesManagementArea_Surface", bbox)
            nsg_f = named([x for x in f if x["properties"].get("d_3_designation") == "NSG"], "Naturschutzgebiet")
            f = wfs_ni("SchutzgebieteNI:ProtectedSites_IUCN_ProtectedLandscapeOrSeascape_Surface", bbox)
            lsg_f = named([x for x in f if x["properties"].get("d_3_designation") in ("LSG", None) or "Landschaftsschutz" in (x["properties"].get("sitename_name_1") or "")], "Landschaftsschutzgebiet")
            prov["nature"] = ("official", "NLWKN WFS Niedersachsen")
        except Exception as e:  # noqa: BLE001
            warn(f"NLWKN WFS failed ({str(e)[:70]}); trying the national BfN service.")
    if "nature" not in prov or (args.nsg_file and not lsg_f):
        try:
            if not nsg_f:
                nsg_f, nsg_deg = named(wfs_bfn("Naturschutzgebiete", city), "Naturschutzgebiet"), False
            lsg_f, lsg_deg = named(wfs_bfn("Landschaftsschutzgebiete", city), "Landschaftsschutzgebiet"), False
            prov.setdefault("nature", ("national", "Bundesamt für Naturschutz (BfN) WFS"))
        except Exception as e:  # noqa: BLE001
            warn(f"BfN WFS failed ({str(e)[:70]}); trying OpenStreetMap.")
            try:
                osm_n, osm_l = osm_protected()
                nsg_f, lsg_f, nsg_deg, lsg_deg = (nsg_f or osm_n), osm_l, True, True
                prov.setdefault("nature", ("osm", "OpenStreetMap protected areas; may be incomplete") if nsg_f or lsg_f else ("missing", "Not available"))
            except Exception as e2:  # noqa: BLE001
                warn(f"No nature protection layer ({str(e2)[:70]}): feature turned off.")
                prov.setdefault("nature", ("missing", "Not available"))
    nsg = from_lonlat([f for _, f in nsg_f], city) if nsg_deg else clip([shape(f["geometry"]) for _, f in nsg_f], city)
    lsg = from_lonlat([f for _, f in lsg_f], city) if lsg_deg else clip([shape(f["geometry"]) for _, f in lsg_f], city)
    feats = []
    for nm, f in nsg_f:
        g = shape(f["geometry"]).buffer(0)
        g = transform(to_m, g) if nsg_deg else g
        if nsg_deg and g.intersection(city).is_empty:
            g = transform(to_m, transform(lambda x, y, z=None: (y, x), shape(f["geometry"]).buffer(0)))
        c = polygons_only(g.intersection(city))
        if not c.is_empty:
            feats.append({"type": "Feature", "geometry": mapping(transform(to_w, c.simplify(1.5, preserve_topology=True))),
                          "properties": {"name": nm, "designation": "NSG", "sourceId": ""}})
    return nsg, lsg, feats


def esri_polygon(rings):
    """Esri rings: clockwise = outer boundary, counter-clockwise = hole."""
    outer, holes = [], []
    for r in rings:
        if len(r) >= 4:
            (holes if shapely.LinearRing(r).is_ccw else outer).append(Polygon(r).buffer(0))
    g = unary_union(outer) if outer else Polygon()
    return g.difference(unary_union(holes)) if holes and not g.is_empty else g


def esri_query(url, bbox, oid="OBJECTID"):
    """All polygons in the box. Uses f=json because not every server offers geojson, and raises
    on error bodies: these servers answer HTTP 200 with an error, which must never read as 'no data'."""
    geoms, offset = [], 0
    while True:
        d = http_json(url + "?" + urlencode({
            "geometry": f"{bbox[0]},{bbox[1]},{bbox[2]},{bbox[3]}", "geometryType": "esriGeometryEnvelope", "inSR": 4326,
            "spatialRel": "esriSpatialRelIntersects", "outSR": 4326, "f": "json", "where": "1=1", "outFields": oid,
            "maxAllowableOffset": 0.00003, "resultOffset": offset, "resultRecordCount": 200}), timeout=240, retries=2)
        if "error" in d:
            raise RuntimeError(str(d["error"])[:200])
        got = d.get("features", [])
        geoms += [esri_polygon(f["geometry"]["rings"]) for f in got if f.get("geometry", {}).get("rings")]
        if not d.get("exceededTransferLimit") and len(got) < 200:
            return geoms
        offset += len(got)


def flood(m, city, bbox, args, prov):
    if args.flood_file:
        prov["flood"] = ("official", f"Your file {Path(args.flood_file).name}")
        return clip([transform(to_m, g) for _, g in read_user_polygons(args.flood_file)], city)
    geoms, legal_ok, legal_failed = [], 0, 0
    if m["state"] == "03":
        for lid in (39, 40):  # designated + provisionally secured
            try:
                geoms += esri_query(NI_FLOOD.format(lid), bbox)
                legal_ok += 1
            except Exception as e:  # noqa: BLE001
                legal_failed += 1
                warn(f"NLWKN flood layer {lid} failed ({str(e)[:70]}); adding the national BfG service.")
    if m["state"] != "03" or legal_failed:
        try:
            geoms += esri_query(BFG_FLOOD, bbox, oid="ESRI_OID")
            text = "HQ100 hazard areas reported to the EU (BfG); not the legal zones"
            prov["flood"] = ("national", f"Part legal zones (NLWKN), part {text}" if legal_ok else text)
        except Exception as e:  # noqa: BLE001
            warn(f"BfG flood service failed ({str(e)[:70]}).")
            if legal_ok:
                prov["flood"] = ("national", "Only part of the NLWKN legal flood zones")
            else:
                warn("No flood layer: blocks are NOT reduced for flooding.")
                prov["flood"] = ("missing", "Not available")
                return Polygon()
    else:
        prov["flood"] = ("official", "Legal flood zones, NLWKN Niedersachsen")
    g = clip([transform(to_m, x) for x in geoms], city)
    if g.is_empty:
        warn("The flood services returned no area inside this municipality. Check that this is plausible.")
    return g


def plan_land(m, city, args, prov):
    """Housing and mixed building land from the land-use plan (FNP)."""
    if args.fnp_file:
        prov["fnp"] = ("official", f"Your file {Path(args.fnp_file).name}")
        return clip([transform(to_m, g) for _, g in read_user_polygons(args.fnp_file)], city)
    key = m["ags"].lstrip("0")
    try:
        txt = http(PLANDIGITAL.format(key) + "?" + urlencode({
            "Service": "WFS", "Version": "1.1.0", "Request": "GetFeature", "TypeName": "ms:fp_bebauungsflaeche_polygons",
            "outputFormat": "text/xml; subtype=gml/2.1.2", "srsName": "EPSG:4326"}), timeout=180, retries=2).decode("utf-8", "replace")

        def gring(s):
            return [(float(b), float(a)) for a, b in (p.split(",")[:2] for p in s.split())]
        polys = []
        for fm in txt.split("<gml:featureMember>")[1:]:
            art = re.search(r"<ms:allgartderbaulnutzung>(\d+)<", fm)
            if not art or art.group(1) not in ("1000", "2000"):
                continue
            for poly in re.findall(r"<gml:Polygon.*?</gml:Polygon>", fm, re.S):
                outer = re.search(r"<gml:outerBoundaryIs>.*?<gml:coordinates>(.*?)</gml:coordinates>", poly, re.S)
                inner = re.findall(r"<gml:innerBoundaryIs>.*?<gml:coordinates>(.*?)</gml:coordinates>", poly, re.S)
                polys.append(transform(to_m, Polygon(gring(outer.group(1)), [gring(i) for i in inner]).buffer(0)))
        g = clip(polys, city)
        if not g.is_empty:
            prov["fnp"] = ("official", "PlanDigital WFS (test portal)")
            return g
    except Exception:  # noqa: BLE001
        pass
    warn("No land-use plan found: 'planned housing land' stays empty. Pass --fnp-file if the city publishes one.")
    prov["fnp"] = ("missing", "No land-use plan available")
    return Polygon()


def fetch_landuse(bbox):
    b = bbox
    return overpass(f"""[out:json][timeout:280];
(way["landuse"~"^(forest|cemetery|allotments|farmland|meadow|grass|greenfield|construction|brownfield|orchard)$"]{b};
 relation["landuse"~"^(forest|cemetery|allotments|farmland|meadow|grass|greenfield|construction|brownfield|orchard)$"]{b};
 way["amenity"="parking"]["parking"!~"^(underground|multi-storey)$"]{b};
 relation["amenity"="parking"]{b};
 way["leisure"~"^(park|pitch|sports_centre|stadium|golf_course|playground)$"]{b};
 relation["leisure"~"^(park|pitch|sports_centre|stadium|golf_course)$"]{b};
 way["natural"="wood"]{b};
 relation["natural"="wood"]{b};
 way["amenity"="grave_yard"]{b};);out geom;""")["elements"]


def fetch_buildings(bbox):
    return overpass(f'[out:json][timeout:280];(way["building"]{bbox};relation["building"]{bbox};);out geom;')["elements"]


def future_blocks(blocks, D, city, landuse, building_els, nsg, lsg, floodz, fnp):
    forest, cemetery, allot, parking, green, farm, unbuilt = [], [], [], [], [], [], []
    for el in landuse:
        t = el.get("tags", {})
        p = element_polygon(el)
        if p is None or p.is_empty:
            continue
        g = transform(to_m, p)
        if t.get("landuse") == "cemetery" or t.get("amenity") == "grave_yard":
            cemetery.append(g)
        elif t.get("landuse") == "allotments":
            allot.append(g)
        elif t.get("amenity") == "parking":
            parking.append(g)
        elif t.get("leisure"):
            green.append(g)
        elif t.get("landuse") == "forest" or t.get("natural") == "wood":
            forest.append(g)
        else:
            unbuilt.append(g)
            if t.get("landuse") == "farmland":
                farm.append(g)
    forest, cemetery, allot, parking, green, farm, unbuilt = (clip(x, city) for x in (forest, cemetery, allot, parking, green, farm, unbuilt))
    bld = []
    for e in building_els:
        p = element_polygon(e)
        if p is not None and not p.is_empty:
            bld.append(transform(to_m, p).buffer(0))
    bld = unary_union(bld) if bld else Polygon()
    reserve = fnp.intersection(unbuilt)
    excl = {"nsg": nsg, "lsg": lsg, "flood": floodz, "forest": forest, "cemetery": cemetery, "allot": allot, "parking": parking, "green": green}
    log("  exclusions km²:", {k: round(v.area / 1e6, 2) for k, v in excl.items()})
    all_excl = unary_union(list(excl.values()))
    dgeo = {d["name"]: d["gm"].buffer(0) for d in D}
    for g in (all_excl, bld, fnp, reserve, farm):
        shapely.prepare(g)

    def polys_only(g):
        if g["type"] != "GeometryCollection":
            return g if g["type"] in ("Polygon", "MultiPolygon") else None
        cs = [c for x in g["geometries"] for c in ([x["coordinates"]] if x["type"] == "Polygon" else x["coordinates"] if x["type"] == "MultiPolygon" else [])]
        return {"type": "MultiPolygon", "coordinates": cs} if cs else None

    out = []
    for n, b in enumerate(blocks):
        if n and n % 500 == 0:
            log(f"  {n}/{len(blocks)} blocks")
        dn, ix, iy = b[0].rsplit("|", 2)
        ix, iy = int(ix), int(iy)
        tile = transform(to_m, box(LON0 + ix * DLON, LAT0 + iy * DLAT, LON0 + (ix + 1) * DLON, LAT0 + (iy + 1) * DLAT))
        full = tile.intersection(dgeo[dn])
        if full.is_empty:
            continue
        rest = full.difference(all_excl)
        ps = [p for p in getattr(rest, "geoms", [rest]) if isinstance(p, Polygon) and p.area > 2000]
        rest = MultiPolygon(ps) if ps else Polygon()
        area = rest.area
        reasons = {k: round(full.intersection(v).area / full.area * 100) for k, v in excl.items()}
        res = rest.intersection(reserve) if area else Polygon()
        out.append({
            "id": b[0], "d": dn, "ew": b[1], "living": b[2], "vac": b[3],
            "cover": round(rest.intersection(bld).area / area * 100, 1) if area and not bld.is_empty else None,
            "freeHa": round(area / 1e4, 1), "exclPct": round((1 - area / full.area) * 100),
            "excl": {k: v for k, v in reasons.items() if v},
            "fnpHa": round(rest.intersection(fnp).area / 1e4, 1) if area else 0,
            "resHa": round(res.area / 1e4, 1),
            "farmPct": round(rest.intersection(farm).area / area * 100) if area else 0,
            "rg": polys_only(mapping(transform(to_w, res.simplify(3, preserve_topology=True)))) if res.area > 500 else None,
            "g": mapping(transform(to_w, rest.simplify(3, preserve_topology=True))) if area else None,
        })
    return out


# ------------------------------------------------------------------ 6. app files
def tile_of(c):
    """Same arithmetic as blockOf in src/lib/radar.ts. Python's // disagrees with JavaScript's
    Math.floor(a / b) when a cell sits exactly on a tile edge, which orphans that cell in the app."""
    return math.floor((c[0] - LON0) / DLON), math.floor((c[1] - LAT0) / DLAT)


def make_blocks(cells):
    groups = defaultdict(list)
    for c in cells:
        groups[(c[9], *tile_of(c))].append(c)

    def wmean(cs, i):
        den = sum(c[2] for c in cs if c[i] is not None and c[2])
        return round(sum(c[i] * c[2] for c in cs if c[i] is not None and c[2]) / den, 2) if den else None

    def cmean(cs, i):
        v = [c[i] for c in cs if c[i] is not None]
        return round(sum(v) / len(v), 2) if v else None
    out = []
    for (dn, ix, iy), cs in groups.items():
        ew = sum(c[2] or 0 for c in cs)
        vac = sum(c[2] or 0 for c in cs if c[4] is not None)
        out.append([f"{dn}|{ix}|{iy}", ew, wmean(cs, 3), wmean(cs, 4), wmean(cs, 5), cmean(cs, 6), wmean(cs, 7), cmean(cs, 8),
                    len(cs), round(vac / ew * 100) if ew else 0, dn])
    return sorted(out, key=lambda b: (b[10], b[0]))


def make_districts(D, agg, reach, bstats):
    a_ew = sum(a["ew"] for a in agg.values())
    w_sum, w_den = sum(a["w"][0] for a in agg.values()), sum(a["w"][1] for a in agg.values())
    city = round(w_sum / w_den, 1) if w_den else 0

    def r(pair, n=1):
        return round(pair[0] / pair[1], n) if pair[1] else None
    feats = []
    for d in D:
        a, b = agg[d["name"]], bstats[d["name"]]
        wfv = r(a["w"])
        g = reach.get(d["name"])
        feats.append({"type": "Feature", "geometry": mapping(d["geom"].simplify(0.0001)), "properties": {
            "name": d["name"], "osmId": d["id"], "einwohner": int(a["ew"]), "zellen": a["n"],
            "wohnflaecheProKopf": wfv, "leerstandsquote": r(a["l"]),
            "abweichung": round((wfv - city) / city * 100, 1) if wfv and city else None,
            "abdeckung": round(a["w"][1] / a["ew"] * 100) if a["ew"] else 0,
            "flaecheKm2": round(d["g3"].area / 1e6, 2),
            "gebaeude": b["gebaeude"], "bebautAnteil": b["bebautAnteil"], "wohnGrundflaecheM2": b["wohnGrundflaecheM2"],
            "anteil65": r(a["o"]), "abdeckung65": round(a["o"][1] / a["ew"] * 100) if a["ew"] else 0,
            "raeumeProKopf": r(a["r"], 2), "abdeckungRaeume": round(a["r"][1] / a["ew"] * 100) if a["ew"] else 0,
            "efhAnteil": round(a["gk"] / a["gt"] * 100, 1) if a["gt"] else None,
            "versorgung": round(g[0] / g[1], 2) if g and g[1] else None,
        }})
    return feats, city, int(a_ew)


def make_breaks(blocks, feats):
    """Colour classes at this city's quintiles: Lüneburg's fixed numbers would paint most places one colour."""
    out = {}
    for field, (i, nd) in BREAK_FIELDS.items():
        v = [b[i] for b in blocks if b[i] is not None and b[1] >= 10]
        if len(v) < 5:
            continue
        q = [round(float(x), nd) for x in np.percentile(v, [20, 40, 60, 80])]
        if all(x < y for x, y in zip(q, q[1:])):
            out[field] = q
    a = sorted(f["properties"]["bebautAnteil"] for f in feats)
    if len(a) >= 5:
        q = [round(float(x), 1) for x in np.percentile(a, [20, 40, 60, 80])]
        if all(x < y for x, y in zip(q, q[1:])):
            out["bebautAnteil"] = q
    e = sorted(f["properties"]["einwohner"] / f["properties"]["gebaeude"] for f in feats if f["properties"]["gebaeude"])
    if len(e) >= 5:
        q = [round(float(x), 2) for x in np.percentile(e, [20, 40, 60, 80])]
        if all(x < y for x, y in zip(q, q[1:])):
            out["einwohnerJeGebaeude"] = q
    return out


def make_thresholds(blocks):
    """Lüneburg's slider defaults, kept at the same position in each city's own values."""
    live = [b[2] for b in blocks if b[2] is not None and b[1] >= 10]
    vac = [b[3] for b in blocks if b[3] is not None and b[1] >= 10]
    out = {}
    if len(live) >= 5:
        out["living"] = int(min(70, max(30, round(float(np.percentile(live, 23))))))
    if len(vac) >= 5:
        out["vacancy"] = min(25.0, round(float(np.percentile(vac, 44)) * 2) / 2)
    return out


def commercial_layer(path, name, geom_by_name):
    """LeAn-style table with columns 'Straße' and 'Objektstatus'. Owner and contact columns are never read."""
    df = pd.read_csv(path, sep=None, engine="python", usecols=["Straße", "Objektstatus"]) if str(path).lower().endswith(".csv") \
        else pd.read_excel(path, usecols=["Straße", "Objektstatus"])
    agg = defaultdict(lambda: [0, 0, 0, 0])
    for _, r in df.iterrows():
        s = re.sub(r"\s+\d+\w*$", "", str(r["Straße"]).strip())
        a = agg[s]
        a[0] += 1
        st = r["Objektstatus"]
        a[1] += st == "Leerstand"; a[2] += st == "drohender Leerstand"; a[3] += st == "Nachnutzung vereinbart"
    out, votes = [], defaultdict(int)
    for s, v in sorted(agg.items()):
        time.sleep(1.1)  # Nominatim usage policy
        hit = http_json("https://nominatim.openstreetmap.org/search?" + urlencode({"q": f"{s}, {name}", "countrycodes": "de", "format": "jsonv2", "limit": 1}))
        if not hit:
            warn(f"Street not found: {s}")
            continue
        lon, lat = round(float(hit[0]["lon"]), 5), round(float(hit[0]["lat"]), 5)
        out.append([s, lon, lat, *[int(x) for x in v]])
        for n, g in geom_by_name.items():
            if g.contains(shapely.Point(lon, lat)):
                votes[n] += v[0]
    return out, (max(votes, key=votes.get) if votes else None)


TIER = {"official": ("amtlich", "official"), "national": ("bundesweit", "national"), "osm": ("OpenStreetMap", "OpenStreetMap"),
        "approximate": ("Näherung", "approximation"), "missing": ("nicht verfügbar", "not available"), "skipped": ("übersprungen", "skipped")}
OSM_URL = "https://www.openstreetmap.org/copyright"
# publisher, licence, url by the text recorded in prov
PROVIDERS = [
    ("ALKIS", "LGLN Niedersachsen", "CC-BY 4.0", "https://ni-lgln-opengeodata.hub.arcgis.com/pages/alkis-hausumringe"),
    ("NLWKN", "NLWKN Niedersachsen", "Datenlizenz Deutschland – Namensnennung 2.0", "https://www.umweltkarten-niedersachsen.de/"),
    ("BfN", "Bundesamt für Naturschutz", "siehe Metadaten des Anbieters", "https://geodienste.bfn.de/schutzgebiete"),
    ("BfG", "Bundesanstalt für Gewässerkunde", "siehe Metadaten des Anbieters", "https://geoportal.bafg.de/"),
    ("PlanDigital", "PlanDigital Niedersachsen", "siehe Metadaten des Anbieters", "https://numis.niedersachsen.de/"),
    ("OpenStreetMap", "OpenStreetMap-Mitwirkende", "ODbL 1.0", OSM_URL),
    ("OSM", "OpenStreetMap-Mitwirkende", "ODbL 1.0", OSM_URL),
    ("Your file", "Von der Stadt bereitgestellt", "Bedingungen der Stadt prüfen", ""),
]
LAYER_LABEL = {
    "districts": ("Stadtteilgrenzen", "District boundaries", "Stadtteil-Polygone", "District polygons", "Räumliche Bezugsebene aller Kennzahlen", "Spatial unit of all indicators"),
    "amenities": ("Versorgung und Wegenetz", "Amenities and path network", "Punkte, Wege", "Points, paths", "Supermärkte, Bäckereien, Arztpraxen, Haltestellen, Fußwege", "Supermarkets, bakeries, doctors, stops, footpaths"),
    "buildings": ("Gebäude", "Buildings", "Gebäudeumrisse", "Building outlines", "Gebäudezahl und Bebauungsdichte je Stadtteil, Bebauung je Block", "Building count and density per district, coverage per block"),
    "landuse": ("Landnutzung", "Land use", "Polygone", "Polygons", "Wald, Friedhöfe, Kleingärten, Parkplätze, Parks, Acker; von den Entwicklungsblöcken abgezogen", "Forest, cemeteries, allotments, car parks, parks, farmland; subtracted from development blocks"),
    "nature": ("Natur- und Landschaftsschutzgebiete", "Nature and landscape protection areas", "Polygone", "Polygons", "Von den Entwicklungsblöcken abgezogen", "Subtracted from development blocks"),
    "flood": ("Hochwasserflächen", "Flood areas", "Polygone", "Polygons", "Von den Entwicklungsblöcken abgezogen", "Subtracted from development blocks"),
    "fnp": ("Flächennutzungsplan", "Land-use plan", "Polygone", "Polygons", "Wohn- und gemischte Bauflächen je Block", "Housing and mixed building land per block"),
    "commercial": ("Gewerbeleerstand", "Commercial vacancy", "Straße", "Street", "Leere und gefährdete Gewerbeobjekte", "Vacant and at-risk commercial units"),
}


def source_rows(prov):
    """Only what this city really uses; missing or skipped layers are listed under limits instead."""
    rows = [{"name": "Zensus 2022 (100-m-Gitter)", "publisher": "Statistisches Bundesamt",
             "content": "Einwohner, Wohnfläche je Bewohner, Leerstandsquote, Anteil ab 65, Gebäude nach Wohnungszahl, Wohnungen nach Räumen",
             "level": "100-m-Gitter (EPSG:3035)", "licence": "Datenlizenz Deutschland – Namensnennung 2.0", "status": "Stichtag 15.05.2022",
             "url": "https://www.destatis.de/DE/Themen/Gesellschaft-Umwelt/Bevoelkerung/Zensus2022/_publikationen.html",
             "en": {"name": "Census 2022 (100 m grid)", "content": "Residents, living space per resident, vacancy rate, share 65+, buildings by dwellings, dwellings by rooms",
                    "level": "100 m grid (EPSG:3035)", "status": "Reference date 15 May 2022"}}]
    for k, (de, en, lvl_de, lvl_en, c_de, c_en) in LAYER_LABEL.items():
        tier, text = prov.get(k, ("missing", ""))
        if tier in ("missing", "skipped"):
            continue
        pub, lic, url = next(((a, b, c) for key, a, b, c in PROVIDERS if key in text), ("OpenStreetMap-Mitwirkende", "ODbL 1.0", OSM_URL))
        rows.append({"name": de, "publisher": pub, "content": f"{c_de}. {text}.", "level": lvl_de, "licence": lic,
                     "status": f"{TIER[tier][0]}, Abruf {TODAY}", "url": url,
                     "en": {"name": en, "content": f"{c_en}. {text}.", "level": lvl_en, "status": f"{TIER[tier][1]}, retrieved {TODAY}"}})
    return rows


def limits(prov, has_commercial):
    de = ["Stichtag des Zensus ist Mai 2022; Neubaugebiete seitdem fehlen.",
          "Der Zensus verändert kleine Fallzahlen leicht und lässt manche Zellen aus Geheimhaltungsgründen leer.",
          "Zellen an Stadtteilgrenzen werden vollständig dem Stadtteil ihres Mittelpunkts zugerechnet.",
          "Die Versorgung misst Fußwege aus OpenStreetMap; dessen Vollständigkeit ist nicht garantiert und schwankt zwischen Regionen.",
          "Die Farbstufen sind aus den Werten dieser Stadt berechnet und daher nicht direkt mit anderen Städten vergleichbar."]
    en = ["The census reference date is May 2022; newer housing developments are missing.",
          "The census slightly perturbs small counts and leaves some cells empty for confidentiality.",
          "Cells on district borders are assigned entirely to the district containing their centre.",
          "Amenities use OpenStreetMap footpaths; its completeness is not guaranteed and varies by region.",
          "Colour classes are computed from this city's values, so they cannot be compared directly with other cities."]
    if prov["districts"][0] != "official":
        de.append("Die Stadtteilgrenzen sind keine amtlichen Grenzen und sollten mit der Stadt abgeglichen werden.")
        en.append("The district boundaries are not official and should be checked with the city.")
    if prov["districts"][0] == "approximate":
        de.append("Für diese Gemeinde gab es keine Stadtteilgrenzen; die Gebiete sind eine Näherung um benannte Orte.")
        en.append("No district boundaries existed for this municipality; areas are an approximation around named places.")
    if prov["buildings"][0] == "osm":
        de.append("Gebäudezahlen stammen aus OpenStreetMap, nicht aus dem amtlichen Kataster, und können unvollständig sein.")
        en.append("Building counts come from OpenStreetMap, not the official cadastre, and may be incomplete.")
    if prov["flood"][0] == "national":
        de.append("Hochwasserflächen sind die an die EU berichteten HQ100-Gefahrenflächen, nur in ausgewiesenen Risikogebieten. Sie ersetzen nicht die amtlichen Überschwemmungsgebiete.")
        en.append("Flood areas are the HQ100 hazard areas reported to the EU, only inside designated risk areas. They do not replace the legal flood zones.")
    off = {"amenities": ("Versorgung", "Amenities"), "buildings": ("Gebäude und Bebauung", "Buildings and coverage"),
           "landuse": ("Landnutzung", "Land use"), "nature": ("Schutzgebiete", "Protected areas"), "flood": ("Hochwasserflächen", "Flood areas"),
           "fnp": ("Flächennutzungsplan", "Land-use plan"), "commercial": ("Gewerbeleerstand", "Commercial vacancy")}
    gone = [k for k in off if prov.get(k, ("missing",))[0] in ("missing", "skipped")]
    if gone:
        de.append("Für diese Stadt nicht verfügbar oder übersprungen: " + ", ".join(off[k][0] for k in gone) + ". Die davon abhängigen Funktionen sind ausgeblendet.")
        en.append("Not available or skipped for this city: " + ", ".join(off[k][1] for k in gone) + ". Features that depend on them are hidden.")
    if set(gone) & {"nature", "flood", "landuse"}:
        de.append("Mindestens ein Ausschlussgrund fehlt, deshalb sind die verbleibenden Flächen der Entwicklungsblöcke zu groß.")
        en.append("At least one exclusion layer is missing, so the remaining area of development blocks is overstated.")
    return {"de": de, "en": en}


def steps(n_cells, n_blocks):
    c = f"{n_cells:,}".replace(",", ".")
    return {
        "de": [["Laden", "Zensus-2022-Tabellen im 100-m-Gitter, Versorgung und Landnutzung aus OpenStreetMap, dazu Stadtteil-, Gebäude-, Schutzgebiets- und Planungsdaten (siehe Tabelle)."],
               ["Zusammenführen", f"Jede Gitterzelle wird über ihren Mittelpunkt einem Stadtteil zugeordnet; {c} Zellen ergeben {n_blocks} Blöcke von rund 500 m, die nie über eine Stadtteilgrenze gehen."],
               ["Kennzahl", "Stadtteil- und Blockwerte sind nach Einwohnern gewichtete Mittel. Versorgung = Angebote in Gehweite (Supermarkt/Bäckerei/Arzt 600 m, Halt 400 m) über das Wegenetz."],
               ["Datenschutz", "Ergebnisse erscheinen nur auf Stadtteil-, 500-m-Block- bzw. 100-m-Ebene, nie für Personen oder Haushalte."]],
        "en": [["Load", "Census 2022 tables on the 100 m grid, amenities and land use from OpenStreetMap, plus district, building, protection and planning data (see table)."],
               ["Merge", f"Each grid cell is assigned to a district via its centre; {n_cells:,} cells make {n_blocks} blocks of about 500 m that never cross a district border."],
               ["Indicator", "District and block values are resident-weighted means. Amenities = services within walking distance (supermarket/bakery/doctor 600 m, stop 400 m) over the path network."],
               ["Privacy", "Results appear only at district, 500 m block or 100 m level, never for persons or households."]],
    }


def validate(o):
    """Checks the invariants src/lib/*.ts relies on, so a bad build fails here and not in the browser."""
    errs = []
    names = {f["properties"]["name"] for f in o["stadtteile"]["features"]}
    keys = {b[0] for b in o["blocke"]}
    if not names or not o["gitter"] or not o["blocke"]:
        errs.append("empty districts, cells or blocks")
    for c in o["gitter"]:
        if len(c) != 10 or c[9] not in names or not isinstance(c[8], int):
            errs.append(f"bad cell {c}"); break
        k = "{}|{}|{}".format(c[9], *tile_of(c))
        if k not in keys:
            errs.append(f"cell without block {k}"); break
    if any(len(b) != 11 for b in o["blocke"]):
        errs.append("block row width")
    if sum(b[1] for b in o["blocke"]) != sum(c[2] or 0 for c in o["gitter"]):
        errs.append("blocks lose residents")
    if any(len(n.split("|")) > 1 for n in names):
        errs.append("district name contains |")
    need = {"wohnflaecheProKopf", "leerstandsquote", "gebaeude", "bebautAnteil", "anteil65", "efhAnteil", "raeumeProKopf", "versorgung"}
    for f in o["stadtteile"]["features"]:
        if need - set(f["properties"]):
            errs.append("district fields missing"); break
    if set(o["versorgung"]) != set(BIT):
        errs.append("amenity keys")
    if any(b["id"] not in keys for b in o["zukunft-bloecke"]):
        errs.append("future block id unknown")
    return errs


APP_FILES = ("stadtteile", "gitter", "blocke", "versorgung", "gebaeude", "summary", "naturschutzgebiete", "gewerbe", "zukunft-bloecke", "stadt")


def install(folder):
    """Copies a built city into src/data. The first install keeps the original Lüneburg data."""
    src = ROOT / "src" / "data"
    original = ROOT / "data" / "municipalities" / "_original"
    if not original.exists():
        original.mkdir(parents=True)
        for n in APP_FILES:
            shutil.copy(src / f"{n}.json", original / f"{n}.json")
    for n in APP_FILES:
        shutil.copy(Path(folder) / f"{n}.json", src / f"{n}.json")


def discover(m, args):
    """Finds what exists for this municipality without building anything, for the approval screen."""
    D, cover = osm_districts(m)
    D = list(D)
    x0, y0, x1, y1 = m["geom"].bounds
    bbox, ob = (x0, y0, x1, y1), f"({y0},{x0},{y1},{x1})"
    city = transform(to_m, m["geom"])

    def row(id_, name, status, source, detail, affects, required=False, upload=False):
        return dict(id=id_, name=name, status=status, source=source, detail=detail, affects=affects, required=required, upload=upload)

    busy = []

    def count(q):
        """Quick probe: a busy server means 'unknown', which the build will simply try again."""
        if busy:  # one failed probe means Overpass is overloaded; do not wait for the others too
            return None
        log("  checking OSM ...")
        body = urlencode({"data": f"[out:json][timeout:20];{q}out count;"}).encode()
        for url in OVERPASS[:2]:
            try:
                return int(http_json(url, body, timeout=25, retries=1)["elements"][0]["tags"]["total"])
            except Exception:  # noqa: BLE001
                continue
        busy.append(True)
        return None

    def osm_status(n):
        return "unknown" if n is None else "found" if n else "missing"
    rows = []
    try:
        ok = (CACHE / "zensus" / ZENSUS["bev"][0]).exists() or bool(http("https://www.destatis.de/", timeout=20, retries=1))
    except urllib.error.HTTPError:
        ok = True  # the server answered; the archives themselves are checked at build time
    except Exception:  # noqa: BLE001
        ok = False
    rows.append(row("census", "Zensus 2022 (100 m grid)", "found" if ok else "missing", "Statistisches Bundesamt",
                    "6 national tables, about 120 MB", "Everything: the dashboard cannot be built without it", required=True))
    if D and cover >= 0.5:
        rows.append(row("districts", "District boundaries", "found" if cover >= 0.97 else "fallback", "OpenStreetMap",
                        f"{len(D)} districts, {cover:.0%} of the area", "Map, ranking and district metrics. Not official boundaries", required=True, upload=True))
    else:
        rows.append(row("districts", "District boundaries", "fallback", "Approximate areas around named places",
                        "No usable OSM boundaries here", "Map, ranking and district metrics. Upload the real boundaries if you can", required=True, upload=True))
    am = count(f'(nwr["shop"~"^(supermarket|convenience|bakery|pastry)$"]{ob};nwr["amenity"~"^(doctors|clinic)$"]{ob};node["highway"="bus_stop"]{ob};);')
    rows.append(row("amenities", "Amenities and walking network", osm_status(am), "OpenStreetMap", f"{am} places" if am is not None else "OSM was busy; the build will try again",
                    "Amenities layer, the analysis 'Vacancy with poor amenities', amenity points on the map"))
    bl = count(f'way["building"]{ob};')
    if m["state"] == "03":
        rows.append(row("buildings", "Buildings", "found", "ALKIS Hausumringe Niedersachsen (official), 690 MB once", "Official footprints", "Building density, residents per building, coverage slider", upload=True))
    else:
        rows.append(row("buildings", "Buildings", "fallback" if bl else osm_status(bl), "OpenStreetMap", f"{bl} buildings; may be incomplete. Upload the state's ALKIS footprints for official counts" if bl is not None else "OSM was busy; the build will try again",
                        "Building density, residents per building, coverage slider", upload=True))
    lu = count(f'(way["landuse"~"^(forest|cemetery|allotments|farmland)$"]{ob};way["natural"="wood"]{ob};way["amenity"="parking"]{ob};);')
    rows.append(row("landuse", "Land use", osm_status(lu), "OpenStreetMap", f"{lu} areas" if lu is not None else "OSM was busy; the build will try again",
                    "Forest, cemetery, allotment, car park and park exclusions in future development"))
    log("  checking protected areas and flood services ...")
    try:
        n = len(wfs_bfn("Naturschutzgebiete", city)) + len(wfs_bfn("Landschaftsschutzgebiete", city))  # raises during maintenance
        rows.append(row("nature", "Nature and landscape protection", "found", "NLWKN (official)" if m["state"] == "03" else "BfN national service", f"{n} areas",
                        "Protected-area exclusions in future development", upload=True))
    except Exception:  # noqa: BLE001
        rows.append(row("nature", "Nature and landscape protection", "unknown", "BfN national service", "Not answering; the build will try again, then OpenStreetMap", "Protected-area exclusions in future development", upload=True))
    try:
        d = http_json(BFG_FLOOD + "?" + urlencode({"geometry": f"{x0},{y0},{x1},{y1}", "geometryType": "esriGeometryEnvelope", "inSR": 4326,
                                                     "spatialRel": "esriSpatialRelIntersects", "where": "1=1", "returnCountOnly": "true", "f": "json"}), timeout=60, retries=2)
        if m["state"] == "03":
            rows.append(row("flood", "Flood areas", "found", "NLWKN legal zones (official)", "BfG used if a layer fails", "Flood exclusion in future development", upload=True))
        else:
            rows.append(row("flood", "Flood areas", "fallback", "BfG HQ100 hazard areas (national)", f"{d.get('count', 0)} areas; not the legal zones. Upload the state's zones if you need them", "Flood exclusion in future development", upload=True))
    except Exception:  # noqa: BLE001
        rows.append(row("flood", "Flood areas", "unknown", "BfG national service", "Slow to answer; the build will try again", "Flood exclusion in future development", upload=True))
    fnp = False
    try:
        fnp = b"FeatureType" in http(PLANDIGITAL.format(m["ags"].lstrip("0")) + "?Service=WFS&Version=1.1.0&Request=GetCapabilities", timeout=30, retries=1)
    except Exception:  # noqa: BLE001
        pass
    rows.append(row("fnp", "Land-use plan (FNP)", "found" if fnp else "missing", "PlanDigital WFS" if fnp else "Not found online", "" if fnp else "Upload it if the city publishes one",
                    "Planned housing land on the map, its legend entry and filter", upload=True))
    rows.append(row("commercial", "Commercial vacancy", "missing", "Local data only, never public", "Upload a table with columns Straße and Objektstatus",
                    "Commercial vacancy layer and its analysis", upload=True))
    print("@@RESULT " + json.dumps(dict(name=m["name"], ags=m["ags"], state=STATES.get(m["state"]), datasets=rows), ensure_ascii=False), flush=True)


def slugify(s):
    s = s.replace("ä", "ae").replace("ö", "oe").replace("ü", "ue").replace("ß", "ss").replace("Ä", "ae").replace("Ö", "oe").replace("Ü", "ue")
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def main():
    try:
        run()
    except RuntimeError as e:
        if "OpenStreetMap servers" in str(e):
            sys.exit(f"Stopped: {e}. Nothing changed. This is usually temporary, so try again in a few minutes.")
        raise


def run():
    ap = argparse.ArgumentParser(description="Build the Housing Radar data for any German municipality.")
    ap.add_argument("--name", help='Municipality name, e.g. "Celle"')
    ap.add_argument("--ags", help="8-digit municipality key (safer than a name), e.g. 03351006")
    ap.add_argument("--osm-id", help="OSM relation id of the municipality")
    ap.add_argument("--out", help="Output folder (default data/municipalities/<slug>)")
    ap.add_argument("--install", action="store_true", help="Also copy the files into src/data, replacing the current city")
    ap.add_argument("--osm-buildings", action="store_true", help="Skip the 690 MB ALKIS download in Niedersachsen")
    ap.add_argument("--refresh", action="store_true", help="Ignore cached Overpass answers")
    ap.add_argument("--discover", action="store_true", help="Only report what is available for this municipality")
    ap.add_argument("--skip", default="", help="Comma list of datasets to leave out: " + ",".join("amenities buildings landuse nature flood fnp commercial".split()))
    ap.add_argument("--districts-file"); ap.add_argument("--district-name-field")
    ap.add_argument("--buildings-file"); ap.add_argument("--buildings-function-field")
    ap.add_argument("--nsg-file"); ap.add_argument("--flood-file"); ap.add_argument("--fnp-file")
    ap.add_argument("--commercial-file", help="Table with columns Straße and Objektstatus")
    args = ap.parse_args()
    if not args.name and not args.ags and not args.osm_id:
        ap.error("give --name, --ags or --osm-id")

    if args.refresh:
        shutil.rmtree(CACHE / "overpass", ignore_errors=True)
    skip = {x.strip() for x in args.skip.split(",") if x.strip()}
    if skip - set(OPTIONAL):
        ap.error(f"--skip takes: {', '.join(OPTIONAL)}")
    prov = {}
    log("[1/7] Municipality and districts")
    m = resolve(args)
    if args.discover:
        discover(m, args)
        return
    log(f"  {m['name']} | AGS {m['ags']} | {STATES.get(m['state'], '?')}")
    D = load_districts(m, args, prov)
    city_w = m["geom"]
    city = transform(to_m, unary_union([d["geom"] for d in D]).buffer(0))
    x0, y0, x1, y1 = unary_union([d["geom"] for d in D]).bounds
    bbox = (x0, y0, x1, y1)
    ob = f"({y0},{x0},{y1},{x1})"
    wide = f"({y0 - 0.02},{x0 - 0.03},{y1 + 0.02},{x1 + 0.03})"  # services just outside the border still count

    log("[2/7] Census 2022 grid")
    cells, agg = build_cells(D)
    log(f"  {len(cells)} cells, {sum(c[2] or 0 for c in cells):,} residents")

    log("[3/7] Amenities and walking network")
    pts, reach = {k: [] for k in BIT}, {}
    if "amenities" in skip:
        prov["amenities"] = ("skipped", "Skipped")
    else:
        try:
            pts = fetch_amenities(wide)
            log("  ", {k: len(v) for k, v in pts.items()})
            reach = walking_reach(cells, pts, wide)
            prov["amenities"] = ("osm", "OpenStreetMap")
        except Exception as e:  # noqa: BLE001
            warn(f"Amenities unavailable ({str(e)[:90]}): feature turned off.")
            pts, prov["amenities"] = {k: [] for k in BIT}, ("missing", "Not available")

    log("[4/7] Buildings")
    building_els = []
    bstats = {d["name"]: dict(gebaeude=0, grundflaecheM2=0, wohnGrundflaecheM2=0, bebautAnteil=0) for d in D}
    if "buildings" in skip:
        prov["buildings"] = ("skipped", "Skipped")
    else:
        try:
            building_els = fetch_buildings(ob)
        except Exception as e:  # noqa: BLE001
            warn(f"OSM buildings unavailable ({str(e)[:90]}).")
        try:
            bstats = building_stats(D, m, args, prov, building_els)
        except Exception as e:  # noqa: BLE001
            warn(f"Building statistics failed ({str(e)[:90]}): feature turned off.")
            prov["buildings"] = ("missing", "Not available")

    log("[5/7] Blocks and districts")
    blocks = make_blocks(cells)
    feats, city_avg, pop = make_districts(D, agg, reach, bstats)
    log(f"  {len(blocks)} blocks, {len(feats)} districts, average {city_avg} m²/person")

    log("[6/7] Exclusion areas and land-use plan")
    nsg, lsg, nsg_feats = Polygon(), Polygon(), []
    if "nature" in skip:
        prov["nature"] = ("skipped", "Skipped")
    else:
        nsg, lsg, nsg_feats = protected(m, city, bbox, args, prov)
    floodz = Polygon()
    if "flood" in skip:
        prov["flood"] = ("skipped", "Skipped")
    else:
        floodz = flood(m, city, bbox, args, prov)
    fnp = Polygon()
    if "fnp" in skip:
        prov["fnp"] = ("skipped", "Skipped")
    else:
        fnp = plan_land(m, city, args, prov)
    landuse = []
    if "landuse" in skip:
        prov["landuse"] = ("skipped", "Skipped")
    else:
        try:
            landuse = fetch_landuse(ob)
            prov["landuse"] = ("osm", "OpenStreetMap")
        except Exception as e:  # noqa: BLE001
            warn(f"Land use unavailable ({str(e)[:90]}): those exclusions are not applied.")
            prov["landuse"] = ("missing", "Not available")
    zukunft = future_blocks(blocks, D, city, landuse, building_els, nsg, lsg, floodz, fnp)

    log("[7/7] Writing and checking")
    gewerbe, c_dist = [], None
    prov["commercial"] = ("skipped" if "commercial" in skip else "missing", "No local commercial vacancy data")
    if args.commercial_file and "commercial" not in skip:
        gewerbe, c_dist = commercial_layer(args.commercial_file, m["name"], {d["name"]: d["geom"] for d in D})
        prov["commercial"] = ("official", f"Your file {Path(args.commercial_file).name}")

    def rnd(o):
        if isinstance(o, float):
            return round(o, 5)
        if isinstance(o, (list, tuple)):
            return [rnd(x) for x in o]
        if isinstance(o, dict):
            return {k: rnd(v) for k, v in o.items()}
        return o

    best = max(feats, key=lambda f: f["properties"]["einwohner"])["properties"]["name"]
    stadt = {
        "name": m["name"], "ags": m["ags"], "state": STATES.get(m["state"]),
        "labelDe": m["name"], "labelEn": m["name"], "avgDe": f"Schnitt von {m['name']}", "avgLongDe": f"Durchschnitt von {m['name']}",
        "center": [round(city_w.centroid.y, 4), round(city_w.centroid.x, 4)], "defaultDistrict": best,
        "commercialDistrict": c_dist, "partnerDe": "", "partnerEn": "",
        "datasetsDe": "Offene Datensätze", "datasetsEn": "Open datasets",
        "officialBuildings": prov["buildings"][0] == "official",
        "breaks": make_breaks(blocks, feats),
        "thresholds": make_thresholds(blocks),
        "features": {k: prov.get(k, ("missing",))[0] not in ("missing", "skipped") for k in ("amenities", "buildings", "landuse", "nature", "flood", "fnp", "commercial")}
        | {"coverage": bool(building_els), "fnp": not fnp.is_empty, "commercial": bool(gewerbe)},
        "sources": source_rows(prov), "limits": limits(prov, bool(gewerbe)), "steps": steps(len(cells), len(blocks)),
    }
    files = {
        "stadtteile": {"type": "FeatureCollection", "features": feats},
        "gitter": cells, "blocke": blocks, "versorgung": pts, "gebaeude": bstats,
        "summary": {"stadtWohnflaecheProKopf": city_avg, "einwohner": pop, "zellen": len(cells)},
        "naturschutzgebiete": {"type": "FeatureCollection", "features": nsg_feats},
        "gewerbe": gewerbe, "zukunft-bloecke": rnd(zukunft), "stadt": stadt,
    }
    errs = validate(files)
    if errs:
        sys.exit("Build failed checks: " + "; ".join(errs))

    out = Path(args.out) if args.out else ROOT / "data" / "municipalities" / slugify(m["name"])
    out.mkdir(parents=True, exist_ok=True)
    for name, data in files.items():
        (out / f"{name}.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    manifest = {"municipality": m["name"], "ags": m["ags"], "state": STATES.get(m["state"]), "built": TODAY,
                "layers": {k: {"tier": v[0], "source": v[1]} for k, v in prov.items()},
                "counts": {"residents": pop, "cells": len(cells), "blocks": len(blocks), "districts": len(feats),
                           "amenities": {k: len(v) for k, v in pts.items()}}}
    (out / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")

    log(f"\nDone: {out}")
    for k, (tier, text) in prov.items():
        log(f"  {k:<11}{tier:<12}{text}")
    if args.install:
        install(out)
        log("Installed into src/data.")


if __name__ == "__main__":
    main()
