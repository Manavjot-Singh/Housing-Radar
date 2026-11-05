import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { SiteHeader } from "@/components/SiteHeader";
import { MunicipalityMap } from "@/components/MunicipalityMap";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLang } from "@/lib/i18n";
import { applyCity } from "@/lib/city";
import { buildCityData, loadMunicipality, searchMunicipality } from "@/lib/municipality.functions";
import type { MunicipalityResult } from "@/lib/municipality";

export const Route = createFileRoute("/gemeinde")({
  head: () => ({
    meta: [
      { title: "Andere Gemeinde prüfen – Housing Radar" },
      { name: "description", content: "Für jede Gemeinde in Niedersachsen Naturschutz, Landschaftsschutz und ALKIS-Gebäude live laden und Bebauung je 500-m-Block vergleichen." },
      { property: "og:title", content: "Andere Gemeinde prüfen – Housing Radar" },
      { property: "og:description", content: "Schutzgebiete und Gebäudegrundrisse für Gemeinden in Niedersachsen auf einen Blick." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Gemeinde,
});

type Hit = Awaited<ReturnType<typeof searchMunicipality>>[number];

function Gemeinde() {
  const [lang] = useLang();
  const en = lang === "en";
  const load = useServerFn(loadMunicipality);
  const search = useServerFn(searchMunicipality);
  const build = useServerFn(buildCityData);
  const navigate = useNavigate();
  const [busyDash, setBusyDash] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [pick, setPick] = useState<Hit | null>(null);
  const [busy, setBusy] = useState<"search" | "load" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<MunicipalityResult | null>(null);
  const f = (x: number, d = 1) => x.toLocaleString(en ? "en-GB" : "de-DE", { maximumFractionDigits: d });

  const doSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!q.trim()) return;
    setBusy("search"); setErr(null); setPick(null); setData(null);
    try { const h = await search({ data: { q: q.trim() } }); setHits(h); if (h.length === 1) setPick(h[0]!); }
    catch { setErr(en ? "Search failed. Please try again." : "Suche fehlgeschlagen. Bitte erneut versuchen."); }
    finally { setBusy(null); }
  };

  const proceed = async () => {
    if (!pick) return;
    setBusy("load"); setErr(null); setData(null);
    try { setData(await load({ data: { osmId: pick.osmId, ags: pick.ags, name: pick.name } })); }
    catch (x) { setErr((en ? "Loading failed: " : "Laden fehlgeschlagen: ") + (x instanceof Error ? x.message : "")); }
    finally { setBusy(null); }
  };

  const toDashboard = async () => {
    if (!pick) return;
    setBusyDash(true); setErr(null);
    try {
      const c = await build({ data: { osmId: pick.osmId, ags: pick.ags, name: pick.name } });
      applyCity(c);
      await navigate({ to: "/" });
    } catch (x) { setErr((en ? "Building the dashboard failed: " : "Dashboard konnte nicht erstellt werden: ") + (x instanceof Error ? x.message : "")); }
    finally { setBusyDash(false); }
  };

  const cards: [string, string][] = data ? [
    [en ? "Area" : "Fläche", `${f(data.areaHa / 100)} km²`],
    [en ? "Buildings (ALKIS)" : "Gebäude (ALKIS)", f(data.buildings, 0)],
    [en ? "Built-up share" : "Bebauungsdichte", `${f(data.builtPct)} %`],
    [en ? "Nature reserves" : "Naturschutzgebiete", `${f(data.nsgHa, 0)} ha · ${f((data.nsgHa / data.areaHa) * 100)} %`],
    [en ? "Landscape protection" : "Landschaftsschutz", `${f(data.lsgHa, 0)} ha · ${f((data.lsgHa / data.areaHa) * 100)} %`],
    [en ? "Neither built nor protected" : "Weder bebaut noch geschützt", `${f(data.freeHa, 0)} ha · ${f((data.freeHa / data.areaHa) * 100)} %`],
  ] : [];

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-8">
        <div>
          <p className="kicker">{en ? "Other municipality · Lower Saxony" : "Andere Gemeinde · Niedersachsen"}</p>
          <h1 className="font-display text-3xl font-bold uppercase">{en ? "Check another municipality" : "Andere Gemeinde prüfen"}</h1>
          <p className="mt-2 max-w-3xl text-muted-foreground">
            {en
              ? "Search a town in Lower Saxony. On “Proceed” the page loads nature reserves and landscape protection areas (NLWKN) and official building outlines (ALKIS, LGLN) live for that town and puts them on the same 500 m blocks as the Lüneburg map."
              : "Suche eine Gemeinde in Niedersachsen. Mit „Weiter“ lädt die Seite live Naturschutz- und Landschaftsschutzgebiete (NLWKN) sowie die amtlichen Gebäudegrundrisse (ALKIS, LGLN) und legt sie wie bei Lüneburg auf 500-m-Blöcke."}
          </p>
        </div>

        <form onSubmit={doSearch} className="flex max-w-xl gap-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={en ? "e.g. Celle, Uelzen, Winsen (Luhe)" : "z. B. Celle, Uelzen, Winsen (Luhe)"} aria-label={en ? "Municipality" : "Gemeinde"} />
          <Button type="submit" disabled={busy !== null}>{busy === "search" ? (en ? "Searching…" : "Suche…") : en ? "Search" : "Suchen"}</Button>
        </form>

        {hits && (
          hits.length === 0
            ? <p className="text-sm text-muted-foreground">{en ? "No municipality in Lower Saxony found." : "Keine Gemeinde in Niedersachsen gefunden."}</p>
            : <div className="max-w-xl space-y-2">
                <ul className="divide-y rounded-sm border">
                  {hits.map((h) => (
                    <li key={h.ags}>
                      <button type="button" onClick={() => setPick(h)} className={`w-full px-3 py-2 text-left text-sm hover:bg-muted ${pick?.ags === h.ags ? "bg-muted font-medium" : ""}`}>
                        {h.label} <span className="font-mono text-xs text-muted-foreground">AGS {h.ags}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap gap-2">
                <Button onClick={toDashboard} disabled={!pick || busy !== null || busyDash}>
                  {busyDash ? (en ? "Building dashboard… (up to 2 min)" : "Erstelle Dashboard… (bis zu 2 Min.)") : pick ? (en ? `Open dashboard for ${pick.name}` : `Dashboard für ${pick.name} öffnen`) : en ? "Choose a municipality" : "Gemeinde wählen"}
                </Button>
                <Button variant="outline" onClick={proceed} disabled={!pick || busy !== null || busyDash}>
                  {busy === "load" ? (en ? "Loading data… (up to 1 min)" : "Lade Daten… (bis zu 1 Min.)") : en ? "Only protected areas & buildings" : "Nur Schutzgebiete & Gebäude"}
                </Button>
                </div>
              </div>
        )}

        {err && <p className="text-sm text-destructive">{err}</p>}

        {data && (
          <section className="space-y-4">
            <h2 className="font-display text-2xl font-bold uppercase">{data.name}</h2>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {cards.map(([k, v]) => (
                <div key={k} className="rounded-sm border bg-card p-3"><p className="kicker">{k}</p><p className="mt-1 font-mono text-lg">{v}</p></div>
              ))}
            </div>
            {data.truncated && <p className="text-sm text-destructive">{en ? "Very many buildings: only the first 120,000 in the search area were counted." : "Sehr viele Gebäude: nur die ersten 120.000 im Suchgebiet wurden gezählt."}</p>}
            <MunicipalityMap data={data} en={en} />
            <p className="text-xs text-muted-foreground">
              {en
                ? "Sources: boundary © OpenStreetMap contributors (ODbL); protected areas © NLWKN (DL-DE-BY 2.0); building outlines ALKIS © LGLN (CC BY 4.0). Areas are estimated on a 100 m sample grid. Census figures, amenities and the land-use plan are only available on the Lüneburg map."
                : "Quellen: Grenze © OpenStreetMap-Mitwirkende (ODbL); Schutzgebiete © NLWKN (DL-DE-BY 2.0); Gebäudegrundrisse ALKIS © LGLN (CC BY 4.0). Flächen werden über ein 100-m-Stichprobengitter geschätzt. Zensuszahlen, Versorgung und Flächennutzungsplan gibt es nur auf der Lüneburg-Karte."}
            </p>
          </section>
        )}
      </main>
    </div>
  );
}
