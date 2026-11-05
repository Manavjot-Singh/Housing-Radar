import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { RadarMap, type AmenityKey } from "@/components/RadarMap";
import { SiteHeader } from "@/components/SiteHeader";
import { useLang, t } from "@/lib/i18n";
import gitter from "@/data/gitter.json";
import {
  analyses, thresholdText, cellValue, cityAvg, cityPopulation, districts, fmt1, fmtAuto, fmtInt, fmtNum, formatValue, indicators, meets, scaleClass, value, verdict,
  type Cell, type Condition, type Dir, type Indicator,
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
const dotVar: Record<AmenityKey, string> = { shop: "var(--scale-3)", doc: "var(--primary)", pt: "var(--card)" };
const cells = gitter as unknown as Cell[];
const layerOrder: Indicator[] = ["wohnflaecheProKopf", "leerstandsquote", "anteil65", "efhAnteil", "raeumeProKopf", "versorgung", "bebautAnteil", "einwohnerJeGebaeude"];
const defaultDir: Record<Indicator, Dir> = {
  wohnflaecheProKopf: "high", leerstandsquote: "high", anteil65: "high", efhAnteil: "high",
  raeumeProKopf: "high", versorgung: "low", bebautAnteil: "low", einwohnerJeGebaeude: "low",
};

function Index() {
  const [lang] = useLang();
  const tx = t[lang];
  const en = lang === "en";
  const [conditions, setConditions] = useState<Condition[]>([{ ind: "wohnflaecheProKopf", dir: "high" }]);
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [amenities, setAmenities] = useState<Record<AmenityKey, boolean>>({ shop: false, doc: false, pt: false });
  const [selected, setSelected] = useState<string | null>("Wilschenbruch");

  const L = (k: Indicator) => (en ? indicators[k].labelEn : indicators[k].label);
  const unit = (k: Indicator) => (en && indicators[k].unit === "Pers." ? "ppl" : indicators[k].unit);
  const combo = conditions.length > 1;
  const single = conditions.length === 1 ? conditions[0]!.ind : null;
  const analysis = analyses.find((a) => a.id === analysisId);

  function toggle(k: Indicator) {
    setAnalysisId(null);
    setConditions((cs) => {
      if (cs.some((c) => c.ind === k)) return cs.length > 1 ? cs.filter((c) => c.ind !== k) : cs;
      return [...cs, { ind: k, dir: defaultDir[k] }];
    });
  }
  function setDir(k: Indicator, dir: Dir) {
    setAnalysisId(null);
    setConditions((cs) => cs.map((c) => (c.ind === k ? { ...c, dir } : c)));
  }
  function pick(id: string) {
    const a = analyses.find((x) => x.id === id)!;
    setAnalysisId(id);
    setConditions(a.conditions);
    if (a.conditions.some((c) => c.ind === "versorgung")) setAmenities({ shop: true, doc: true, pt: false });
  }

  // share of residents per district living in squares meeting all conditions
  const hits = useMemo(() => {
    if (!combo) return [];
    const m = new Map<string, { hit: number; all: number }>();
    for (const c of cells) {
      if (!c[2]) continue;
      const e = m.get(c[9]) ?? { hit: 0, all: 0 };
      e.all += c[2];
      if (conditions.every((k) => meets(cellValue(c, k.ind), k) === true)) e.hit += c[2];
      m.set(c[9], e);
    }
    return [...m.entries()].map(([name, e]) => ({ name, share: (e.hit / e.all) * 100, people: e.hit })).sort((a, b) => b.share - a.share);
  }, [combo, conditions]);

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
          <p className="kicker">Leuphana AI Hackathon · Challenge 4</p>
          <h1 className="mt-1 text-4xl font-bold uppercase leading-none sm:text-5xl">{tx.title}</h1>
          <p className="mt-3 text-muted-foreground">{tx.intro(fmtAuto(cityAvg), fmtInt(cityPopulation))}</p>
        </div>

        <section className="mb-3">
          <p className="kicker mb-1.5">{tx.analyses}</p>
          <div className="flex flex-wrap gap-2">
            {analyses.map((a) => (
              <button key={a.id} onClick={() => pick(a.id)}
                className={`rounded-sm border px-3 py-1.5 text-left text-sm ${analysisId === a.id ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted"}`}>
                {a[lang].title}
              </button>
            ))}
          </div>
        </section>

        <section className="mb-3 rounded-md border bg-card p-3">
          <div className="mb-1.5 flex flex-wrap items-baseline gap-x-3">
            <p className="kicker">{tx.layers}</p>
            <p className="text-xs text-muted-foreground">{tx.layersHint}</p>
          </div>
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
            {(["shop", "doc", "pt"] as AmenityKey[]).map((k) => (
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
        </section>

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
              {single ? (
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
                  {(["shop", "doc", "pt"] as AmenityKey[]).filter((k) => amenities[k]).map((k) => (
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
            {combo && (
              <section className="rounded-md border bg-card p-4">
                {analysis && (
                  <>
                    <p className="kicker">{tx.whatToDo}</p>
                    <p className="mt-1 border-l-2 border-primary pl-3 text-sm">{analysis[lang].action}</p>
                  </>
                )}
                <p className={`kicker ${analysis ? "mt-4" : ""}`}>{tx.hits}</p>
                <p className="mb-2 text-xs text-muted-foreground">{tx.hitsHint}</p>
                <ul className="space-y-1">
                  {hits.map((h) => (
                    <li key={h.name}>
                      <button onClick={() => setSelected(h.name)} className={`flex w-full items-center gap-2 rounded-sm px-1 py-0.5 text-left text-sm hover:bg-muted ${selected === h.name ? "bg-accent" : ""}`}>
                        <span className="w-32 shrink-0 truncate">{h.name}</span>
                        <span className="h-2.5 flex-1 overflow-hidden rounded-sm bg-muted">
                          <span className="block h-full bg-scale-5" style={{ width: `${h.share}%` }} />
                        </span>
                        <span className="w-28 shrink-0 whitespace-nowrap text-right font-mono text-xs">{fmtAuto(h.share)} % · {h.people.toLocaleString(loc)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-muted-foreground">{tx.fallbackNote}</p>
              </section>
            )}

            {sel && (
              <section className="rounded-md border bg-card p-4">
                <p className="kicker">{tx.district}</p>
                <h2 className="text-3xl font-bold uppercase">{sel.name}</h2>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div><dt className="text-muted-foreground">{tx.living}</dt><dd className="font-display text-2xl font-semibold">{fmtAuto(sel.wohnflaecheProKopf)} m²</dd></div>
                  <div><dt className="text-muted-foreground">{tx.vacancy}</dt><dd className="font-display text-2xl font-semibold">{sel.leerstandsquote != null ? `${fmtAuto(sel.leerstandsquote)} %` : tx.noData}</dd></div>
                  <div><dt className="text-muted-foreground">{tx.old}</dt><dd className="font-display text-2xl font-semibold">{sel.anteil65 != null ? `${fmtAuto(sel.anteil65)} %` : tx.noData}</dd></div>
                  <div><dt className="text-muted-foreground">{tx.efh}</dt><dd className="font-display text-2xl font-semibold">{sel.efhAnteil != null ? `${Math.round(sel.efhAnteil)} %` : tx.noData}</dd></div>
                  <div><dt className="text-muted-foreground">{tx.rooms}</dt><dd className="font-display text-2xl font-semibold">{sel.raeumeProKopf != null ? fmt1(sel.raeumeProKopf) : tx.noData}</dd></div>
                  <div><dt className="text-muted-foreground">{tx.amen}</dt><dd className="font-display text-2xl font-semibold">{sel.versorgung != null ? `${fmt1(sel.versorgung)} / 3` : tx.noData}</dd></div>
                  <div><dt className="text-muted-foreground">{tx.density}</dt><dd className="font-display text-2xl font-semibold">{fmtAuto(sel.bebautAnteil)} %</dd></div>
                  <div><dt className="text-muted-foreground">{tx.coverage}</dt><dd className="font-medium">{sel.abdeckung} %</dd></div>
                </dl>

                <div className="mt-3 rounded-sm border bg-muted/50 p-3">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div><dt className="text-xs text-muted-foreground">{tx.residents}</dt><dd className="font-display text-xl font-semibold">{sel.einwohner.toLocaleString(loc)}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">{tx.buildings}</dt><dd className="font-display text-xl font-semibold">{sel.gebaeude.toLocaleString(loc)}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">{tx.perBuilding}</dt><dd className="font-display text-xl font-semibold text-primary">{fmt1(sel.einwohnerJeGebaeude)}</dd></div>
                  </div>
                  <p className="mt-2 border-t pt-2 text-xs text-muted-foreground">
                    {tx.spread(fmtInt(sel.einwohner), fmtInt(sel.gebaeude), fmt1(sel.einwohnerJeGebaeude))}
                  </p>
                </div>

                <p className="mt-3 border-l-2 border-primary pl-3 text-sm">{verdict(sel, lang)}</p>
              </section>
            )}

            {single && (
              <section className="rounded-md border bg-card p-4">
                <p className="kicker mb-2">{tx.ranking} · {L(single)}</p>
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
      </main>
    </div>
  );
}
