import { Link } from "@tanstack/react-router";

export function SiteHeader() {
  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
        <Link to="/" className="flex items-baseline gap-3">
          <span className="font-display text-2xl font-bold uppercase text-primary">Housing Radar</span>
          <span className="kicker hidden sm:inline">Hansestadt Lüneburg</span>
        </Link>
        <nav className="flex gap-1 text-sm">
          <Link to="/" className="rounded-sm px-3 py-1.5 hover:bg-muted" activeProps={{ className: "bg-muted font-medium" }} activeOptions={{ exact: true }}>Karte</Link>
          <Link to="/quellen" className="rounded-sm px-3 py-1.5 hover:bg-muted" activeProps={{ className: "bg-muted font-medium" }}>Quellen & Methode</Link>
        </nav>
      </div>
    </header>
  );
}
