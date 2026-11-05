import blocke from "@/data/blocke.json";
import gitter from "@/data/gitter.json";
import gewerbe from "@/data/gewerbe.json";
import stadtteile from "@/data/stadtteile.json";
import summary from "@/data/summary.json";
import type { FeatureCollection, Geometry } from "geojson";

export type District = {
  name: string;
  osmId: number;
  einwohner: number;
  zellen: number;
  wohnflaecheProKopf: number | null;
  leerstandsquote: number | null;
  abweichung: number | null;
  abdeckung: number;
  flaecheKm2: number;
  gebaeude: number;
  bebautAnteil: number;
  wohnGrundflaecheM2: number;
  einwohnerJeGebaeude: number;
  anteil65: number | null;
  abdeckung65: number;
  raeumeProKopf: number | null;
  abdeckungRaeume: number;
  efhAnteil: number | null;
  versorgung: number | null;
  gewerbeLeerstand: number | null;
};

export type Indicator = "wohnflaecheProKopf" | "leerstandsquote" | "anteil65" | "efhAnteil" | "raeumeProKopf" | "versorgung" | "gewerbeLeerstand" | "bebautAnteil" | "einwohnerJeGebaeude";

type DistrictProps = Omit<District, "einwohnerJeGebaeude" | "gewerbeLeerstand">;

export const geo = stadtteile as unknown as FeatureCollection<Geometry, DistrictProps>;

// ============= Commercial vacancy (LeAn extract) =============
/** Street: [name, lon, lat, objects, vacant, at risk, reuse agreed] – built by scripts/prepare_gewerbe.py. */
export type CommercialStreet = [string, number, number, number, number, number, number];
export const commercial = gewerbe as unknown as CommercialStreet[];
/** The LeAn extract only covers Altstadt shopping streets; elsewhere commercial vacancy is unknown, not zero. */
export const COMMERCIAL_DISTRICT = "Altstadt";
const commercialTotal = commercial.reduce((s, x) => s + x[4] + x[5], 0);

function metres(lon1: number, lat1: number, lon2: number, lat2: number) {
  const dx = (lon1 - lon2) * 66600, dy = (lat1 - lat2) * 111200;
  return Math.sqrt(dx * dx + dy * dy);
}
/** Vacant + at-risk commercial units within `radius` m, or null outside the area the extract covers. */
export function commercialNear(lon: number, lat: number, radius: number, covered = radius + 150): number | null {
  let n = 0, near = false;
  for (const s of commercial) {
    const d = metres(lon, lat, s[1], s[2]);
    if (d <= covered) near = true;
    if (d <= radius) n += s[4] + s[5];
  }
  return near ? n : null;
}

export const districts: District[] = geo.features.map((f) => ({
  ...f.properties,
  einwohnerJeGebaeude: f.properties.gebaeude > 0 ? f.properties.einwohner / f.properties.gebaeude : 0,
  gewerbeLeerstand: f.properties.name === COMMERCIAL_DISTRICT ? commercialTotal : null,
}));

export const districtByName = new Map(districts.map((d) => [d.name, d]));

let loc = "de-DE";
/** Switches number formatting between German and English. */
export function setNumberLocale(l: "de" | "en") { loc = l === "en" ? "en-GB" : "de-DE"; }
export function fmtInt(x: number) { return x.toLocaleString(loc); }

export const cityAvg = summary.stadtWohnflaecheProKopf;
export const cityPopulation = summary.einwohner;

export const indicators: Record<
  Indicator,
  { label: string; labelEn: string; hintEn: string; unit: string; breaks: number[]; decimals: number; gridSource: boolean; hint: string; gridIndex?: number; legend?: string[] }
