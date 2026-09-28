import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { decodeNavGrid, encodeNavGrid } from '@plaza/shared/navgrid';
import { describe, expect, it } from 'vitest';

const file = resolve(import.meta.dirname, '../../client/public/assets/mall/navgrid.bin');
const bytes = readFileSync(file);
const nav = decodeNavGrid(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
const GROUND = 0;
const UPPER = 1;
const at = (floor: number, x: number, z: number) => nav.walkable(floor, nav.index(x, z));

describe('navgrid.bin', () => {
  it('round-trips through encode/decode unchanged', () => {
    const again = decodeNavGrid(encodeNavGrid(nav).buffer as ArrayBuffer);
    expect(again.cols).toBe(nav.cols);
    expect(again.cells).toEqual(nav.cells);
    expect(again.links).toEqual(nav.links);
  });

  it('stays within its 60 KB budget', () => {
    expect(bytes.byteLength).toBeLessThan(60 * 1024);
  });

  it('marks the open concourse walkable and walls, pillars and escalators blocked', () => {
    expect(at(GROUND, 0, -5.5)).toBe(true); // spawn
    expect(at(GROUND, 6.15, -8)).toBe(true); // shop doorway
    expect(at(GROUND, 6.15, -4.5)).toBe(false); // storefront pillar
    expect(at(GROUND, -15.9, -20)).toBe(false); // against the outer wall
    expect(at(GROUND, -2, -18)).toBe(false); // on escalator A (a link, not cells)
  });

  it('records planter and bench tops at their height, so A* can refuse to walk up them', () => {
    const planter = nav.index(-3, -4.5);
    const bench = nav.index(4.6, -20);
    expect(nav.height(GROUND, planter)).toBeCloseTo(0.6, 2);
    expect(nav.height(GROUND, bench)).toBeCloseTo(0.45, 2);
  });

  it('knows the stage is 0.6 m up', () => {
    const i = nav.index(0, -63);
    expect(nav.walkable(GROUND, i)).toBe(true);
    expect(nav.height(GROUND, i)).toBeCloseTo(0.6, 2);
  });

  it('only has upper-floor cells where there is an upper floor', () => {
    expect(at(UPPER, 4.5, -12)).toBe(true); // gallery
    expect(at(UPPER, 0, -28.5)).toBe(true); // sky bridge
    expect(at(UPPER, 0, -20)).toBe(false); // over the atrium opening
  });

  it('links the ground floor to the upper floor through both escalators', () => {
    expect(nav.links).toHaveLength(2);
    for (const l of nav.links) {
      expect(l.floorA).toBe(GROUND);
      expect(l.floorB).toBe(UPPER);
      expect(nav.walkable(l.floorA, l.cellA) && nav.walkable(l.floorB, l.cellB)).toBe(true);
    }
  });
});
