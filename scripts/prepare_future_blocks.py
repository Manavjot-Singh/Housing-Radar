"""Future-development screen on ~500 m blocks with hard exclusion areas.

Run after prepare_blocks.py. For every block (same tile grid as src/lib/radar.ts,
clipped to its district) it computes the remaining area after subtracting
exclusions, plus building coverage of that remaining area. The thresholds are
NOT applied here: the app filters blocks live with sliders.

Exclusions (all clipped to the city):
- Naturschutzgebiete (NSG), already in src/data/naturschutzgebiete.json (NLWKN)
- Landschaftsschutzgebiete (LSG), NLWKN protected-sites WFS (DL-DE BY 2.0)
- Überschwemmungsgebiete, festgesetzt + vorläufig gesichert, NLWKN (DL-DE BY 2.0)
- Wald and Friedhöfe, OpenStreetMap (ODbL)
Building coverage uses OpenStreetMap building footprints (ODbL).
Writes src/data/zukunft-bloecke.json.
"""
import json
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import pyproj
from shapely.geometry import box, mapping, shape, Polygon, MultiPolygon
from shapely.ops import transform, unary_union

ROOT = Path(__file__).resolve().parents[1]
LON0, LAT0, DLON, DLAT = 10.30, 53.10, 0.0075, 0.0045  # must match src/lib/radar.ts
UA = {"User-Agent": "HousingRadar/1.0"}
to_m = pyproj.Transformer.from_crs(4326, 25832, always_xy=True).transform
to_w = pyproj.Transformer.from_crs(25832, 4326, always_xy=True).transform

districts = json.loads((ROOT / "src/data/stadtteile.json").read_text(encoding="utf-8"))
dgeo = {f["properties"]["name"]: transform(to_m, shape(f["geometry"]).buffer(0)) for f in districts["features"]}
city_w = unary_union([shape(f["geometry"]).buffer(0) for f in districts["features"]])
city = transform(to_m, city_w)
minx, miny, maxx, maxy = city_w.bounds


def get(url, data=None, timeout=180):
    with urlopen(Request(url, data=data, headers=UA), timeout=timeout) as r:
        return json.load(r)


def clip(geoms):
    g = unary_union([x.buffer(0) for x in geoms if not x.is_empty]) if geoms else Polygon()
    return g.intersection(city)


# --- NSG
nsg = clip([transform(to_m, shape(f["geometry"])) for f in json.loads((ROOT / "src/data/naturschutzgebiete.json").read_text())["features"]])

# --- LSG
lsg_src = get("https://www.umweltkarten-niedersachsen.de/geoserver/SchutzgebieteNI/wfs?" + urlencode({
    "service": "WFS", "version": "2.0.0", "request": "GetFeature",
    "typeNames": "SchutzgebieteNI:ProtectedSites_IUCN_ProtectedLandscapeOrSeascape_Surface",
    "bbox": f"{minx},{miny},{maxx},{maxy},EPSG:4326", "outputFormat": "application/json"}))
lsg_f = [f for f in lsg_src["features"] if f["properties"].get("d_3_designation") == "LSG" or "Landschaftsschutz" in (f["properties"].get("sitename_name_1") or "")]
lsg = clip([transform(to_m, shape(f["geometry"])) for f in lsg_f])
# WFS 2.0 with EPSG:4326 may return lat/lon order; detect by checking overlap
if lsg.is_empty and lsg_f:
    swap = lambda x, y, z=None: (y, x)
    lsg = clip([transform(to_m, transform(swap, shape(f["geometry"]))) for f in lsg_f])

# --- Flood zones
flood = []
for lid in (39, 40):
    q = get(f"https://www.umweltkarten-niedersachsen.de/arcgis/rest/services/Hochwasserschutz_WFS/MapServer/{lid}/query?" + urlencode({
        "geometry": f"{minx},{miny},{maxx},{maxy}", "geometryType": "esriGeometryEnvelope", "inSR": 4326,
        "spatialRel": "esriSpatialRelIntersects", "outSR": 4326, "f": "geojson", "where": "1=1", "outFields": "OBJECTID"}))
    flood += [transform(to_m, shape(f["geometry"])) for f in q["features"] if f.get("geometry")]
flood = clip(flood)

