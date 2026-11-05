import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { CityMap } from "@/components/CityMap";
import { useLang } from "@/lib/i18n";
import { fetchDistricts, loadCensus, searchCities, type CensusRow, type CityHit, type DistrictSet } from "@/lib/citySearch";

export const Route = createFileRoute("/staedte")({
  head: () => ({
    meta: [
      { title: "Andere Städte – Housing Radar" },
      { name: "description", content: "Jede deutsche Gemeinde suchen: Stadtteilgrenzen aus OpenStreetMap und Zensus-2022-Kennzahlen zu Wohnfläche, Leerstand und Alter." },
      { property: "og:title", content: "Andere Städte – Housing Radar" },
      { property: "og:description", content: "Stadtteilgrenzen und Zensus-2022-Kennzahlen für jede deutsche Gemeinde." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Staedte,
});

function Staedte() {
  const [lang] = useLang();
  const en = lang === "en";
  const loc = en ? "en-GB" : "de-DE";
  const f1 = (v: number | null) => (v == null ? "–" : v.toLocaleString(loc, { maximumFractionDigits: 1 }));
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [hits, setHits] = useState<CityHit[] | null>(null);
  const [city, setCity] = useState<CityHit | null>(null);
  const [census, setCensus] = useState<CensusRow | null>(null);
  const [sets, setSets] = useState<DistrictSet[]>([]);
  const [level, setLevel] = useState<string | null>(null);
  const [loadingDistricts, setLoadingDistricts] = useState(false);

  async function onSearch(e: FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    setBusy(true); setErr(null); setHits(null);
    try {
      const r = await searchCities(q.trim());
      setHits(r);
      if (r.length === 1) await choose(r[0]!);
    } catch {
      setErr(en ? "Search failed. Please try again in a moment." : "Suche fehlgeschlagen. Bitte gleich nochmal versuchen.");
    } finally { setBusy(false); }
  }

  async function choose(h: CityHit) {
    setCity(h); setSets([]); setLevel(null); setCensus(null); setErr(null);
    const cen = await loadCensus();
    setCensus(h.ags ? cen.get(h.ags) ?? null : null);
    setLoadingDistricts(true);
    try {
      const s = await fetchDistricts(h.osmId);
      setSets(s);
      // prefer the finer level unless it is too fragmented
      const pick = [...s].reverse().find((x) => x.geojson.features.length <= 150) ?? s[0];
      setLevel(pick?.level ?? null);
    } catch {
      setErr(en ? "District boundaries could not be loaded (OpenStreetMap server busy). Try again." : "Stadtteilgrenzen konnten nicht geladen werden (OpenStreetMap-Server ausgelastet). Bitte erneut versuchen.");
    } finally { setLoadingDistricts(false); }
  }

  const active = sets.find((s) => s.level === level) ?? null;
  const names = active ? active.geojson.features.map((f) => (f.properties as { tags?: Record<string, string> }).tags?.name ?? "?").sort((a, b) => a.localeCompare(b, "de")) : [];

  const stats: [string, string][] = census ? [
    [en ? "Residents" : "Einwohner", census.einwohner?.toLocaleString(loc) ?? "–"],
    [en ? "Vacancy rate" : "Leerstandsquote", census.leerstandsquote != null ? `${f1(census.leerstandsquote)} %` : "–"],
    [en ? "Living space per resident (approx.)" : "Wohnfläche je Einwohner (ca.)", census.wohnflaecheProKopf != null ? `${f1(census.wohnflaecheProKopf)} m²` : "–"],
    [en ? "Average flat size" : "Ø Wohnungsgröße", census.flaecheJeWohnung != null ? `${f1(census.flaecheJeWohnung)} m²` : "–"],
    [en ? "Flats" : "Wohnungen", census.wohnungen?.toLocaleString(loc) ?? "–"],
    [en ? "Flats in 1–2 family houses" : "Wohnungen in Ein-/Zweifamilienhäusern", census.efhAnteil != null ? `${f1(census.efhAnteil)} %` : "–"],
    [en ? "Aged 67+" : "Anteil ab 67 Jahren", census.anteil67 != null ? `${f1(census.anteil67)} %` : "–"],
  ] : [];

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-5 max-w-3xl">
          <p className="kicker">{en ? "Other municipalities" : "Andere Gemeinden"}</p>
          <h1 className="mt-1 text-4xl font-bold uppercase leading-none sm:text-5xl">{en ? "Search a city" : "Stadt suchen"}</h1>
          <p className="mt-3 text-muted-foreground">
            {en
              ? "Any German municipality: district boundaries come live from OpenStreetMap, city-wide figures from the 2022 census. The detailed layers and analyses exist only for Lüneburg."
              : "Jede deutsche Gemeinde: Stadtteilgrenzen kommen live aus OpenStreetMap, die gesamtstädtischen Zahlen aus dem Zensus 2022. Die detaillierten Ebenen und Analysen gibt es nur für Lüneburg."}
          </p>
        </div>

        <form onSubmit={onSearch} role="search" className="mb-4 flex max-w-xl gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} type="search" aria-label={en ? "City name" : "Name der Stadt"}
            placeholder={en ? "e.g. Celle, Lübeck, Göttingen" : "z. B. Celle, Lübeck, Göttingen"}
            className="flex-1 rounded-sm border bg-card px-3 py-2 text-sm outline-none focus:border-primary" />
          <button type="submit" disabled={busy} className="rounded-sm bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60">
            {busy ? (en ? "Searching…" : "Suche…") : (en ? "Find city" : "Stadt suchen")}
          </button>
        </form>

        {err && <p className="mb-3 text-sm text-destructive">{err}</p>}

        {hits && hits.length === 0 && <p className="mb-3 text-sm text-muted-foreground">{en ? "No municipality found." : "Keine Gemeinde gefunden."}</p>}
        {hits && hits.length > 1 && (
          <ul className="mb-4 flex flex-wrap gap-2">
            {hits.map((h) => (
              <li key={h.osmId}>
                <button onClick={() => choose(h)} title={h.label}
                  className={`rounded-sm border px-3 py-1.5 text-left text-sm ${city?.osmId === h.osmId ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted"}`}>
                  {h.name} <span className="opacity-70">· {h.label.split(",").slice(1, 3).join(",")}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {city && (
          <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
            <div className="relative overflow-hidden rounded-md border">
              <CityMap outline={city.outline} districts={active?.geojson ?? null} lang={lang} />
              {loadingDistricts && <div className="absolute right-3 top-3 z-[400] rounded-sm border bg-card px-2 py-1 text-xs">{en ? "Loading districts…" : "Lade Stadtteile…"}</div>}
            </div>
            <aside className="flex flex-col gap-4">
              <section className="rounded-md border bg-card p-4">
                <p className="kicker">Zensus 2022</p>
                <h2 className="text-3xl font-bold uppercase">{city.name}</h2>
                {census ? (
                  <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                    {stats.map(([k, v]) => (
                      <div key={k}><dt className="text-muted-foreground">{k}</dt><dd className="font-display text-xl font-semibold">{v}</dd></div>
                    ))}
                  </dl>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">{en ? "No census figures matched this place (no municipality key in OpenStreetMap)." : "Keine Zensuszahlen zugeordnet (kein Gemeindeschlüssel in OpenStreetMap)."}</p>
                )}
              </section>
              <section className="rounded-md border bg-card p-4">
                <p className="kicker mb-2">{en ? "Districts" : "Stadtteile"} {active ? `· ${names.length}` : ""}</p>
                {sets.length > 1 && (
                  <div className="mb-2 flex gap-1 text-xs">
                    {sets.map((s) => (
                      <button key={s.level} onClick={() => setLevel(s.level)} aria-pressed={s.level === level}
                        className={`rounded-sm border px-2 py-1 ${s.level === level ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                        {en ? "Level" : "Ebene"} {s.level} ({s.geojson.features.length})
                      </button>
                    ))}
                  </div>
                )}
                {!loadingDistricts && !active && <p className="text-sm text-muted-foreground">{en ? "OpenStreetMap has no district boundaries for this municipality – only the outline is shown." : "OpenStreetMap hat für diese Gemeinde keine Stadtteilgrenzen – nur der Umriss wird gezeigt."}</p>}
                {active && <p className="max-h-64 overflow-auto text-sm">{names.join(" · ")}</p>}
              </section>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
