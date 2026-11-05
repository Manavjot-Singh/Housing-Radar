import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import { evaluate, futureBlocks, type Check, type ExclKey, type Thresholds } from "@/lib/future";

const EXCL_LABEL: Record<ExclKey, { de: string; en: string }> = {
  nsg: { de: "Naturschutzgebiet", en: "Nature reserve" },
  lsg: { de: "Landschaftsschutzgebiet", en: "Landscape protection area" },
  flood: { de: "Überschwemmungsgebiet", en: "Flood zone" },
  forest: { de: "Wald", en: "Forest" },
  cemetery: { de: "Friedhof", en: "Cemetery" },
  allot: { de: "Kleingärten", en: "Allotments" },
  parking: { de: "Parkplätze", en: "Car parks" },
  green: { de: "Parks/Sport", en: "Parks/sports" },
};

function num(x: number | null, en: boolean) {
  return x == null ? "–" : x.toLocaleString(en ? "en-GB" : "de-DE", { maximumFractionDigits: 1 });
}

function line(c: Check, label: string, unit: string, cond: string, en: boolean) {
  const mark = c.ok == null ? "?" : c.ok ? "✔" : "✘";
  const note = c.fromDistrict ? (en ? " (district value)" : " (Stadtteilwert)") : "";
  return `${mark} ${label}: ${num(c.value, en)} ${unit} <span style="opacity:.7">(${cond})</span>${note}`;
}

export function FutureDevelopmentMap({ lang, t, focus }: { lang: "de" | "en"; t: Thresholds; focus: Set<string> }) {
  const el = useRef<HTMLDivElement>(null);
  const layerRef = useRef<import("leaflet").GeoJSON | null>(null);
  const tRef = useRef(t);
  tRef.current = t;
  const fRef = useRef(focus);
  fRef.current = focus;
  const en = lang === "en";

  const restyle = () => {
    const layer = layerRef.current;
    if (!layer) return;
    const th = tRef.current;
    layer.eachLayer((l) => {
      const b = (l as import("leaflet").Layer & { feature: GeoJSON.Feature }).feature.properties as { idx: number };
      const blk = futureBlocks[b.idx];
      if (!blk) return;
      const e = evaluate(blk, th);
      const inFocus = fRef.current instanceof Set && fRef.current.has(blk.id);
      const path = l as import("leaflet").Path;
      path.setStyle(e.pass
        ? inFocus
          ? { color: "#b91c1c", weight: 3, fillColor: "#16a34a", fillOpacity: 0.75 }
          : { color: "#14532d", weight: 1.5, fillColor: "#22c55e", fillOpacity: 0.4 }
        : inFocus
          ? { color: "#b91c1c", weight: 2.5, fillColor: "#fca5a5", fillOpacity: 0.35 }
          : { color: "#64748b", weight: 0.5, fillColor: "#94a3b8", fillOpacity: 0.08 });
      if (inFocus) path.bringToFront();
      const excl = Object.entries(blk.excl).map(([k, v]) => `${EXCL_LABEL[k as ExclKey][lang]} ${v} %`).join(", ");
      const html = [
        `<b>${blk.d}</b> · ${e.pass ? (en ? "matches all conditions" : "erfüllt alle Bedingungen") : (en ? "does not match" : "erfüllt nicht alle")}`,
        line(e.living, en ? "Living space" : "Wohnfläche", en ? "m²/resident" : "m²/Einw.", `< ${th.living}`, en),
        line(e.vacancy, en ? "Vacancy" : "Leerstand", "%", `≤ ${th.vacancy}`, en),
        line(e.coverage, en ? "Building coverage" : "Bebauung", "%", `≤ ${th.coverage}`, en),
        `${en ? "Remaining area" : "Verbleibende Fläche"}: ${num(blk.freeHa, en)} ha`,
        `${en ? "Land-use plan (FNP) housing/mixed land" : "Im Flächennutzungsplan Wohn-/Mischbaufläche"}: ${num(blk.fnpHa, en)} ha${blk.resHa ? ` · ${en ? "still unbuilt" : "davon noch unbebaut"}: ${num(blk.resHa, en)} ha` : ""}`,
        blk.farmPct ? `${en ? "Farmland share" : "Anteil Acker"}: ${blk.farmPct} %` : "",
        excl ? `${en ? "Excluded" : "Abgezogen"}: ${excl}` : "",
      ].filter(Boolean).join("<br>");
      l.unbindTooltip().bindTooltip(html, { sticky: true });
    });
  };

  useEffect(() => {
    let map: import("leaflet").Map | undefined;
    let cancelled = false;
    import("leaflet").then((mod) => {
      if (cancelled || !el.current) return;
      const L = (mod.default ?? mod) as typeof import("leaflet");
      map = L.map(el.current, { zoomControl: true, renderer: L.svg() }).setView([53.245, 10.41], 12);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap-Mitwirkende · Zensus 2022 · NLWKN",
        maxZoom: 19,
      }).addTo(map);
      const fc = {
        type: "FeatureCollection",
        features: futureBlocks.flatMap((b, idx) => (b.g ? [{ type: "Feature", geometry: b.g, properties: { idx } }] : [])),
      };
      layerRef.current = L.geoJSON(fc as never).addTo(map);
      const rfc = { type: "FeatureCollection", features: futureBlocks.flatMap((b) => (b.rg ? [{ type: "Feature", geometry: b.rg, properties: {} }] : [])) };
      L.geoJSON(rfc as never, { interactive: false, style: { color: "#1d4ed8", weight: 1.5, dashArray: "4 3", fillColor: "#3b82f6", fillOpacity: 0.45 } }).addTo(map);
      const bb = layerRef.current.getBounds();
      map.fitBounds(bb, { padding: [10, 10] });
      restyle();
    });
    return () => { cancelled = true; map?.remove(); layerRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(restyle, [t, lang, focus]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={el} className="h-[460px] w-full rounded-md" aria-label={en ? "Future development screening map" : "Karte zur Prüfung möglicher Entwicklungsflächen"} />;
}
