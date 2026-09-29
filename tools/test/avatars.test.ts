import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { AVATARS, CLIPS } from '@shopping-mall/shared/avatars';
import { describe, expect, it } from 'vitest';

const DIR = resolve(import.meta.dirname, '../../client/public/assets/avatars');
const glb = readFileSync(`${DIR}/avatars.glb`);
const json = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString()) as {
  nodes: { name?: string; mesh?: number; skin?: number }[];
  animations: { name: string }[];
  images: unknown[];
  materials: unknown[];
};

// avatars.glb is built by `pnpm assets`; these catch a stale or broken build being committed
describe('avatars.glb', () => {
  it('has every avatar the picker offers, each one skinned mesh', () => {
    const names = json.nodes.map((n) => n.name);
    for (const id of AVATARS) {
      expect(names).toContain(id);
      expect(
        json.nodes.filter((n) => n.name === `${id}-mesh` && n.mesh !== undefined && n.skin !== undefined),
      ).toHaveLength(1);
    }
    for (const id of AVATARS) statSync(`${DIR}/${id}.png`); // and a preview
  });

  it('ships each clip once, shared by everyone', () => {
    expect(json.animations.map((a) => a.name).sort()).toEqual([...CLIPS].sort());
  });

  it('shares one texture and material, and stays within its 250 KB budget', () => {
    expect(json.images).toHaveLength(1);
    expect(json.materials).toHaveLength(1);
    expect(glb.byteLength).toBeLessThan(250 * 1024);
  });
});
