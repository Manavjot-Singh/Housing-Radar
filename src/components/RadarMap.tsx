import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type * as L from "leaflet";
import gitter from "@/data/gitter.json";
import versorgung from "@/data/versorgung.json";
import { t } from "@/lib/i18n";
import {
  cellOwn, cellValue, districtByName, geo, indicators, meets, scaleClass, value,
  type Cell, type Condition, type District,
} from "@/lib/radar";

export type AmenityKey = "shop" | "doc" | "pt";

type Props = {
  lang: "de" | "en";
  conditions: Condition[];
  showGrid: boolean;
  amenities: Record<AmenityKey, boolean>;
  selected: string | null;
  onSelect: (name: string) => void;
};

const cells = gitter as unknown as Cell[];
const points = versorgung as Record<AmenityKey, [number, number][]>;

function cssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
function color(c: number) {
  return c === 0 ? cssVar("--nodata") : cssVar(`--scale-${c}`);
}

/** Dot colours for amenity markers, shared with the legend. */
export const AMENITY_COLOR: Record<AmenityKey, () => string> = {
  shop: () => cssVar("--scale-3"),
  doc: () => cssVar("--foreground"),
  pt: () => cssVar("--card"),
};

export function RadarMap({ lang, conditions, showGrid, amenities, selected, onSelect }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const libRef = useRef<typeof L | null>(null);
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

    if (detail) {
      const grp = Lf.layerGroup();
      const renderer = Lf.canvas();
      const dLat = 0.00045, dLon = 0.00075;
      for (const c of cells) {
        let fill: string;
        let opacity = 0.85;
        let marks: (boolean | null)[] = [];
        if (combo) {
          if (!c[2]) continue;
          const res = conditions.map((k) => meets(cellValue(c, k.ind), k));
          marks = res;
          const hit = res.filter((r) => r === true).length;
          if (hit === conditions.length) fill = color(5);
          else if (hit === conditions.length - 1) { fill = color(2); opacity = 0.6; }
          else continue;
        } else {
          fill = color(scaleClass(cellOwn(c, single!), single!));
        }
        const rows = (combo ? conditions.map((k) => k.ind) : [single!]).map((k, idx) => {
          const own = cellOwn(c, k);
          const v = combo ? cellValue(c, k) : own;
          const u = indicators[k].unit;
          const m = combo ? (marks[idx] ? "✔ " : marks[idx] === false ? "✘ " : "? ") : "";
          return `${m}${label(k)}: ${v != null ? f1(v) + (u ? " " + u : "") : tx.noData}${combo && own == null && v != null ? ` <i>(${tx.districtValue})</i>` : ""}`;
        });
        Lf.rectangle([[c[1] - dLat, c[0] - dLon], [c[1] + dLat, c[0] + dLon]], {
          stroke: false, fillColor: fill, fillOpacity: opacity, renderer,
        })
          .bindTooltip(`<b>${tx.cell} · ${c[9]}</b><br>${tx.cellRes}: ${c[2] ?? "–"}<br>${rows.join("<br>")}`, { sticky: true })
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

    const icon: Record<AmenityKey, string> = { shop: "S", doc: "A", pt: "H" };
    const iconEn: Record<AmenityKey, string> = { shop: "S", doc: "D", pt: "T" };
    const pg = Lf.layerGroup();
    (Object.keys(amenities) as AmenityKey[]).forEach((k) => {
      if (!amenities[k]) return;
      for (const [lon, lat] of points[k]) {
        Lf.circleMarker([lat, lon], {
          radius: k === "pt" ? 3 : 5, color: fg, weight: 1, fillColor: AMENITY_COLOR[k](), fillOpacity: 1,
        }).bindTooltip(`${(lang === "en" ? iconEn : icon)[k]} · ${tx.amenity[k]}`).addTo(pg);
      }
    });
    pg.addTo(map);
    layers.current.push(pg);
  }

  return <div ref={el} className="h-full w-full" aria-label={lang === "en" ? "Map of Lüneburg districts" : "Karte der Lüneburger Stadtteile"} />;
}
