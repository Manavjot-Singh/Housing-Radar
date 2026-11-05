import { useEffect, useSyncExternalStore } from "react";
import { setNumberLocale } from "@/lib/radar";

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
    map: "Karte", sources: "Quellen & Methode", city: "Hansestadt Lüneburg",
    title: "Wo wird Wohnraum in Lüneburg ungleich genutzt?",
    intro: (avg: string, pop: string) => <>Im Lüneburger Schnitt hat jeder Einwohner <strong className="text-foreground">{avg} m²</strong> Wohnfläche ({pop} Einwohner in 17 Stadtteilen). Acht öffentliche Datensätze, auf Stadtteile zusammengeführt, ganz ohne personenbezogene Daten.</>,
    detail: "Detailfarben innerhalb der Stadtteile (500-m-Blöcke, 100 m beim Reinzoomen)",
    block: "500-m-Block", blockCells: "Quadrate im Block",
    showingBlock: "Farbe: 500-m-Blöcke", showingCell: "Farbe: 100-m-Quadrate",
    district: "Stadtteil", living: "Wohnfläche / Kopf", vacancy: "Leerstandsquote", density: "Bebauungsdichte", coverage: "Datenabdeckung",
    noData: "keine Angabe", residents: "Einwohner", buildings: "Gebäude", perBuilding: "Personen je Gebäude",
    spread: (e: string, g: string, r: string) => `${e} Einwohner verteilt auf ${g} amtlich erfasste Gebäude – das sind ${r} Personen je Gebäude.`,
    ranking: "Rangliste", abbr: ["E", "G", "P/G"],
    cell: "100-m-Quadrat", cellRes: "Einwohner", cellLiving: "Wohnfläche/Kopf", cellVac: "Leerstand",
    districtValue: "Stadtteilwert",
    amenity: { shop: "Supermarkt", doc: "Arztpraxis", pt: "Bus-/Bahnhalt" },
    layers: "Ebenen", layersHint: "Mehrere Ebenen wählen, um sie zu kombinieren.", analyses: "Fertige Analysen", showPoints: "Standorte zeigen",
    high: "hoch", low: "niedrig", reset: "Zurücksetzen",
    allMet: (n: number) => `alle ${n} Bedingungen erfüllt`, oneMissing: "eine Bedingung fehlt", fewer: "ohne Farbe = weniger Bedingungen erfüllt",
    howToRead: "So liest du die Karte", markedWhen: "Dunkelrot markiert sind 500-m-Blöcke, in denen alle diese Bedingungen gleichzeitig zutreffen. Hellblau: eine Bedingung fehlt. Fahr mit der Maus über einen Block, um ✔/✘ je Bedingung zu sehen.",
    hits: "Treffer je Stadtteil", hitsHint: "Anteil der Einwohner, die in 500-m-Blöcken mit allen Bedingungen wohnen.",
    whatToDo: "Was die Stadt tun kann", fallbackNote: "Wo ein Block keinen eigenen Wert hat (z. B. Leerstand), zählt der Stadtteilwert.",
    old: "Ab 65 Jahre", efh: "Ein-/Zweifamilienhäuser", rooms: "Räume / Person", amen: "Versorgung",
  },
  en: {
    map: "Map", sources: "Sources & method", city: "Hanseatic City of Lüneburg",
    title: "Where is living space in Lüneburg used unevenly?",
    intro: (avg: string, pop: string) => <>On average, each resident of Lüneburg has <strong className="text-foreground">{avg} m²</strong> of living space ({pop} residents in 17 districts). Eight public datasets, merged by district, with no personal data at all.</>,
    detail: "Detailed colours within districts (500 m blocks, 100 m when zoomed in)",
    block: "500 m block", blockCells: "squares in block",
    showingBlock: "Colour: 500 m blocks", showingCell: "Colour: 100 m squares",
    district: "District", living: "Living space / person", vacancy: "Vacancy rate", density: "Building density", coverage: "Data coverage",
    noData: "no data", residents: "Residents", buildings: "Buildings", perBuilding: "People per building",
    spread: (e: string, g: string, r: string) => `${e} residents spread across ${g} officially recorded buildings – that is ${r} people per building.`,
    ranking: "Ranking", abbr: ["R", "B", "P/B"],
    cell: "100 m square", cellRes: "Residents", cellLiving: "Living space/person", cellVac: "Vacancy",
    districtValue: "district value",
    amenity: { shop: "Supermarket", doc: "Doctor", pt: "Bus/rail stop" },
    layers: "Layers", layersHint: "Pick several layers to combine them.", analyses: "Ready-made analyses", showPoints: "Show locations",
    high: "high", low: "low", reset: "Reset",
    allMet: (n: number) => `all ${n} conditions met`, oneMissing: "one condition missing (light)", fewer: "no colour = fewer conditions met",
    howToRead: "How to read the map", markedWhen: "Dark red marks 500 m blocks where all of these conditions apply at once. Light blue: one condition is missing. Hover over a block to see ✔/✘ per condition.",
    hits: "Matches per district", hitsHint: "Share of residents living in 500 m blocks that meet all conditions.",
    whatToDo: "What the city can do", fallbackNote: "Where a block has no value of its own (e.g. vacancy), the district value is used.",
    old: "Aged 65+", efh: "Detached/two-family", rooms: "Rooms / person", amen: "Amenities",
  },
};
