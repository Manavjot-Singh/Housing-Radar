import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type { MunicipalityResult, Poly } from "@/lib/municipality";

const toLatLng = (polys: Poly[]) => polys.map((p) => p.map((r) => r.map(([x, y]) => [y, x] as [number, number])));

function builtColor(p: number) {
  return p >= 20 ? "#7f1d1d" : p >= 10 ? "#c2410c" : p >= 5 ? "#f59e0b" : p >= 1 ? "#fde68a" : "#fefce8";
}

export function MunicipalityMap({ data, en }: { data: MunicipalityResult; en: boolean }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let map: import("leaflet").Map | undefined;
    let dead = false;
    import("leaflet").then((L) => {
      if (dead || !el.current) return;
      map = L.map(el.current, { renderer: L.svg() });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap-Mitwirkende", maxZoom: 18 }).addTo(map);
      const f = (x: number) => x.toLocaleString(en ? "en-GB" : "de-DE", { maximumFractionDigits: 1 });
      for (const b of data.blocks) {
        L.rectangle([[b.s, b.w], [b.n, b.e]], { color: "#78716c", weight: 0.4, fillColor: builtColor(b.builtPct), fillOpacity: 0.6 })
          .bindTooltip(`<b>${en ? "500 m block" : "500-m-Block"}</b><br>${en ? "Built-up" : "Bebaut"}: ${f(b.builtPct)} %<br>${en ? "Buildings" : "Gebäude"}: ${b.buildings}<br>${en ? "Nature reserve" : "Naturschutz"}: ${f(b.nsgPct)} %<br>${en ? "Landscape protection" : "Landschaftsschutz"}: ${f(b.lsgPct)} %`, { sticky: true })
          .addTo(map);
      }
      L.polygon(toLatLng(data.lsg), { color: "#15803d", weight: 1, fillColor: "#22c55e", fillOpacity: 0.15, dashArray: "4 3", interactive: false }).addTo(map);
      L.polygon(toLatLng(data.nsg), { color: "#1d4ed8", weight: 1.5, fillColor: "#3b82f6", fillOpacity: 0.3, interactive: false }).addTo(map);
      const bnd = L.polygon(toLatLng(data.boundary), { color: "#111827", weight: 2.5, fill: false, interactive: false }).addTo(map);
      map.fitBounds(bnd.getBounds());
    });
    return () => { dead = true; map?.remove(); };
  }, [data, en]);

  const legend: [string, string][] = [
    ["#fde68a", en ? "1–5 % built-up" : "1–5 % bebaut"],
    ["#f59e0b", en ? "5–10 % built-up" : "5–10 % bebaut"],
    ["#c2410c", en ? "10–20 % built-up" : "10–20 % bebaut"],
    ["#7f1d1d", en ? "≥ 20 % built-up" : "≥ 20 % bebaut"],
    ["#3b82f6", en ? "Nature reserve" : "Naturschutzgebiet"],
    ["#22c55e", en ? "Landscape protection" : "Landschaftsschutzgebiet"],
  ];
  return (
    <div className="relative">
      <div ref={el} className="h-[560px] w-full rounded-sm border" />
      <div className="pointer-events-none absolute bottom-3 left-3 z-[500] rounded-sm border bg-card/95 p-2 text-xs shadow">
        {legend.map(([c, l]) => (
          <div key={l} className="flex items-center gap-2"><span className="inline-block h-3 w-4 border" style={{ background: c }} />{l}</div>
        ))}
      </div>
    </div>
  );
}
