// Asset budgets (docs/art-direction.md § Asset budgets): every file the client downloads under
// client/public/assets must match a budget, so a heavy asset can't slip in unnoticed.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../../client/public/assets');
const KB = 1024;

/** First matching pattern wins. Triangles are checked for .glb files when given. */
const BUDGETS: { match: RegExp; bytes: number; tris?: number; what: string }[] = [
  { match: /^mall\/.*\.collision\.glb$/, bytes: 1500 * KB, tris: 50_000, what: 'collision mesh' },
  { match: /^mall\/.*\.glb$/, bytes: 1500 * KB, tris: 80_000, what: 'mall (one world chunk)' },
  { match: /^mall\/navgrid\.bin$/, bytes: 60 * KB, what: 'navgrid' },
  { match: /^mall\/mall\.meta\.json$/, bytes: 100 * KB, what: 'mall meta' },
  { match: /^avatars\/avatars\.glb$/, bytes: 250 * KB, tris: 15_000, what: 'avatar pack' },
  { match: /^avatars\/.*\.png$/, bytes: 8 * KB, what: 'avatar preview' },
  // each area's pack loads when you get near it, so a new batch of props adds a pack rather than weight up front
  { match: /^props\/[a-z-]+\.glb$/, bytes: 200 * KB, tris: 20_000, what: 'props pack (one area)' },
  { match: /^props\/index\.json$/, bytes: 2 * KB, what: 'props index' },
  { match: /^audio\/.*\.mp3$/, bytes: 170 * KB, what: 'audio loop' },
];

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)],
  );
}

/** Triangle count from the glTF JSON (indexed or not; meshopt keeps accessor counts in the JSON). */
function triangles(path: string): number {
  const glb = readFileSync(path);
  const json = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString()) as {
    meshes?: { primitives: { indices?: number; attributes: { POSITION: number }; mode?: number }[] }[];
    accessors: { count: number }[];
  };
  let n = 0;
  for (const m of json.meshes ?? [])
    for (const p of m.primitives) {
      if ((p.mode ?? 4) !== 4) continue;
      n += (json.accessors[p.indices ?? p.attributes.POSITION]?.count ?? 0) / 3;
    }
  return n;
}

describe('asset budgets', () => {
  const rows = files(ROOT).map((path) => {
    const name = relative(ROOT, path);
    const budget = BUDGETS.find((b) => b.match.test(name));
    const bytes = statSync(path).size;
    const tris = name.endsWith('.glb') ? triangles(path) : undefined;
    return { name, budget, bytes, tris };
  });

  it('every asset has a budget, and stays within it', () => {
    const over = rows.filter(
      (r) => !r.budget || r.bytes > r.budget.bytes || (r.budget.tris && (r.tris ?? 0) > r.budget.tris),
    );
    if (over.length) {
      console.table(
        over.map((r) => ({
          file: r.name,
          budget: r.budget?.what ?? 'NO BUDGET',
          KB: (r.bytes / KB).toFixed(0),
          maxKB: r.budget ? r.budget.bytes / KB : '-',
          tris: r.tris ?? '-',
          maxTris: r.budget?.tris ?? '-',
        })),
      );
    }
    expect(over.map((r) => r.name)).toEqual([]);
  });

  it('all audio together stays within 250 KB (T-506)', () => {
    const audio = rows.filter((r) => r.name.startsWith('audio/')).reduce((n, r) => n + r.bytes, 0);
    expect(audio).toBeGreaterThan(0);
    expect(audio).toBeLessThan(250 * KB);
  });
});
