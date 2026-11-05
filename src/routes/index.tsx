import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { RadarMap } from "@/components/RadarMap";
import { SiteHeader } from "@/components/SiteHeader";
import { cityAvg, cityPopulation, districts, indicators, scaleClass, verdict, type Indicator } from "@/lib/radar";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Housing Radar Lüneburg – Wo ist Wohnraum knapp oder ungenutzt?" },
      { name: "description", content: "Karte der Wohnfläche pro Einwohner und Leerstand in den 17 Lüneburger Stadtteilen, auf Basis offener Zensus-2022-Daten." },
      { property: "og:title", content: "Housing Radar Lüneburg" },
      { property: "og:description", content: "Wo wird Wohnraum in Lüneburg ungleich genutzt? Offene Daten, datenschutzkonform auf Stadtteilebene." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const swatch = ["bg-nodata", "bg-scale-1", "bg-scale-2", "bg-scale-3", "bg-scale-4", "bg-scale-5"];

function Index() {
  const [indicator, setIndicator] = useState<Indicator>("wohnflaecheProKopf");
  const [showGrid, setShowGrid] = useState(false);
  const [selected, setSelected] = useState<string | null>("Wilschenbruch");
  const ind = indicators[indicator];
  const sorted = [...districts].sort((a, b) => (b[indicator] ?? -1) - (a[indicator] ?? -1));
  const sel = districts.find((d) => d.name === selected);
  const max = Math.max(...districts.map((d) => d[indicator] ?? 0));

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-5 max-w-3xl">
          <p className="kicker">Leuphana AI Hackathon · Challenge 4</p>
          <h1 className="mt-1 text-4xl font-bold uppercase leading-none sm:text-5xl">Wo wird Wohnraum in Lüneburg ungleich genutzt?</h1>
          <p className="mt-3 text-muted-foreground">
            Im Lüneburger Schnitt hat jeder Einwohner <strong className="text-foreground">{cityAvg} m²</strong> Wohnfläche
            ({cityPopulation.toLocaleString("de-DE")} Einwohner in 17 Stadtteilen). Vier öffentliche Datensätze, auf
            Stadtteile zusammengeführt, ganz ohne personenbezogene Daten.
          </p>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          {(Object.keys(indicators) as Indicator[]).map((k) => (
            <button key={k} onClick={() => setIndicator(k)}
              className={`rounded-sm border px-3 py-1.5 text-sm ${indicator === k ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted"}`}>
              {indicators[k].label}
            </button>
          ))}
          <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} className="accent-primary" />
            100-m-Raster anzeigen
          </label>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
          <div className="relative h-[480px] overflow-hidden rounded-md border lg:h-[620px]">
            <RadarMap indicator={indicator} showGrid={showGrid} selected={selected} onSelect={setSelected} />
            <div className="pointer-events-none absolute bottom-3 left-3 z-[400] rounded-sm border bg-card/95 p-2 text-xs">
              <div className="mb-1 font-medium">{ind.label} ({ind.unit})</div>
              <div className="flex">
                {[1, 2, 3, 4, 5].map((c) => (
                  <div key={c} className="text-center">
                    <div className={`h-3 w-10 ${swatch[c]}`} />
                    <div className="mt-0.5 text-muted-foreground">{c === 1 ? `<${ind.breaks[0]}` : c === 5 ? `≥${ind.breaks[3]}` : `${ind.breaks[c - 2]}–${ind.breaks[c - 1]}`}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <aside className="flex flex-col gap-4">
            {sel && (
              <section className="rounded-md border bg-card p-4">
                <p className="kicker">Stadtteil</p>
                <h2 className="text-3xl font-bold uppercase">{sel.name}</h2>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div><dt className="text-muted-foreground">Wohnfläche / Kopf</dt><dd className="font-display text-2xl font-semibold">{sel.wohnflaecheProKopf ?? "–"} m²</dd></div>
                  <div><dt className="text-muted-foreground">Leerstandsquote</dt><dd className="font-display text-2xl font-semibold">{sel.leerstandsquote != null ? `${sel.leerstandsquote} %` : "keine Angabe"}</dd></div>
                  <div><dt className="text-muted-foreground">Bebauungsdichte</dt><dd className="font-display text-2xl font-semibold">{sel.bebautAnteil} %</dd></div>
                  <div><dt className="text-muted-foreground">Einwohner</dt><dd className="font-medium">{sel.einwohner.toLocaleString("de-DE")}</dd></div>
                  <div><dt className="text-muted-foreground">Gebäude (amtlich)</dt><dd className="font-medium">{sel.gebaeude.toLocaleString("de-DE")}</dd></div>
                  <div><dt className="text-muted-foreground">Datenabdeckung</dt><dd className="font-medium">{sel.abdeckung} %</dd></div>
                </dl>
                <p className="mt-3 border-l-2 border-primary pl-3 text-sm">{verdict(sel)}</p>
              </section>
            )}
            <section className="rounded-md border bg-card p-4">
              <p className="kicker mb-2">Rangliste · {ind.label}</p>
              <ul className="space-y-1">
                {sorted.map((d) => {
                  const v = d[indicator];
                  return (
                    <li key={d.name}>
                      <button onClick={() => setSelected(d.name)} className={`flex w-full items-center gap-2 rounded-sm px-1 py-0.5 text-left text-sm hover:bg-muted ${selected === d.name ? "bg-accent" : ""}`}>
                        <span className="w-32 shrink-0 truncate">{d.name}</span>
                        <span className="h-2.5 flex-1 overflow-hidden rounded-sm bg-muted">
                          <span className={`block h-full ${swatch[scaleClass(v, indicator)]}`} style={{ width: `${((v ?? 0) / max) * 100}%` }} />
                        </span>
                        <span className="w-14 text-right font-mono text-xs">{v != null ? `${v} ${ind.unit}` : "–"}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}
