import { city } from "@/lib/radar";
import { describe, expect, it } from "vitest";
import { blocks, blockValueOf, commercial, districts, meets } from "@/lib/radar";

describe.skipIf(city.name !== "Lüneburg")("Commercial vacancy (LeAn)", () => {
  it("counts 4 vacant and 4 at-risk units", () => {
    expect(commercial.reduce((s, x) => s + x[4], 0)).toBe(4);
    expect(commercial.reduce((s, x) => s + x[5], 0)).toBe(4);
  });
  it("has no value outside Altstadt instead of zero", () => {
    expect(districts.find((d) => d.name === "Altstadt")!.gewerbeLeerstand).toBe(8);
    expect(districts.filter((d) => d.name !== "Altstadt").every((d) => d.gewerbeLeerstand === null)).toBe(true);
    expect(blocks.filter((b) => b[10] !== "Altstadt").every((b) => blockValueOf(b, "gewerbeLeerstand") === null)).toBe(true);
  });
  it("the combined analysis finds at least one block", () => {
    const hit = blocks.filter((b) =>
      meets(blockValueOf(b, "leerstandsquote"), { ind: "leerstandsquote", dir: "high", min: 10 }) &&
      meets(blockValueOf(b, "gewerbeLeerstand"), { ind: "gewerbeLeerstand", dir: "high" }));
    expect(hit.length).toBeGreaterThan(0);
  });
});