> = {
  wohnflaecheProKopf: {
    label: "Wohnfläche pro Einwohner", labelEn: "Living space per resident", hintEn: "Living space per person – weighted by residents.",
    unit: "m²",
    breaks: [47, 53, 59, 68],
    decimals: 1,
    gridSource: true, gridIndex: 3,
    hint: "Wie viel Wohnfläche auf eine Person entfällt – nach Einwohnern gewichtet.",
  },
  leerstandsquote: {
    label: "Leerstandsquote", labelEn: "Vacancy rate", hintEn: "Share of vacant dwellings counted by the census – housing only, no commercial space.",
    unit: "%",
    breaks: [8, 10, 14, 20],
    decimals: 1,
    gridSource: true, gridIndex: 4,
    hint: "Anteil leerstehender Wohnungen, gezählt vom Zensus – nur Wohnraum, kein Gewerbe.",
  },
  anteil65: {
    label: "Anteil ab 65 Jahren", labelEn: "Share aged 65+", hintEn: "Where older people live: share of residents aged 65 or over.",
    unit: "%", breaks: [13, 19, 27, 37], decimals: 1, gridSource: true, gridIndex: 5,
    hint: "Wo ältere Menschen wohnen: Anteil der Einwohner ab 65 Jahren.",
  },
  efhAnteil: {
    label: "Ein-/Zweifamilienhäuser", labelEn: "Detached / two-family houses", hintEn: "Share of residential buildings with 1–2 dwellings. Low values mean blocks of flats.",
    unit: "%", breaks: [45, 70, 85, 95], decimals: 0, gridSource: true, gridIndex: 6,
    hint: "Anteil der Wohngebäude mit 1–2 Wohnungen. Niedrige Werte bedeuten Mehrfamilienhäuser.",
  },
  raeumeProKopf: {
    label: "Räume pro Person", labelEn: "Rooms per person", hintEn: "Rooms in all dwellings divided by residents (7+ rooms counted as 7).",
    unit: "", breaks: [1.6, 2, 2.35, 2.8], decimals: 1, gridSource: true, gridIndex: 7,
    hint: "Räume aller Wohnungen geteilt durch die Einwohner (7 und mehr Räume als 7 gezählt).",
  },
  versorgung: {
    label: "Versorgung", labelEn: "Amenities", hintEn: "Share of the selected amenities within walking distance along real footpaths: supermarket, bakery, doctor (600 m each), bus/rail stop (400 m). With none ticked, all four count.",
    unit: "%", breaks: [12.5, 37.5, 62.5, 87.5], decimals: 0, gridSource: true, gridIndex: 8, legend: ["0 %", "25 %", "50 %", "75 %", "100 %"],
    hint: "Anteil der ausgewählten Angebote, die auf echten Fußwegen erreichbar sind: Supermarkt, Bäckerei, Arztpraxis (je 600 m), Bus-/Bahnhalt (400 m). Ist nichts angehakt, zählen alle vier.",
  },
  gewerbeLeerstand: {
    label: "Gewerbeleerstand", labelEn: "Commercial vacancy", hintEn: "Vacant or soon-to-be-vacant shops and commercial units within 250 m (LeAn extract, Altstadt shopping streets only – no data elsewhere).",
    unit: "Obj.", breaks: [0.5, 0.9, 1, 3], decimals: 0, gridSource: true, legend: ["0", "", "", "1–2", "≥ 3"],
    hint: "Leerstehende oder bald leerstehende Läden und Gewerbeflächen im Umkreis von 250 m (LeAn-Auszug, nur Altstadt-Einkaufsstraßen – anderswo keine Angabe).",
  },
  bebautAnteil: {
    label: "Bebauungsdichte", labelEn: "Building density", hintEn: "Share of district area covered by building footprints.",
    unit: "%",
    breaks: [5, 10, 15, 25],
    decimals: 1,
    gridSource: false,
    hint: "Anteil der Stadtteilfläche, der von Gebäudegrundrissen bedeckt ist.",
  },
  einwohnerJeGebaeude: {
    label: "Einwohner je Gebäude", labelEn: "Residents per building", hintEn: "Residents divided by officially recorded buildings – high values mean apartment blocks, low values single-family homes.",
    unit: "Pers.",
    breaks: [1.05, 1.2, 1.8, 2.2],
    decimals: 1,
    gridSource: false,
    hint: "Einwohner geteilt durch die amtlich erfassten Gebäude – hohe Werte stehen für Mehrfamilienhäuser, niedrige für Einzelfamilienhäuser.",
  },
};

/** Returns the scale class 1..5 (0 = no data). */
export function scaleClass(value: number | null, ind: Indicator): number {
  if (value == null) return 0;
  const b = indicators[ind].breaks;
  let c = 1;
  for (const x of b) if (value >= x) c++;
  return c;
}

export function value(d: District, ind: Indicator): number | null {
  return d[ind];
}

/** Grid cell: [lon, lat, residents, living m²/person, vacancy %, 65+ %, 1–2-dwelling building %, rooms/person, amenity reach bitmask (shop 1, doc 2, pt 4, bakery 8), district]. */
export type Cell = [number, number, number | null, number | null, number | null, number | null, number | null, number | null, number, string];

