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
};

export type Indicator = "wohnflaecheProKopf" | "leerstandsquote";

export const geo = stadtteile as unknown as FeatureCollection<Geometry, District>;
export const districts: District[] = geo.features.map((f) => f.properties);
export const cityAvg = summary.stadtWohnflaecheProKopf;
export const cityPopulation = summary.einwohner;

export const indicators: Record<Indicator, { label: string; unit: string; breaks: number[] }> = {
  wohnflaecheProKopf: { label: "Wohnfläche pro Einwohner", unit: "m²", breaks: [48, 52, 56, 61] },
  leerstandsquote: { label: "Leerstandsquote", unit: "%", breaks: [8, 10, 14, 20] },
};

/** Returns the scale class 1..5 (0 = no data). */
export function scaleClass(value: number | null, ind: Indicator): number {
  if (value == null) return 0;
  const b = indicators[ind].breaks;
  let c = 1;
  for (const x of b) if (value >= x) c++;
  return c;
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
  { name: "Zensus 2022 – Leerstandsquote", publisher: "Statistisches Bundesamt", content: "Anteil leerstehender Wohnungen", level: "100-m-Gitter (EPSG:3035)", licence: "Datenlizenz Deutschland – Namensnennung 2.0", status: "Stichtag 15.05.2022", url: "https://www.destatis.de/DE/Themen/Gesellschaft-Umwelt/Bevoelkerung/Zensus2022/_publikationen.html" },
  { name: "Stadtteilgrenzen Lüneburg", publisher: "OpenStreetMap-Mitwirkende", content: "17 Stadtteile als Flächen", level: "Stadtteil-Polygone", licence: "ODbL 1.0", status: "Abruf 05.11.2026", url: "https://www.openstreetmap.org/relation/4191677" },
];
