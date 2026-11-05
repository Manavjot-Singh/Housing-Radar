import { describe, expect, it } from "vitest";
import { evaluate, futureBlocks, type FutureBlock } from "@/lib/future";

const base: FutureBlock = { id: "X|1|1", d: "Bockelsberg", ew: 100, living: 45, vac: 8, cover: 6, freeHa: 10, fnpHa: 0, resHa: 0, farmPct: 0, rg: null, exclPct: 0, excl: {}, g: { type: "Point", coordinates: [0, 0] } };
const t = { living: 50, vacancy: 11, coverage: 10, onlyPlanned: false };

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
    expect(n({ living: 60, vacancy: 15, coverage: 20, onlyPlanned: false })).toBeGreaterThanOrEqual(n(t));
  });
});

import { evaluate as ev2, futureBlocks as fb2 } from "@/lib/future";
describe("land-use plan filter", () => {
  it("only keeps blocks with plan housing land when ticked", () => {
    const loose = { living: 70, vacancy: 25, coverage: 40, onlyPlanned: true };
    const hits = fb2.filter((b) => ev2(b, loose).pass);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((b) => b.fnpHa > 0)).toBe(true);
  });
});

import { quadrantOf, quadrantStats } from "@/lib/future";
describe("quadrants", () => {
  it("assigns a block north-east of the town hall to NE", () => {
    // ix 15 → lon 10.41375, iy 33 → lat 53.25075
    expect(quadrantOf({ ...base, id: "X|15|33" })).toBe("NE");
    expect(quadrantOf({ ...base, id: "X|10|30" })).toBe("SW");
  });
  it("ranks the quadrant with more suitable + plan land first", () => {
    const a = { ...base, id: "X|15|33", freeHa: 5, resHa: 0 };
    const b = { ...base, id: "X|10|30", freeHa: 5, resHa: 8 };
    const r = quadrantStats([a, b], { living: 50, vacancy: 11, coverage: 10, onlyPlanned: false });
    expect(r[0].q).toBe("SW");
    expect(r[0].score).toBe(13);
  });
});