/** The cell's own value, or null when the census publishes none (or the indicator only exists per district). */
export function cellOwn(c: Cell, ind: Indicator): number | null {
  if (ind === "gewerbeLeerstand") return c[9] === COMMERCIAL_DISTRICT ? commercialNear(c[0], c[1], 250) : null;
  if (ind === "versorgung") return amenityScore(c[8]);
  const i = indicators[ind].gridIndex;
  return i == null ? null : (c[i] as number | null);
}

/** The cell's value with the district value as fallback, used for combined analyses. */
export function cellValue(c: Cell, ind: Indicator): number | null {
  const own = cellOwn(c, ind);
  if (own != null || ind === "gewerbeLeerstand") return own;
  const d = districtByName.get(c[9]);
  return d ? value(d, ind) : null;
}

// ============= 500 m blocks =============
// The 100 m census squares are ~4 pixels wide in the city overview, so the map groups them
// into ~500 m blocks (5 x 5 cells) that never cross a district border. scripts/prepare_blocks.py
// builds them from gitter.json; the tile grid below must stay identical to that script.
const BLOCK_LON0 = 10.30, BLOCK_LAT0 = 53.10, BLOCK_DLON = 0.0075, BLOCK_DLAT = 0.0045;

/** Block: [key, residents, living m²/person, vacancy %, 65+ %, 1–2-dwelling %, rooms/person, amenities, cells, vacancy coverage %, district]. */
export type Block = [string, number, number | null, number | null, number | null, number | null, number | null, number, number, number, string];

export const blocks = blocke as unknown as Block[];
const blockByKey = new Map(blocks.map((b) => [b[0], b]));

/** The block a cell belongs to, or null if the tile has no block (should not happen). */
export function blockOf(c: Cell): Block | null {
  const ix = Math.floor((c[0] - BLOCK_LON0) / BLOCK_DLON);
  const iy = Math.floor((c[1] - BLOCK_LAT0) / BLOCK_DLAT);
  return blockByKey.get(`${c[9]}|${ix}|${iy}`) ?? null;
}

/** The block's own value, or null when no cell in it carries one. */
export function blockOwn(b: Block, ind: Indicator): number | null {
  if (ind === "gewerbeLeerstand") {
    if (b[10] !== COMMERCIAL_DISTRICT) return null;
    const [, ix, iy] = b[0].split("|").map(Number);
    return commercialNear(BLOCK_LON0 + (ix! + 0.5) * BLOCK_DLON, BLOCK_LAT0 + (iy! + 0.5) * BLOCK_DLAT, 400);
  }
  if (ind === "versorgung") return blockAmenity.get(b[0]) ?? null;
  const i = indicators[ind].gridIndex;
  return i == null ? null : (b[i - 1] as number | null);
}

/** The block's value with the district value as fallback. */
export function blockValueOf(b: Block, ind: Indicator): number | null {
  const own = blockOwn(b, ind);
  if (own != null || ind === "gewerbeLeerstand") return own;
  const d = districtByName.get(b[10]);
  return d ? value(d, ind) : null;
}

/** The value of the block the cell sits in, with the district value as fallback. */
export function blockValue(c: Cell, ind: Indicator): number | null {
  const b = blockOf(c);
  return b ? blockValueOf(b, ind) : null;
}

// ============= Amenity score follows the selected amenities =============
export type AmenityKey = "shop" | "doc" | "pt" | "bakery";
export const AMENITY_BIT: Record<AmenityKey, number> = { shop: 1, doc: 2, pt: 4, bakery: 8 };
const ALL_AMENITIES = 15;
let amenityMask = ALL_AMENITIES;
const gridCells = gitter as unknown as Cell[];
const blockAmenity = new Map<string, number>();
const bits = (m: number) => { let n = 0; for (; m; m &= m - 1) n++; return n; };

/** % of the selected amenities a cell's reach bitmask covers. */
export function amenityScore(reach: number, mask = amenityMask): number {
  return (bits(reach & mask) / bits(mask)) * 100;
}

