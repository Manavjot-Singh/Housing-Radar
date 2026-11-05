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
};

export type Indicator = "wohnflaecheProKopf" | "leerstandsquote" | "anteil65" | "efhAnteil" | "raeumeProKopf" | "versorgung" | "bebautAnteil" | "einwohnerJeGebaeude";

type DistrictProps = Omit<District, "einwohnerJeGebaeude">;

export const geo = stadtteile as unknown as FeatureCollection<Geometry, DistrictProps>;

export const districts: District[] = geo.features.map((f) => ({
  ...f.properties,
  einwohnerJeGebaeude: f.properties.gebaeude > 0 ? f.properties.einwohner / f.properties.gebaeude : 0,
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
    label: "Versorgung", labelEn: "Amenities", hintEn: "How many of three amenities are within walking distance: supermarket (600 m), doctor (600 m), bus/rail stop (400 m).",
    unit: "/ 3", breaks: [0.5, 1.5, 2.5, 99], decimals: 1, gridSource: true, gridIndex: 8, legend: ["0", "1", "2", "3", ""],
    hint: "Wie viele von drei Angeboten zu Fuß erreichbar sind: Supermarkt (600 m), Arztpraxis (600 m), Bus-/Bahnhalt (400 m).",
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

/** Grid cell: [lon, lat, residents, living m²/person, vacancy %, 65+ %, 1–2-dwelling building %, rooms/person, amenities 0–3, district]. */
export type Cell = [number, number, number | null, number | null, number | null, number | null, number | null, number | null, number, string];

/** The cell's own value, or null when the census publishes none (or the indicator only exists per district). */
export function cellOwn(c: Cell, ind: Indicator): number | null {
  const i = indicators[ind].gridIndex;
  return i == null ? null : (c[i] as number | null);
}

/** The cell's value with the district value as fallback, used for combined analyses. */
export function cellValue(c: Cell, ind: Indicator): number | null {
  const own = cellOwn(c, ind);
  if (own != null) return own;
  const d = districtByName.get(c[9]);
  return d ? value(d, ind) : null;
}

export type Dir = "high" | "low";
export type Condition = { ind: Indicator; dir: Dir };

/** High = top two colour classes, low = bottom two. */
export function meets(v: number | null, cond: Condition): boolean | null {
  if (v == null) return null;
  const b = indicators[cond.ind].breaks;
  return cond.dir === "high" ? v >= b[2]! : v < b[1]!;
}

/** Threshold as text, e.g. "≥ 14 %" for high or "< 1,5 / 3" for low. */
export function thresholdText(cond: Condition, en = false): string {
  const i = indicators[cond.ind];
  const u = en && i.unit === "Pers." ? "ppl" : i.unit;
  const x = cond.dir === "high" ? i.breaks[2]! : i.breaks[1]!;
  if (cond.ind === "versorgung") return cond.dir === "high" ? (en ? "all 3 nearby" : "alle 3 in der Nähe") : (en ? "0–1 of 3 nearby" : "0–1 von 3 in der Nähe");
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
    de: { title: "Leerstand bei schlechter Versorgung", question: "Wo stehen Wohnungen leer, obwohl Supermarkt, Arzt oder Haltestelle fehlen?", action: "Stadtentwicklung: Versorgung und Anbindung verbessern, damit leere Wohnungen wieder gefragt sind." },
    en: { title: "Vacancy with poor amenities", question: "Where are dwellings empty while supermarket, doctor or stop are missing?", action: "Urban development: improve amenities and transport so empty homes become attractive again." },
  },
  {
    id: "leerstand-aktivieren",
    conditions: [{ ind: "leerstandsquote", dir: "high" }, { ind: "versorgung", dir: "high" }],
    de: { title: "Leerstand an guter Lage", question: "Wo stehen Wohnungen leer, obwohl alles zu Fuß erreichbar ist?", action: "Schnell wirksam: Eigentümer ansprechen, Leerstand aktivieren (Sanierungsberatung, Vermittlung)." },
    en: { title: "Vacancy in well-served areas", question: "Where are dwellings empty although everything is within walking distance?", action: "Quick win: contact owners and bring vacant homes back to the market (renovation advice, letting support)." },
  },
  {
    id: "wohnungstausch",
    conditions: [{ ind: "wohnflaecheProKopf", dir: "high" }, { ind: "anteil65", dir: "high" }],
    de: { title: "Viel Fläche, ältere Bewohner", question: "Wo leben viele Ältere auf viel Wohnfläche?", action: "Wohnungstausch und altersgerechte Wohnungen in der Nähe anbieten – frei werdende Häuser für Familien." },
    en: { title: "Large homes, older residents", question: "Where do many older people live on a lot of space?", action: "Offer home swaps and age-friendly flats nearby – freeing up houses for families." },
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
  { en: { name: "OpenStreetMap amenities", content: "62 supermarkets, 80 doctors' practices, 513 bus/rail stops", level: "Points", status: "Retrieved 5 Nov 2026" }, name: "Versorgung aus OpenStreetMap", publisher: "OpenStreetMap-Mitwirkende", content: "62 Supermärkte, 80 Arztpraxen, 513 Bus-/Bahnhalte", level: "Punkte", licence: "ODbL 1.0", status: "Abruf 05.11.2026", url: "https://www.openstreetmap.org" },
];
