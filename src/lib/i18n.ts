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
    intro: (avg: string, pop: string) => <>Im Lüneburger Schnitt hat jeder Einwohner <strong className="text-foreground">{avg} m²</strong> Wohnfläche ({pop} Einwohner in 17 Stadtteilen). Vier öffentliche Datensätze, auf Stadtteile zusammengeführt, ganz ohne personenbezogene Daten.</>,
    detail: "Detailfarben innerhalb der Stadtteile (100-m-Quadrate)",
    district: "Stadtteil", living: "Wohnfläche / Kopf", vacancy: "Leerstandsquote", density: "Bebauungsdichte", coverage: "Datenabdeckung",
    noData: "keine Angabe", residents: "Einwohner", buildings: "Gebäude", perBuilding: "Personen je Gebäude",
    spread: (e: string, g: string, r: string) => `${e} Einwohner verteilt auf ${g} amtlich erfasste Gebäude – das sind ${r} Personen je Gebäude.`,
    ranking: "Rangliste", abbr: ["E", "G", "P/G"],
    cell: "100-m-Quadrat", cellRes: "Einwohner", cellLiving: "Wohnfläche/Kopf", cellVac: "Leerstand",
  },
  en: {
    map: "Map", sources: "Sources & method", city: "Hanseatic City of Lüneburg",
    title: "Where is living space in Lüneburg used unevenly?",
    intro: (avg: string, pop: string) => <>On average, each resident of Lüneburg has <strong className="text-foreground">{avg} m²</strong> of living space ({pop} residents in 17 districts). Four public datasets, merged by district, with no personal data at all.</>,
    detail: "Detailed colours within districts (100 m squares)",
    district: "District", living: "Living space / person", vacancy: "Vacancy rate", density: "Building density", coverage: "Data coverage",
    noData: "no data", residents: "Residents", buildings: "Buildings", perBuilding: "People per building",
    spread: (e: string, g: string, r: string) => `${e} residents spread across ${g} officially recorded buildings – that is ${r} people per building.`,
    ranking: "Ranking", abbr: ["R", "B", "P/B"],
    cell: "100 m square", cellRes: "Residents", cellLiving: "Living space/person", cellVac: "Vacancy",
  },
};