/** Re-scores cells, blocks and districts against the ticked amenities; none ticked = all four. */
export function setAmenitySelection(sel: Partial<Record<AmenityKey, boolean>>) {
  const m = (Object.keys(AMENITY_BIT) as AmenityKey[]).reduce((s, k) => (sel[k] ? s | AMENITY_BIT[k] : s), 0);
  amenityMask = m || ALL_AMENITIES;
  const blockSum = new Map<string, [number, number]>();
  const distSum = new Map<string, [number, number]>();
  for (const c of gridCells) {
    const v = amenityScore(c[8]);
    const b = blockOf(c);
    if (b) { const a = blockSum.get(b[0]) ?? [0, 0]; a[0] += v; a[1]++; blockSum.set(b[0], a); }
    if (c[2]) { const a = distSum.get(c[9]) ?? [0, 0]; a[0] += v * c[2]; a[1] += c[2]; distSum.set(c[9], a); }
  }
  blockAmenity.clear();
  for (const [k, [s, n]] of blockSum) blockAmenity.set(k, s / n);
  for (const d of districts) { const a = distSum.get(d.name); d.versorgung = a && a[1] ? a[0] / a[1] : null; }
}
/** Amenities currently counted (all four when none is ticked). */
export function countedAmenities(): AmenityKey[] {
  return (Object.keys(AMENITY_BIT) as AmenityKey[]).filter((k) => amenityMask & AMENITY_BIT[k]);
}

export type Dir = "high" | "low";
/** `min` overrides the default "high" threshold, e.g. for an analysis that needs a lower bar. */
export type Condition = { ind: Indicator; dir: Dir; min?: number };

/** High = top two colour classes, low = bottom two. */
export function meets(v: number | null, cond: Condition): boolean | null {
  if (v == null) return null;
  const b = indicators[cond.ind].breaks;
  return cond.dir === "high" ? v >= (cond.min ?? b[2]!) : v < b[1]!;
}

/** Threshold as text, e.g. "≥ 14 %" for high or "< 1,5 / 4" for low. */
export function thresholdText(cond: Condition, en = false): string {
  const i = indicators[cond.ind];
  const u = en && i.unit === "Pers." ? "ppl" : i.unit;
  const x = cond.dir === "high" ? (cond.min ?? i.breaks[2]!) : i.breaks[1]!;
  if (cond.ind === "gewerbeLeerstand") return cond.dir === "high" ? (en ? "≥ 1 unit within 250 m" : "≥ 1 Objekt im Umkreis von 250 m") : (en ? "none nearby" : "keins in der Nähe");
  if (cond.ind === "versorgung") return cond.dir === "high" ? (en ? "≥ 62.5 % of selected nearby" : "≥ 62,5 % der gewählten in der Nähe") : (en ? "< 37.5 % of selected nearby" : "< 37,5 % der gewählten in der Nähe");
  return `${cond.dir === "high" ? "≥" : "<"} ${fmtNum(x)}${u ? " " + u : ""}`;
}

export type Analysis = {
  id: string; conditions: Condition[];
  de: { title: string; question: string; action: string };
  en: { title: string; question: string; action: string };
};

export const analyses: Analysis[] = [
  {
    id: "leerstand-versorgung",
    conditions: [{ ind: "leerstandsquote", dir: "high" }, { ind: "versorgung", dir: "low" }],
    de: { title: "Leerstand bei schlechter Versorgung", question: "Wo stehen Wohnungen leer, obwohl Supermarkt, Bäckerei, Arzt oder Haltestelle fehlen?", action: "Stadtentwicklung: Versorgung und Anbindung verbessern, damit leere Wohnungen wieder gefragt sind." },
    en: { title: "Vacancy with poor amenities", question: "Where are dwellings empty while supermarket, bakery, doctor or stop are missing?", action: "Urban development: improve amenities and transport so empty homes become attractive again." },
  },
  {
    id: "wohnungstausch",
    conditions: [{ ind: "wohnflaecheProKopf", dir: "high" }, { ind: "anteil65", dir: "high" }],
    de: { title: "Viel Fläche, ältere Bewohner", question: "Wo leben viele Ältere auf viel Wohnfläche?", action: "Wohnungstausch und altersgerechte Wohnungen in der Nähe anbieten – frei werdende Häuser für Familien." },
    en: { title: "Large homes, older residents", question: "Where do many older people live on a lot of space?", action: "Offer home swaps and age-friendly flats nearby – freeing up houses for families." },
  },
  {
    id: "wohn-gewerbe-leerstand",
    conditions: [{ ind: "leerstandsquote", dir: "high", min: 10 }, { ind: "gewerbeLeerstand", dir: "high" }],
    de: { title: "Wohn- und Gewerbeleerstand", question: "Wo stehen Wohnungen leer und zugleich Läden oder Gewerbeflächen?", action: "Gewerbeleerstand abbauen: leere Läden für Community-Projekte, Pop-up-Nutzungen oder Umbau zu Wohnungen öffnen – eine belebte Straße macht auch die Wohnungen darüber wieder gefragt." },
    en: { title: "Housing and commercial vacancy", question: "Where are dwellings empty and shops or commercial units too?", action: "Reduce commercial vacancy: open empty shops for community projects, pop-ups or conversion to flats – a lively street makes the homes above attractive again." },
  },
];

