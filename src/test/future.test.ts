import { describe, expect, it } from "vitest";
import { evaluate, futureBlocks, type FutureBlock } from "@/lib/future";

const base: FutureBlock = { id: "X|1|1", d: "Bockelsberg", ew: 100, living: 45, vac: 8, cover: 6, freeHa: 10, exclPct: 0, excl: {}, g: { type: "Point", coordinates: [0, 0] } };
const t = { living: 50, vacancy: 11, coverage: 10 };

describe("future development screen", () => {
  it("passes a block under 50 m², at most 11 % vacancy, at most 10 % coverage", () => {
    expect(evaluate(base, t).pass).toBe(true);
  });
  it("fails at exactly 50 m² living space", () => {
    expect(evaluate({ ...base, living: 50 }, t).pass).toBe(false);
  });
  it("still passes at exactly 11 % vacancy and 10 % coverage", () => {
    expect(evaluate({ ...base, vac: 11, cover: 10 }, t).pass).toBe(true);
  });
  it("never passes a block whose area is fully excluded", () => {
    expect(evaluate({ ...base, g: null }, t).pass).toBe(false);
  });
  it("uses the district value when the block's vacancy is missing", () => {
    const e = evaluate({ ...base, vac: null }, t);
    expect(e.vacancy.fromDistrict).toBe(true);
  });
  it("loosening the sliders never removes a matching block", () => {
    const n = (x: typeof t) => futureBlocks.filter((b) => evaluate(b, x).pass).length;
    expect(n({ living: 60, vacancy: 15, coverage: 20 })).toBeGreaterThanOrEqual(n(t));
  });
});
