// Pure helpers for the "other municipality" page (Lower Saxony only).
// Shared by the server function and tests; no browser or Node APIs.

export type Ring = [number, number][]; // [lon, lat]
export type Poly = Ring[]; // outer ring first, then holes
export type BBox = [number, number, number, number]; // w, s, e, n

export type Block = {
  w: number; s: number; e: number; n: number;
  insidePct: number; // share of the block inside the municipality
  builtPct: number; // building footprint / block land inside municipality
  nsgPct: number;
  lsgPct: number;
  buildings: number;
};

export type MunicipalityResult = {
  name: string;
  ags: string;
  areaHa: number;
  buildings: number;
  footprintHa: number;
  builtPct: number;
  nsgHa: number;
  lsgHa: number;
  freeHa: number; // neither built nor protected
  truncated: boolean;
  boundary: Poly[];
  nsg: Poly[];
  lsg: Poly[];
  blocks: Block[];
};

export const BLOCK_M = 500;
export const SAMPLE_M = 100;

const M_PER_DEG_LAT = 111_320;
export const mPerDegLon = (lat: number) => M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);

export function geojsonToPolys(g: { type: string; coordinates: unknown } | null | undefined): Poly[] {
  if (!g) return [];
  if (g.type === "Polygon") return [g.coordinates as Poly];
  if (g.type === "MultiPolygon") return g.coordinates as Poly[];
  return [];
}

export function polyBBox(polys: Poly[]): BBox {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const p of polys) for (const [x, y] of p[0] ?? []) {
    if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y;
  }
  return [w, s, e, n];
}

function inRing(x: number, y: number, r: Ring) {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function inPoly(x: number, y: number, p: Poly) {
  if (!p[0] || !inRing(x, y, p[0])) return false;
  for (let k = 1; k < p.length; k++) if (inRing(x, y, p[k])) return false;
  return true;
}

/** Point-in-any-polygon with a per-polygon bbox prefilter. */
export function makeTester(polys: Poly[]) {
  const items = polys.map((p) => ({ p, b: polyBBox([p]) }));
  return (x: number, y: number) => items.some(({ p, b }) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3] && inPoly(x, y, p));
}

/** Planar area in m² of a lon/lat ring (local equirectangular approximation). */
export function ringAreaM2(r: Ring) {
  if (r.length < 3) return 0;
  const lat0 = r[0][1];
  const kx = mPerDegLon(lat0), ky = M_PER_DEG_LAT;
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] * kx) * (r[i][1] * ky) - (r[i][0] * kx) * (r[j][1] * ky);
  return Math.abs(a) / 2;
}

export function polyAreaM2(p: Poly) {
  return Math.max(0, ringAreaM2(p[0]) - p.slice(1).reduce((s, h) => s + ringAreaM2(h), 0));
}

export function centroid(r: Ring): [number, number] {
  let x = 0, y = 0;
  for (const [a, b] of r) { x += a; y += b; }
  return [x / r.length, y / r.length];
}

/** Parse ALKIS-vereinfacht GML (srsName EPSG:4326, lat lon order) into building rings + municipality key. */
export function parseAlkisGml(xml: string): { ring: Ring; ags: string }[] {
  const out: { ring: Ring; ags: string }[] = [];
  const members = xml.split("<wfs:member>");
  for (let i = 1; i < members.length; i++) {
    const m = members[i];
    const pos = /<gml:posList>([^<]+)<\/gml:posList>/.exec(m);
    if (!pos) continue;
    const nums = pos[1].trim().split(/\s+/).map(Number);
    const ring: Ring = [];
    for (let k = 0; k + 1 < nums.length; k += 2) ring.push([nums[k + 1], nums[k]]);
    const ags = /<gmdschl>([^<]+)<\/gmdschl>/.exec(m)?.[1] ?? "";
    out.push({ ring, ags });
  }
  return out;
}

