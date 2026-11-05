// The town the dashboard currently shows. Lüneburg is the default; a town built on the
// "Andere Gemeinde" page replaces it and is kept in IndexedDB so a reload keeps it.
import { useSyncExternalStore } from "react";
import { loadCity } from "./radar";
import { setFutureBlocks } from "./future";
import type { CityData } from "./cityBuild";

export type { CityData };

let current: CityData | null = null;
let version = 0;
const listeners = new Set<() => void>();

export function currentCity() { return current; }

export function applyCity(c: CityData | null, persist = true) {
  current = c;
  loadCity(c);
  setFutureBlocks(c ? c.zukunft : null);
  version++;
  listeners.forEach((l) => l());
  if (persist) void save(c);
}

/** Re-renders when the town changes; returns a key that changes with it. */
export function useCityKey(): string {
  const v = useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => version, () => 0);
  return `${current?.id ?? "lueneburg"}-${v}`;
}

// ---- tiny IndexedDB store (the data is too large for localStorage)
const DB = "housing-radar", STORE = "city", KEY = "current";
function db(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function save(c: CityData | null) {
  try {
    const d = await db();
    const tx = d.transaction(STORE, "readwrite");
    if (c) tx.objectStore(STORE).put(c, KEY); else tx.objectStore(STORE).delete(KEY);
  } catch { /* storage unavailable: the town just won't survive a reload */ }
}
let restored = false;
/** Call once in the browser after hydration. */
export async function restoreCity() {
  if (restored || typeof indexedDB === "undefined") return;
  restored = true;
  try {
    const d = await db();
    const c = await new Promise<CityData | undefined>((res) => {
      const r = d.transaction(STORE).objectStore(STORE).get(KEY);
      r.onsuccess = () => res(r.result as CityData | undefined);
      r.onerror = () => res(undefined);
    });
    if (c) applyCity(c, false);
  } catch { /* ignore */ }
}
