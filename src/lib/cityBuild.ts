// Builds a full dashboard data set for any municipality in Lower Saxony, in the same shapes as
// Lüneburg's precomputed files (stadtteile, gitter, blocke, versorgung, zukunft-bloecke).
// Runs inside a server function: OSM (Nominatim/Overpass), NLWKN and LGLN are fetched live,
// the census cells come from the static tiles in public/zensus (scripts/prepare_zensus_ni.py).
import { centroid, geojsonToPolys, makeTester, parseAlkisGml, polyAreaM2, polyBBox, simplify, type Poly, type Ring } from "./municipality";

export const TILE_DLON = 0.15, TILE_DLAT = 0.1; // must match scripts/prepare_zensus_ni.py
export const BLOCK_DLON = 0.0075, BLOCK_DLAT = 0.0045; // same block size as Lüneburg

type AmenityKey = "shop" | "doc" | "pt" | "bakery";
export type CityData = {
  id: string; name: string; ags: string; hasFnp: boolean; hasGewerbe: boolean;
  blockOrigin: [number, number];
  stadtteile: { type: "FeatureCollection"; features: { type: "Feature"; geometry: GeoJSON.Geometry; properties: Record<string, unknown> }[] };
  summary: { stadtWohnflaecheProKopf: number; einwohner: number; zellen: number };
  gitter: unknown[][]; blocke: unknown[][];
  versorgung: Record<AmenityKey, [number, number][]>;
  zukunft: Record<string, unknown>[];
  notes: string[];
};

const UA = { "User-Agent": "HousingRadar/1.0 (Leuphana hackathon demo)" };
const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter"];
const SCHUTZ = "https://www.umweltkarten-niedersachsen.de/geoserver/SchutzgebieteNI/wfs";
const ALKIS = "https://opendata.lgln.niedersachsen.de/doorman/noauth/alkis_wfs_einfach";

type OsmEl = { type: string; id: number; tags?: Record<string, string>; lat?: number; lon?: number; center?: { lat: number; lon: number }; geometry?: { lat: number; lon: number }[]; members?: { type: string; role: string; geometry?: { lat: number; lon: number }[] }[] };

async function overpass(q: string): Promise<OsmEl[]> {
  let last = "";
  for (const ep of [...OVERPASS, ...OVERPASS]) {
    try {
      const r = await fetch(ep, { method: "POST", headers: { ...UA, "Content-Type": "application/x-www-form-urlencoded" }, body: "data=" + encodeURIComponent(q) });
      if (r.ok) return ((await r.json()) as { elements: OsmEl[] }).elements;
      last = `HTTP ${r.status}`;
    } catch (e) { last = String(e); }
  }
  throw new Error(`OpenStreetMap (Overpass) nicht erreichbar: ${last}`);
}

async function nominatimPolys(ids: number[]): Promise<Map<number, Poly[]>> {
  const out = new Map<number, Poly[]>();
  for (let i = 0; i < ids.length; i += 50) {
    const r = await fetch(`https://nominatim.openstreetmap.org/lookup?osm_ids=${ids.slice(i, i + 50).map((x) => "R" + x).join(",")}&format=json&polygon_geojson=1`, { headers: UA });
    if (!r.ok) throw new Error(`Grenzen: HTTP ${r.status}`);
    for (const x of (await r.json()) as { osm_id: number; geojson?: { type: string; coordinates: unknown } }[]) out.set(x.osm_id, geojsonToPolys(x.geojson));
  }
  return out;
}

async function protectedAreas(type: string, b: number[], filter: (p: Record<string, unknown>) => boolean): Promise<Poly[]> {
  const [w, s, e, n] = b;
  const q = new URLSearchParams({ service: "WFS", version: "2.0.0", request: "GetFeature", typeNames: type, bbox: `${s},${w},${n},${e},urn:ogc:def:crs:EPSG::4326`, srsName: "EPSG:4326", outputFormat: "application/json" });
  const r = await fetch(`${SCHUTZ}?${q}`, { headers: UA });
  if (!r.ok) throw new Error(`Schutzgebiete: HTTP ${r.status}`);
  const j = (await r.json()) as { features: { geometry: { type: string; coordinates: unknown }; properties: Record<string, unknown> }[] };
  return j.features.filter((f) => filter(f.properties ?? {})).flatMap((f) => geojsonToPolys(f.geometry));
}

