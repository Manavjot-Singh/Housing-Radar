import { describe, expect, it } from "vitest";
import rows from "@/data/gemeinden.json";
import { arsToAgs, toCensusRow } from "@/lib/citySearch";

describe("city search census lookup", () => {
  it("turns the 12-digit regional key into the 8-digit municipality key", () => {
    expect(arsToAgs("033550022022")).toBe("03355022");
  });
  it("finds Lüneburg's census figures by its municipality key", () => {
    const lg = (rows as never[]).map(toCensusRow).find((r) => r.ags === "03355022");
    expect(lg?.einwohner).toBe(72870);
    expect(lg?.leerstandsquote).toBe(3.5);
  });
});
