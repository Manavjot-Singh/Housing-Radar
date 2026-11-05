import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import { districtName } from "@/lib/citySearch";

export function CityMap({ outline, districts, lang }: { outline: GeoJSON.Geometry | null; districts: GeoJSON.FeatureCollection | null; lang: "de" | "en" }) {
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let map: import("leaflet").Map | undefined;
    let cancelled = false;
    import("leaflet").then((mod) => {
      if (cancelled || !el.current) return;
      const L = (mod.default ?? mod) as typeof import("leaflet");
      const css = getComputedStyle(document.documentElement);
      const primary = css.getPropertyValue("--primary").trim() || "currentColor";
      map = L.map(el.current).setView([51.2, 10.4], 6);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap-Mitwirkende · Zensus 2022", maxZoom: 19 }).addTo(map);
      let bounds: import("leaflet").LatLngBounds | null = null;
      if (outline) {
        const o = L.geoJSON(outline as never, { style: { color: primary, weight: 3, fill: false } }).addTo(map);
        bounds = o.getBounds();
      }
      if (districts) {
        const d = L.geoJSON(districts as never, {
          style: { color: primary, weight: 1.5, fillColor: primary, fillOpacity: 0.12 },
          onEachFeature: (f, layer) => {
            const name = districtName(f);
            layer.bindTooltip(name, { sticky: true });
            layer.on("mouseover", () => (layer as import("leaflet").Path).setStyle({ fillOpacity: 0.35 }));
            layer.on("mouseout", () => (layer as import("leaflet").Path).setStyle({ fillOpacity: 0.12 }));
          },
        }).addTo(map);
        bounds = bounds ?? d.getBounds();
      }
      if (bounds?.isValid()) map.fitBounds(bounds, { padding: [16, 16] });
    });
    return () => { cancelled = true; map?.remove(); };
  }, [outline, districts]);

  return <div ref={el} className="h-[480px] w-full" aria-label={lang === "en" ? "Map of the selected city" : "Karte der gewählten Stadt"} />;
}
