// Live lookup of any German municipality: OSM (Nominatim + Overpass) for outlines,
// Zensus 2022 Regionaltabellen (precomputed src/data/gemeinden.json) for city-wide figures.

export type CityHit = {
  osmId: number;
  name: string;
  label: string;
  ags: string | null;
  outline: GeoJSON.Geometry | null;
};

export type CensusRow = {
  ags: string;
  name: string;
  einwohner: number | null;
  leerstandsquote: number | null;
  flaecheJeWohnung: number | null;
  wohnungen: number | null;
  efhAnteil: number | null;
  anteil67: number | null;
  wohnflaecheProKopf: number | null;
};

type RawRow = [string, string, number | null, number | null, number | null, number | null, number | null, number | null, number | null];

/** 12-digit ARS (Regionalschlüssel) → 8-digit AGS (Gemeindeschlüssel). */
export function arsToAgs(ars: string): string {
  return ars.length === 12 ? ars.slice(0, 5) + ars.slice(9) : ars;
}

export function toCensusRow(r: RawRow): CensusRow {
  return {
    ags: arsToAgs(r[0]), name: r[1], einwohner: r[2], leerstandsquote: r[3], flaecheJeWohnung: r[4],
    wohnungen: r[5], efhAnteil: r[6], anteil67: r[7], wohnflaecheProKopf: r[8],
  };
}

let censusCache: Map<string, CensusRow> | null = null;
export async function loadCensus(): Promise<Map<string, CensusRow>> {
  if (censusCache) return censusCache;
  const mod = await import("@/data/gemeinden.json");
  const rows = (mod.default ?? mod) as unknown as RawRow[];
  censusCache = new Map(rows.map((r) => { const c = toCensusRow(r); return [c.ags, c]; }));
  return censusCache;
}

export async function searchCities(q: string): Promise<CityHit[]> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=de&extratags=1&polygon_geojson=1&polygon_threshold=0.0005&limit=10&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const data = (await res.json()) as Array<{
    osm_type: string; osm_id: number; name: string; display_name: string; category?: string; type?: string;
    extratags?: Record<string, string>; geojson?: GeoJSON.Geometry;
  }>;
  return data
    .filter((d) => d.osm_type === "relation" && d.type === "administrative")
    .map((d) => {
      const ags = d.extratags?.["de:amtlicher_gemeindeschluessel"] ?? (d.extratags?.["de:regionalschluessel"] ? arsToAgs(d.extratags["de:regionalschluessel"]) : null);
      return { osmId: d.osm_id, name: d.name, label: d.display_name, ags: ags ?? null, outline: d.geojson ?? null };
    });
}

const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter"];

export type DistrictSet = { level: string; geojson: GeoJSON.FeatureCollection };

/** Sub-municipal admin boundaries (admin_level 9/10) inside the city, grouped by level. */
export async function fetchDistricts(osmId: number): Promise<DistrictSet[]> {
  const q = `[out:json][timeout:60];area(${3600000000 + osmId})->.a;rel(area.a)[boundary=administrative][admin_level~"^(9|10)$"];out geom;`;
  let json: unknown = null;
  for (const server of OVERPASS) {
    try {
      const res = await fetch(server, { method: "POST", body: "data=" + encodeURIComponent(q), headers: { "Content-Type": "application/x-www-form-urlencoded" } });
      if (res.ok) { json = await res.json(); break; }
    } catch { /* try next mirror */ }
  }
  if (!json) throw new Error("Overpass unavailable");
  const osmtogeojson = (await import("osmtogeojson")).default;
  const fc = osmtogeojson(json as never) as GeoJSON.FeatureCollection;
  const polys = fc.features.filter((f) => f.geometry && /Polygon/.test(f.geometry.type) && String(f.id ?? (f.properties as { id?: string })?.id ?? "").startsWith("relation"));
  const byLevel = new Map<string, GeoJSON.Feature[]>();
  for (const f of polys) {
    const p = f.properties as { admin_level?: string; tags?: Record<string, string> }; const lvl = String(p.tags?.['admin_level'] ?? p.admin_level ?? "");
    byLevel.set(lvl, [...(byLevel.get(lvl) ?? []), f]);
  }
  return [...byLevel.entries()].filter(([, fs]) => fs.length >= 2).sort((a, b) => a[0].localeCompare(b[0]))
    .map(([level, features]) => ({ level, geojson: { type: "FeatureCollection", features } }));
}

export function districtName(f: GeoJSON.Feature): string {
  const p = (f.properties ?? {}) as { name?: string; tags?: Record<string, string> };
  return p.tags?.['name'] ?? p.name ?? "?";
}
