import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type * as L from "leaflet";
import gitter from "@/data/gitter.json";
import { t } from "@/lib/i18n";
import { districtByName, geo, indicators, scaleClass, value, type District, type Indicator } from "@/lib/radar";

type Props = {
  lang: "de" | "en";
  indicator: Indicator;
  showGrid: boolean;
  selected: string | null;
  onSelect: (name: string) => void;
};

type Cell = [number, number, number | null, number | null, number | null, string];

function cssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
function color(c: number) {
  return c === 0 ? cssVar("--nodata") : cssVar(`--scale-${c}`);
}

export function RadarMap({ lang, indicator, showGrid, selected, onSelect }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const libRef = useRef<typeof L | null>(null);
  const districtLayer = useRef<L.GeoJSON | null>(null);
  const gridLayer = useRef<L.LayerGroup | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((mod) => {
      if (cancelled || !el.current || mapRef.current) return;
      const Lf = (mod.default ?? mod) as typeof L;
      libRef.current = Lf;
      const map = Lf.map(el.current, { zoomControl: true, attributionControl: true }).setView([53.245, 10.41], 13);
      Lf.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap-Mitwirkende · Daten: Zensus 2022, Destatis",
        maxZoom: 19,
        opacity: 0.45,
      }).addTo(map);
      mapRef.current = map;
      map.on("zoomend", () => render());
      render();
      map.fitBounds(districtLayer.current!.getBounds(), { padding: [10, 10] });
    });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    render();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicator, showGrid, selected, lang]);

  function render() {
    const Lf = libRef.current;
    const map = mapRef.current;
    if (!Lf || !map) return;
    districtLayer.current?.remove();
    gridLayer.current?.remove();
    const fg = cssVar("--foreground");
    const primary = cssVar("--primary");

    const tx = t[lang];
    const f1 = (x: number) => x.toLocaleString(lang === "en" ? "en-GB" : "de-DE", { maximumFractionDigits: 1 });
    const detail = (showGrid || map.getZoom() >= 15) && indicators[indicator].gridSource;
    if (detail) {
      const grp = Lf.layerGroup();
      const renderer = Lf.canvas();
      for (const c of gitter as Cell[]) {
        const v = indicator === "wohnflaecheProKopf" ? c[3] : indicator === "leerstandsquote" ? c[4] : null;
        const dLat = 0.00045, dLon = 0.00075;
        Lf.rectangle([[c[1] - dLat, c[0] - dLon], [c[1] + dLat, c[0] + dLon]], {
          stroke: false, fillColor: color(scaleClass(v, indicator)), fillOpacity: 0.85, renderer,
        })
          .bindTooltip(
            `<b>${tx.cell} · ${c[5]}</b><br>${tx.cellRes}: ${c[2] ?? "–"}<br>${tx.cellLiving}: ${c[3] != null ? f1(c[3]) + " m²" : "–"}<br>${tx.cellVac}: ${c[4] != null ? f1(c[4]) + " %" : tx.noData}`,
            { sticky: true },
          )
          .on("click", () => onSelectRef.current(c[5]))
          .addTo(grp);
      }
      grp.addTo(map);
      gridLayer.current = grp;
    }

    districtLayer.current = Lf.geoJSON(geo, {
      style: (f) => {
        const p = f!.properties as District;
        const d = districtByName.get(p.name) ?? p;
        const isSel = p.name === selected;
        return {
          color: isSel ? primary : fg,
          weight: isSel ? 3.5 : 1,
          opacity: isSel ? 1 : 0.6,
          fillColor: color(scaleClass(value(d, indicator), indicator)),
          fillOpacity: detail ? 0 : 0.8,
        };
      },
      onEachFeature: (f, layer) => {
        const p = f.properties as District;
        if (!detail) layer.bindTooltip(p.name, { sticky: true });
        layer.on("click", () => onSelectRef.current(p.name));
      },
    }).addTo(map);
    if (detail) districtLayer.current.bringToBack();
  }

  return <div ref={el} className="h-full w-full" aria-label="Karte der Lüneburger Stadtteile" />;
}
