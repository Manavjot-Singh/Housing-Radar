import { useMemo, useState } from "react";
import { FutureDevelopmentMap } from "@/components/FutureDevelopmentMap";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DEFAULT_THRESHOLDS, evaluate, futureBlocks, edgeSuggestions, type Thresholds } from "@/lib/future";
import { useLang } from "@/lib/i18n";
import { features } from "@/lib/radar";

export function FutureDevelopmentPlans() {
  const [lang] = useLang();
  const en = lang === "en";
  const [t, setT] = useState<Thresholds>(DEFAULT_THRESHOLDS);
  const hits = useMemo(() => futureBlocks.filter((b) => evaluate(b, t).pass), [t]);
  const ha = hits.reduce((s, b) => s + b.freeHa, 0);
  const fmt = (x: number) => x.toLocaleString(en ? "en-GB" : "de-DE", { maximumFractionDigits: 0 });
  const edge = useMemo(() => edgeSuggestions(futureBlocks, t), [t]);
  const top = edge.slice(0, 3);
  const focus = useMemo(() => new Set(top.flatMap((s) => s.blockIds)), [edge]); // eslint-disable-line react-hooks/exhaustive-deps
  const names = top.map((s) => `${s.district} (${fmt(s.ha)} ha)`).join(", ");
  const districts = [...new Set(hits.map((b) => b.d))].sort();

  const sliders: { key: "living" | "vacancy" | "coverage"; label: string; min: number; max: number; step: number; show: string }[] = [
    { key: "living" as const, label: en ? "Living space per resident below" : "Wohnfläche je Einwohner unter", min: 30, max: 70, step: 1, show: `${t.living} m²` },
    { key: "vacancy" as const, label: en ? "Vacancy at most" : "Leerstand höchstens", min: 0, max: 25, step: 0.5, show: `${t.vacancy} %` },
    { key: "coverage" as const, label: en ? "Building coverage at most" : "Bebauung höchstens", min: 1, max: 40, step: 1, show: `${t.coverage} %` },
  ].filter((s) => features.coverage || s.key !== "coverage");


  return (
    <section className="mt-10 rounded-md border bg-card p-4 sm:p-6" aria-labelledby="future-development-title">
      <p className="kicker">{en ? "Long-term planning" : "Langfristige Planung"}</p>
      <h2 id="future-development-title" className="mt-1 text-3xl font-bold uppercase">
        {en ? "Future Development Plans" : "Future Development Plans · Zukünftige Entwicklung"}
      </h2>

      <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
        <span>{en ? "Thresholds" : "Grenzwerte"}</span>
        <Popover>
          <PopoverTrigger aria-label={en ? "How to use the sliders" : "So nutzt du die Regler"}
            className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-muted-foreground font-mono text-[10px] leading-none hover:border-primary hover:text-primary">i</PopoverTrigger>
          <PopoverContent className="w-80 text-sm">
            <p className="mb-1 font-semibold">{en ? "Why three sliders?" : "Warum drei Regler?"}</p>
            <p className="text-muted-foreground">{en
              ? "A block turns green only if it meets all conditions: little living space per resident and low vacancy mean housing is scarce there; little building on the remaining land means there is room to build. Move a slider to tighten or loosen a condition – if a block stays green over a wide range, it is a robust result; if it flips quickly, treat it with caution. Reset restores the defaults."
              : "Ein Block wird nur grün, wenn er alle Bedingungen erfüllt: wenig Wohnfläche je Einwohner und wenig Leerstand zeigen knappen Wohnraum; wenig Bebauung auf der Restfläche zeigt, dass Platz zum Bauen da ist. Verschiebe einen Regler, um eine Bedingung strenger oder lockerer zu machen – bleibt ein Block über einen weiten Bereich grün, ist das Ergebnis stabil; kippt er schnell, mit Vorsicht betrachten. „Zurücksetzen“ stellt die Standardwerte wieder her."}</p>
          </PopoverContent>
        </Popover>
      </div>
      <div className="mt-2 grid gap-4 sm:grid-cols-3">
        {sliders.map((s) => (
          <label key={s.key} className="block text-sm">
            <span className="flex justify-between gap-2"><span>{s.label}</span><b>{s.show}</b></span>
            <Slider className="mt-2" min={s.min} max={s.max} step={s.step} value={[t[s.key]]}
              onValueChange={([v]) => setT((p) => ({ ...p, [s.key]: v }))} aria-label={s.label} />
          </label>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        <span>
          <b>{hits.length}</b> {en ? "blocks" : "Blöcke"} · <b>{fmt(ha)} ha</b> {en ? "remaining area" : "verbleibende Fläche"}
          {districts.length > 0 && <span className="text-muted-foreground"> · {districts.join(", ")}</span>}
        </span>
        {features.fnp && <label className="flex items-center gap-2">
          <input type="checkbox" checked={t.onlyPlanned} onChange={(e) => setT((p) => ({ ...p, onlyPlanned: e.target.checked }))} />
          {en ? "Only blocks with housing land in the land-use plan" : "Nur Blöcke mit Wohnbaufläche im Flächennutzungsplan"}
        </label>}
        <Button variant="outline" size="sm" onClick={() => setT(DEFAULT_THRESHOLDS)}>{en ? "Reset" : "Zurücksetzen"}</Button>
      </div>

      <div className="mt-3 overflow-hidden rounded-md border">
        <FutureDevelopmentMap lang={lang} t={t} focus={focus} />
      </div>
      <div className="mt-4 rounded-md border p-4">
        <p className="kicker">{en ? "Direction for outward growth" : "Richtung für Stadterweiterung"}</p>
        {top.length > 0 ? (
          <p className="mt-1 text-lg font-bold">
            {en ? "Suggested: grow outwards at the city edge near " : "Empfehlung: Stadt nach außen erweitern bei "}
            <span className="font-normal">{names}</span>
          </p>
        ) : (
          <p className="mt-1 text-lg font-bold">{en ? "No edge area is suitable with these settings" : "Mit diesen Einstellungen ist kein Stadtrand-Bereich geeignet"}</p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          {en
            ? `Only blocks on the city edge count. A block qualifies if it meets all conditions above${features.fnp ? " or holds still-unbuilt housing land from the land-use plan (both after exclusions)" : ""}. The three districts with the most such area are suggested and their blocks outlined in red on the map. Changes with the sliders.`
            : `Gezählt werden nur Blöcke am Stadtrand. Ein Block zählt, wenn er alle Bedingungen oben erfüllt${features.fnp ? " oder noch unbebaute Wohnbaufläche aus dem Flächennutzungsplan enthält (beides nach Abzug der Ausschlussflächen)" : ""}. Vorgeschlagen werden die drei Stadtteile mit der meisten solchen Fläche; ihre Blöcke sind auf der Karte rot umrandet. Ändert sich mit den Reglern.`}
        </p>
      </div>
      <p className="mt-3 border-l-2 border-primary bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        {en
          ? `Green = all conditions met; hover any block to see ✔/✘ per condition and what was subtracted. Where the census hides a block's value for privacy, the district value is used and marked.${features.coverage ? " Building coverage comes from OpenStreetMap footprints and refers to the land left after exclusions." : ""} These are search areas, not buildable plots: zoning, ownership, Natura 2000 and infrastructure are not checked – confirm every site in the Geoportal and binding plans.`
          : `Grün = alle Bedingungen erfüllt; beim Überfahren zeigt jeder Block ✔/✘ je Bedingung und was abgezogen wurde. Wo der Zensus den Blockwert aus Datenschutzgründen verbirgt, gilt der Stadtteilwert (markiert).${features.coverage ? " Die Bebauung stammt aus OpenStreetMap-Gebäudeumrissen und bezieht sich auf die Fläche nach Abzug." : ""} Das sind Suchräume, keine Baugrundstücke: Bauleitplanung, Eigentum, Natura 2000 und Infrastruktur sind nicht geprüft – jeden Standort im Geoportal und anhand der verbindlichen Pläne kontrollieren.`}
      </p>
    </section>
  );
}
