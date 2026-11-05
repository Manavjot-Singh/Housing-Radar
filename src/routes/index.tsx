import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { RadarMap } from "@/components/RadarMap";
import { SiteHeader } from "@/components/SiteHeader";
import { useLang, t } from "@/lib/i18n";
import { fmtInt, cityAvg, cityPopulation, districts, fmt1, fmtAuto, fmtNum, formatValue, indicators, scaleClass, value, verdict, type Indicator } from "@/lib/radar";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Housing Radar Lüneburg – Wo ist Wohnraum knapp oder ungenutzt?" },
      { name: "description", content: "Karte der Wohnfläche pro Einwohner, des Leerstands und der Einwohner je Gebäude in den 17 Lüneburger Stadtteilen, auf Basis offener Zensus-2022- und ALKIS-Daten." },
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
  const [showGrid, setShowGrid] = useState(true);
  const [lang] = useLang();
  const tx = t[lang];
  const L = (k: Indicator) => (lang === "en" ? indicators[k].labelEn : indicators[k].label);
  const [selected, setSelected] = useState<string | null>("Wilschenbruch");
  const ind0 = indicators[indicator];
  const ind = { ...ind0, label: L(indicator), hint: lang === "en" ? ind0.hintEn : ind0.hint, unit: lang === "en" && ind0.unit === "Pers." ? "ppl" : ind0.unit };
  const sorted = [...districts].sort((a, b) => (value(b, indicator) ?? -1) - (value(a, indicator) ?? -1));
  const sel = districts.find((d) => d.name === selected);
  const max = Math.max(...districts.map((d) => value(d, indicator) ?? 0));

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-5 max-w-3xl">
          <p className="kicker">Leuphana AI Hackathon · Challenge 4</p>
          <h1 className="mt-1 text-4xl font-bold uppercase leading-none sm:text-5xl">{tx.title}</h1>
          <p className="mt-3 text-muted-foreground">{tx.intro(fmtAuto(cityAvg), fmtInt(cityPopulation))}</p>
        </div>

        <div className="mb-2 flex flex-wrap items-center gap-2">
          {(Object.keys(indicators) as Indicator[]).map((k) => (
            <button key={k} onClick={() => setIndicator(k)}
              className={`rounded-sm border px-3 py-1.5 text-sm ${indicator === k ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted"}`}>
              {L(k)}
            </button>
          ))}
          {ind.gridSource && (
            <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} className="accent-primary" />
              {tx.detail}
            </label>
          )}
        </div>
        <p className="mb-3 max-w-3xl text-sm text-muted-foreground">{ind.hint}</p>

        <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
          <div className="relative h-[480px] overflow-hidden rounded-md border lg:h-[620px]">
            <RadarMap lang={lang} indicator={indicator} showGrid={showGrid} selected={selected} onSelect={setSelected} />
            <div className="pointer-events-none absolute bottom-3 left-3 z-[400] rounded-sm border bg-card/95 p-2 text-xs">
              <div className="mb-1 font-medium">{ind.label}{ind.unit ? ` (${ind.unit})` : ""}</div>
              <div className="flex">
                {[1, 2, 3, 4, 5].map((c) => (
                  <div key={c} className="text-center">
                    <div className={`h-3 w-10 ${swatch[c]}`} />
                    <div className="mt-0.5 text-muted-foreground">{c === 1 ? `<${fmtNum(ind.breaks[0])}` : c === 5 ? `≥${fmtNum(ind.breaks[3])}` : `${fmtNum(ind.breaks[c - 2])}–${fmtNum(ind.breaks[c - 1])}`}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <aside className="flex flex-col gap-4">
            {sel && (
              <section className="rounded-md border bg-card p-4">
                <p className="kicker">{tx.district}</p>
                <h2 className="text-3xl font-bold uppercase">{sel.name}</h2>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div><dt className="text-muted-foreground">{tx.living}</dt><dd className="font-display text-2xl font-semibold">{fmtAuto(sel.wohnflaecheProKopf)} m²</dd></div>
                  <div><dt className="text-muted-foreground">{tx.vacancy}</dt><dd className="font-display text-2xl font-semibold">{sel.leerstandsquote != null ? `${fmtAuto(sel.leerstandsquote)} %` : tx.noData}</dd></div>
                  <div><dt className="text-muted-foreground">{tx.density}</dt><dd className="font-display text-2xl font-semibold">{fmtAuto(sel.bebautAnteil)} %</dd></div>
                  <div><dt className="text-muted-foreground">{tx.coverage}</dt><dd className="font-medium">{sel.abdeckung} %</dd></div>
                </dl>

                <div className="mt-3 rounded-sm border bg-muted/50 p-3">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div><dt className="text-xs text-muted-foreground">{tx.residents}</dt><dd className="font-display text-xl font-semibold">{sel.einwohner.toLocaleString(lang === "en" ? "en-GB" : "de-DE")}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">{tx.buildings}</dt><dd className="font-display text-xl font-semibold">{sel.gebaeude.toLocaleString(lang === "en" ? "en-GB" : "de-DE")}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">{tx.perBuilding}</dt><dd className="font-display text-xl font-semibold text-primary">{fmt1(sel.einwohnerJeGebaeude)}</dd></div>
                  </div>
                  <p className="mt-2 border-t pt-2 text-xs text-muted-foreground">
                    {tx.spread(fmtInt(sel.einwohner), fmtInt(sel.gebaeude), fmt1(sel.einwohnerJeGebaeude))}
                  </p>
                </div>

                <p className="mt-3 border-l-2 border-primary pl-3 text-sm">{verdict(sel, lang)}</p>
              </section>
            )}
            <section className="rounded-md border bg-card p-4">
              <p className="kicker mb-2">{tx.ranking} · {ind.label}</p>
              <ul className="space-y-1">
                {sorted.map((d) => {
                  const v = value(d, indicator);
                  return (
                    <li key={d.name}>
                      <button onClick={() => setSelected(d.name)} className={`flex w-full items-center gap-2 rounded-sm px-1 py-0.5 text-left text-sm hover:bg-muted ${selected === d.name ? "bg-accent" : ""}`}>
                        <span className="w-32 shrink-0 truncate">{d.name}</span>
                        <span className="h-2.5 flex-1 overflow-hidden rounded-sm bg-muted">
                          <span className={`block h-full ${swatch[scaleClass(v, indicator)]}`} style={{ width: `${((v ?? 0) / max) * 100}%` }} />
                        </span>
                        <span className="w-24 shrink-0 text-right font-mono text-xs">{formatValue(v, indicator).replace("Pers.", lang === "en" ? "ppl" : "Pers.")}</span>
                      </button>
                      <p className="pb-1 pl-[7.5rem] font-mono text-[11px] text-muted-foreground">
                        {d.einwohner.toLocaleString(lang === "en" ? "en-GB" : "de-DE")} {tx.abbr[0]} · {d.gebaeude.toLocaleString(lang === "en" ? "en-GB" : "de-DE")} {tx.abbr[1]} ·{" "}
                        {fmt1(d.einwohnerJeGebaeude)} {tx.abbr[2]}
                      </p>
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
