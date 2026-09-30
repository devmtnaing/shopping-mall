import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { Overview } from '../src/player/overview';

const from = { position: new Vector3(0, 2, 5), target: new Vector3(0, 1.5, 0) };
const bounds = { minX: -22, maxX: 22, minZ: -80, maxZ: 0 };
const run = (o: Overview, seconds: number) => {
  for (let t = 0; t < seconds; t += 1 / 60) o.update(1 / 60, false, from, bounds, 0, 60, 16 / 9);
};

describe('Overview', () => {
  it('eases up to a high view in under 800 ms and cuts away the ceiling', () => {
    const o = new Overview();
    o.active = true;
    run(o, 0.75);
    expect(o.t).toBe(1);
    expect(o.position.y).toBeGreaterThan(40);
    expect(o.clipY).toBeCloseTo(3.4);
  });

  it('frames a tall, narrow phone screen by backing further off', () => {
    const wide = new Overview();
    const tall = new Overview();
    wide.active = tall.active = true;
    wide.update(1, true, from, bounds, 0, 60, 16 / 9);
    tall.update(1, true, from, bounds, 0, 60, 390 / 844);
    expect(tall.position.y).toBeGreaterThan(wide.position.y);
  });

  it('returns to the follow camera and stops clipping', () => {
    const o = new Overview();
    o.active = true;
    run(o, 1);
    o.active = false;
    run(o, 1);
    expect(o.t).toBe(0);
    expect(o.position.distanceTo(from.position)).toBeLessThan(1e-6);
    expect(o.clipY).toBe(Number.POSITIVE_INFINITY);
  });

  it('jumps straight there with reduced motion', () => {
    const o = new Overview();
    o.active = true;
    o.update(1 / 60, true, from, bounds, 8, 60, 1);
    expect(o.t).toBe(1);
    expect(o.clipY).toBeCloseTo(8 + 3.4);
  });
});
