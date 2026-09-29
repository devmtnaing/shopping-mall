import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { MallMeta } from '@shopping-mall/shared/meta';
import { describe, expect, it } from 'vitest';
import { PACKS, PROPS } from '../greybox/props';

const ASSETS = resolve(import.meta.dirname, '../../client/public/assets');
const { packs: index, footprints } = JSON.parse(readFileSync(`${ASSETS}/props/index.json`, 'utf8')) as {
  packs: Record<string, string[]>;
  footprints: Record<string, unknown>;
};
const meta: MallMeta = JSON.parse(readFileSync(`${ASSETS}/mall/mall.meta.json`, 'utf8'));

function topNodes(pack: string): string[] {
  const glb = readFileSync(`${ASSETS}/props/${pack}.glb`);
  const json = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString()) as {
    nodes: { name?: string }[];
    scenes: { nodes: number[] }[];
  };
  return (json.scenes[0]?.nodes ?? []).map((i) => json.nodes[i]?.name ?? '');
}

describe('props', () => {
  it('the index lists every kind once, in the pack its spec names', () => {
    expect(Object.values(index).flat().sort()).toEqual(Object.keys(PROPS).sort());
    for (const [pack, kinds] of Object.entries(index)) {
      expect(PACKS).toContain(pack);
      for (const k of kinds) expect(PROPS[k]?.pack).toBe(pack);
    }
  });

  it("the index carries every kind's collision box", () => {
    for (const [k, p] of Object.entries(PROPS)) expect(footprints[k]).toEqual(p.footprint);
  });

  it('each pack has one top-level node per kind in it, and nothing else ships', () => {
    for (const [pack, kinds] of Object.entries(index))
      expect(topNodes(pack).sort()).toEqual([...kinds].sort());
    const files = readdirSync(`${ASSETS}/props`).sort();
    expect(files).toEqual([...Object.keys(index).map((p) => `${p}.glb`), 'index.json'].sort());
  });

  it('the greybox only places kinds the packs have', () => {
    const placed = new Set((meta.props ?? []).map((p) => p.kind));
    expect(placed.size).toBeGreaterThan(5);
    for (const k of placed) expect(PROPS).toHaveProperty(k);
  });
});
