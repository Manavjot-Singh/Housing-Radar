/**
 * Structure check for whichever city is installed in src/data. It holds every city to the
 * shape of the Lüneburg dashboard, so each major section has what it needs to render.
 * Run after every install: npx vitest run src/test/city-contract.test.ts
 */
import { describe, expect, it } from "vitest";
import gitter from "@/data/gitter.json";
import {
  analyses, blockOf, blocks, city, districts, features, geo, indicatorAvailable, indicators, sources, value, type Cell, type Indicator,
} from "@/lib/radar";
import { DEFAULT_THRESHOLDS, edgeBlocks, edgeSuggestions, evaluate, futureBlocks } from "@/lib/future";
import { recommend } from "@/lib/recommendations";

const DISTRICT_FIELDS = [
  "name", "osmId", "einwohner", "zellen", "wohnflaecheProKopf", "leerstandsquote", "abweichung", "abdeckung", "flaecheKm2",
  "gebaeude", "bebautAnteil", "wohnGrundflaecheM2", "anteil65", "abdeckung65", "raeumeProKopf", "abdeckungRaeume", "efhAnteil", "versorgung",
];
const FUTURE_FIELDS = ["id", "d", "ew", "living", "vac", "cover", "freeHa", "exclPct", "excl", "fnpHa", "resHa", "farmPct", "rg", "g"];
const CORE: Indicator[] = ["wohnflaecheProKopf", "leerstandsquote", "anteil65", "efhAnteil", "raeumeProKopf"];
const cells = gitter as unknown as Cell[];

describe(`data files of ${city.name}`, () => {
  it("has the same district fields as Lüneburg", () => {
    expect(geo.features.length).toBeGreaterThan(0);
    for (const f of geo.features) expect(Object.keys(f.properties).sort()).toEqual([...DISTRICT_FIELDS].sort());
  });
  it("keeps the grid and block row layout, and links every cell to a block", () => {
    expect(cells.length).toBeGreaterThan(0);
    for (const c of cells) {
      expect(c).toHaveLength(10);
      expect(blockOf(c)).not.toBeNull();
    }
    for (const b of blocks) expect(b).toHaveLength(11);
  });
});

describe(`map and legends of ${city.name}`, () => {
  it("opens on a real district inside the data", () => {
    expect(districts.some((d) => d.name === city.defaultDistrict)).toBe(true);
    const lat = cells.map((c) => c[1]), lon = cells.map((c) => c[0]);
    expect(city.center[0]).toBeGreaterThan(Math.min(...lat) - 0.1);
    expect(city.center[0]).toBeLessThan(Math.max(...lat) + 0.1);
    expect(city.center[1]).toBeGreaterThan(Math.min(...lon) - 0.1);
    expect(city.center[1]).toBeLessThan(Math.max(...lon) + 0.1);
  });
  it("has four rising colour breaks for every indicator, so each legend draws", () => {
    for (const i of Object.values(indicators)) {
      expect(i.breaks).toHaveLength(4);
      for (let n = 1; n < 4; n++) expect(i.breaks[n]!).toBeGreaterThan(i.breaks[n - 1]!);
    }
  });
});

describe(`analyses and custom layers of ${city.name}`, () => {
  it("keeps each census layer that has data, and at least one layer overall", () => {
    // Very small places can have census values suppressed; those layers hide instead of showing blanks.
    expect(CORE.some(indicatorAvailable)).toBe(true);
    for (const k of CORE) expect(indicatorAvailable(k), k).toBe(districts.some((d) => value(d, k) != null));
  });
  it("gives each ready-made analysis data behind it", () => {
    for (const a of analyses) for (const c of a.conditions) expect(indicatorAvailable(c.ind), `${a.id}: ${c.ind}`).toBe(true);
  });
  it("hides layers whose dataset is off", () => {
    if (!features.amenities) expect(indicatorAvailable("versorgung")).toBe(false);
    if (!features.buildings) expect(indicatorAvailable("bebautAnteil")).toBe(false);
    expect(indicatorAvailable("gewerbeLeerstand")).toBe(features.commercial);
  });
  it("has real values for each optional layer that stays on", () => {
    if (features.amenities) expect(districts.some((d) => (d.versorgung ?? 0) > 0)).toBe(true);
    if (features.buildings) expect(districts.some((d) => d.gebaeude > 0)).toBe(true);
  });
});

describe(`district panel and recommendations of ${city.name}`, () => {
  it("gives every district a resident count and at least one idea", () => {
    for (const d of districts) {
      expect(d.einwohner).toBeGreaterThanOrEqual(0);
      const p = { wohnflaecheProKopf: d.wohnflaecheProKopf, leerstandsquote: d.leerstandsquote, anteilAelter: d.anteil65, efhAnteil: d.efhAnteil };
      expect(recommend(p, p).length).toBeGreaterThan(0);
    }
  });
});

describe(`future development of ${city.name}`, () => {
  it("has blocks in the Lüneburg format", () => {
    expect(futureBlocks.length).toBeGreaterThan(0);
    for (const b of futureBlocks) expect(Object.keys(b).sort()).toEqual([...FUTURE_FIELDS].sort());
  });
  it("starts with sliders inside their ranges and every block evaluates", () => {
    expect(DEFAULT_THRESHOLDS.living).toBeGreaterThanOrEqual(30);
    expect(DEFAULT_THRESHOLDS.living).toBeLessThanOrEqual(70);
    expect(DEFAULT_THRESHOLDS.vacancy).toBeLessThanOrEqual(25);
    for (const b of futureBlocks) expect(() => evaluate(b, DEFAULT_THRESHOLDS)).not.toThrow();
  });
  it("finds the city edge for outward growth suggestions", () => {
    expect(edgeBlocks(futureBlocks).size).toBeGreaterThan(0);
    expect(() => edgeSuggestions(futureBlocks, DEFAULT_THRESHOLDS)).not.toThrow();
  });
});

describe(`sources page of ${city.name}`, () => {
  it("lists the census and complete rows for every source", () => {
    expect(sources.some((s) => s.name.startsWith("Zensus"))).toBe(true);
    for (const s of sources) {
      for (const f of [s.name, s.publisher, s.content, s.licence, s.status, s.en.name, s.en.content]) expect(f, s.name).toBeTruthy();
    }
  });
  it("does not credit a dataset this city skipped", () => {
    if (city.sources == null) return;
    const names = sources.map((s) => s.name).join("|");
    if (!features.amenities) expect(names).not.toContain("Versorgung");
    if (!features.buildings) expect(names).not.toContain("Gebäude");
    if (!features.fnp) expect(names).not.toContain("Flächennutzungsplan");
    if (!features.commercial) expect(names).not.toContain("Gewerbeleerstand");
  });
});
