import { Link } from "@tanstack/react-router";
import { useLang, t } from "@/lib/i18n";
import { MunicipalitySwitcher } from "@/components/MunicipalitySwitcher";

const NAV_ITEM = "whitespace-nowrap rounded-sm px-3 py-1.5 font-medium hover:bg-muted";

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
        <nav className="flex flex-wrap items-center justify-end gap-1 text-sm">
          <Link to="/" className={NAV_ITEM} activeProps={{ className: "bg-muted" }} activeOptions={{ exact: true }}>{tx.map}</Link>
          <Link to="/quellen" className={NAV_ITEM} activeProps={{ className: "bg-muted" }}>{tx.sources}</Link>
          {import.meta.env.DEV && <MunicipalitySwitcher className={NAV_ITEM} />}
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
