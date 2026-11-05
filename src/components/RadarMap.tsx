import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type * as L from "leaflet";
import { t } from "@/lib/i18n";
import {
  amenityPoints, gridCells, cityName, blockOf, blockOwn, commercial, blockValueOf, cellOwn, cellValue, districtByName, geo, indicators, meets, scaleClass, value,
  type Cell, type Condition, type District, type Indicator,
} from "@/lib/radar";

export type { AmenityKey } from "@/lib/radar";
import type { AmenityKey } from "@/lib/radar";

type Props = {
  lang: "de" | "en";
  conditions: Condition[];
  showGrid: boolean;
  amenities: Record<AmenityKey, boolean>;
  selected: string | null;
  onSelect: (name: string) => void;
};


function cssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
function color(c: number) {
  return c === 0 ? cssVar("--nodata") : cssVar(`--scale-${c}`);
}

/** Dot colours for amenity markers, shared with the legend. */
export const AMENITY_COLOR: Record<AmenityKey, () => string> = {
  shop: () => cssVar("--scale-3"),
  doc: () => cssVar("--poi-doc"),
  pt: () => cssVar("--card"),
  bakery: () => cssVar("--poi-bakery"),
};

export function RadarMap({ lang, conditions, showGrid, amenities, selected, onSelect }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const libRef = useRef<typeof L | null>(null);
  const [unit, setUnit] = useState<"block" | "cell" | null>(null);
  const layers = useRef<L.Layer[]>([]);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const renderRef = useRef<() => void>(() => {});
  renderRef.current = render;

  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((mod) => {
      if (cancelled || !el.current || mapRef.current) return;
      const Lf = (mod.default ?? mod) as typeof L;
      libRef.current = Lf;
      const map = Lf.map(el.current, { zoomControl: true, attributionControl: true }).setView([53.245, 10.41], 13);
      Lf.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap-Mitwirkende · Daten: Zensus 2022, Destatis; ALKIS, LGLN",
        maxZoom: 19,
        opacity: 0.45,
      }).addTo(map);
      mapRef.current = map;
      map.on("zoomend", () => renderRef.current());
      render();
      map.fitBounds(Lf.geoJSON(geo).getBounds(), { padding: [10, 10] });
    });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    renderRef.current();
  }, [conditions, showGrid, amenities, selected, lang]);

  function render() {
    const Lf = libRef.current;
    const map = mapRef.current;
    if (!Lf || !map) return;
    layers.current.forEach((l) => l.remove());
    layers.current = [];
    const fg = cssVar("--foreground");
    const primary = cssVar("--primary");
    const tx = t[lang];
    const loc = lang === "en" ? "en-GB" : "de-DE";
    const f1 = (x: number) => x.toLocaleString(loc, { maximumFractionDigits: 1 });
    const label = (k: Condition["ind"]) => (lang === "en" ? indicators[k].labelEn : indicators[k].label);

    const combo = conditions.length > 1;
    const single = conditions[0]?.ind;
    const detail = combo || (single != null && showGrid && indicators[single].gridSource);
    // A 100 m square is about 4 pixels wide in the city overview, so colours come from the
    // 500 m blocks there; from zoom 14 up the census cells themselves are big enough to colour.
    const zoomed = map.getZoom() >= 14;
    setUnit(detail ? (zoomed ? "cell" : "block") : null);

    if (detail) {
      const grp = Lf.layerGroup();
      const dLat = 0.00045, dLon = 0.00075;
      for (const c of gridCells) {
        const b = blockOf(c);
        const shown = (k: Indicator) => (zoomed ? cellValue(c, k) : b ? blockValueOf(b, k) : null);
        const own = (k: Indicator) => (zoomed ? cellOwn(c, k) : b ? blockOwn(b, k) : null);
        let fill: string;
        let opacity = 0.85;
        let marks: (boolean | null)[] = [];
        if (combo) {
          if (!c[2]) continue;
          const res = conditions.map((k) => meets(shown(k.ind), k));
          marks = res;
          const hit = res.filter((r) => r === true).length;
          if (hit === conditions.length) fill = color(5);
          else if (hit === conditions.length - 1) { fill = color(2); opacity = 0.6; }
          else continue;
        } else {
          fill = color(scaleClass(own(single!), single!));
        }
        const rows = (combo ? conditions.map((k) => k.ind) : [single!]).map((k, idx) => {
          const v = shown(k);
          const u = indicators[k].unit;
          const m = combo ? (marks[idx] ? "✔ " : marks[idx] === false ? "✘ " : "? ") : "";
          return `${m}${label(k)}: ${v != null ? f1(v) + (u ? " " + u : "") : tx.noData}${combo && own(k) == null && v != null ? ` <i>(${tx.districtValue})</i>` : ""}`;
        });
        const head = zoomed || !b
          ? `<b>${tx.cell} · ${c[9]}</b><br>${tx.cellRes}: ${c[2] ?? "–"}`
          : `<b>${tx.block} · ${c[9]}</b><br>${tx.cellRes}: ${b[1]}<br>${tx.blockCells}: ${b[8]}`;
        const coord = `${tx.coords}: ${c[1].toLocaleString(loc, { minimumFractionDigits: 5 })}° N, ${c[0].toLocaleString(loc, { minimumFractionDigits: 5 })}° E`;
        Lf.rectangle([[c[1] - dLat, c[0] - dLon], [c[1] + dLat, c[0] + dLon]], {
          stroke: false, fillColor: fill, fillOpacity: opacity,
        })
          .bindTooltip(`${head}<br>${rows.join("<br>")}<br><span style="opacity:.7">${coord}</span>`, { sticky: true })
          .on("click", () => onSelectRef.current(c[9]))
          .addTo(grp);
      }
      grp.addTo(map);
      layers.current.push(grp);
    }

    const dl = Lf.geoJSON(geo, {
      style: (f) => {
        const p = f!.properties as District;
        const d = districtByName.get(p.name) ?? p;
        const isSel = p.name === selected;
        return {
          color: isSel ? primary : fg,
          weight: isSel ? 3.5 : 1,
          opacity: isSel ? 1 : 0.6,
          fillColor: single ? color(scaleClass(value(d as District, single), single)) : "transparent",
          fillOpacity: detail ? 0 : 0.8,
        };
      },
      onEachFeature: (f, layer) => {
        const p = f.properties as District;
        if (!detail) layer.bindTooltip(p.name, { sticky: true });
        layer.on("click", () => onSelectRef.current(p.name));
      },
    }).addTo(map);
    if (detail) dl.bringToBack();
    layers.current.push(dl);

    const icon: Record<AmenityKey, string> = { shop: "S", doc: "A", pt: "H", bakery: "B" };
    const iconEn: Record<AmenityKey, string> = { shop: "S", doc: "D", pt: "T", bakery: "B" };
    const pg = Lf.layerGroup();
    (Object.keys(amenities) as AmenityKey[]).forEach((k) => {
      if (!amenities[k]) return;
      for (const [lon, lat] of amenityPoints[k] ?? []) {
        Lf.circleMarker([lat, lon], {
          radius: k === "pt" ? 3 : 5, color: fg, weight: 1, fillColor: AMENITY_COLOR[k](), fillOpacity: 1,
        }).bindTooltip(`${(lang === "en" ? iconEn : icon)[k]} · ${tx.amenity[k]}`).addTo(pg);
      }
    });
    if (conditions.some((c) => c.ind === "gewerbeLeerstand")) {
      for (const [name, lon, lat, objs, vac, risk] of commercial) {
        const n = vac + risk;
        Lf.circleMarker([lat, lon], {
          radius: n ? 5 + n * 2 : 3, color: fg, weight: 1.5, fillColor: n ? primary : cssVar("--card"), fillOpacity: n ? 0.9 : 1,
        }).bindTooltip(`<b>${name}</b><br>${tx.commercialTip(objs, vac, risk)}`).addTo(pg);
      }
    }
    pg.addTo(map);
    layers.current.push(pg);
  }

  return (
    <div className="relative h-full w-full">
      <div ref={el} className="h-full w-full" aria-label={lang === "en" ? `Map of ${cityName} districts` : `Karte der Stadtteile von ${cityName}`} />
      {unit && (
        <div className="pointer-events-none absolute right-2 top-2 z-[400] rounded-sm border bg-card/95 px-2 py-1 font-mono text-xs">
          {unit === "block" ? t[lang].showingBlock : t[lang].showingCell}
        </div>
      )}
    </div>
  );
}
