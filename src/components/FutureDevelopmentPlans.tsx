import { useMemo, useState } from "react";
import { FutureDevelopmentMap } from "@/components/FutureDevelopmentMap";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { DEFAULT_THRESHOLDS, evaluate, futureBlocks, edgeSuggestions, type Thresholds } from "@/lib/future";
import { useLang } from "@/lib/i18n";
import { hasFnp } from "@/lib/radar";

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
    { key: "living", label: en ? "Living space per resident below" : "Wohnfläche je Einwohner unter", min: 30, max: 70, step: 1, show: `${t.living} m²` },
    { key: "vacancy", label: en ? "Vacancy at most" : "Leerstand höchstens", min: 0, max: 25, step: 0.5, show: `${t.vacancy} %` },
    { key: "coverage", label: en ? "Building coverage at most" : "Bebauung höchstens", min: 1, max: 40, step: 1, show: `${t.coverage} %` },
  ];

  return (
    <section className="mt-10 rounded-md border bg-card p-4 sm:p-6" aria-labelledby="future-development-title">
      <p className="kicker">{en ? "Long-term planning" : "Langfristige Planung"}</p>
      <h2 id="future-development-title" className="mt-1 text-3xl font-bold uppercase">
        {en ? "Future Development Plans" : "Future Development Plans · Zukünftige Entwicklung"}
      </h2>
      <p className="mt-2 max-w-4xl text-sm text-muted-foreground">
        {en
          ? "Search areas on ~500 m blocks: high housing pressure (little living space, low vacancy) combined with little building on the remaining land. Nature reserves, landscape protection areas, flood zones, forests, cemeteries, allotments, car parks and parks/sports grounds are subtracted first; farmland stays (it is where new housing areas are usually zoned). Blue dashed areas are housing or mixed land in the city land-use plan (Flächennutzungsplan) that is still unbuilt. Move the sliders – the map recalculates instantly, so you can see how stable a result is."
          : "Suchräume auf ~500-m-Blöcken: hoher Wohnungsdruck (wenig Wohnfläche, wenig Leerstand) und wenig Bebauung auf der verbleibenden Fläche. Vorher abgezogen werden Naturschutzgebiete, Landschaftsschutzgebiete, Überschwemmungsgebiete, Wald, Friedhöfe, Kleingärten, Parkplätze sowie Parks und Sportflächen; Ackerflächen bleiben (dort werden neue Baugebiete meist ausgewiesen). Blau gestrichelt: im Flächennutzungsplan ausgewiesene Wohn- oder Mischbauflächen, die noch unbebaut sind. Verschiebe die Regler – die Karte rechnet sofort neu, so siehst du, wie stabil ein Ergebnis ist."}
      </p>
      {!hasFnp && (
        <p className="mt-2 max-w-4xl rounded-sm border-l-2 border-primary bg-muted/40 px-3 py-2 text-xs">
          {en
            ? "For this town there is no land-use plan or flood-zone data, so blue areas are missing and flood zones are not subtracted. Exclusion areas and building coverage are estimated on a 100 m sample grid."
            : "Für diese Gemeinde gibt es keinen Flächennutzungsplan und keine Überschwemmungsgebiete – blaue Flächen fehlen, Überschwemmungsgebiete werden nicht abgezogen. Ausschlussflächen und Bebauung werden über ein 100-m-Stichprobengitter geschätzt."}
        </p>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
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
        {hasFnp && <label className="flex items-center gap-2">
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
            ? "Only blocks on the city edge count. A block qualifies if it meets all conditions above or holds still-unbuilt housing land from the land-use plan (both after exclusions). The three districts with the most such area are suggested and their blocks outlined in red on the map. Changes with the sliders."
            : "Gezählt werden nur Blöcke am Stadtrand. Ein Block zählt, wenn er alle Bedingungen oben erfüllt oder noch unbebaute Wohnbaufläche aus dem Flächennutzungsplan enthält (beides nach Abzug der Ausschlussflächen). Vorgeschlagen werden die drei Stadtteile mit der meisten solchen Fläche; ihre Blöcke sind auf der Karte rot umrandet. Ändert sich mit den Reglern."}
        </p>
      </div>
      <p className="mt-3 border-l-2 border-primary bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        {en
          ? "Green = all conditions met; hover any block to see ✔/✘ per condition and what was subtracted. Where the census hides a block's value for privacy, the district value is used and marked. Building coverage comes from OpenStreetMap footprints and refers to the land left after exclusions. These are search areas, not buildable plots: zoning, ownership, Natura 2000 and infrastructure are not checked – confirm every site in the Geoportal and binding plans."
          : "Grün = alle Bedingungen erfüllt; beim Überfahren zeigt jeder Block ✔/✘ je Bedingung und was abgezogen wurde. Wo der Zensus den Blockwert aus Datenschutzgründen verbirgt, gilt der Stadtteilwert (markiert). Die Bebauung stammt aus OpenStreetMap-Gebäudeumrissen und bezieht sich auf die Fläche nach Abzug. Das sind Suchräume, keine Baugrundstücke: Bauleitplanung, Eigentum, Natura 2000 und Infrastruktur sind nicht geprüft – jeden Standort im Geoportal und anhand der verbindlichen Pläne kontrollieren."}
      </p>
    </section>
  );
}
