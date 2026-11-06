import { describe, expect, it } from "vitest";
import * as radar from "@/lib/radar";

const fake = {
  name: "Testdorf", hasGewerbe: false, hasFnp: false, blockOrigin: [10, 52] as [number, number],
  stadtteile: { type: "FeatureCollection", features: [{ type: "Feature", geometry: null, properties: { name: "Mitte", einwohner: 100, gebaeude: 50 } }] },
  summary: { stadtWohnflaecheProKopf: 40, einwohner: 100 },
  gitter: [], blocke: [], versorgung: { shop: [], doc: [], pt: [], bakery: [] },
};

describe("switching the dashboard town", () => {
  it("replaces districts and hides Lüneburg-only shop vacancy, then restores Lüneburg", () => {
    radar.loadCity(fake);
    expect(radar.cityName).toBe("Testdorf");
    expect(radar.districts.map((d) => d.name)).toEqual(["Mitte"]);
    expect(radar.districts[0]!.gewerbeLeerstand).toBeNull();
    expect(radar.hasFnp).toBe(false);
    radar.loadCity(null);
    expect(radar.cityName).toBe("Lüneburg");
    expect(radar.districts.length).toBe(17);
    expect(radar.hasGewerbe).toBe(true);
  });
});
