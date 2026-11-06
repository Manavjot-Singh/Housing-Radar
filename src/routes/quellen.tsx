import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/SiteHeader";
import { city, sources } from "@/lib/radar";
import { useLang } from "@/lib/i18n";

export const Route = createFileRoute("/quellen")({
  head: () => ({
    meta: [
      { title: `Daten & Methodik – Housing Radar ${city.name}` },
      { name: "description", content: "Welche offenen Daten der Housing Radar nutzt, wie sie zusammengeführt werden und wo ihre Grenzen liegen." },
      { property: "og:title", content: `Daten & Methodik – Housing Radar ${city.name}` },
      { property: "og:description", content: "Lizenzen, räumliche Ebene, Aktualität und Datenlücken der verwendeten Quellen." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Quellen,
});

const stepsDe = [
  ["Laden", "Zensus-2022-Daten im 100-m-Gitter, Versorgungsangebote und Stadtteile aus OpenStreetMap sowie amtliche ALKIS-Gebäudegrundrisse."],
  ["Zusammenführen", "Jede Zelle und jedes Gebäude wird einem Stadtteil zugeordnet. Die Zellen werden dann zu 500-m-Blöcken zusammengefasst (1.897 Zellen ergeben 245 Blöcke)."],
  ["Berechnen", "Kennzahlen wie Wohnfläche pro Einwohner, Leerstand, Bebauungsdichte und Fußwege zu Versorgungsangeboten, die sich zu Analysen kombinieren lassen."],
  ["Datenschutz", "Es werden nur anonymisierte Zensusdaten genutzt. Ergebnisse erscheinen nie für Personen oder Haushalte."],
];

const limitsDe = [
  "Datenstand: Der Zensus stammt von Mai 2022, neuerer Wohnungsbau fehlt.",
  "Leerstandslücken: Nur 86 von 245 Blöcken haben einen eigenen Leerstandswert; sie decken 74 % der Einwohner ab. Die übrigen nutzen den Stadtteilwert.",
  "Gewerbeleerstand: Die Daten umfassen nur 55 Objekte in Altstadt-Einkaufsstraßen. Anderswo heißt das „keine Angabe“, nicht „kein Leerstand“.",
  "Stadtteilgrenzen: Sie stammen aus OpenStreetMap und sind nicht amtlich.",
  "Bebauungsdichte: Sie berücksichtigt keine Geschosse und enthält Garagen, ist also nur ein erster Anhaltspunkt für mögliche Bauflächen.",
  "Versorgung: Die Ergebnisse hängen davon ab, wie vollständig OpenStreetMap ist.",
];

const stepsEn = [
  ["Load", "Census 2022 data on a 100 m grid, OpenStreetMap amenities and districts, and official ALKIS building footprints."],
  ["Merge", "Each cell and building is assigned to one district, then cells are grouped into 500 m blocks (1,897 cells make 245 blocks)."],
  ["Calculate", "Indicators such as living space per resident, vacancy, building density and walking distance to amenities, which can then be combined into analyses."],
  ["Protect privacy", "Only anonymised census data is used, and results are never shown for individuals or households."],
];

const limitsEn = [
  "Data age: the census is from May 2022, so newer housing is missing.",
  "Vacancy gaps: only 86 of 245 blocks have their own vacancy value, though they cover 74 % of residents. The others use the district value.",
  "Commercial vacancy: the data covers just 55 units in Altstadt shopping streets, so elsewhere it means “no data”, not “no vacancy”.",
  "District boundaries: they come from OpenStreetMap and aren't official.",
  "Building density: it ignores storeys and includes garages, so it's only a first indication of where building could go.",
  "Amenities: results depend on how complete OpenStreetMap is.",
];

function Quellen() {
  const [lang] = useLang();
  const en = lang === "en";
  const steps = city.steps?.[en ? "en" : "de"] ?? (en ? stepsEn : stepsDe);
  const limits = city.limits?.[en ? "en" : "de"] ?? (en ? limitsEn : limitsDe);
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <p className="kicker">{en ? "Transparency" : "Transparenz"}</p>
        <h1 className="text-5xl font-bold uppercase">{en ? "Data & Methods" : "Daten & Methodik"}</h1>

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
