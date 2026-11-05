import { describe, expect, it } from "vitest";

import { analyses } from "@/lib/radar";

// The user dropped two ready-made analyses; they must not come back.
describe("Ready-made analyses", () => {
  const ids = analyses.map((a) => a.id);

  it("keeps only the three analyses in scope", () => {
    expect(ids).toEqual(["leerstand-versorgung", "leerstand-aktivieren", "wohnungstausch"]);
  });

  it("does not offer densification or crowded-housing", () => {
    expect(ids).not.toContain("nachverdichtung");
    expect(ids).not.toContain("knapp");
    expect(analyses.some((a) => a.de.title === "Nachverdichtung an guter Infrastruktur")).toBe(false);
    expect(analyses.some((a) => a.de.title === "Wohnraum knapp")).toBe(false);
  });
});
