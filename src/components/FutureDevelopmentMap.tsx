import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import futureAreas from "@/data/future-development-areas.json";

export function FutureDevelopmentMap({ lang }: { lang: "de" | "en" }) {
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let map: import("leaflet").Map | undefined;
    let cancelled = false;
    import("leaflet").then((mod) => {
      if (cancelled || !el.current) return;
      const L = (mod.default ?? mod) as typeof import("leaflet");
      map = L.map(el.current, { zoomControl: true }).setView([53.245, 10.41], 12);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap-Mitwirkende · Zensus 2022 · ALKIS, LGLN · Naturschutzgebiete, NLWKN",
        maxZoom: 19,
      }).addTo(map);
      const zones = L.geoJSON(futureAreas as never, {
        style: () => ({ color: "#14532d", weight: 2, fillColor: "#22c55e", fillOpacity: 0.48 }),
        onEachFeature: (feature, layer) => {
          const p = feature.properties as { name: string; livingSpacePerResident: number; vacancyRate: number; buildingCoverage: number };
          const label = lang === "en"
            ? `<b>${p.name}</b><br>${p.livingSpacePerResident} m² per resident · ${p.vacancyRate}% vacancy<br>${p.buildingCoverage}% building coverage<br>NSG areas removed; zoning still to check`
            : `<b>${p.name}</b><br>${p.livingSpacePerResident} m² je Einwohner · ${p.vacancyRate}% Leerstand<br>${p.buildingCoverage}% Gebäudegrundfläche<br>NSG-Flächen abgezogen; Bauleitplanung noch prüfen`;
          layer.bindTooltip(label, { sticky: true });
        },
      }).addTo(map);
      if (zones.getLayers().length) map.fitBounds(zones.getBounds(), { padding: [18, 18] });
    });
    return () => { cancelled = true; map?.remove(); };
  }, [lang]);

  return <div ref={el} className="h-[420px] w-full rounded-md" aria-label={lang === "en" ? "Future development screening map" : "Karte zur Prüfung möglicher Entwicklungsflächen"} />;
}
