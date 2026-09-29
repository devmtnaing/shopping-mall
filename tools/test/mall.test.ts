import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const DIR = resolve(import.meta.dirname, '../../client/public/assets/mall');
type Gltf = {
  meshes: { primitives: { attributes: Record<string, number>; material?: number }[] }[];
  materials: {
    name: string;
    extras?: { lightmap?: number };
    occlusionTexture?: { index: number; texCoord?: number };
  }[];
  accessors: { min?: number[]; max?: number[] }[];
};
const json = (file: string): Gltf => {
  const glb = readFileSync(`${DIR}/${file}`);
  return JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString());
};
const bounds = (g: Gltf) => {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const m of g.meshes)
    for (const p of m.primitives) {
      const a = g.accessors[p.attributes.POSITION as number];
      for (let i = 0; i < 3; i++) {
        min[i] = Math.min(min[i] as number, a?.min?.[i] ?? Infinity);
        max[i] = Math.max(max[i] as number, a?.max?.[i] ?? -Infinity);
      }
    }
  return { min, max };
};

// the baked mall (pnpm mall, issue #2)
describe('mall.glb', () => {
  const mall = json('mall.glb');

  it('follows the lightmap convention: occlusionTexture on UV1 plus extras.lightmap', () => {
    const lit = mall.materials.filter((m) => m.extras?.lightmap);
    expect(lit.map((m) => m.name.split('.')[0]).sort()).toEqual(
      expect.arrayContaining(['ceiling', 'floor', 'shopfloor', 'wall']),
    );
    for (const m of lit) expect(m.occlusionTexture?.texCoord).toBe(1);
    const litIndex = new Set(lit.map((m) => mall.materials.indexOf(m)));
    for (const mesh of mall.meshes)
      for (const p of mesh.primitives)
        if (litIndex.has(p.material ?? -1)) expect(p.attributes).toHaveProperty('TEXCOORD_1');
  });

  it('lines up with the greybox collision it was dressed from', () => {
    const a = bounds(mall);
    const b = bounds(json('greybox.collision.glb'));
    for (let i = 0; i < 3; i++) {
      expect(a.min[i]).toBeCloseTo(b.min[i] as number, 0);
      expect(a.max[i]).toBeCloseTo(b.max[i] as number, 0);
    }
  });
});
