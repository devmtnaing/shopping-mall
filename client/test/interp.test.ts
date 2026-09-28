import type { Pose } from '@plaza/shared/protocol';
import { describe, expect, it } from 'vitest';
import { INTERP_DELAY, PoseBuffer, ServerClock } from '../src/net/interp';

const TICK = 1000 / 15;
const pose = (x: number, z = 0, yaw = 0): Pose => ({ x, y: 0, z, yaw, anim: 0, flags: 1 });

/**
 * Simulate a player walking at `speed` m/s along +x. Snapshots are sent every tick, arrive with
 * `latency` ± `jitter` ms, and a fraction `loss` are dropped. Render at 60 fps and return per-frame
 * steps and the error against where the player really was INTERP_DELAY + latency ago.
 */
function simulate({ speed = 3, latency = 60, jitter = 25, loss = 0, seconds = 6, seed = 7 } = {}) {
  let r = seed;
  const rand = () => {
    r = (r * 1664525 + 1013904223) % 2 ** 32;
    return r / 2 ** 32;
  };
  const arrivals: { at: number; tick: number; x: number }[] = [];
  for (let tick = 0; tick * TICK < seconds * 1000; tick++) {
    if (rand() < loss) continue;
    arrivals.push({
      at: tick * TICK + latency + (rand() - 0.5) * 2 * jitter,
      tick: tick & 0xffff,
      x: (speed * tick * TICK) / 1000,
    });
  }
  arrivals.sort((a, b) => a.at - b.at);
  const clock = new ServerClock();
  const buf = new PoseBuffer();
  const out = pose(0);
  const steps: number[] = [];
  const errors: number[] = [];
  let prevX: number | null = null;
  let next = 0;
  for (let now = 0; now < seconds * 1000; now += 1000 / 60) {
    while (next < arrivals.length && (arrivals[next]?.at ?? 0) <= now) {
      const a = arrivals[next++] as (typeof arrivals)[number];
      buf.push(clock.onTick(a.tick, a.at), pose(a.x));
    }
    if (!buf.sample(clock.renderTime(now), out)) continue;
    if (prevX !== null && now > 1000) {
      steps.push(out.x - prevX);
      const truth = (speed * (now - latency + jitter - INTERP_DELAY)) / 1000;
      errors.push(Math.abs(out.x - truth));
    }
    prevX = out.x;
  }
  return { steps, errors };
}

describe('interpolation', () => {
  it('moves smoothly with network jitter: every frame advances about speed/60', () => {
    const { steps } = simulate();
    const ideal = 3 / 60;
    for (const s of steps) {
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThan(ideal * 2);
    }
  });

  it('stays smooth with 10 % packet loss', () => {
    const { steps } = simulate({ loss: 0.1 });
    expect(Math.max(...steps)).toBeLessThan((3 / 60) * 2.5);
    expect(steps.every((s) => s >= -1e-9)).toBe(true); // never jumps backwards
  });

  it('stays close to the true path (within 25 cm at walking speed)', () => {
    const { errors } = simulate({ loss: 0.1 });
    expect(Math.max(...errors)).toBeLessThan(0.25);
  });

  it('extrapolates briefly when packets stop, then holds still', () => {
    const clock = new ServerClock();
    const buf = new PoseBuffer();
    for (let tick = 0; tick < 10; tick++) buf.push(clock.onTick(tick, tick * TICK), pose(tick * 0.2));
    const out = pose(0);
    const last = 9 * TICK;
    buf.sample(last + 100, out);
    const x100 = out.x;
    buf.sample(last + 250, out);
    const x250 = out.x;
    buf.sample(last + 2000, out);
    expect(x100).toBeGreaterThan(1.8);
    expect(x250).toBeGreaterThan(x100);
    expect(out.x).toBeCloseTo(x250, 6); // capped at 250 ms
  });

  it('snaps across a teleport instead of sliding', () => {
    const buf = new PoseBuffer();
    buf.push(0, pose(0));
    buf.push(TICK, pose(40));
    const out = pose(0);
    buf.sample(TICK * 0.4, out);
    expect(out.x === 0 || out.x === 40).toBe(true);
  });

  it('turns the short way round', () => {
    const buf = new PoseBuffer();
    buf.push(0, pose(0, 0, Math.PI - 0.1));
    buf.push(100, pose(0, 0, -Math.PI + 0.1));
    const out = pose(0);
    buf.sample(50, out);
    expect(Math.abs(Math.cos(out.yaw) + 1)).toBeLessThan(0.01); // halfway = facing exactly π
  });

  it('unwraps the 16-bit tick counter', () => {
    const clock = new ServerClock();
    const a = clock.onTick(65534, 0);
    const b = clock.onTick(1, 3 * TICK);
    expect(b - a).toBeCloseTo(3 * TICK);
  });
});
