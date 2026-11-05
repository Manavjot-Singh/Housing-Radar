import { Link } from "@tanstack/react-router";
import { useLang, t } from "@/lib/i18n";

export function SiteHeader() {
  const [lang, setLang] = useLang();
  const tx = t[lang];
  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
        <Link to="/" className="flex items-baseline gap-3">
          <span className="font-display text-2xl font-bold uppercase text-primary">Housing Radar</span>
          <span className="kicker hidden sm:inline">{tx.city}</span>
        </Link>
        <nav className="flex gap-1 text-sm">
          <Link to="/" className="rounded-sm px-3 py-1.5 hover:bg-muted" activeProps={{ className: "bg-muted font-medium" }} activeOptions={{ exact: true }}>{tx.map}</Link>
          <Link to="/staedte" className="rounded-sm px-3 py-1.5 hover:bg-muted" activeProps={{ className: "bg-muted font-medium" }}>{lang === "en" ? "Other cities" : "Andere Städte"}</Link>
          <Link to="/quellen" className="rounded-sm px-3 py-1.5 hover:bg-muted" activeProps={{ className: "bg-muted font-medium" }}>{tx.sources}</Link>
          <div className="ml-2 flex overflow-hidden rounded-sm border" role="group" aria-label="Sprache / Language">
            {(["de", "en"] as const).map((l) => (
              <button key={l} onClick={() => setLang(l)} aria-pressed={lang === l} className={`px-2 py-1.5 font-mono text-xs uppercase ${lang === l ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{l}</button>
            ))}
          </div>
        </nav>
      </div>
    </header>
  );
}
