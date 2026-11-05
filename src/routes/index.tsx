import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { RadarMap, type AmenityKey } from "@/components/RadarMap";
import { SiteHeader } from "@/components/SiteHeader";
import { FutureDevelopmentPlans } from "@/components/FutureDevelopmentPlans";
import { useLang, t } from "@/lib/i18n";
import { MetricInfo, type MetricKey } from "@/components/MetricInfo";
import { recommend, type Profile } from "@/lib/recommendations";
import {
  analyses, thresholdText, districts, fmt1, fmtAuto, fmtInt, fmtNum, formatValue, indicators, scaleClass, value, verdict,
  type Condition, type Dir, type Indicator,
  setAmenitySelection,
} from "@/lib/radar";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Housing Radar Lüneburg – Wo ist Wohnraum knapp oder ungenutzt?" },
      { name: "description", content: "Kombinierbare Kartenebenen zu Wohnfläche, Leerstand, Älteren, Gebäudetypen, Räumen und Versorgung in Lüneburg – mit fertigen Analysen gegen Wohnungsmangel." },
      { property: "og:title", content: "Housing Radar Lüneburg" },
      { property: "og:description", content: "Wo wird Wohnraum in Lüneburg ungleich genutzt? Offene Daten, kombinierbar, datenschutzkonform." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const swatch = ["bg-nodata", "bg-scale-1", "bg-scale-2", "bg-scale-3", "bg-scale-4", "bg-scale-5"];
const dotVar: Record<AmenityKey, string> = { shop: "var(--scale-3)", doc: "var(--poi-doc)", pt: "var(--card)", bakery: "var(--poi-bakery)" };
const layerOrder: Indicator[] = ["wohnflaecheProKopf", "leerstandsquote", "anteil65", "efhAnteil", "raeumeProKopf", "versorgung", "gewerbeLeerstand", "bebautAnteil", "einwohnerJeGebaeude"];
function weighted(k: keyof Profile & keyof (typeof districts)[number]) {
  let s = 0, w = 0;
  for (const d of districts) { const v = d[k] as number | null; if (v != null) { s += v * d.einwohner; w += d.einwohner; } }
  return w ? s / w : null;
}
const toProfile = (d: (typeof districts)[number]): Profile => ({
  wohnflaecheProKopf: d.wohnflaecheProKopf, leerstandsquote: d.leerstandsquote, anteilAelter: d.anteil65, efhAnteil: d.efhAnteil,
  raeumeProKopf: d.raeumeProKopf, versorgung: d.versorgung, gewerbeLeerstand: d.gewerbeLeerstand, einwohnerJeGebaeude: d.einwohnerJeGebaeude,
});
const cityRefOf = (): Profile => ({
  wohnflaecheProKopf: weighted("wohnflaecheProKopf"), leerstandsquote: weighted("leerstandsquote"), efhAnteil: weighted("efhAnteil"),
  raeumeProKopf: weighted("raeumeProKopf"), versorgung: weighted("versorgung"), anteilAelter: (() => {
    let s = 0, w = 0; for (const d of districts) if (d.anteil65 != null) { s += d.anteil65 * d.einwohner; w += d.einwohner; } return w ? s / w : null;
  })(),
});

const defaultDir: Record<Indicator, Dir> = {
  wohnflaecheProKopf: "high", leerstandsquote: "high", anteil65: "high", efhAnteil: "high",
  raeumeProKopf: "high", versorgung: "low", gewerbeLeerstand: "high", bebautAnteil: "low", einwohnerJeGebaeude: "low",
};

function Index() {
  const [lang] = useLang();
  const tx = t[lang];
  const en = lang === "en";
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [amenities, setAmenities] = useState<Record<AmenityKey, boolean>>({ shop: false, doc: false, pt: false, bakery: false });
  const [selected, setSelected] = useState<string | null>("Wilschenbruch");

  const L = (k: Indicator) => (en ? indicators[k].labelEn : indicators[k].label);
  const unit = (k: Indicator) => (en && indicators[k].unit === "Pers." ? "ppl" : en && indicators[k].unit === "Obj." ? "units" : indicators[k].unit);
  const combo = conditions.length > 1;
  const single = conditions.length === 1 ? conditions[0]!.ind : null;
  const analysis = analyses.find((a) => a.id === analysisId);

  function toggle(k: Indicator) {
    setAnalysisId(null);
    setConditions((cs) => {
      if (cs.some((c) => c.ind === k)) return cs.filter((c) => c.ind !== k);
      return [...cs, { ind: k, dir: defaultDir[k] }];
    });
  }
  function setDir(k: Indicator, dir: Dir) {
    setAnalysisId(null);
    setConditions((cs) => cs.map((c) => (c.ind === k ? { ind: k, dir } : c)));
  }
  function pick(id: string) {
    if (id === analysisId) return clear();
    const a = analyses.find((x) => x.id === id)!;
    setAnalysisId(id);
    setConditions(a.conditions);
    if (a.conditions.some((c) => c.ind === "versorgung")) setAmenities({ shop: true, doc: true, pt: true, bakery: true });
  }

  function clear() {
    setAnalysisId(null);
    setConditions([]);
  }

  setAmenitySelection(amenities); // re-score before render so map, card and ranking agree
  const cityRef = cityRefOf();
  const sel = districts.find((d) => d.name === selected);
  const sorted = single ? [...districts].sort((a, b) => (value(b, single) ?? -1) - (value(a, single) ?? -1)) : [];
  const max = single ? Math.max(...districts.map((d) => value(d, single) ?? 0)) : 1;
  const hint = single ? (en ? indicators[single].hintEn : indicators[single].hint) : null;
  const loc = en ? "en-GB" : "de-DE";

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-5 max-w-3xl">
          <h1 className="text-4xl font-bold uppercase leading-none sm:text-5xl">{tx.title}</h1>
        </div>

        <section className="mb-3">
          <p className="kicker mb-1.5">{tx.analyses}</p>
          <div className="flex flex-wrap items-center gap-2">
            {analyses.map((a) => (
              <button key={a.id} onClick={() => pick(a.id)}
                className={`rounded-sm border px-3 py-1.5 text-left text-sm ${analysisId === a.id ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted"}`}>
                {a[lang].title}
              </button>
            ))}
            {conditions.length > 0 && (
              <button onClick={clear} className="px-2 py-1.5 text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground">
                {tx.reset}
              </button>
            )}
          </div>
        </section>

        <details className="group mb-3 rounded-md border bg-card">
          <summary className="flex cursor-pointer list-none flex-wrap items-baseline gap-x-3 p-3 select-none">
            <span className="text-sm transition-transform group-open:rotate-90">▸</span>
            <span className="kicker">{tx.layers}</span>
            <span className="text-xs text-muted-foreground">
              {conditions.length ? conditions.map((c) => L(c.ind)).join(" · ") : tx.noLayer}
            </span>
          </summary>
          <div className="border-t p-3">
          <p className="mb-2 text-xs text-muted-foreground">{tx.layersHint}</p>
          <div className="flex flex-wrap gap-2">
            {layerOrder.map((k) => {
              const c = conditions.find((x) => x.ind === k);
              return (
                <div key={k} className={`flex items-center rounded-sm border text-sm ${c ? "border-primary" : ""}`}>
                  <label className={`flex cursor-pointer items-center gap-1.5 px-2.5 py-1.5 ${c ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                    <input type="checkbox" checked={!!c} onChange={() => toggle(k)} className="accent-primary-foreground" />
                    {L(k)}
                  </label>
                  {c && combo && (
                    <select value={c.dir} onChange={(e) => setDir(k, e.target.value as Dir)} aria-label={L(k)}
                      className="bg-card px-1.5 py-1.5 text-sm outline-none">
                      <option value="high">{tx.high} ({thresholdText({ ind: k, dir: "high" }, en)})</option>
                      <option value="low">{tx.low} ({thresholdText({ ind: k, dir: "low" }, en)})</option>
                    </select>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-2 text-sm">
            <span className="text-muted-foreground">{tx.showPoints}:</span>
            {(["shop", "bakery", "doc", "pt"] as AmenityKey[]).map((k) => (
              <label key={k} className="flex cursor-pointer items-center gap-1.5">
                <input type="checkbox" checked={amenities[k]} onChange={(e) => setAmenities((a) => ({ ...a, [k]: e.target.checked }))} className="accent-primary" />
                {tx.amenity[k]}
              </label>
            ))}
            {single && indicators[single].gridSource && (
              <label className="ml-auto flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} className="accent-primary" />
                {tx.detail}
              </label>
            )}
          </div>
          </div>
        </details>

        {combo ? (
          <section className="mb-3 rounded-md border-l-4 border-primary bg-card p-3">
            {analysis && <p className="mb-2 font-semibold">{analysis[lang].question}</p>}
            <p className="kicker mb-1.5">{tx.howToRead}</p>
            <p className="mb-2 text-sm">{tx.markedWhen}</p>
            <ol className="grid gap-2 sm:grid-cols-2">
              {conditions.map((c, i) => (
                <li key={c.ind} className="flex gap-2 rounded-sm border bg-muted/40 p-2 text-sm">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{i + 1}</span>
                  <span>
                    <strong>{L(c.ind)} {c.dir === "high" ? tx.high : tx.low}</strong>{" "}
                    <span className="font-mono text-xs">({thresholdText(c, en)})</span>
                    <span className="block text-xs text-muted-foreground">{en ? indicators[c.ind].hintEn : indicators[c.ind].hint}</span>
                  </span>
                </li>
              ))}
            </ol>
          </section>
        ) : hint ? (
          <p className="mb-3 max-w-3xl text-sm text-muted-foreground">{hint}</p>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
          <div className="relative h-[480px] overflow-hidden rounded-md border lg:h-[620px]">
            <RadarMap lang={lang} conditions={conditions} showGrid={showGrid} amenities={amenities} selected={selected} onSelect={setSelected} />
            <div className="pointer-events-none absolute bottom-3 left-3 z-[400] rounded-sm border bg-card/95 p-2 text-xs">
              {conditions.length === 0 ? (
                <div className="text-muted-foreground">{tx.noLayer}</div>
              ) : single ? (
                <>
                  <div className="mb-1 font-medium">{L(single)}{unit(single) ? ` (${unit(single)})` : ""}</div>
                  <div className="flex">
                    {[1, 2, 3, 4, 5].map((c) => {
                      const i = indicators[single];
                      const lbl = i.legend ? i.legend[c - 1] : c === 1 ? `<${fmtNum(i.breaks[0])}` : c === 5 ? `≥${fmtNum(i.breaks[3])}` : `${fmtNum(i.breaks[c - 2])}–${fmtNum(i.breaks[c - 1])}`;
                      if (lbl === "") return null;
                      return (
                        <div key={c} className="text-center">
                          <div className={`h-3 w-10 ${swatch[c]}`} />
                          <div className="mt-0.5 text-muted-foreground">{lbl}</div>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="space-y-1">
                  <div className="flex items-center gap-2"><span className="h-3 w-5 bg-scale-5" />{tx.allMet(conditions.length)}</div>
                  <div className="flex items-center gap-2"><span className="h-3 w-5 bg-scale-2 opacity-60" />{tx.oneMissing}</div>
                  <div className="text-muted-foreground">{tx.fewer}</div>
                </div>
              )}
              {(Object.keys(amenities) as AmenityKey[]).some((k) => amenities[k]) && (
                <div className="mt-2 space-y-1 border-t pt-2">
                  {(["shop", "bakery", "doc", "pt"] as AmenityKey[]).filter((k) => amenities[k]).map((k) => (
                    <div key={k} className="flex items-center gap-2">
                      <span className="inline-block h-2.5 w-2.5 rounded-full border border-foreground" style={{ background: dotVar[k] }} />
                      {tx.amenity[k]}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <aside className="flex flex-col gap-4">
            {sel && (
              <section className="rounded-md border bg-card p-4">
                <p className="kicker">{tx.district}</p>
                <h2 className="text-3xl font-bold uppercase">{sel.name}</h2>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div><dt className="text-muted-foreground">{tx.living}<MetricInfo k="living" lang={lang} label={tx.living} /></dt><dd className="font-display text-2xl font-semibold">{fmtAuto(sel.wohnflaecheProKopf)} m²</dd></div>
                  <div><dt className="text-muted-foreground">{tx.vacancy}<MetricInfo k="vacancy" lang={lang} label={tx.vacancy} /></dt><dd className="font-display text-2xl font-semibold">{sel.leerstandsquote != null ? `${fmtAuto(sel.leerstandsquote)} %` : tx.noData}</dd></div>
                  <div><dt className="text-muted-foreground">{tx.old}<MetricInfo k="old" lang={lang} label={tx.old} /></dt><dd className="font-display text-2xl font-semibold">{sel.anteil65 != null ? `${fmtAuto(sel.anteil65)} %` : tx.noData}</dd></div>
                  <div><dt className="text-muted-foreground">{tx.efh}<MetricInfo k="efh" lang={lang} label={tx.efh} /></dt><dd className="font-display text-2xl font-semibold">{sel.efhAnteil != null ? `${Math.round(sel.efhAnteil)} %` : tx.noData}</dd></div>
                  <div><dt className="text-muted-foreground">{tx.rooms}<MetricInfo k="rooms" lang={lang} label={tx.rooms} /></dt><dd className="font-display text-2xl font-semibold">{sel.raeumeProKopf != null ? fmt1(sel.raeumeProKopf) : tx.noData}</dd></div>
                  <div><dt className="text-muted-foreground">{tx.amen}<MetricInfo k="amen" lang={lang} label={tx.amen} /></dt><dd className="font-display text-2xl font-semibold">{sel.versorgung != null ? `${Math.round(sel.versorgung)} %` : tx.noData}</dd></div>
                  <div><dt className="text-muted-foreground">{tx.density}<MetricInfo k="density" lang={lang} label={tx.density} /></dt><dd className="font-display text-2xl font-semibold">{fmtAuto(sel.bebautAnteil)} %</dd></div>
                  <div><dt className="text-muted-foreground">{tx.coverage}<MetricInfo k="coverage" lang={lang} label={tx.coverage} /></dt><dd className="font-medium">{sel.abdeckung} %</dd></div>
                </dl>

                <div className="mt-3 rounded-sm border bg-muted/50 p-3">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div><dt className="text-xs text-muted-foreground">{tx.residents}<MetricInfo k="residents" lang={lang} label={tx.residents} /></dt><dd className="font-display text-xl font-semibold">{sel.einwohner.toLocaleString(loc)}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">{tx.buildings}<MetricInfo k="buildings" lang={lang} label={tx.buildings} /></dt><dd className="font-display text-xl font-semibold">{sel.gebaeude.toLocaleString(loc)}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">{tx.perBuilding}<MetricInfo k="perBuilding" lang={lang} label={tx.perBuilding} /></dt><dd className="font-display text-xl font-semibold text-primary">{fmt1(sel.einwohnerJeGebaeude)}</dd></div>
                  </div>
                  <p className="mt-2 border-t pt-2 text-xs text-muted-foreground">
                    {tx.spread(fmtInt(sel.einwohner), fmtInt(sel.gebaeude), fmt1(sel.einwohnerJeGebaeude))}
                  </p>
                </div>

                <p className="mt-3 border-l-2 border-primary pl-3 text-sm">{verdict(sel, lang)}</p>
              </section>
            )}

            {(sel || analysis) && (
              <section className="rounded-md border bg-card p-4">
                <p className="kicker">{tx.whatToDo}{sel ? ` · ${sel.name}` : ""}</p>
                {sel && <p className="mt-1 text-xs text-muted-foreground">{tx.ideasBasis}</p>}
                <ul className="mt-2 space-y-2">
                  {analysis && (
                    <li className="border-l-2 border-primary pl-3 text-sm"><strong>{analysis[lang].title}:</strong> {analysis[lang].action}</li>
                  )}
                  {sel && recommend(toProfile(sel), cityRef).map((i) => (
                    <li key={i.id} className="border-l-2 border-primary pl-3 text-sm"><strong>{i[lang].title}:</strong> {i[lang].text}</li>
                  ))}
                </ul>
              </section>
            )}

            {single && (
              <section className="rounded-md border bg-card p-4">
                <p className="kicker mb-2">{tx.ranking} · {L(single)}</p>
                <p className="mb-2 text-xs text-muted-foreground">{en ? "Under each bar: R = residents · B = buildings · P/B = residents per building." : "Unter den Balken: E = Einwohner · G = Gebäude · E/G = Einwohner je Gebäude."}</p>
                <ul className="space-y-1">
                  {sorted.map((d) => {
                    const v = value(d, single);
                    return (
                      <li key={d.name}>
                        <button onClick={() => setSelected(d.name)} className={`flex w-full items-center gap-2 rounded-sm px-1 py-0.5 text-left text-sm hover:bg-muted ${selected === d.name ? "bg-accent" : ""}`}>
                          <span className="w-32 shrink-0 truncate">{d.name}</span>
                          <span className="h-2.5 flex-1 overflow-hidden rounded-sm bg-muted">
                            <span className={`block h-full ${swatch[scaleClass(v, single)]}`} style={{ width: `${((v ?? 0) / max) * 100}%` }} />
                          </span>
                          <span className="w-24 shrink-0 text-right font-mono text-xs">{formatValue(v, single).replace("Pers.", en ? "ppl" : "Pers.")}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </aside>
        </div>
        <FutureDevelopmentPlans />
      </main>
    </div>
  );
}
