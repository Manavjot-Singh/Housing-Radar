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
};

export type Indicator = "wohnflaecheProKopf" | "leerstandsquote" | "bebautAnteil" | "einwohnerJeGebaeude";

type DistrictProps = Omit<District, "einwohnerJeGebaeude">;

export const geo = stadtteile as unknown as FeatureCollection<Geometry, DistrictProps>;

export const districts: District[] = geo.features.map((f) => ({
  ...f.properties,
  einwohnerJeGebaeude: f.properties.gebaeude > 0 ? f.properties.einwohner / f.properties.gebaeude : 0,
}));

export const districtByName = new Map(districts.map((d) => [d.name, d]));

export const cityAvg = summary.stadtWohnflaecheProKopf;
export const cityPopulation = summary.einwohner;

export const indicators: Record<
  Indicator,
  { label: string; unit: string; breaks: number[]; decimals: number; gridSource: boolean; hint: string }
> = {
  wohnflaecheProKopf: {
    label: "Wohnfläche pro Einwohner",
    unit: "m²",
    breaks: [48, 52, 56, 61],
    decimals: 1,
    gridSource: true,
    hint: "Wie viel Wohnfläche auf eine Person entfällt – nach Einwohnern gewichtet.",
  },
  leerstandsquote: {
    label: "Leerstandsquote",
    unit: "%",
    breaks: [8, 10, 14, 20],
    decimals: 1,
    gridSource: true,
    hint: "Anteil leerstehender Wohnungen, gezählt vom Zensus – nur Wohnraum, kein Gewerbe.",
  },
  bebautAnteil: {
    label: "Bebauungsdichte",
    unit: "%",
    breaks: [5, 10, 15, 25],
    decimals: 1,
    gridSource: false,
    hint: "Anteil der Stadtteilfläche, der von Gebäudegrundrissen bedeckt ist.",
  },
  einwohnerJeGebaeude: {
    label: "Einwohner je Gebäude",
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

function num(x: number, decimals: number) {
  return x.toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: decimals });
}

/** Formats a value for the given indicator with German number style. */
export function formatValue(v: number | null, ind: Indicator): string {
  if (v == null) return "keine Angabe";
  const i = indicators[ind];
  const s = v.toLocaleString("de-DE", { minimumFractionDigits: i.decimals, maximumFractionDigits: i.decimals });
  return i.unit ? `${s} ${i.unit}` : s;
}

/** Formats a scale break or threshold number. */
export function fmtNum(x: number) {
  return num(x, 2);
}

/** One-decimal German number, e.g. 1,9. */
export function fmt1(x: number) {
  return x.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function verdict(d: District): string {
  if (d.wohnflaecheProKopf == null) return "Keine ausreichenden Daten.";
  const a = d.abweichung ?? 0;
  if (a >= 10) return `Hier leben vergleichsweise wenige Menschen auf viel Wohnfläche: ${a.toFixed(0)} % mehr pro Kopf als im Lüneburger Schnitt. Ansatzpunkt für Beratung zu Wohnungstausch, Umbau oder Einliegerwohnungen.`;
  if (a <= -7) return `Hier ist Wohnraum knapp: ${Math.abs(a).toFixed(0)} % weniger Fläche pro Kopf als im Schnitt. Neubau oder Verdichtung in der Umgebung würde hier entlasten.`;
  return "Die Wohnfläche pro Kopf liegt nahe am Lüneburger Durchschnitt.";
}

export type Source = { name: string; publisher: string; content: string; level: string; licence: string; status: string; url: string };

export const sources: Source[] = [
  { name: "Zensus 2022 – Bevölkerungszahl", publisher: "Statistisches Bundesamt", content: "Einwohner je Gitterzelle", level: "100-m-Gitter (EPSG:3035)", licence: "Datenlizenz Deutschland – Namensnennung 2.0", status: "Stichtag 15.05.2022", url: "https://www.destatis.de/DE/Themen/Gesellschaft-Umwelt/Bevoelkerung/Zensus2022/_publikationen.html" },
  { name: "Zensus 2022 – Durchschnittliche Wohnfläche je Bewohner", publisher: "Statistisches Bundesamt", content: "m² Wohnfläche pro Bewohner", level: "100-m-Gitter (EPSG:3035)", licence: "Datenlizenz Deutschland – Namensnennung 2.0", status: "Stichtag 15.05.2022", url: "https://www.destatis.de/DE/Themen/Gesellschaft-Umwelt/Bevoelkerung/Zensus2022/_publikationen.html" },
  { name: "Zensus 2022 – Leerstandsquote", publisher: "Statistisches Bundesamt", content: "Anteil leerstehender Wohnungen – nur Wohnraum, Gewerbe (Läden, Büros) ist nicht enthalten", level: "100-m-Gitter (EPSG:3035)", licence: "Datenlizenz Deutschland – Namensnennung 2.0", status: "Stichtag 15.05.2022", url: "https://www.destatis.de/DE/Themen/Gesellschaft-Umwelt/Bevoelkerung/Zensus2022/_publikationen.html" },
  { name: "Stadtteilgrenzen Lüneburg", publisher: "OpenStreetMap-Mitwirkende", content: "17 Stadtteile als Flächen", level: "Stadtteil-Polygone", licence: "ODbL 1.0", status: "Abruf 05.11.2026", url: "https://www.openstreetmap.org/relation/4191677" },
  { name: "ALKIS Hausumringe Niedersachsen", publisher: "LGLN (Landesamt für Geoinformation und Landesvermessung)", content: "47.415 amtliche Gebäudegrundrisse der Hansestadt, daraus Bebauungsdichte und Gebäudezahl je Stadtteil", level: "Einzelflächen (EPSG:25832)", licence: "CC-BY 4.0", status: "Auslesedatum 03.09.2026, vierteljährlich aktualisiert", url: "https://ni-lgln-opengeodata.hub.arcgis.com/pages/alkis-hausumringe" },
];
