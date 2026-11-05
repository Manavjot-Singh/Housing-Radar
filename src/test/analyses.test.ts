import { describe, expect, it } from "vitest";

import { analyses } from "@/lib/radar";

// The user dropped three ready-made analyses; they must not come back.
describe("Ready-made analyses", () => {
  const ids = analyses.map((a) => a.id);

  it("keeps only the two analyses in scope", () => {
    expect(ids).toEqual(["leerstand-versorgung", "wohnungstausch"]);
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
