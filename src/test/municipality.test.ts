import { describe, expect, it } from "vitest";
import { analyse, parseAlkisGml, type Poly } from "@/lib/municipality";

const square = (w: number, s: number, d: number): Poly => [[[w, s], [w + d, s], [w + d, s + d], [w, s + d], [w, s]]];

describe("municipality analysis", () => {
  it("reads ALKIS GML in lat-lon order and keeps the municipality key", () => {
    const xml = `<wfs:member><gml:posList>53.1 10.2 53.1 10.3 53.2 10.3 53.1 10.2</gml:posList><gmdschl>03355022</gmdschl></wfs:member>`;
    const [b] = parseAlkisGml(xml);
    expect(b.ags).toBe("03355022");
    expect(b.ring[0]).toEqual([10.2, 53.1]);
  });

  it("counts protected land only inside the boundary", () => {
    const r = analyse({
      name: "T", ags: "03000000", boundary: [square(10, 53, 0.02)],
      nsg: [square(10, 53, 0.01)], lsg: [square(9, 52, 0.01)], buildings: [], truncated: false,
    });
    expect(r.lsgHa).toBe(0);
    expect(r.nsgHa / r.areaHa).toBeGreaterThan(0.2);
    expect(r.nsgHa / r.areaHa).toBeLessThan(0.3);
  });
});
