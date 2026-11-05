import { describe, expect, it } from "vitest";
import { recommend } from "@/lib/recommendations";

const ref = { wohnflaecheProKopf: 45, leerstandsquote: 3.5, anteilAelter: 20, efhAnteil: 40 };

describe("recommendations", () => {
  it("suggests homeshare where many older people live in large houses", () => {
    const ids = recommend({ wohnflaecheProKopf: 60, anteilAelter: 30, efhAnteil: 70, leerstandsquote: 3 }, ref).map((i) => i.id);
    expect(ids).toContain("wohnenFuerHilfe");
  });
  it("does not suggest homeshare where residents are young", () => {
    const ids = recommend({ wohnflaecheProKopf: 60, anteilAelter: 10, efhAnteil: 70 }, ref).map((i) => i.id);
    expect(ids).not.toContain("wohnenFuerHilfe");
  });
  it("gives different ideas for different places", () => {
    const a = recommend({ leerstandsquote: 8, wohnflaecheProKopf: 45 }, ref).map((i) => i.id);
    const b = recommend({ leerstandsquote: 2, wohnflaecheProKopf: 35 }, ref).map((i) => i.id);
    expect(a).toContain("leerstandAktivieren");
    expect(b).toEqual(["knapp"]);
  });
});
