import { STEP } from '@shopping-mall/shared/constants';
import type { Escalator } from '@shopping-mall/shared/meta';
import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { PlayerController } from '../src/player/controller';
import { escalatorCarry } from '../src/world/escalators';
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

  it('ignores you when beside it, past its ends, or not on its surface', () => {
    expect(escalatorCarry([e], new Vector3(0.8, 1.5, -2), out).length()).toBe(0);
    expect(escalatorCarry([e], new Vector3(0, 0, 1), out).length()).toBe(0);
    expect(escalatorCarry([e], new Vector3(0, 0, -2), out).length()).toBe(0); // under it
  });
});

describe('riding the greybox escalators', () => {
  it('carries a player who stands still from the bottom of A to the sky bridge', () => {
    const p = new PlayerController(collider);
    p.place(-2, 0, -12.3);
    ride(p, 0.3, { ...idle, y: 1 }); // step on
    ride(p, 16);
    expect(p.pos.y).toBeCloseTo(7.6, 2);
    expect(p.pos.z).toBeLessThan(-25);
    expect(p.pos.z).toBeGreaterThan(-26.5); // stepped off and stopped, didn't shoot across the bridge
  });

  it('carries you up B too, which runs the other way (toward +z)', () => {
    const p = new PlayerController(collider);
    p.place(2, 0, -45.3, Math.PI);
    ride(p, 0.3, { ...idle, y: 1, yaw: Math.PI });
    ride(p, 16);
    expect(p.pos.y).toBeCloseTo(7.6, 2);
    expect(p.pos.z).toBeGreaterThan(-32);
  });

  it('lets you walk up faster than it moves, and walk down against it', () => {
    const up = new PlayerController(collider);
    up.place(-2, 0, -12.3);
    ride(up, 4, { ...idle, y: 1 });
    expect(up.pos.y).toBeGreaterThan(7.5);

    const down = new PlayerController(collider);
    down.place(-2, 7.6, -26);
    ride(down, 0.2);
    ride(down, 12, { ...idle, y: -1 }); // walk backwards (+z) = down A, against its motion
    expect(down.pos.y).toBeLessThan(0.05);
  });

  it('moves smoothly: no step changes height by more than the carry allows', () => {
    const p = new PlayerController(collider);
    p.place(-2, 0, -12.3);
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
