import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { STEP } from '@plaza/shared/constants';
import { decodeNavGrid } from '@plaza/shared/navgrid';
import { describe, expect, it } from 'vitest';
import { PlayerController } from '../src/player/controller';
import { PathFollower } from '../src/player/follow';
import { PathFinder, type Waypoint } from '../src/player/path';
import { escalatorCarry } from '../src/world/escalators';
import { collider, greybox } from './greybox';

const bytes = readFileSync(resolve(import.meta.dirname, '../public/assets/mall/navgrid.bin'));
const nav = decodeNavGrid(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
const finder = new PathFinder(nav);
const spawn: Waypoint = { x: 0, y: 0, z: -2.5 };

/** Walk a path with the real controller. Returns the final position and time taken. */
function walk(to: Waypoint, from = spawn, maxSeconds = 60) {
  const path = finder.find(from, to);
  if (!path) throw new Error('no path');
  const p = new PlayerController(collider);
  p.place(from.x, from.y, from.z);
  p.step(STEP, { x: 0, y: 0, run: false, jump: false, yaw: 0 });
  const f = new PathFollower();
  f.start(path, p.pos);
  let t = 0;
  const yaw = 0.7; // camera yaw shouldn't matter
  while (f.active && t < maxSeconds) {
    const m = f.update(STEP, p.pos, yaw) ?? { x: 0, y: 0 };
    escalatorCarry(greybox.meta.escalators, p.pos, p.carry);
    p.step(STEP, { ...m, run: false, jump: false, yaw });
    t += STEP;
  }
  return { pos: p.pos, t, path };
}

describe('PathFinder', () => {
  it('finds a short, smoothed path across the concourse into a shop', () => {
    const path = finder.find(spawn, { x: -12, y: 0, z: -32 });
    expect(path).not.toBeNull();
    expect(path?.length).toBeLessThan(6); // a few straight legs, not a cell staircase
  });

  it('goes upstairs through an escalator link', () => {
    const path = finder.find(spawn, { x: 4.5, y: 7.6, z: -12 });
    expect(path).not.toBeNull();
    expect(path?.some((p) => p.y > 7)).toBe(true);
    expect(path?.some((p) => p.y < 1)).toBe(true);
  });

  it('refuses goals you cannot walk to (the top of the planter)', () => {
    expect(finder.find(spawn, { x: 0, y: 0.6, z: -6 })).toBeNull();
  });

  it('snaps goals that are just off the grid (a wall) to the nearest walkable cell', () => {
    expect(finder.find(spawn, { x: -15.99, y: 0, z: -20 })).not.toBeNull();
  });

  it('is fast: well under 2 ms per path on average', () => {
    const goals: Waypoint[] = [
      { x: -12, y: 0, z: -32 },
      { x: 12, y: 0, z: -48 },
      { x: 0, y: 0.6, z: -63 },
      { x: 4.5, y: 7.6, z: -50 },
      { x: -12, y: 7.6, z: -10 },
    ];
    for (const g of goals) finder.find(spawn, g); // warm up
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) for (const g of goals) finder.find(spawn, g);
    const avg = (performance.now() - t0) / 100;
    // budget is 2 ms (docs/tasks.md T-109); shared CI runners are ~2-3× slower than a dev laptop
    expect(avg).toBeLessThan(process.env.CI ? 6 : 2);
  });
});

describe('PathFollower with the real controller', () => {
  it('walks from the entrance into shop w3', () => {
    const to = { x: -12, y: 0, z: -32 };
    const { pos, t } = walk(to);
    expect(Math.hypot(pos.x - to.x, pos.z - to.z)).toBeLessThan(0.4);
    expect(t).toBeLessThan(20);
  });

  it('walks up the flagship steps onto the stage', () => {
    const to = { x: 3, y: 0.6, z: -62.5 };
    const { pos } = walk(to);
    expect(pos.y).toBeCloseTo(0.6, 2);
    expect(Math.hypot(pos.x - to.x, pos.z - to.z)).toBeLessThan(0.4);
  });

  it('walks upstairs via an escalator to the far end of the upper gallery', () => {
    const to = { x: -4.5, y: 7.6, z: -50 };
    const { pos } = walk(to);
    expect(pos.y).toBeCloseTo(7.6, 1);
    expect(Math.hypot(pos.x - to.x, pos.z - to.z)).toBeLessThan(0.4);
  });
});