/** Thin long rings so the payload stays small; keeps first/last point. */
export function simplify(polys: Poly[], maxPts = 150): Poly[] {
  return polys.map((p) => p.map((r) => {
    if (r.length <= maxPts) return r;
    const step = Math.ceil(r.length / maxPts);
    const t = r.filter((_, i) => i % step === 0);
    t.push(r[r.length - 1]);
    return t;
  }));
}

export type Building = { c: [number, number]; m2: number };

/**
 * Combine boundary, buildings and protected areas on a common 500 m block grid.
 * Areas for land, NSG and LSG come from 100 m point sampling.
 */
export function analyse(input: {
  name: string; ags: string; boundary: Poly[]; nsg: Poly[]; lsg: Poly[];
  buildings: Building[]; truncated: boolean;
}): MunicipalityResult {
  const { boundary, nsg, lsg, buildings } = input;
  const [w, s, e, n] = polyBBox(boundary);
  const lat0 = (s + n) / 2;
  const dLon = SAMPLE_M / mPerDegLon(lat0), dLat = SAMPLE_M / M_PER_DEG_LAT;
  const bLon = BLOCK_M / mPerDegLon(lat0), bLat = BLOCK_M / M_PER_DEG_LAT;
  const nx = Math.ceil((e - w) / bLon), ny = Math.ceil((n - s) / bLat);
  const inB = makeTester(boundary), inN = makeTester(nsg), inL = makeTester(lsg);
  const cellHa = (SAMPLE_M * SAMPLE_M) / 10_000;
  const per = SAMPLE_M ** 0 * (BLOCK_M / SAMPLE_M) ** 2;

  type Acc = { land: number; nsg: number; lsg: number; prot: number; built: number; count: number };
  const acc = new Map<number, Acc>();
  const get = (k: number) => { let a = acc.get(k); if (!a) { a = { land: 0, nsg: 0, lsg: 0, prot: 0, built: 0, count: 0 }; acc.set(k, a); } return a; };
  const key = (x: number, y: number) => {
    const i = Math.floor((x - w) / bLon), j = Math.floor((y - s) / bLat);
    return i < 0 || j < 0 || i >= nx || j >= ny ? -1 : j * nx + i;
  };

  let landHa = 0, nsgHa = 0, lsgHa = 0, protHa = 0;
  for (let y = s + dLat / 2; y < n; y += dLat) for (let x = w + dLon / 2; x < e; x += dLon) {
    if (!inB(x, y)) continue;
    const a = get(key(x, y));
    const isN = inN(x, y), isL = inL(x, y);
    a.land++; landHa += cellHa;
    if (isN) { a.nsg++; nsgHa += cellHa; }
    if (isL) { a.lsg++; lsgHa += cellHa; }
    if (isN || isL) { a.prot++; protHa += cellHa; }
  }

  let footprint = 0;
  for (const b of buildings) {
    footprint += b.m2;
    const k = key(b.c[0], b.c[1]);
    if (k < 0) continue;
    const a = get(k); a.built += b.m2; a.count++;
  }

  const blocks: Block[] = [];
  for (const [k, a] of acc) {
    if (k < 0 || a.land === 0) continue;
    const i = k % nx, j = Math.floor(k / nx);
    const landM2 = a.land * SAMPLE_M * SAMPLE_M;
    blocks.push({
      w: w + i * bLon, s: s + j * bLat, e: w + (i + 1) * bLon, n: s + (j + 1) * bLat,
      insidePct: (a.land / per) * 100,
      builtPct: Math.min(100, (a.built / landM2) * 100),
      nsgPct: (a.nsg / a.land) * 100,
      lsgPct: (a.lsg / a.land) * 100,
      buildings: a.count,
    });
  }

  const footprintHa = footprint / 10_000;
  return {
    name: input.name, ags: input.ags,
    areaHa: landHa, buildings: buildings.length, footprintHa,
    builtPct: landHa ? (footprintHa / landHa) * 100 : 0,
    nsgHa, lsgHa,
    freeHa: Math.max(0, landHa - protHa - footprintHa),
    truncated: input.truncated,
    boundary: simplify(boundary, 400), nsg: simplify(nsg), lsg: simplify(lsg),
    blocks,
  };
}
