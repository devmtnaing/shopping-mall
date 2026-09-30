import { STEP } from '@shopping-mall/shared/constants';
import type { Escalator } from '@shopping-mall/shared/meta';
import { type InstancedMesh, Matrix4, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { PlayerController } from '../src/player/controller';
import { escalatorCarry, escalatorSteps } from '../src/world/escalators';
import { collider, greybox } from './greybox';

const { meta } = greybox;
const idle = { x: 0, y: 0, run: false, jump: false, yaw: 0 };

function ride(p: PlayerController, seconds: number, intent = idle) {
  for (let t = 0; t < seconds; t += STEP) {
    escalatorCarry(meta.escalators, p.pos, p.carry);
    p.step(STEP, intent);
  }
}

describe('escalatorCarry', () => {
  const e: Escalator = { id: 't', from: [0, 0, 0], to: [0, 3, -4], width: 1, speed: 1 };
  const out = new Vector3();

  it('moves you along the escalator at its speed', () => {
    escalatorCarry([e], new Vector3(0, 1.5, -2), out);
    expect(out.length()).toBeCloseTo(1);
    expect(out.y).toBeGreaterThan(0);
    expect(out.z).toBeLessThan(0);
  });

  it('carries you flat across its landings, where the steps run level', () => {
    escalatorCarry([e], new Vector3(0, 0, 0.8), out);
    expect(out.length()).toBeCloseTo(1);
    expect(out.y).toBe(0);
    escalatorCarry([e], new Vector3(0, 3, -4.8), out);
    expect(out.y).toBe(0);
    expect(out.z).toBeLessThan(0);
  });

  it('ignores you when beside it, past its ends, or not on its surface', () => {
    expect(escalatorCarry([e], new Vector3(0.8, 1.5, -2), out).length()).toBe(0);
    expect(escalatorCarry([e], new Vector3(0, 0, 1.5), out).length()).toBe(0); // past the landing
    expect(escalatorCarry([e], new Vector3(0, 3, -5.5), out).length()).toBe(0);
    expect(escalatorCarry([e], new Vector3(0, 0, -2), out).length()).toBe(0); // under it
  });
});

describe('riding the greybox escalators', () => {
  it('carries a player who stands still from the bottom of A to the sky bridge', () => {
    const p = new PlayerController(collider);
    p.place(-3, 0, -19.4);
    ride(p, 0.3, { ...idle, y: 1 }); // step on
    ride(p, 16);
    expect(p.pos.y).toBeCloseTo(8, 2);
    expect(p.pos.z).toBeLessThan(-33);
    expect(p.pos.z).toBeGreaterThan(-34.5); // stepped off and stopped, didn't shoot across the bridge
  });

  it('carries you down B, from the bridge back to the ground (toward −z)', () => {
    const p = new PlayerController(collider);
    p.place(3, 8, -40.6);
    ride(p, 0.3, { ...idle, y: 1 }); // step on
    ride(p, 16);
    expect(p.pos.y).toBeCloseTo(0, 2);
    expect(p.pos.z).toBeLessThan(-54.8);
  });

  it('lets you walk up faster than it moves, and walk down against it', () => {
    const up = new PlayerController(collider);
    up.place(-3, 0, -19.4);
    ride(up, 4, { ...idle, y: 1 });
    expect(up.pos.y).toBeGreaterThan(7.9);

    const down = new PlayerController(collider);
    down.place(-3, 8, -34);
    ride(down, 0.2);
    ride(down, 12, { ...idle, y: -1 }); // walk backwards (+z) = down A, against its motion
    expect(down.pos.y).toBeLessThan(0.05);
  });

  it('moves smoothly: no step changes height by more than the carry allows', () => {
    const p = new PlayerController(collider);
    p.place(-3, 0, -19.4);
    ride(p, 0.3, { ...idle, y: 1 });
    let maxJump = 0;
    for (let t = 0; t < 16; t += STEP) {
      const y = p.pos.y;
      escalatorCarry(meta.escalators, p.pos, p.carry);
      p.step(STEP, idle);
      maxJump = Math.max(maxJump, Math.abs(p.pos.y - y));
    }
    expect(maxJump).toBeLessThan(0.05);
  });
});

describe('escalatorSteps', () => {
  const e: Escalator = { id: 't', from: [0, 0, 0], to: [0, 3, -4], width: 1.4, speed: 1 };
  const heights = (steps: ReturnType<typeof escalatorSteps>) => {
    const treads = steps.group.children[0] as InstancedMesh;
    const m = new Matrix4();
    const p = new Vector3();
    return Array.from({ length: treads.count }, (_, i) => {
      treads.getMatrixAt(i, m);
      return p.setFromMatrixPosition(m).clone();
    });
  };

  it('lays the steps flat at both landings and climbing in between, all within the escalator', () => {
    const at = heights(escalatorSteps([e]));
    expect(at.length).toBeGreaterThan(10);
    for (const p of at) {
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(3.05);
      expect(p.z).toBeLessThanOrEqual(1.2 + 1e-6); // the bottom landing
      expect(p.z).toBeGreaterThanOrEqual(-4 - 1.2 - 1e-6); // the top landing
    }
    expect(at.some((p) => p.y < 0.05)).toBe(true);
    expect(at.some((p) => p.y > 2.95)).toBe(true);
  });

  it('moves them down on a down escalator (from the top, to the bottom)', () => {
    const down: Escalator = { ...e, from: e.to, to: e.from };
    const steps = escalatorSteps([down]);
    const before = heights(steps);
    steps.update(0.1);
    const after = heights(steps);
    const i = Math.floor(before.length / 2);
    expect((after[i] as Vector3).y).toBeLessThan((before[i] as Vector3).y);
  });

  it('moves them up', () => {
    const steps = escalatorSteps([e]);
    const before = heights(steps);
    steps.update(0.1);
    const after = heights(steps);
    // a step on the incline (the middle one) has risen
    const i = Math.floor(before.length / 2);
    expect((after[i] as Vector3).y).toBeGreaterThan((before[i] as Vector3).y);
  });
});
