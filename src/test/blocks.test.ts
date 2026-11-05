import { describe, expect, it } from "vitest";

import gitter from "@/data/gitter.json";
import { blockOf, blockOwn, blocks, type Block, type Cell } from "@/lib/radar";

const cells = gitter as unknown as Cell[];

// The app re-derives the block of a cell from its coordinates, so the tile formula in
// radar.ts must match the one in scripts/prepare_blocks.py.
describe("500 m blocks", () => {
  it("gives every grid cell a block in the same district", () => {
    for (const c of cells) {
      const b = blockOf(c);
      expect(b, `cell ${c[0]},${c[1]} has no block`).not.toBeNull();
      expect(b![10]).toBe(c[9]);
    }
  });

  it("keeps the resident total identical to the 100 m grid", () => {
    const grid = cells.reduce((s, c) => s + (c[2] ?? 0), 0);
    const sum = blocks.reduce((s, b) => s + b[1], 0);
    expect(sum).toBe(grid);
    expect(sum).toBe(72972);
  });

  it("pools the 1897 cells into 245 blocks", () => {
    expect(cells.length).toBe(1897);
    expect(blocks.length).toBe(245);
  });

  it("keeps a block's vacancy inside the range of its own cells", () => {
    const byKey = new Map<string, Cell[]>();
    for (const c of cells) {
      const b = blockOf(c);
      if (!b) continue;
      const list = byKey.get(b[0]);
      if (list) list.push(c);
      else byKey.set(b[0], [c]);
    }
    for (const b of blocks as Block[]) {
      const v = blockOwn(b, "leerstandsquote");
      if (v == null) continue;
      const vals = (byKey.get(b[0]) ?? []).map((c) => c[4]).filter((x): x is number => x != null);
      expect(vals.length).toBeGreaterThan(0);
      expect(v).toBeGreaterThanOrEqual(Math.min(...vals) - 0.01);
      expect(v).toBeLessThanOrEqual(Math.max(...vals) + 0.01);
    }
  });
});
