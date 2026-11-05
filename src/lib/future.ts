import zukunft from "@/data/zukunft-bloecke.json";
import { districtByName } from "@/lib/radar";

export type ExclKey = "nsg" | "lsg" | "flood" | "forest" | "cemetery" | "allot" | "parking" | "green";
export type FutureBlock = {
  id: string; d: string; ew: number;
  living: number | null; vac: number | null; cover: number | null;
  freeHa: number; fnpHa: number; resHa: number; farmPct: number; rg: GeoJSON.Geometry | null; exclPct: number; excl: Partial<Record<ExclKey, number>>;
  g: GeoJSON.Geometry | null;
};
export let futureBlocks = zukunft as unknown as FutureBlock[];
/** null restores Lüneburg. */
export function setFutureBlocks(b: unknown[] | null) { futureBlocks = (b ?? zukunft) as FutureBlock[]; }

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

/* ---------- Outward growth at the city edge ---------- */

function tile(b: FutureBlock) {
  const [, ix = 0, iy = 0] = b.id.split("|").map(Number);
  return { ix, iy };
}

/** A block is on the city edge when at least one of its 4 neighbouring tiles lies outside the city. */
export function edgeBlocks(blocks: FutureBlock[]): Set<string> {
  const have = new Set(blocks.map((b) => { const { ix, iy } = tile(b); return `${ix}|${iy}`; }));
  const out = new Set<string>();
  for (const b of blocks) {
    const { ix, iy } = tile(b);
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !have.has(`${ix + dx!}|${iy + dy!}`))) out.add(b.id);
  }
  return out;
}

export type EdgeSuggestion = { district: string; ha: number; blockIds: string[] };

/**
 * Edge blocks qualify when they meet all conditions or hold still-unbuilt land-use-plan housing land.
 * Districts are ranked by that suitable area (ha).
 */
export function edgeSuggestions(blocks: FutureBlock[], t: Thresholds): EdgeSuggestion[] {
  const edge = edgeBlocks(blocks);
  const by = new Map<string, EdgeSuggestion>();
  for (const b of blocks) {
    if (!edge.has(b.id) || !b.g) continue;
    const pass = evaluate(b, t).pass;
    const ha = (pass ? b.freeHa : 0) + (pass ? 0 : b.resHa);
    if (ha <= 0) continue;
    const s = by.get(b.d) ?? { district: b.d, ha: 0, blockIds: [] };
    s.ha += ha; s.blockIds.push(b.id); by.set(b.d, s);
  }
  return [...by.values()].sort((a, b) => b.ha - a.ha);
}
