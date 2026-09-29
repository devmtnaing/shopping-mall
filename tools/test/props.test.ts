import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { MallMeta } from '@shopping-mall/shared/meta';
import { describe, expect, it } from 'vitest';
import { PROPS } from '../greybox/props';

const ASSETS = resolve(import.meta.dirname, '../../client/public/assets');
const glb = readFileSync(`${ASSETS}/props/props.glb`);
const json = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString()) as {
  nodes: { name?: string }[];
  scenes: { nodes: number[] }[];
};
const meta: MallMeta = JSON.parse(readFileSync(`${ASSETS}/mall/mall.meta.json`, 'utf8'));

describe('props', () => {
  it('props.glb has one top-level node per kind', () => {
    const top = json.scenes[0]?.nodes.map((i) => json.nodes[i]?.name).sort();
    expect(top).toEqual(Object.keys(PROPS).sort());
  });

  it('the greybox only places kinds the pack has', () => {
    const placed = new Set((meta.props ?? []).map((p) => p.kind));
    expect(placed.size).toBeGreaterThan(5);
    for (const k of placed) expect(PROPS).toHaveProperty(k);
  });

  it('stays within its 300 KB budget', () => {
    expect(glb.byteLength).toBeLessThan(300 * 1024);
  });
});
