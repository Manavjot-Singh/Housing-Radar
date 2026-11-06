import { useEffect, useSyncExternalStore } from "react";
import { city, districts, setNumberLocale } from "@/lib/radar";

export type Lang = "de" | "en";

let current: Lang = "de";
const listeners = new Set<() => void>();

function setLang(l: Lang) {
  current = l;
  setNumberLocale(l);
  try { localStorage.setItem("lang", l); } catch { /* ignore */ }
  if (typeof document !== "undefined") document.documentElement.lang = l;
  listeners.forEach((f) => f());
}

/** Current UI language; starts as German on server and first client render, then restores the saved choice. */
export function useLang(): [Lang, (l: Lang) => void] {
  const lang = useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => current,
    () => "de" as Lang,
  );
  useEffect(() => {
    const saved = localStorage.getItem("lang");
    if ((saved === "en" || saved === "de") && saved !== current) setLang(saved);
  }, []);
  setNumberLocale(lang);
  return [lang, setLang];
}

export const t = {
  de: {
    map: "Karte", sources: "Quellen & Methode", city: city.labelDe,
    title: `WOHNRAUM-RADAR ${city.name.toUpperCase()}: POTENZIALE ENTFALTEN`,
    intro: (avg: string, pop: string) => <>Im {city.avgDe} hat jeder Einwohner <strong className="text-foreground">{avg} m²</strong> Wohnfläche ({pop} Einwohner in {districts.length} Stadtteilen). {city.datasetsDe}, auf Stadtteile zusammengeführt, ganz ohne personenbezogene Daten.</>,
    detail: "Detailfarben innerhalb der Stadtteile (500-m-Blöcke, 100 m beim Reinzoomen)",
    block: "500-m-Block", blockCells: "Quadrate im Block",
    showingBlock: "Farbe: 500-m-Blöcke", showingCell: "Farbe: 100-m-Quadrate",
    district: "Stadtteil", living: "Wohnfläche / Kopf", vacancy: "Leerstandsquote", density: "Bebauungsdichte", coverage: "Datenabdeckung",
    noData: "keine Angabe", residents: "Einwohner", buildings: "Gebäude", perBuilding: "Personen je Gebäude",
    spread: (e: string, g: string, r: string) => `${e} Einwohner verteilt auf ${g} ${city.officialBuildings ? "amtlich erfasste" : "in OpenStreetMap kartierte"} Gebäude – das sind ${r} Personen je Gebäude.`,
    ranking: "Rangliste", abbr: ["E", "G", "P/G"],
    cell: "100-m-Quadrat", cellRes: "Einwohner", cellLiving: "Wohnfläche/Kopf", cellVac: "Leerstand",
    districtValue: "Stadtteilwert",
    amenity: { shop: "Supermarkt", doc: "Arztpraxis", pt: "Bus-/Bahnhalt", bakery: "Bäckerei" },
    layers: "Eigene Analyse", noLayer: "Keine Ebene gewählt – nur Stadtteile", commercial: "Gewerbeleerstand (LeAn)", commercialTip: (o: number, v: number, r: number) => `${o} erfasste Gewerbeobjekte · ${v} leer · ${r} drohend leer`, layersHint: "Ebenen frei an- und abwählen; mehrere werden kombiniert.", analyses: "Analysen", showPoints: "Standorte zeigen",
    high: "hoch", low: "niedrig", reset: "Zurücksetzen",
    allMet: (n: number) => `alle ${n} Bedingungen erfüllt`, oneMissing: "eine Bedingung fehlt", fewer: "ohne Farbe = weniger Bedingungen erfüllt",
    howToRead: "So liest du die Karte", markedWhen: "Dunkelrot markiert sind 500-m-Blöcke, in denen alle diese Bedingungen gleichzeitig zutreffen. Hellblau: eine Bedingung fehlt. Fahr mit der Maus über einen Block, um ✔/✘ je Bedingung zu sehen.",
    whatToDo: "Was die Stadt tun kann", ideasBasis: `Passend zu den Daten dieses Stadtteils im Vergleich zum ${city.avgDe}.`, coords: "Koordinaten",
    old: "Ab 65 Jahre", efh: "Ein-/Zweifamilienhäuser", rooms: "Räume / Person", amen: "Versorgung",
  },
  en: {
    map: "Map", sources: "Sources & method", city: city.labelEn,
    title: `HOUSING RADAR ${city.name.toUpperCase()}: UNLOCK THE POTENTIAL`,
    intro: (avg: string, pop: string) => <>On average, each resident of {city.name} has <strong className="text-foreground">{avg} m²</strong> of living space ({pop} residents in {districts.length} districts). {city.datasetsEn}, merged by district, with no personal data at all.</>,
    detail: "Detailed colours within districts (500 m blocks, 100 m when zoomed in)",
    block: "500 m block", blockCells: "squares in block",
    showingBlock: "Colour: 500 m blocks", showingCell: "Colour: 100 m squares",
    district: "District", living: "Living space / person", vacancy: "Vacancy rate", density: "Building density", coverage: "Data coverage",
    noData: "no data", residents: "Residents", buildings: "Buildings", perBuilding: "People per building",
    spread: (e: string, g: string, r: string) => `${e} residents spread across ${g} ${city.officialBuildings ? "officially recorded" : "OpenStreetMap-mapped"} buildings – that is ${r} people per building.`,
    ranking: "Ranking", abbr: ["R", "B", "P/B"],
    cell: "100 m square", cellRes: "Residents", cellLiving: "Living space/person", cellVac: "Vacancy",
    districtValue: "district value",
    amenity: { shop: "Supermarket", doc: "Doctor", pt: "Bus/rail stop", bakery: "Bakery" },
    layers: "Custom analysis", noLayer: "No layer selected – districts only", commercial: "Commercial vacancy (LeAn)", commercialTip: (o: number, v: number, r: number) => `${o} recorded commercial units · ${v} vacant · ${r} at risk`, layersHint: "Switch layers on and off freely; several are combined.", analyses: "Analyses", showPoints: "Show locations",
    high: "high", low: "low", reset: "Reset",
    allMet: (n: number) => `all ${n} conditions met`, oneMissing: "one condition missing (light)", fewer: "no colour = fewer conditions met",
    howToRead: "How to read the map", markedWhen: "Dark red marks 500 m blocks where all of these conditions apply at once. Light blue: one condition is missing. Hover over a block to see ✔/✘ per condition.",
    whatToDo: "What the city can do", ideasBasis: `Matched to this district's data compared with the ${city.name} average.`, coords: "Coordinates",
    old: "Aged 65+", efh: "Detached/two-family", rooms: "Rooms / person", amen: "Amenities",
  },
};
