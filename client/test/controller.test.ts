import { PLAYER, STEP } from '@shopping-mall/shared/constants';
import { Box3, Vector3 } from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import { type Intent, PlayerController } from '../src/player/controller';
import { collider } from './greybox';

const idle: Intent = { x: 0, y: 0, run: false, jump: false, yaw: 0 };
/** Run `seconds` of simulation with a fixed intent. Returns the lowest and highest y seen. */
function sim(p: PlayerController, seconds: number, intent: Partial<Intent> = {}) {
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let t = 0; t < seconds; t += STEP) {
    p.step(STEP, { ...idle, ...intent });
    minY = Math.min(minY, p.pos.y);
    maxY = Math.max(maxY, p.pos.y);
  }
  return { minY, maxY };
}

let p: PlayerController;
beforeEach(() => {
  p = new PlayerController(collider);
});

describe('PlayerController on the greybox', () => {
  it('stands still on flat ground without drifting', () => {
    p.place(0, 0, -5.5);
    sim(p, 2);
    expect(p.grounded).toBe(true);
    expect(p.pos.distanceTo({ x: 0, y: 0, z: -5.5 } as never)).toBeLessThan(0.01);
  });

  it('is stopped by the planter (0.6 m, too tall to step)', () => {
    // planter spans x -5.5…-3.5, z -6…-4; walk west into its east side
    p.place(0, 0, -5);
    sim(p, 3, { x: -1 });
    expect(p.pos.x).toBeGreaterThan(-3.5 + PLAYER.radius - 0.05);
    expect(p.pos.x).toBeLessThan(-3);
    expect(p.pos.y).toBeLessThan(0.05);
  });

  it('is stopped by an obstacle box (shop furniture), and stays out of it', () => {
    // a shelf inside unit w0: x -16…-14, z -12…-10
    p.obstacles = [new Box3(new Vector3(-16, 0, -12), new Vector3(-14, 1.8, -10))];
    p.place(-11, 0, -11);
    sim(p, 3, { x: -1, run: true });
    expect(p.pos.x).toBeCloseTo(-14 + PLAYER.radius, 2);
    p.place(-15, 0, -11.8); // spawned inside it: pushed out through the nearest side
    sim(p, 0.1);
    expect(p.pos.z).toBeLessThanOrEqual(-12 - PLAYER.radius + 1e-6);
  });

  it('never tunnels through a wall, even running into it for a long time', () => {
    p.place(-14, 0, -10.9); // inside unit w0, facing the outer west wall at x = −22
    sim(p, 6, { x: -1, run: true });
    expect(p.pos.x).toBeGreaterThan(-22 + PLAYER.radius - 0.02);
    expect(p.pos.x).toBeLessThan(-21);
  });

  it('walks up the 0.2 m flagship steps onto the stage', () => {
    p.place(0, 0, -74);
    sim(p, 3, { y: 1 });
    expect(p.pos.y).toBeCloseTo(0.6, 1);
    expect(p.pos.z).toBeLessThan(-77);
  });

  it('is blocked by a 0.45 m bench', () => {
    p.place(7, 0, -16); // the bench at x 8.6 spans x 8.25…8.95
    sim(p, 2, { x: 1 });
    // the body capsule starts at step height, so it meets the bench's top edge a little past its side
    expect(p.pos.x).toBeLessThan(8.35 - 0.2);
    expect(p.pos.y).toBeCloseTo(0, 6);
  });

  it('is blocked by the side of the 0.6 m stage, and can jump onto it', () => {
    p.place(9.5, 0, -78.5);
    sim(p, 1.5, { x: -1 }); // walk west into the stage side at x = 8
    expect(p.pos.x).toBeGreaterThan(8);
    expect(p.pos.y).toBeCloseTo(0, 6);
    p.step(STEP, { ...idle, x: -1, jump: true });
    sim(p, 1, { x: -1 });
    expect(p.pos.y).toBeCloseTo(0.6, 3);
    expect(p.pos.x).toBeLessThan(8);
  });

  it('walks up escalator A (a 30° slope) to the sky bridge', () => {
    p.place(-3, 0, -18);
    const { maxY } = sim(p, 8, { y: 1 });
    expect(maxY).toBeGreaterThan(7.9);
    expect(p.pos.y).toBeCloseTo(8, 1);
    expect(p.pos.z).toBeLessThan(-33);
  });

  it('does not slide down the escalator when standing still', () => {
    p.place(-3, 0, -18);
    sim(p, 2.2, { y: 1 }); // part-way up
    sim(p, 0.5); // come to a stop
    const z = p.pos.z;
    const y = p.pos.y;
    expect(y).toBeGreaterThan(1);
    sim(p, 3);
    expect(Math.abs(p.pos.z - z)).toBeLessThan(0.02);
    expect(Math.abs(p.pos.y - y)).toBeLessThan(0.02);
  });

  it('walks back down the escalator without leaving the ground', () => {
    p.place(-3, 8, -36);
    sim(p, 0.2);
    let airborne = 0;
    for (let t = 0; t < 7; t += STEP) {
      p.step(STEP, { ...idle, y: -1 }); // backwards = +z = down escalator A
      if (!p.grounded) airborne++;
    }
    expect(p.pos.y).toBeLessThan(0.1);
    expect(airborne).toBeLessThan(10);
  });

  it('stays on the escalator near the top: no stepping or jumping over its side', () => {
    for (const x of [-1, 1]) {
      p.place(-3, 0, -18);
      sim(p, 4.2, { y: 1 }); // most of the way up escalator A
      expect(p.pos.y).toBeGreaterThan(6);
      expect(p.pos.y).toBeLessThan(7.9);
      for (let i = 0; i < 6; i++) {
        p.step(STEP, { ...idle, x, jump: true }); // turn to the side and jump at the balustrade
        sim(p, 0.8, { x });
      }
      expect(Math.abs(p.pos.x + 3)).toBeLessThan(0.7); // still between the balustrades
      expect(p.pos.y).toBeGreaterThan(4);
    }
  });

  it("can't jump onto a parapet round the atrium", () => {
    p.place(8, 8, -20);
    for (let i = 0; i < 6; i++) {
      p.step(STEP, { ...idle, x: -1, jump: true }); // west, at the parapet on the atrium's edge (x 6…6.2)
      sim(p, 0.8, { x: -1, run: true });
    }
    expect(p.pos.x).toBeGreaterThan(6.2);
    expect(p.pos.y).toBeCloseTo(8, 1);
  });

  it('jumps about a metre and lands where it started', () => {
    p.place(0, 0, -20);
    sim(p, 0.2);
    p.step(STEP, { ...idle, jump: true });
    const { maxY } = sim(p, 1.5);
    // v²/2g, minus a little from discrete integration
    expect(Math.abs(maxY - PLAYER.jumpSpeed ** 2 / (2 * PLAYER.gravity))).toBeLessThan(0.08);
    expect(p.grounded).toBe(true);
    expect(p.pos.y).toBeCloseTo(0, 3);
  });

  it('recovers when spawned inside geometry', () => {
    p.place(-4.5, 0.1, -5); // inside the planter
    sim(p, 1);
    const inside = p.pos.x > -5.5 && p.pos.x < -3.5 && p.pos.z < -4 && p.pos.z > -6 && p.pos.y < 0.55;
    expect(inside).toBe(false);
  });

  it('respawns after falling out of the world', () => {
    p.place(0, 0, -5.5);
    p.pos.set(0, -30, 20);
    p.step(STEP, idle);
    expect(p.pos.z).toBeCloseTo(-5.5, 1);
  });
});
