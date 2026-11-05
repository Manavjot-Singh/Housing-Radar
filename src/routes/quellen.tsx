import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/SiteHeader";
import { sources } from "@/lib/radar";

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

const steps = [
  ["Laden", "Zensus-2022-Tabellen im 100-m-Gitter (Einwohner, Wohnfläche je Bewohner, Leerstandsquote), die Stadtteilgrenzen aus OpenStreetMap und die amtlichen ALKIS-Gebäudegrundrisse des LGLN."],
  ["Zusammenführen", "Jede Gitterzelle wird über ihren Mittelpunkt genau einem Stadtteil zugeordnet (EPSG:3035). Jedes Gebäude wird über seinen Schwerpunkt einem Stadtteil zugerechnet (EPSG:25832)."],
  ["Kennzahl", "Wohnfläche pro Einwohner je Stadtteil = nach Einwohnern gewichteter Mittelwert der Zellen. Bebauungsdichte = Summe der Gebäudegrundflächen geteilt durch die Stadtteilfläche."],
  ["Datenschutz", "Es werden nur bereits amtlich geheimgehaltene Zensusdaten genutzt. Ergebnisse erscheinen nur auf Stadtteil- bzw. 100-m-Ebene, nie für Personen oder Haushalte."],
];

const limits = [
  "Stichtag ist Mai 2022; Neubaugebiete seitdem fehlen.",
  "Der Zensus verändert kleine Fallzahlen leicht (Cell-Key-Methode) und lässt manche Zellen aus Geheimhaltungsgründen leer. Die Spalte „Datenabdeckung“ zeigt, für welchen Anteil der Einwohner ein Wohnflächenwert vorlag.",
  "Für Wilschenbruch liegt keine Leerstandsquote vor.",
  "Die Leerstandsquote zählt ausschließlich Wohnungen. Leerstehende Läden, Büros oder andere Gewerbeflächen sind nicht enthalten – dafür gäbe es keine offene 100-m-Quelle.",
  "Die Leerstandsquote ist nach Einwohnern statt nach Wohnungen gewichtet, weil keine Wohnungszahl je Zelle geladen wurde. Das ist eine Näherung.",
  "Zellen an Stadtteilgrenzen werden vollständig dem Stadtteil ihres Mittelpunkts zugerechnet.",
  "Die Stadtteilgrenzen aus OpenStreetMap sind keine amtlichen Grenzen; sie sollten mit Lüne-GIS abgeglichen werden.",
  "Die Bebauungsdichte zählt nur die Grundfläche der Gebäude, nicht die Geschosse – sie ist ein erster Anhaltspunkt für Nachverdichtung, kein Ersatz für ein Baulückenkataster. Garagen und Nebengebäude sind enthalten.",
];

function Quellen() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <p className="kicker">Transparenz</p>
        <h1 className="text-5xl font-bold uppercase">Quellen & Methode</h1>

        <h2 className="mt-8 text-2xl font-bold uppercase">Verwendete Quellen</h2>
        <div className="mt-3 overflow-x-auto rounded-md border bg-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted text-xs uppercase text-muted-foreground">
              <tr><th className="p-3">Quelle</th><th className="p-3">Inhalt</th><th className="p-3">Räumliche Ebene</th><th className="p-3">Lizenz</th><th className="p-3">Stand</th></tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.name} className="border-t align-top">
                  <td className="p-3"><a href={s.url} target="_blank" rel="noreferrer" className="font-medium text-primary underline-offset-2 hover:underline">{s.name}</a><div className="text-xs text-muted-foreground">{s.publisher}</div></td>
                  <td className="p-3">{s.content}</td><td className="p-3">{s.level}</td><td className="p-3">{s.licence}</td><td className="p-3">{s.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2 className="mt-10 text-2xl font-bold uppercase">So funktioniert die Pipeline</h2>
        <ol className="mt-3 grid gap-3 sm:grid-cols-2">
          {steps.map(([t, d], i) => (
            <li key={t} className="rounded-md border bg-card p-4">
              <span className="kicker">Schritt {i + 1}</span>
              <h3 className="text-xl font-semibold uppercase">{t}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{d}</p>
            </li>
          ))}
        </ol>

        <h2 className="mt-10 text-2xl font-bold uppercase">Datenlücken & Grenzen</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm">
          {limits.map((l) => <li key={l}>{l}</li>)}
        </ul>
      </main>
    </div>
  );
}
