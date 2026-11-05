import zukunft from "@/data/zukunft-bloecke.json";
import { districtByName } from "@/lib/radar";

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
