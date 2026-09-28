import { STEP } from '@plaza/shared/constants';
import { describe, expect, it } from 'vitest';
import { FixedStep } from '../src/loop';

/** Simulate `seconds` of a body moving at 2 m/s, rendered at `fps`. */
function distanceAt(fps: number, seconds: number) {
  let x = 0;
  const loop = new FixedStep({ step: (dt) => (x += 2 * dt), render: () => {} });
  for (let t = 0; t <= seconds * 1000; t += 1000 / fps) loop.tick(t);
  return x;
}

describe('FixedStep', () => {
  it('moves the same distance at 30, 60 and 144 fps', () => {
    const d60 = distanceAt(60, 3);
    expect(distanceAt(30, 3)).toBeCloseTo(d60, 1);
    expect(distanceAt(144, 3)).toBeCloseTo(d60, 1);
    expect(d60).toBeCloseTo(6, 1);
  });

  it('always steps by exactly STEP', () => {
    const dts: number[] = [];
    const loop = new FixedStep({ step: (dt) => dts.push(dt), render: () => {} });
    for (const t of [0, 7, 40, 41, 90]) loop.tick(t);
    expect(dts.every((dt) => dt === STEP)).toBe(true);
  });

  it('drops long stalls instead of replaying them', () => {
    const loop = new FixedStep({ step: () => {}, render: () => {} });
    loop.tick(0);
    expect(loop.tick(10_000)).toBe(Math.floor(0.25 / STEP));
  });

  it('reports alpha between 0 and 1', () => {
    const alphas: number[] = [];
    const loop = new FixedStep({ step: () => {}, render: (a) => alphas.push(a) });
    for (let t = 0; t < 500; t += 7) loop.tick(t);
    expect(alphas.every((a) => a >= 0 && a < 1)).toBe(true);
  });

  it('does not jump after reset', () => {
    const loop = new FixedStep({ step: () => {}, render: () => {} });
    loop.tick(0);
    loop.reset();
    expect(loop.tick(60_000)).toBe(0);
  });
});
