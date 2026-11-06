import { useMemo, useState } from "react";
import { FutureDevelopmentMap } from "@/components/FutureDevelopmentMap";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DEFAULT_THRESHOLDS, evaluate, futureBlocks, edgeSuggestions, type Thresholds } from "@/lib/future";
import { useLang } from "@/lib/i18n";
import { features } from "@/lib/radar";

const INFO_BUTTON = "inline-flex h-4 w-4 items-center justify-center rounded-full border border-muted-foreground font-mono text-[10px] leading-none hover:border-primary hover:text-primary";

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

  const sliders: { key: "living" | "vacancy" | "coverage"; label: string; info: string; min: number; max: number; step: number; show: string }[] = [
    { key: "living" as const, label: en ? "Living space per resident below" : "Wohnfläche je Einwohner unter",
      info: en ? "Little space per person signals housing pressure. Raise it to include more blocks, lower it to keep only the tightest areas." : "Wenig Fläche pro Person zeigt Wohnungsdruck. Höher nimmt mehr Blöcke auf, niedriger lässt nur die engsten Gebiete übrig.",
      min: 30, max: 70, step: 1, show: `${t.living} m²` },
    { key: "vacancy" as const, label: en ? "Vacancy at most" : "Leerstand höchstens",
      info: en ? "Few empty homes mean existing housing can't absorb demand. Raise it to allow blocks with more empty homes." : "Wenig leere Wohnungen heißt, der Bestand fängt die Nachfrage nicht auf. Höher lässt auch Blöcke mit mehr Leerstand zu.",
      min: 0, max: 25, step: 0.5, show: `${t.vacancy} %` },
    { key: "coverage" as const, label: en ? "Building coverage at most" : "Bebauung höchstens",
      info: en ? "Little building on the remaining land means there is room to build. Raise it to include more built-up blocks." : "Wenig Bebauung auf der Restfläche heißt, es gibt Platz zum Bauen. Höher nimmt auch dichter bebaute Blöcke auf.",
      min: 1, max: 40, step: 1, show: `${t.coverage} %` },
  ].filter((s) => features.coverage || s.key !== "coverage");


  return (
    <section className="mt-10 rounded-md border bg-card p-4 sm:p-6" aria-labelledby="future-development-title">
      <p className="kicker">{en ? "Long-term planning" : "Langfristige Planung"}</p>
      <h2 id="future-development-title" className="mt-1 text-3xl font-bold uppercase">
        {en ? "Future Development Plans" : "Future Development Plans · Zukünftige Entwicklung"}
      </h2>

      <p className="mt-4 text-sm text-muted-foreground">{en ? "Thresholds" : "Grenzwerte"}</p>
      <div className="mt-2 grid gap-4 sm:grid-cols-3">
        {sliders.map((s) => (
          <label key={s.key} className="block text-sm">
            <span className="flex justify-between gap-2">
              <span className="flex items-center gap-1.5">
                {s.label}
                <Popover>
                  <PopoverTrigger aria-label={`${en ? "About" : "Info zu"}: ${s.label}`} className={`${INFO_BUTTON} shrink-0`}>i</PopoverTrigger>
                  <PopoverContent className="w-64 text-sm text-muted-foreground">{s.info}</PopoverContent>
                </Popover>
              </span>
              <b className="whitespace-nowrap">{s.show}</b>
            </span>
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
        <span className="flex items-center gap-2 text-muted-foreground">
          {en ? "How to read the map" : "So liest du die Karte"}
          <Popover>
            <PopoverTrigger aria-label={en ? "How to read the map" : "So liest du die Karte"} className={INFO_BUTTON}>i</PopoverTrigger>
            <PopoverContent className="w-96 max-w-[calc(100vw-2rem)] text-sm">
              <p className="text-muted-foreground">
                {en
                  ? `Green = all conditions met; hover any block to see ✔/✘ per condition and what was subtracted. Where the census hides a block's value for privacy, the district value is used and marked.${features.coverage ? " Building coverage comes from OpenStreetMap footprints and refers to the land left after exclusions." : ""} These are search areas, not buildable plots: zoning, ownership, Natura 2000 and infrastructure are not checked – confirm every site in the Geoportal and binding plans.`
                  : `Grün = alle Bedingungen erfüllt; beim Überfahren zeigt jeder Block ✔/✘ je Bedingung und was abgezogen wurde. Wo der Zensus den Blockwert aus Datenschutzgründen verbirgt, gilt der Stadtteilwert (markiert).${features.coverage ? " Die Bebauung stammt aus OpenStreetMap-Gebäudeumrissen und bezieht sich auf die Fläche nach Abzug." : ""} Das sind Suchräume, keine Baugrundstücke: Bauleitplanung, Eigentum, Natura 2000 und Infrastruktur sind nicht geprüft – jeden Standort im Geoportal und anhand der verbindlichen Pläne kontrollieren.`}
              </p>
            </PopoverContent>
          </Popover>
        </span>
      </div>

      <div className="mt-3 overflow-hidden rounded-md border">
        <FutureDevelopmentMap lang={lang} t={t} focus={focus} />
      </div>
      <div className="mt-4 rounded-md border p-4">
        <div className="flex items-center gap-2">
          <p className="kicker">{en ? "Direction for outward growth" : "Richtung für Stadterweiterung"}</p>
          <Popover>
            <PopoverTrigger aria-label={en ? "How the growth direction is chosen" : "So wird die Richtung bestimmt"} className={INFO_BUTTON}>i</PopoverTrigger>
            <PopoverContent className="w-96 max-w-[calc(100vw-2rem)] text-sm">
              <p className="text-muted-foreground">
                {en
                  ? `Only blocks on the city edge count. A block qualifies if it meets all conditions above${features.fnp ? " or holds still-unbuilt housing land from the land-use plan (both after exclusions)" : ""}. The three districts with the most such area are suggested and their blocks outlined in red on the map. Changes with the sliders.`
                  : `Gezählt werden nur Blöcke am Stadtrand. Ein Block zählt, wenn er alle Bedingungen oben erfüllt${features.fnp ? " oder noch unbebaute Wohnbaufläche aus dem Flächennutzungsplan enthält (beides nach Abzug der Ausschlussflächen)" : ""}. Vorgeschlagen werden die drei Stadtteile mit der meisten solchen Fläche; ihre Blöcke sind auf der Karte rot umrandet. Ändert sich mit den Reglern.`}
              </p>
            </PopoverContent>
          </Popover>
        </div>
        {top.length > 0 ? (
          <p className="mt-1 text-lg font-bold">
            {en ? "Suggested: grow outwards at the city edge near " : "Empfehlung: Stadt nach außen erweitern bei "}
            <span className="font-normal">{names}</span>
          </p>
        ) : (
          <p className="mt-1 text-lg font-bold">{en ? "No edge area is suitable with these settings" : "Mit diesen Einstellungen ist kein Stadtrand-Bereich geeignet"}</p>
        )}
      </div>
    </section>
  );
}