function num(x: number, decimals: number) {
  return x.toLocaleString(loc, { minimumFractionDigits: 0, maximumFractionDigits: decimals });
}

/** Formats a value for the given indicator with German number style. */
export function formatValue(v: number | null, ind: Indicator): string {
  if (v == null) return loc === "en-GB" ? "no data" : "keine Angabe";
  const i = indicators[ind];
  const s = v.toLocaleString(loc, { minimumFractionDigits: i.decimals, maximumFractionDigits: i.decimals });
  return i.unit ? `${s} ${i.unit}` : s;
}

/** Formats a scale break or threshold number. */
export function fmtNum(x: number | undefined) {
  return x == null ? "" : num(x, 2);
}

/** One-decimal German number, e.g. 1,9. */
export function fmt1(x: number) {
  return x.toLocaleString(loc, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** German number with at most one decimal, e.g. 72 or 50,2. */
export function fmtAuto(x: number | null | undefined) {
  return x == null ? "–" : x.toLocaleString(loc, { maximumFractionDigits: 1 });
}

export function verdict(d: District, lang: "de" | "en" = "de"): string {
  if (lang === "en") {
    if (d.wohnflaecheProKopf == null) return "Not enough data.";
    const a = d.abweichung ?? 0;
    if (a >= 10) return `Comparatively few people live on a lot of space here: ${a.toFixed(0)} % more per person than the Lüneburg average. A starting point for advice on home swaps, conversions or granny flats.`;
    if (a <= -7) return `Living space is scarce here: ${Math.abs(a).toFixed(0)} % less space per person than average. New housing or densification nearby would relieve pressure.`;
    return "Living space per person is close to the Lüneburg average.";
  }
  if (d.wohnflaecheProKopf == null) return "Keine ausreichenden Daten.";
  const a = d.abweichung ?? 0;
  if (a >= 10) return `Hier leben vergleichsweise wenige Menschen auf viel Wohnfläche: ${a.toFixed(0)} % mehr pro Kopf als im Lüneburger Schnitt. Ansatzpunkt für Beratung zu Wohnungstausch, Umbau oder Einliegerwohnungen.`;
  if (a <= -7) return `Hier ist Wohnraum knapp: ${Math.abs(a).toFixed(0)} % weniger Fläche pro Kopf als im Schnitt. Neubau oder Verdichtung in der Umgebung würde hier entlasten.`;
  return "Die Wohnfläche pro Kopf liegt nahe am Lüneburger Durchschnitt.";
}

export type Source = { en: { name: string; content: string; level: string; status: string }; name: string; publisher: string; content: string; level: string; licence: string; status: string; url: string };

export const sources: Source[] = [
  { en: { name: "Census 2022 – Population", content: "Residents per grid cell", level: "100 m grid (EPSG:3035)", status: "Reference date 15 May 2022" }, name: "Zensus 2022 – Bevölkerungszahl", publisher: "Statistisches Bundesamt", content: "Einwohner je Gitterzelle", level: "100-m-Gitter (EPSG:3035)", licence: "Datenlizenz Deutschland – Namensnennung 2.0", status: "Stichtag 15.05.2022", url: "https://www.destatis.de/DE/Themen/Gesellschaft-Umwelt/Bevoelkerung/Zensus2022/_publikationen.html" },
  { en: { name: "Census 2022 – Average living space per resident", content: "m² living space per resident", level: "100 m grid (EPSG:3035)", status: "Reference date 15 May 2022" }, name: "Zensus 2022 – Durchschnittliche Wohnfläche je Bewohner", publisher: "Statistisches Bundesamt", content: "m² Wohnfläche pro Bewohner", level: "100-m-Gitter (EPSG:3035)", licence: "Datenlizenz Deutschland – Namensnennung 2.0", status: "Stichtag 15.05.2022", url: "https://www.destatis.de/DE/Themen/Gesellschaft-Umwelt/Bevoelkerung/Zensus2022/_publikationen.html" },
  { en: { name: "Census 2022 – Vacancy rate", content: "Share of vacant dwellings – housing only, commercial space (shops, offices) not included", level: "100 m grid (EPSG:3035)", status: "Reference date 15 May 2022" }, name: "Zensus 2022 – Leerstandsquote", publisher: "Statistisches Bundesamt", content: "Anteil leerstehender Wohnungen – nur Wohnraum, Gewerbe (Läden, Büros) ist nicht enthalten", level: "100-m-Gitter (EPSG:3035)", licence: "Datenlizenz Deutschland – Namensnennung 2.0", status: "Stichtag 15.05.2022", url: "https://www.destatis.de/DE/Themen/Gesellschaft-Umwelt/Bevoelkerung/Zensus2022/_publikationen.html" },
  { en: { name: "Lüneburg district boundaries", content: "17 districts as polygons", level: "District polygons", status: "Retrieved 5 Nov 2026" }, name: "Stadtteilgrenzen Lüneburg", publisher: "OpenStreetMap-Mitwirkende", content: "17 Stadtteile als Flächen", level: "Stadtteil-Polygone", licence: "ODbL 1.0", status: "Abruf 05.11.2026", url: "https://www.openstreetmap.org/relation/4191677" },
  { en: { name: "ALKIS building footprints Lower Saxony", content: "47,415 official building footprints in the city, used for building density and building count per district", level: "Individual footprints (EPSG:25832)", status: "Extracted 3 Sep 2026, updated quarterly" }, name: "ALKIS Hausumringe Niedersachsen", publisher: "LGLN (Landesamt für Geoinformation und Landesvermessung)", content: "47.415 amtliche Gebäudegrundrisse der Hansestadt, daraus Bebauungsdichte und Gebäudezahl je Stadtteil", level: "Einzelflächen (EPSG:25832)", licence: "CC-BY 4.0", status: "Auslesedatum 03.09.2026, vierteljährlich aktualisiert", url: "https://ni-lgln-opengeodata.hub.arcgis.com/pages/alkis-hausumringe" },
  { en: { name: "Census 2022 – Share aged 65+", content: "Share of residents aged 65 and over", level: "100 m grid (EPSG:3035)", status: "Reference date 15 May 2022" }, name: "Zensus 2022 – Anteil ab 65-Jährige", publisher: "Statistisches Bundesamt", content: "Anteil der Einwohner ab 65 Jahren", level: "100-m-Gitter (EPSG:3035)", licence: "Datenlizenz Deutschland – Namensnennung 2.0", status: "Stichtag 15.05.2022", url: "https://www.destatis.de/DE/Themen/Gesellschaft-Umwelt/Bevoelkerung/Zensus2022/_publikationen.html" },
  { en: { name: "Census 2022 – Buildings by number of dwellings", content: "Residential buildings with 1, 2, 3–6, 7–12, 13+ dwellings", level: "100 m grid (EPSG:3035)", status: "Reference date 15 May 2022" }, name: "Zensus 2022 – Gebäude nach Anzahl der Wohnungen", publisher: "Statistisches Bundesamt", content: "Wohngebäude mit 1, 2, 3–6, 7–12, 13+ Wohnungen", level: "100-m-Gitter (EPSG:3035)", licence: "Datenlizenz Deutschland – Namensnennung 2.0", status: "Stichtag 15.05.2022", url: "https://www.destatis.de/DE/Themen/Gesellschaft-Umwelt/Bevoelkerung/Zensus2022/_publikationen.html" },
  { en: { name: "Census 2022 – Dwellings by number of rooms", content: "Dwellings with 1 to 7+ rooms", level: "100 m grid (EPSG:3035)", status: "Reference date 15 May 2022" }, name: "Zensus 2022 – Wohnungen nach Zahl der Räume", publisher: "Statistisches Bundesamt", content: "Wohnungen mit 1 bis 7+ Räumen", level: "100-m-Gitter (EPSG:3035)", licence: "Datenlizenz Deutschland – Namensnennung 2.0", status: "Stichtag 15.05.2022", url: "https://www.destatis.de/DE/Themen/Gesellschaft-Umwelt/Bevoelkerung/Zensus2022/_publikationen.html" },
  { en: { name: "LeAn extract – commercial vacancy", content: "55 commercial units in Altstadt shopping streets with status (4 vacant, 4 at risk); owner data removed", level: "Street (house numbers anonymised)", status: "Extract provided by the city for the hackathon" }, name: "LeAn-Auszug – Gewerbeleerstand", publisher: "Hansestadt Lüneburg, Leerstandsmanagement (LeAn)", content: "55 Gewerbeobjekte in Altstadt-Einkaufsstraßen mit Status (4 leer, 4 drohend leer); Eigentümerdaten entfernt", licence: "Bereitgestellt für den Hackathon (Ausnahme laut Challenge)", level: "Straße (Hausnummern anonymisiert)", status: "Auszug der Stadt für den Hackathon", url: "https://www.hansestadt-lueneburg.de" },
  { en: { name: "OpenStreetMap amenities", content: "62 supermarkets, 55 bakeries, 80 doctors' practices, 513 bus/rail stops", level: "Points", status: "Retrieved 5 Nov 2026" }, name: "Versorgung aus OpenStreetMap", publisher: "OpenStreetMap-Mitwirkende", content: "62 Supermärkte, 55 Bäckereien, 80 Arztpraxen, 513 Bus-/Bahnhalte", level: "Punkte", licence: "ODbL 1.0", status: "Abruf 05.11.2026", url: "https://www.openstreetmap.org" },
  { en: { name: "Nature reserves (NSG)", content: "Five protected polygons; subtracted from the future-development blocks", level: "City-clipped polygons", status: "NLWKN WFS extract 5 Nov 2026" }, name: "Naturschutzgebiete Niedersachsen", publisher: "NLWKN · Niedersächsisches Umweltkarten-Geoportal", content: "Fünf Schutzgebietsflächen; von den Blöcken der zukünftigen Entwicklung abgezogen", level: "Auf Stadtteilumgrenzung zugeschnittene Polygone", licence: "Datenlizenz Deutschland – Namensnennung 2.0", status: "NLWKN-WFS-Auszug 05.11.2026", url: "https://umweltportal.niedersachsen.de/suche/detail?id=numis-metadaten-7d3a9e20-4519-456e-8a75-b6d18250c5a8" },
  { en: { name: "Landscape protection areas (LSG)", content: "Subtracted from the future-development blocks", level: "City-clipped polygons", status: "NLWKN WFS extract 5 Nov 2026" }, name: "Landschaftsschutzgebiete Niedersachsen", publisher: "NLWKN · Niedersächsisches Umweltkarten-Geoportal", content: "Von den Blöcken der zukünftigen Entwicklung abgezogen", level: "Auf die Stadt zugeschnittene Polygone", licence: "Datenlizenz Deutschland – Namensnennung 2.0", status: "NLWKN-WFS-Auszug 05.11.2026", url: "https://www.umweltkarten-niedersachsen.de/" },
  { en: { name: "Flood zones (designated + provisionally secured)", content: "HQ100 flood zones, subtracted from the future-development blocks", level: "City-clipped polygons", status: "NLWKN service extract 5 Nov 2026" }, name: "Überschwemmungsgebiete Niedersachsen (festgesetzt + vorläufig gesichert)", publisher: "NLWKN · Hochwasserschutz-Kartendienst", content: "HQ100-Überschwemmungsgebiete, von den Blöcken der zukünftigen Entwicklung abgezogen", level: "Auf die Stadt zugeschnittene Polygone", licence: "Datenlizenz Deutschland – Namensnennung 2.0", status: "NLWKN-Auszug 05.11.2026", url: "https://www.nlwkn.niedersachsen.de/hochwasser_kuestenschutz/hochwasserschutz/ueberschwemmungsgebiete/" },
  { en: { name: "OpenStreetMap – forests, cemeteries, building footprints", content: "Forests and cemeteries subtracted; building footprints give the coverage of the remaining land per block", level: "Polygons, aggregated to ~500 m blocks", status: "Overpass extract 5 Nov 2026" }, name: "OpenStreetMap – Wald, Friedhöfe, Gebäudeumrisse", publisher: "OpenStreetMap-Mitwirkende", content: "Wald und Friedhöfe abgezogen; Gebäudeumrisse ergeben die Bebauung der verbleibenden Fläche je Block", level: "Polygone, auf ~500-m-Blöcke verdichtet", licence: "ODbL 1.0", status: "Overpass-Auszug 05.11.2026", url: "https://www.openstreetmap.org/copyright" },
];

setAmenitySelection({});