async function alkis(b: number[], ags: string) {
  const [w, s, e, n] = b;
  const out: { c: [number, number]; m2: number; res: boolean }[] = [];
  let truncated = false;
  for (let page = 0; page < 15; page++) {
    const q = new URLSearchParams({ SERVICE: "WFS", VERSION: "2.0.0", REQUEST: "GetFeature", TYPENAMES: "ave:GebaeudeBauwerk", BBOX: `${s},${w},${n},${e},urn:ogc:def:crs:EPSG::4326`, SRSNAME: "urn:ogc:def:crs:EPSG::4326", COUNT: "10000", STARTINDEX: String(page * 10000) });
    const r = await fetch(`${ALKIS}?${q}`, { headers: UA });
    if (!r.ok) throw new Error(`ALKIS: HTTP ${r.status}`);
    const items = parseAlkisGml(await r.text());
    for (const it of items) if (it.ags === ags && it.ring.length > 2) out.push({ c: centroid(it.ring), m2: polyAreaM2([it.ring]), res: /Wohn/.test(it.fn) });
    if (items.length < 10000) break;
    if (page === 14) truncated = true;
  }
  return { buildings: out, truncated };
}

/** Closed outer ways (and closed outer members of multipolygons) as polygons. */
function osmPolys(els: OsmEl[]): Poly[] {
  const out: Poly[] = [];
  const ring = (g: { lat: number; lon: number }[]): Ring => g.map((p) => [p.lon, p.lat]);
  for (const e of els) {
    if (e.type === "way" && e.geometry && e.geometry.length > 3) out.push([ring(e.geometry)]);
    if (e.type === "relation") for (const m of e.members ?? []) if (m.type === "way" && m.role !== "inner" && m.geometry && m.geometry.length > 3) {
      const g = m.geometry; const a = g[0]!, z = g[g.length - 1]!;
      if (a.lat === z.lat && a.lon === z.lon) out.push([ring(g)]);
    }
  }
  return out;
}

const num = (x: unknown) => (typeof x === "number" ? x : null);
const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;

