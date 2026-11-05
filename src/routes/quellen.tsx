import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/SiteHeader";
import { sources } from "@/lib/radar";
import { useLang } from "@/lib/i18n";

export const Route = createFileRoute("/quellen")({
  head: () => ({
    meta: [
      { title: "Quellen & Methode – Housing Radar Lüneburg" },
      { name: "description", content: "Welche offenen Daten der Housing Radar nutzt, wie sie zusammengeführt werden und wo ihre Grenzen liegen." },
      { property: "og:title", content: "Quellen & Methode – Housing Radar Lüneburg" },
      { property: "og:description", content: "Lizenzen, räumliche Ebene, Aktualität und Datenlücken der verwendeten Quellen." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Quellen,
});

const stepsDe = [
  ["Laden", "Zensus-2022-Tabellen im 100-m-Gitter (Einwohner, Wohnfläche je Bewohner, Leerstandsquote, Anteil ab 65, Gebäude nach Wohnungszahl, Wohnungen nach Räumen), Supermärkte, Arztpraxen und Haltestellen aus OpenStreetMap, die Stadtteilgrenzen aus OpenStreetMap und die amtlichen ALKIS-Gebäudegrundrisse des LGLN."],
  ["Zusammenführen", "Jede Gitterzelle wird über ihren Mittelpunkt genau einem Stadtteil zugeordnet (EPSG:3035). Jedes Gebäude wird über seinen Schwerpunkt einem Stadtteil zugerechnet (EPSG:25832). Für die Karte werden die 100-m-Zellen zusätzlich zu Blöcken von rund 500 m Kantenlänge zusammengefasst (5 × 5 Zellen), die nie über eine Stadtteilgrenze gehen – 1.897 Zellen ergeben 245 Blöcke. Pro Block werden die Werte nach Einwohnern gewichtet."],
  ["Kennzahl", "Wohnfläche pro Einwohner je Stadtteil = nach Einwohnern gewichteter Mittelwert der Zellen. Bebauungsdichte = Summe der Gebäudegrundflächen geteilt durch die Stadtteilfläche. Einwohner je Gebäude = Zensus-Bevölkerung dividiert durch die Zahl der ALKIS-Gebäude im Stadtteil. Räume pro Person = Summe der Räume (7+ als 7) geteilt durch Einwohner. Versorgung = Zahl der Angebote in Gehweite (Supermarkt/Arzt 600 m, Halt 400 m Luftlinie vom Zellmittelpunkt). Kombinierte Analysen: „hoch“ = obere zwei Farbstufen, „niedrig“ = untere zwei."],
  ["Datenschutz", "Es werden nur bereits amtlich geheimgehaltene Zensusdaten genutzt. Ergebnisse erscheinen nur auf Stadtteil-, 500-m-Block- bzw. 100-m-Ebene, nie für Personen oder Haushalte."],
];

const limitsDe = [
  "Stichtag ist Mai 2022; Neubaugebiete seitdem fehlen.",
  "Der Zensus verändert kleine Fallzahlen leicht (Cell-Key-Methode) und lässt manche Zellen aus Geheimhaltungsgründen leer. Die Spalte „Datenabdeckung“ zeigt, für welchen Anteil der Einwohner ein Wohnflächenwert vorlag.",
  "Für Wilschenbruch liegt keine Leerstandsquote vor.",
  "Die Leerstandsquote zählt ausschließlich Wohnungen. Gewerbeleerstand kommt separat aus dem LeAn-Auszug des Leerstandsmanagements.",
  "Der LeAn-Auszug umfasst nur 55 Gewerbeobjekte in Altstadt-Einkaufsstraßen (4 leer, 4 drohend leer); außerhalb gilt „keine Angabe“, nicht „kein Leerstand“. Hausnummern sind anonymisiert, deshalb liegt jedes Objekt auf der Mitte seiner Straße. Eigentümer- und Kontaktdaten werden nicht übernommen.",
  "Die Analyse „Wohn- und Gewerbeleerstand“ nutzt für den Wohnleerstand eine niedrigere Schwelle (≥ 10 %), weil kein Altstadt-Block die sonst übliche Schwelle von 14 % erreicht; der Stadtschnitt liegt bei 3,5 %.",
  "Die Leerstandsquote ist nach Einwohnern statt nach Wohnungen gewichtet, weil keine Wohnungszahl je Zelle geladen wurde. Das ist eine Näherung.",
  "Zellen an Stadtteilgrenzen werden vollständig dem Stadtteil ihres Mittelpunkts zugerechnet.",
  "Die Stadtteilgrenzen aus OpenStreetMap sind keine amtlichen Grenzen; sie sollten mit Lüne-GIS abgeglichen werden.",
  "Die Bebauungsdichte zählt nur die Grundfläche der Gebäude, nicht die Geschosse – sie ist ein erster Anhaltspunkt für Nachverdichtung, kein Ersatz für ein Baulückenkataster. Garagen und Nebengebäude sind enthalten.",
  "Die Zahl „Einwohner je Gebäude“ zählt alle amtlich erfassten Gebäude, also auch Garagen, Schuppen und Betriebsgebäude. Der tatsächliche Besatz je Wohngebäude ist deshalb höher; die Kennzahl ist ein Vergleichswert zwischen Stadtteilen, keine absolute Größe.",
  "In kombinierten Analysen zählt für Blöcke ohne eigenen Wert der Stadtteilwert. Das betrifft vor allem den Leerstand: nur 86 von 245 Blöcken haben einen eigenen Wert, sie decken aber 74 % der Einwohner ab (auf 100-m-Ebene wären es nur 21 %).",
  "Die 500-m-Blöcke fassen bis zu 25 Zellen zusammen – Unterschiede innerhalb eines Blocks sind in der Übersicht nicht sichtbar. Ab Zoom 14 zeigt die Karte wieder die einzelnen 100-m-Quadrate.",
  "Der Anteil der Ein-/Zweifamilienhäuser wird pro Block über die Zellen gemittelt, nicht über Gebäudezahlen, weil je Zelle keine Gebäudezahl vorlag.",
  "Die Versorgung misst Luftlinie, keine Fußwege (Angebote knapp außerhalb der Stadt zählen mit). Die Vollständigkeit von OpenStreetMap ist nicht garantiert.",
  "Räume pro Person enthält auch Küchen ab 6 m² (Zensus-Definition) und bezieht sich auf alle Einwohner, auch in Wohnheimen.",
  "Einwohner- und Gebäudezahlen stammen aus verschiedenen Erhebungen mit unterschiedlichen Stichtagen (Zensus Mai 2022, ALKIS September 2026).",
];

const stepsEn = [
  ["Load", "Census 2022 tables on the 100 m grid (residents, living space per resident, vacancy rate, share 65+, buildings by dwellings, dwellings by rooms), supermarkets, doctors and stops from OpenStreetMap, district boundaries from OpenStreetMap and the official ALKIS building footprints from LGLN."],
  ["Merge", "Each grid cell is assigned to exactly one district via its centre point (EPSG:3035). Each building is assigned to a district via its centroid (EPSG:25832). For the map, the 100 m cells are additionally grouped into blocks of about 500 m edge length (5 × 5 cells) that never cross a district border – 1,897 cells make 245 blocks. Within a block, values are weighted by residents."],
  ["Indicator", "Living space per resident per district = resident-weighted mean of the cells. Building density = total building footprint divided by district area. Residents per building = census population divided by the number of ALKIS buildings in the district. Rooms per person = total rooms (7+ counted as 7) divided by residents. Amenities = number of services within walking distance (supermarket/doctor 600 m, stop 400 m straight line from the cell centre). Combined analyses: “high” = top two colour classes, “low” = bottom two."],
  ["Privacy", "Only census data that is already officially anonymised is used. Results appear only at district, 500 m block or 100 m level, never for persons or households."],
];

const limitsEn = [
  "The reference date is May 2022; newer housing developments are missing.",
  "The census slightly perturbs small counts (cell-key method) and leaves some cells empty for confidentiality. “Data coverage” shows for what share of residents a living-space value was available.",
  "No vacancy rate is available for Wilschenbruch.",
  "The vacancy rate counts dwellings only. Commercial vacancy comes separately from the LeAn extract of the vacancy management system.",
  "The LeAn extract covers only 55 commercial units in Altstadt shopping streets (4 vacant, 4 at risk); elsewhere it means “no data”, not “no vacancy”. House numbers are anonymised, so each unit sits at the middle of its street. Owner and contact data are not used.",
  "The “Housing and commercial vacancy” analysis uses a lower housing-vacancy threshold (≥ 10 %), because no Altstadt block reaches the usual 14 %; the city average is 3.5 %.",
  "The vacancy rate is weighted by residents rather than dwellings, because no dwelling count per cell was loaded. This is an approximation.",
  "Cells on district borders are assigned entirely to the district containing their centre.",
  "The OpenStreetMap district boundaries are not official; they should be checked against Lüne-GIS.",
  "Building density counts only the footprint, not the number of storeys – it is a first indication of densification potential, not a replacement for a vacant-plot register. Garages and outbuildings are included.",
  "“Residents per building” counts all officially recorded buildings, including garages, sheds and commercial buildings. The real occupancy per residential building is therefore higher; the figure is for comparing districts, not an absolute value.",
  "In combined analyses, blocks without their own value use the district value. This mainly affects vacancy: only 86 of 245 blocks have their own value, but they cover 74 % of residents (on the 100 m level it would be only 21 %).",
  "The 500 m blocks pool up to 25 cells – differences inside a block are not visible in the overview. From zoom 14 the map shows the individual 100 m squares again.",
  "The share of detached/two-family houses is averaged over the cells in a block rather than over building counts, because no building count per cell was available.",
  "Amenities are measured as straight-line distance, not walking routes. OpenStreetMap completeness is not guaranteed.",
  "Rooms per person includes kitchens of 6 m² or more (census definition) and refers to all residents, including those in shared accommodation.",
  "Resident and building figures come from different surveys with different reference dates (census May 2022, ALKIS September 2026).",
];

function Quellen() {
  const [lang] = useLang();
  const en = lang === "en";
  const steps = en ? stepsEn : stepsDe;
  const limits = en ? limitsEn : limitsDe;
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <p className="kicker">{en ? "Transparency" : "Transparenz"}</p>
        <h1 className="text-5xl font-bold uppercase">{en ? "Sources & method" : "Quellen & Methode"}</h1>

        <h2 className="mt-8 text-2xl font-bold uppercase">{en ? "Sources used" : "Verwendete Quellen"}</h2>
        <div className="mt-3 overflow-x-auto rounded-md border bg-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted text-xs uppercase text-muted-foreground">
              <tr><th className="p-3">{en ? "Source" : "Quelle"}</th><th className="p-3">{en ? "Content" : "Inhalt"}</th><th className="p-3">{en ? "Spatial level" : "Räumliche Ebene"}</th><th className="p-3">{en ? "Licence" : "Lizenz"}</th><th className="p-3">{en ? "Status" : "Stand"}</th></tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.name} className="border-t align-top">
                  <td className="p-3"><a href={s.url} target="_blank" rel="noreferrer" className="font-medium text-primary underline-offset-2 hover:underline">{en ? s.en.name : s.name}</a><div className="text-xs text-muted-foreground">{s.publisher}</div></td>
                  <td className="p-3">{en ? s.en.content : s.content}</td><td className="p-3">{en ? s.en.level : s.level}</td><td className="p-3">{s.licence}</td><td className="p-3">{en ? s.en.status : s.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2 className="mt-10 text-2xl font-bold uppercase">{en ? "How the pipeline works" : "So funktioniert die Pipeline"}</h2>
        <ol className="mt-3 grid gap-3 sm:grid-cols-2">
          {steps.map(([t, d], i) => (
            <li key={t} className="rounded-md border bg-card p-4">
              <span className="kicker">{en ? "Step" : "Schritt"} {i + 1}</span>
              <h3 className="text-xl font-semibold uppercase">{t}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{d}</p>
            </li>
          ))}
        </ol>

        <h2 className="mt-10 text-2xl font-bold uppercase">{en ? "Data gaps & limitations" : "Datenlücken & Grenzen"}</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm">
          {limits.map((l) => <li key={l}>{l}</li>)}
        </ul>
      </main>
    </div>
  );
}
