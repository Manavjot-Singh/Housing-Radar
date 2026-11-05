import zukunft from "@/data/zukunft-bloecke.json";
import { districtByName, BLOCK_LON0, BLOCK_LAT0, BLOCK_DLON, BLOCK_DLAT } from "@/lib/radar";

export type ExclKey = "nsg" | "lsg" | "flood" | "forest" | "cemetery" | "allot" | "parking" | "green";
export type FutureBlock = {
  id: string; d: string; ew: number;
  living: number | null; vac: number | null; cover: number | null;
  freeHa: number; fnpHa: number; resHa: number; farmPct: number; rg: GeoJSON.Geometry | null; exclPct: number; excl: Partial<Record<ExclKey, number>>;
  g: GeoJSON.Geometry | null;
};
export const futureBlocks = zukunft as unknown as FutureBlock[];

export type Thresholds = { living: number; vacancy: number; coverage: number; onlyPlanned: boolean };
export const DEFAULT_THRESHOLDS: Thresholds = { living: 50, vacancy: 11, coverage: 10, onlyPlanned: false };

export type Check = { ok: boolean | null; value: number | null; fromDistrict: boolean };
export type Evaluation = { living: Check; vacancy: Check; coverage: Check; pass: boolean };

/** Missing block values (census privacy gaps) fall back to the district value and are flagged. */
export function evaluate(b: FutureBlock, t: Thresholds): Evaluation {
  const dist = districtByName.get(b.d);
  const pick = (own: number | null, fallback: number | null | undefined) =>
    own != null ? { value: own, fromDistrict: false } : { value: fallback ?? null, fromDistrict: fallback != null };
  const lv = pick(b.living, dist?.wohnflaecheProKopf);
  const vc = pick(b.vac, dist?.leerstandsquote);
  const living: Check = { ...lv, ok: lv.value == null ? null : lv.value < t.living };
  const vacancy: Check = { ...vc, ok: vc.value == null ? null : vc.value <= t.vacancy };
  const coverage: Check = { value: b.cover, fromDistrict: false, ok: b.cover == null ? null : b.cover <= t.coverage };
  const pass = b.g != null && living.ok === true && vacancy.ok === true && coverage.ok === true && (!t.onlyPlanned || b.fnpHa > 0);
  return { living, vacancy, coverage, pass };
}

/* ---------- Quadrants & outward-growth direction ---------- */

/** City centre: Lüneburg town hall (Am Markt). */
export const CENTRE = { lat: 53.2486, lon: 10.4072 };
export type Quadrant = "NW" | "NE" | "SW" | "SE";
export const QUADRANTS: Quadrant[] = ["NW", "NE", "SW", "SE"];

export function blockCentre(b: FutureBlock) {
  const [, ix, iy] = b.id.split("|").map(Number);
  return { lon: BLOCK_LON0 + (ix + 0.5) * BLOCK_DLON, lat: BLOCK_LAT0 + (iy + 0.5) * BLOCK_DLAT };
}
export function quadrantOf(b: FutureBlock): Quadrant {
  const c = blockCentre(b);
  return `${c.lat >= CENTRE.lat ? "N" : "S"}${c.lon >= CENTRE.lon ? "E" : "W"}` as Quadrant;
}

export type QuadrantStat = {
  q: Quadrant; blocks: number; hits: number; hitHa: number; planHa: number;
  farmHa: number; exclPct: number; score: number;
};

/**
 * Score = area of blocks passing all conditions + unbuilt land-use-plan housing land.
 * Both count equally (ha); exclusions are already subtracted from both.
 */
export function quadrantStats(blocks: FutureBlock[], t: Thresholds): QuadrantStat[] {
  const out = QUADRANTS.map((q) => ({ q, blocks: 0, hits: 0, hitHa: 0, planHa: 0, farmHa: 0, exclPct: 0, score: 0 }));
  const area: Record<Quadrant, number> = { NW: 0, NE: 0, SW: 0, SE: 0 };
  for (const b of blocks) {
    const s = out[QUADRANTS.indexOf(quadrantOf(b))];
    s.blocks++;
    if (evaluate(b, t).pass) { s.hits++; s.hitHa += b.freeHa; }
    s.planHa += b.resHa;
    s.farmHa += (b.farmPct / 100) * b.freeHa;
    s.exclPct += b.exclPct; area[s.q]++;
  }
  for (const s of out) {
    s.exclPct = area[s.q] ? Math.round(s.exclPct / area[s.q]) : 0;
    s.score = Math.round(s.hitHa + s.planHa);
  }
  return out.sort((a, b) => b.score - a.score);
}