# --- OSM forest, cemeteries, buildings
ovq = f"""[out:json][timeout:180];
(way["landuse"~"^(forest|cemetery)$"]({miny},{minx},{maxy},{maxx});
 relation["landuse"~"^(forest|cemetery)$"]({miny},{minx},{maxy},{maxx});
 way["natural"="wood"]({miny},{minx},{maxy},{maxx});
 relation["natural"="wood"]({miny},{minx},{maxy},{maxx});
 way["amenity"="grave_yard"]({miny},{minx},{maxy},{maxx});
 way["building"]({miny},{minx},{maxy},{maxx}););
out geom;"""
osm = None
for ep in ("https://overpass-api.de/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter"):
    try:
        osm = get(ep, data=urlencode({"data": ovq}).encode(), timeout=300)
        break
    except Exception as e:  # noqa: BLE001
        print("overpass failed", ep, e)


def ring(geom):
    pts = [(p["lon"], p["lat"]) for p in geom]
    return pts if len(pts) >= 4 else None


forest, cemetery, buildings = [], [], []
for el in osm["elements"]:
    t = el.get("tags", {})
    polys = []
    if el["type"] == "way" and el.get("geometry"):
        r = ring(el["geometry"])
        if r: polys.append(Polygon(r))
    elif el["type"] == "relation":
        outers = [ring(m["geometry"]) for m in el.get("members", []) if m.get("role") == "outer" and m.get("geometry")]
        inners = [ring(m["geometry"]) for m in el.get("members", []) if m.get("role") == "inner" and m.get("geometry")]
        try:
            o = unary_union([Polygon(r).buffer(0) for r in outers if r])
            i = unary_union([Polygon(r).buffer(0) for r in inners if r])
            polys.append(o.difference(i))
        except Exception:  # noqa: BLE001
            pass
    for p in polys:
        g = transform(to_m, p.buffer(0) if not p.is_valid else p)
        if "building" in t:
            buildings.append(g)
        elif t.get("landuse") == "cemetery" or t.get("amenity") == "grave_yard":
            cemetery.append(g)
        else:
            forest.append(g)
forest, cemetery = clip(forest), clip(cemetery)
bld = unary_union(buildings)
excl = {"nsg": nsg, "lsg": lsg, "flood": flood, "forest": forest, "cemetery": cemetery}
all_excl = unary_union(list(excl.values()))
print({k: round(v.area / 1e6, 2) for k, v in excl.items()}, "km² | buildings", len(buildings))

blocks = json.loads((ROOT / "src/data/blocke.json").read_text(encoding="utf-8"))
out = []
for b in blocks:
    dn, ix, iy = b[0].split("|"); ix, iy = int(ix), int(iy)
    tile = transform(to_m, box(LON0 + ix * DLON, LAT0 + iy * DLAT, LON0 + (ix + 1) * DLON, LAT0 + (iy + 1) * DLAT))
    full = tile.intersection(dgeo[dn])
    if full.is_empty:
        continue
    rest = full.difference(all_excl)
    rest = MultiPolygon([p for p in (rest.geoms if hasattr(rest, "geoms") else [rest]) if isinstance(p, Polygon) and p.area > 2000]) if not rest.is_empty else rest
    reasons = {k: round(full.intersection(v).area / full.area * 100) for k, v in excl.items()}
    rest_area = rest.area if not rest.is_empty else 0
    cover = round(rest.intersection(bld).area / rest_area * 100, 1) if rest_area else None
    geom = transform(to_w, rest.simplify(3, preserve_topology=True)) if rest_area else None
    out.append({"id": b[0], "d": dn, "ew": b[1], "living": b[2], "vac": b[3],
                "cover": cover, "freeHa": round(rest_area / 1e4, 1),
                "exclPct": round((1 - rest_area / full.area) * 100), "excl": {k: v for k, v in reasons.items() if v},
                "g": mapping(geom) if geom else None})

def rnd(o):
    if isinstance(o, float): return round(o, 5)
    if isinstance(o, (list, tuple)): return [rnd(x) for x in o]
    if isinstance(o, dict): return {k: rnd(v) for k, v in o.items()}
    return o

(ROOT / "src/data/zukunft-bloecke.json").write_text(json.dumps(rnd(out), ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print("blocks", len(out), "| with remaining area", sum(1 for o in out if o["g"]), "| fully excluded", sum(1 for o in out if not o["g"]))
