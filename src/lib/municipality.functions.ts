import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { buildCity } from "./cityBuild";
import { analyse, centroid, geojsonToPolys, parseAlkisGml, polyAreaM2, polyBBox, type Building, type Poly } from "./municipality";

const UA = { "User-Agent": "HousingRadar/1.0 (Leuphana hackathon demo)" };
const SCHUTZ = "https://www.umweltkarten-niedersachsen.de/geoserver/SchutzgebieteNI/wfs";
const ALKIS = "https://opendata.lgln.niedersachsen.de/doorman/noauth/alkis_wfs_einfach";
const PAGE = 10_000;
const MAX_PAGES = 12;

async function protectedAreas(type: string, b: [number, number, number, number], filter: (p: Record<string, unknown>) => boolean): Promise<Poly[]> {
  const [w, s, e, n] = b;
  const q = new URLSearchParams({
    service: "WFS", version: "2.0.0", request: "GetFeature", typeNames: type,
    bbox: `${s},${w},${n},${e},urn:ogc:def:crs:EPSG::4326`, srsName: "EPSG:4326", outputFormat: "application/json",
  });
  const r = await fetch(`${SCHUTZ}?${q}`, { headers: UA });
  if (!r.ok) throw new Error(`Schutzgebiete: HTTP ${r.status}`);
  const j = (await r.json()) as { features: { geometry: { type: string; coordinates: unknown }; properties: Record<string, unknown> }[] };
  return j.features.filter((f) => filter(f.properties ?? {})).flatMap((f) => geojsonToPolys(f.geometry));
}

export const loadMunicipality = createServerFn({ method: "POST" })
  .inputValidator((d: { osmId: number; ags: string; name: string }) => {
    if (!Number.isInteger(d.osmId) || !/^03\d{6}$/.test(d.ags)) throw new Error("Nur Gemeinden in Niedersachsen");
    return { osmId: d.osmId, ags: d.ags, name: String(d.name).slice(0, 120) };
  })
  .handler(async ({ data }) => {
    // 1. Boundary from OpenStreetMap
    const nr = await fetch(`https://nominatim.openstreetmap.org/lookup?osm_ids=R${data.osmId}&format=json&polygon_geojson=1`, { headers: UA });
    if (!nr.ok) throw new Error(`Grenze: HTTP ${nr.status}`);
    const boundary = geojsonToPolys(((await nr.json()) as { geojson?: { type: string; coordinates: unknown } }[])[0]?.geojson);
    if (!boundary.length) throw new Error("Keine Gemeindegrenze gefunden");
    const bb = polyBBox(boundary);
    const [w, s, e, n] = bb;

    // 2. Nature reserves + landscape protection (NLWKN) and 3. ALKIS buildings (LGLN), in parallel
    const nsgP = protectedAreas("SchutzgebieteNI:ProtectedSites_IUCN_HabitatSpeciesManagementArea_Surface", bb, () => true);
    const lsgP = protectedAreas("SchutzgebieteNI:ProtectedSites_IUCN_ProtectedLandscapeOrSeascape_Surface", bb,
      (p) => p["d_3_designation"] === "LSG" || String(p["inspireid_localid"] ?? "").includes("LSG") || String(p["sitename_name_1"] ?? "").includes("Landschaftsschutz"));

    const buildings: Building[] = [];
    let truncated = false;
    for (let page = 0; page < MAX_PAGES; page++) {
      const q = new URLSearchParams({
        SERVICE: "WFS", VERSION: "2.0.0", REQUEST: "GetFeature", TYPENAMES: "ave:GebaeudeBauwerk",
        BBOX: `${s},${w},${n},${e},urn:ogc:def:crs:EPSG::4326`, SRSNAME: "urn:ogc:def:crs:EPSG::4326",
        COUNT: String(PAGE), STARTINDEX: String(page * PAGE),
      });
      const r = await fetch(`${ALKIS}?${q}`, { headers: UA });
      if (!r.ok) throw new Error(`ALKIS: HTTP ${r.status}`);
      const items = parseAlkisGml(await r.text());
      for (const it of items) if (it.ags === data.ags && it.ring.length > 2) buildings.push({ c: centroid(it.ring), m2: polyAreaM2([it.ring]) });
      if (items.length < PAGE) break;
      if (page === MAX_PAGES - 1) truncated = true;
    }

    const [nsg, lsg] = await Promise.all([nsgP, lsgP]);
    return analyse({ name: data.name, ags: data.ags, boundary, nsg, lsg, buildings, truncated });
  });

export const searchMunicipality = createServerFn({ method: "POST" })
  .inputValidator((d: { q: string }) => ({ q: String(d.q).trim().slice(0, 80) }))
  .handler(async ({ data }) => {
    const u = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({ q: `${data.q}, Niedersachsen`, countrycodes: "de", format: "jsonv2", extratags: "1", addressdetails: "1", limit: "15", "accept-language": "de" })}`;
    const r = await fetch(u, { headers: UA });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const rows = (await r.json()) as { osm_type: string; osm_id: number; name: string; display_name: string; address?: Record<string, string>; extratags?: Record<string, string> | null }[];
    const seen = new Set<string>();
    const hits: { osmId: number; name: string; label: string; ags: string }[] = [];
    for (const x of rows) {
      const ags = x.extratags?.["de:amtlicher_gemeindeschluessel"] ?? "";
      if (x.osm_type !== "relation" || x.address?.["ISO3166-2-lvl4"] !== "DE-NI" || !/^03\d{6}$/.test(ags) || seen.has(ags)) continue;
      seen.add(ags);
      hits.push({ osmId: x.osm_id, name: x.name, label: x.display_name, ags });
    }
    return hits;
  });

/** Builds the full dashboard data set for a town (census tiles + OSM + NLWKN + ALKIS). */
export const buildCityData = createServerFn({ method: "POST" })
  .inputValidator((d: { osmId: number; ags: string; name: string }) => {
    if (!Number.isInteger(d.osmId) || !/^03\d{6}$/.test(d.ags)) throw new Error("Nur Gemeinden in Niedersachsen");
    return { osmId: d.osmId, ags: d.ags, name: String(d.name).slice(0, 120) };
  })
  .handler(async ({ data }) => {
    const origin = new URL(getRequest().url).origin;
    return buildCity({ ...data, origin });
  });
