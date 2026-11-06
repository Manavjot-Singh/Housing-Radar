import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { city } from "@/lib/radar";

const footprintsDe = city.officialBuildings ? "Amtliche Gebäudegrundrisse" : "OpenStreetMap-Gebäude";
const footprintsEn = city.officialBuildings ? "Official building footprints" : "OpenStreetMap buildings";

export type MetricKey = "living" | "vacancy" | "old" | "efh" | "rooms" | "amen" | "density" | "coverage" | "residents" | "buildings" | "perBuilding";

export const METRIC_INFO: Record<MetricKey, { de: string; en: string }> = {
  living: {
    de: "Zensus 2022, 100-m-Gitter: durchschnittliche Wohnfläche je Bewohner pro Quadrat. Für den Stadtteil gewichtet nach Einwohnern gemittelt (Σ Fläche/Kopf × Einwohner ÷ Σ Einwohner).",
    en: "Census 2022, 100 m grid: average living space per occupant in each square. District value = resident-weighted mean (Σ space/person × residents ÷ Σ residents).",
  },
  vacancy: {
    de: "Zensus 2022: leerstehende Wohnungen ÷ alle Wohnungen × 100. Nur Wohnungen, kein Gewerbe. Kleine Quadrate werden aus Datenschutzgründen geschwärzt; Stadtteilwert nur aus Quadraten mit Angabe.",
    en: "Census 2022: vacant dwellings ÷ all dwellings × 100. Housing only, no commercial space. Small squares are suppressed for privacy; district value uses only squares with data.",
  },
  old: {
    de: "Zensus 2022, Altersgruppen je 100-m-Quadrat: Einwohner ab 65 ÷ alle Einwohner × 100, über den Stadtteil aufsummiert.",
    en: "Census 2022, age groups per 100 m square: residents aged 65+ ÷ all residents × 100, summed over the district.",
  },
  efh: {
    de: "Zensus 2022, Gebäude nach Typ: Ein- und Zweifamilienhäuser ÷ alle Wohngebäude × 100.",
    en: "Census 2022, buildings by type: detached and two-family houses ÷ all residential buildings × 100.",
  },
  rooms: {
    de: "Zensus 2022, Wohnungen nach Raumzahl: Summe aller Räume (1 bis 7+) ÷ Einwohner. Werte über 6 gelten als Ausreißer und entfallen.",
    en: "Census 2022, dwellings by number of rooms: total rooms (1 to 7+) ÷ residents. Values above 6 are treated as outliers and dropped.",
  },
  amen: {
    de: "OpenStreetMap: für jedes Quadrat wird geprüft, ob ein Supermarkt (≤ 600 m), eine Bäckerei (≤ 600 m), eine Arztpraxis (≤ 600 m) und eine Bus-/Bahnhaltestelle (≤ 400 m), jeweils als Fußweg über Straßen und Wege aus OpenStreetMap, erreichbar ist Gezählt werden nur die oben angehakten Angebote (nichts angehakt = alle vier); der Wert ist der Anteil davon in Gehweite in %, nach Einwohnern gemittelt.",
    en: "OpenStreetMap: each square is checked for a supermarket (≤ 600 m), a bakery (≤ 600 m), a doctor (≤ 600 m) and a bus/rail stop (≤ 400 m), each as a walking route over OpenStreetMap streets and paths, Only the amenities ticked above count (none ticked = all four); the value is the share of them within walking distance in %, resident-weighted.",
  },
  density: {
    de: `${footprintsDe}: Grundfläche aller Gebäude im Stadtteil ÷ Fläche des Stadtteils × 100.`,
    en: `${footprintsEn}: total footprint of all buildings in the district ÷ district area × 100.`,
  },
  coverage: {
    de: "Anteil der Einwohner des Stadtteils, die in Quadraten mit veröffentlichtem Leerstandswert wohnen. Niedrig = Leerstandswert unsicher.",
    en: "Share of the district's residents living in squares with a published vacancy value. Low = vacancy figure is uncertain.",
  },
  residents: { de: "Zensus 2022: Summe der Einwohner aller 100-m-Quadrate, deren Mittelpunkt im Stadtteil liegt.", en: "Census 2022: sum of residents of all 100 m squares whose centre lies in the district." },
  buildings: { de: `${footprintsDe}: Anzahl aller Gebäude, deren Mittelpunkt im Stadtteil liegt (inkl. Garagen, Schuppen).`, en: `${footprintsEn}: number of all buildings whose centre lies in the district (incl. garages, sheds).` },
  perBuilding: { de: "Einwohner ÷ Gebäude. Niedrig = viel bebaute Fläche je Person.", en: "Residents ÷ buildings. Low = lots of built space per person." },
};

export function MetricInfo({ k, lang, label }: { k: MetricKey; lang: "de" | "en"; label: string }) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label={lang === "en" ? `How "${label}" is calculated` : `Wie „${label}“ berechnet wird`}
        className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-muted-foreground align-middle font-mono text-[10px] leading-none text-muted-foreground hover:border-primary hover:text-primary"
      >
        i
      </PopoverTrigger>
      <PopoverContent className="w-72 text-sm">
        <p className="mb-1 font-semibold">{label}</p>
        <p className="text-muted-foreground">{METRIC_INFO[k][lang]}</p>
      </PopoverContent>
    </Popover>
  );
}
