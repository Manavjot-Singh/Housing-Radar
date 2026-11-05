import { describe, expect, it } from "vitest";

import { analyses } from "@/lib/radar";

// The user dropped three ready-made analyses; they must not come back.
describe("Ready-made analyses", () => {
  const ids = analyses.map((a) => a.id);

  it("keeps the two analyses in scope plus housing + commercial vacancy", () => {
    expect(ids).toEqual(["leerstand-versorgung", "wohnungstausch", "wohn-gewerbe-leerstand"]);
  });

  it("combines housing vacancy with commercial vacancy", () => {
    const a = analyses.find((x) => x.id === "wohn-gewerbe-leerstand")!;
    expect(a.conditions.map((c) => c.ind)).toEqual(["leerstandsquote", "gewerbeLeerstand"]);
  });

  it("does not offer densification, crowded-housing or well-served vacancy", () => {
    expect(ids).not.toContain("nachverdichtung");
    expect(ids).not.toContain("knapp");
    expect(ids).not.toContain("leerstand-aktivieren");
    expect(analyses.some((a) => a.de.title === "Nachverdichtung an guter Infrastruktur")).toBe(false);
    expect(analyses.some((a) => a.de.title === "Wohnraum knapp")).toBe(false);
    expect(analyses.some((a) => a.de.title === "Leerstand an guter Lage")).toBe(false);
  });
});