export async function buildCity(input: { osmId: number; ags: string; name: string; origin: string }): Promise<CityData> {
  const notes: string[] = [];
  const boundary = (await nominatimPolys([input.osmId])).get(input.osmId) ?? [];
  if (!boundary.length) throw new Error("Keine Gemeindegrenze gefunden");
  const bb = polyBBox(boundary);
  const [w, s, e, n] = bb;
  const inTown = makeTester(boundary);
  const area = `area(${3600000000 + input.osmId})->.a;`;

  // ---- everything live, in parallel
  const [distEls, amenEls, exclEls, nsg, lsg, alk, cells] = await Promise.all([
    overpass(`[out:json][timeout:60];${area}rel(area.a)["boundary"="administrative"]["admin_level"~"^(9|10)$"];out tags;`),
    overpass(`[out:json][timeout:90];${area}(nwr(area.a)["shop"~"^(supermarket|convenience|bakery)$"];nwr(area.a)["amenity"~"^(doctors|clinic)$"];nwr(area.a)["healthcare"="doctor"];node(area.a)["highway"="bus_stop"];nwr(area.a)["railway"~"^(station|halt)$"];);out center tags;`),
    overpass(`[out:json][timeout:120];${area}(wr(area.a)["landuse"="forest"];wr(area.a)["natural"="wood"];wr(area.a)["landuse"="cemetery"];wr(area.a)["amenity"="grave_yard"];wr(area.a)["landuse"="allotments"];wr(area.a)["amenity"="parking"]["parking"!~"underground|multi-storey"];wr(area.a)["leisure"~"^(park|pitch|sports_centre)$"];);out geom;`),
    protectedAreas("SchutzgebieteNI:ProtectedSites_IUCN_HabitatSpeciesManagementArea_Surface", bb, () => true),
    protectedAreas("SchutzgebieteNI:ProtectedSites_IUCN_ProtectedLandscapeOrSeascape_Surface", bb,
      (p) => p["d_3_designation"] === "LSG" || String(p["inspireid_localid"] ?? "").includes("LSG") || String(p["sitename_name_1"] ?? "").includes("Landschaftsschutz")),
    alkis(bb, input.ags),
    (async () => {
      const keys: string[] = [];
      for (let ix = Math.floor(w / TILE_DLON); ix <= Math.floor(e / TILE_DLON); ix++)
        for (let iy = Math.floor(s / TILE_DLAT); iy <= Math.floor(n / TILE_DLAT); iy++) keys.push(`${ix}_${iy}`);
      const parts = await Promise.all(keys.map(async (k) => {
        const r = await fetch(new URL(`/zensus/${k}.json`, input.origin));
        return r.ok ? ((await r.json()) as (number | null)[][]) : [];
      }));
      return parts.flat().filter((c) => inTown(c[0]!, c[1]!));
    })(),
  ]);
  if (!cells.length) throw new Error("Keine Zensusdaten für diese Gemeinde gefunden");
  if (alk.truncated) notes.push("buildingsTruncated");

  // ---- districts: pick the admin level that covers most residents, else the whole town
  const cand = distEls.filter((x) => x.tags?.name).map((x) => ({ id: x.id, name: x.tags!.name!, lvl: x.tags!.admin_level! }));
  let districts: { id: number; name: string; polys: Poly[]; test: (x: number, y: number) => boolean }[] = [];
  if (cand.length >= 2) {
    const geo = await nominatimPolys(cand.map((c) => c.id));
    const totalEw = cells.reduce((a, c) => a + (c[2] ?? 0), 0);
    let best: typeof districts = [], bestCov = 0;
    for (const lvl of ["10", "9"]) {
      const ds = cand.filter((c) => c.lvl === lvl).map((c) => ({ ...c, polys: geo.get(c.id) ?? [] }))
        .filter((d) => d.polys.length && (() => { const [a, b, c2, d2] = polyBBox(d.polys); return inTown((a + c2) / 2, (b + d2) / 2); })())
        .map((d) => ({ id: d.id, name: d.name, polys: d.polys, test: makeTester(d.polys) }));
      if (ds.length < 2) continue;
      const cov = cells.reduce((a, c) => a + (ds.some((d) => d.test(c[0]!, c[1]!)) ? c[2] ?? 0 : 0), 0) / (totalEw || 1);
      if (cov > bestCov) { bestCov = cov; best = ds; }
    }
    if (bestCov >= 0.8) districts = best;
  }
  const rest = { id: input.osmId, name: input.name, polys: boundary, test: inTown };
  if (!districts.length) { districts = [rest]; notes.push("noDistricts"); }
  const districtOf = (x: number, y: number) => districts.find((d) => d.test(x, y)) ?? null;

  // ---- amenities (straight-line reach)
  const pts: Record<AmenityKey, [number, number][]> = { shop: [], doc: [], pt: [], bakery: [] };
  for (const el of amenEls) {
    const t = el.tags ?? {}; const lon = el.lon ?? el.center?.lon, lat = el.lat ?? el.center?.lat;
    if (lon == null || lat == null) continue;
    const p: [number, number] = [r2(lon * 1000) / 1000, r2(lat * 1000) / 1000];
    if (t.shop === "bakery") pts.bakery.push(p);
    else if (t.shop) pts.shop.push(p);
    else if (t.amenity || t.healthcare) pts.doc.push(p);
    else pts.pt.push(p);
  }
  const kx = 111320 * Math.cos(((s + n) / 2) * Math.PI / 180), ky = 111320;
  const R: Record<AmenityKey, number> = { shop: 600, doc: 600, pt: 400, bakery: 600 };
  const BIT: Record<AmenityKey, number> = { shop: 1, doc: 2, pt: 4, bakery: 8 };
  const reach = (lon: number, lat: number) => {
    let m = 0;
    for (const k of Object.keys(pts) as AmenityKey[]) {
      const r2m = R[k] * R[k];
      if (pts[k].some(([x, y]) => { const dx = (x - lon) * kx, dy = (y - lat) * ky; return dx * dx + dy * dy <= r2m; })) m |= BIT[k];
    }
    return m;
  };

  // ---- grid cells
  const gitter: (number | string | null)[][] = [];
  for (const c of cells) {
    const d = districtOf(c[0]!, c[1]!);
    if (!d) continue;
    gitter.push([c[0]!, c[1]!, c[2] ?? null, c[3] ?? null, c[4] ?? null, c[5] ?? null, c[6] ?? null, c[7] ?? null, reach(c[0]!, c[1]!), d.name]);
  }

  // ---- buildings per district
  const bAgg = new Map<string, { n: number; m2: number; res: number }>();
  const bInBlock = new Map<string, { c: [number, number]; m2: number }[]>();
  const LON0 = Math.floor(w * 10) / 10, LAT0 = Math.floor(s * 10) / 10;
  const tileOf = (x: number, y: number) => [Math.floor((x - LON0) / BLOCK_DLON), Math.floor((y - LAT0) / BLOCK_DLAT)] as const;
  for (const b of alk.buildings) {
    const d = districtOf(b.c[0], b.c[1]);
    if (!d) continue;
    const a = bAgg.get(d.name) ?? { n: 0, m2: 0, res: 0 };
    a.n++; a.m2 += b.m2; if (b.res) a.res += b.m2; bAgg.set(d.name, a);
    const [ix, iy] = tileOf(b.c[0], b.c[1]);
    const k = `${d.name}|${ix}|${iy}`;
    (bInBlock.get(k) ?? bInBlock.set(k, []).get(k)!).push(b);
  }

  // ---- district aggregates (same rules as scripts/prepare_data.py + prepare_layers.py)
  type Agg = { ew: number; cells: number; wf: [number, number]; ls: [number, number]; o: [number, number]; r: [number, number]; efh: [number, number]; am: [number, number] };
  const agg = new Map<string, Agg>(districts.map((d) => [d.name, { ew: 0, cells: 0, wf: [0, 0], ls: [0, 0], o: [0, 0], r: [0, 0], efh: [0, 0], am: [0, 0] }]));
  for (const c of gitter) {
    const a = agg.get(c[9] as string)!; const ew = (c[2] as number) ?? 0;
    a.cells++;
    if (c[6] != null) { a.efh[0] += c[6] as number; a.efh[1]++; }
    if (!ew) continue;
    a.ew += ew;
    const add = (t: [number, number], v: unknown) => { if (v != null) { t[0] += (v as number) * ew; t[1] += ew; } };
    add(a.wf, c[3]); add(a.ls, c[4]); add(a.o, c[5]); add(a.r, c[7]);
    a.am[0] += ((c[8] as number) ? 1 : 0) * ew; a.am[1] += ew;
  }
  const totWf = [...agg.values()].reduce((t, a) => [t[0] + a.wf[0], t[1] + a.wf[1]], [0, 0]);
  const cityAvg = totWf[1] ? r1(totWf[0] / totWf[1]) : 0;
  const mean = (t: [number, number], d = 1) => (t[1] ? Math.round((t[0] / t[1]) * 10 ** d) / 10 ** d : null);
  const features = districts.map((d) => {
    const a = agg.get(d.name)!; const b = bAgg.get(d.name) ?? { n: 0, m2: 0, res: 0 };
    const areaM2 = d.polys.reduce((x, p) => x + polyAreaM2(p), 0);
    const wfv = mean(a.wf);
    return {
      type: "Feature" as const,
      geometry: { type: "MultiPolygon", coordinates: simplify(d.polys, 300) } as GeoJSON.Geometry,
      properties: {
        name: d.name, osmId: d.id, einwohner: Math.round(a.ew), zellen: a.cells,
        wohnflaecheProKopf: wfv, leerstandsquote: mean(a.ls),
        abweichung: wfv != null && cityAvg ? r1(((wfv - cityAvg) / cityAvg) * 100) : null,
        abdeckung: a.ew ? Math.round((a.wf[1] / a.ew) * 100) : 0,
        flaecheKm2: r2(areaM2 / 1e6), gebaeude: b.n, bebautAnteil: areaM2 ? r1((b.m2 / areaM2) * 100) : 0, wohnGrundflaecheM2: Math.round(b.res),
        anteil65: mean(a.o), abdeckung65: a.ew ? Math.round((a.o[1] / a.ew) * 100) : 0,
        raeumeProKopf: mean(a.r, 2), abdeckungRaeume: a.ew ? Math.round((a.r[1] / a.ew) * 100) : 0,
        efhAnteil: a.efh[1] ? r1(a.efh[0] / a.efh[1]) : null, versorgung: null,
      },
    };
  }).filter((f) => f.properties.zellen > 0);

  // ---- 500 m blocks (same layout as scripts/prepare_blocks.py)
  const groups = new Map<string, (number | string | null)[][]>();
  for (const c of gitter) {
    const [ix, iy] = tileOf(c[0] as number, c[1] as number);
    const k = `${c[9]}|${ix}|${iy}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(c);
  }
  const wmean = (cs: (number | string | null)[][], i: number) => {
    let a = 0, b = 0; for (const c of cs) if (c[i] != null && c[2]) { a += (c[i] as number) * (c[2] as number); b += c[2] as number; }
    return b ? r2(a / b) : null;
  };
  const cmean = (cs: (number | string | null)[][], i: number) => {
    const v = cs.map((c) => c[i]).filter((x) => x != null) as number[]; return v.length ? r2(v.reduce((a, b) => a + b, 0) / v.length) : null;
  };
  const blocke: unknown[][] = [];
  for (const [k, cs] of groups) {
    const ew = cs.reduce((a, c) => a + ((c[2] as number) ?? 0), 0);
    const vacRes = cs.reduce((a, c) => a + (c[4] != null ? ((c[2] as number) ?? 0) : 0), 0);
    blocke.push([k, ew, wmean(cs, 3), wmean(cs, 4), wmean(cs, 5), cmean(cs, 6), wmean(cs, 7), cmean(cs, 8), cs.length, ew ? Math.round((vacRes / ew) * 100) : 0, cs[0]![9]]);
  }

  // ---- future development blocks: 100 m sampling of exclusion areas
  const excl = osmPolys(exclEls);
  const tagged = (pred: (t: Record<string, string>) => boolean) => osmPolys(exclEls.filter((x) => pred(x.tags ?? {})));
  const testers = {
    nsg: makeTester(nsg), lsg: makeTester(lsg),
    forest: makeTester(tagged((t) => t.landuse === "forest" || t.natural === "wood")),
    cemetery: makeTester(tagged((t) => t.landuse === "cemetery" || t.amenity === "grave_yard")),
    allot: makeTester(tagged((t) => t.landuse === "allotments")),
    parking: makeTester(tagged((t) => t.amenity === "parking")),
    green: makeTester(tagged((t) => !!t.leisure)),
  };
  void excl;
  const SX = BLOCK_DLON / 5, SY = BLOCK_DLAT / 5; // ≈100 m
  const zukunft: Record<string, unknown>[] = [];
  for (const [k, cs] of groups) {
    const [dn, ixs, iys] = k.split("|");
    const ix = Number(ixs), iy = Number(iys);
    const d = districts.find((x) => x.name === dn)!;
    let land = 0, free = 0; const cnt: Record<string, number> = {};
    const freeTest: ((x: number, y: number) => boolean)[] = [];
    for (let a = 0; a < 5; a++) for (let b = 0; b < 5; b++) {
      const x = LON0 + ix * BLOCK_DLON + (a + 0.5) * SX, y = LAT0 + iy * BLOCK_DLAT + (b + 0.5) * SY;
      if (!d.test(x, y)) continue;
      land++;
      let hit = false;
      for (const [name, t] of Object.entries(testers)) if (t(x, y)) { cnt[name] = (cnt[name] ?? 0) + 1; hit = true; }
      if (!hit) free++;
    }
    void freeTest;
    if (!land) continue;
    const bs = bInBlock.get(k) ?? [];
    const builtM2 = bs.filter((b) => !Object.values(testers).some((t) => t(b.c[0], b.c[1]))).reduce((a, b) => a + b.m2, 0);
    const freeHa = free; // 1 sample ≈ 1 ha
    const x0 = LON0 + ix * BLOCK_DLON, y0 = LAT0 + iy * BLOCK_DLAT;
    zukunft.push({
      id: k, d: dn, ew: cs.reduce((a, c) => a + ((c[2] as number) ?? 0), 0),
      living: wmean(cs, 3), vac: wmean(cs, 4),
      cover: freeHa ? Math.min(100, r1((builtM2 / (freeHa * 10000)) * 100)) : null,
      freeHa, exclPct: Math.round(((land - free) / land) * 100),
      excl: Object.fromEntries(Object.entries(cnt).map(([kk, v]) => [kk, Math.round((v / land) * 100)])),
      fnpHa: 0, resHa: 0, farmPct: 0, rg: null,
      g: freeHa ? { type: "Polygon", coordinates: [[[x0, y0], [x0 + BLOCK_DLON, y0], [x0 + BLOCK_DLON, y0 + BLOCK_DLAT], [x0, y0 + BLOCK_DLAT], [x0, y0]]] } : null,
    });
  }

  const ew = features.reduce((a, f) => a + f.properties.einwohner, 0);
  void num;
  return {
    id: input.ags, name: input.name, ags: input.ags, hasFnp: false, hasGewerbe: false,
    blockOrigin: [LON0, LAT0],
    stadtteile: { type: "FeatureCollection", features },
    summary: { stadtWohnflaecheProKopf: cityAvg, einwohner: ew, zellen: gitter.length },
    gitter, blocke, versorgung: pts, zukunft, notes,
  };
}
