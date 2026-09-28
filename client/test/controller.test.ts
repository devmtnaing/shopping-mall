import { PLAYER, STEP } from '@plaza/shared/constants';
import { BufferAttribute, BufferGeometry } from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildGreybox } from '../../tools/greybox/layout';
import { type Intent, PlayerController } from '../src/player/controller';

const { geo } = buildGreybox();
const collision = new BufferGeometry();
collision.setAttribute('position', new BufferAttribute(new Float32Array(geo.collision), 3));

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
  p = new PlayerController(collision);
});

describe('PlayerController on the greybox', () => {
  it('stands still on flat ground without drifting', () => {
    p.place(0, 0, -2.5);
    sim(p, 2);
    expect(p.grounded).toBe(true);
    expect(p.pos.distanceTo({ x: 0, y: 0, z: -2.5 } as never)).toBeLessThan(0.01);
  });

  it('is stopped by the planter (0.6 m, too tall to step)', () => {
    p.place(0, 0, -2.5);
    sim(p, 3, { y: 1 });
    expect(p.pos.z).toBeGreaterThan(-5 + PLAYER.radius - 0.05);
    expect(p.pos.z).toBeLessThan(-4.5);
    expect(p.pos.y).toBeLessThan(0.05);
  });

  it('never tunnels through a wall, even running into it for a long time', () => {
    p.place(-10, 0, -7.9); // inside unit w0, facing the outer west wall at x = −16
    sim(p, 6, { x: -1, run: true });
    expect(p.pos.x).toBeGreaterThan(-16 + PLAYER.radius - 0.02);
    expect(p.pos.x).toBeLessThan(-15);
  });

  it('walks up the 0.2 m flagship steps onto the stage', () => {
    p.place(0, 0, -58);
    sim(p, 3, { y: 1 });
    expect(p.pos.y).toBeCloseTo(0.6, 1);
    expect(p.pos.z).toBeLessThan(-61);
  });

  it('is blocked by a 0.45 m bench', () => {
    p.place(3, 0, -8);
    sim(p, 2, { x: 1 });
    // the body capsule starts at step height, so it meets the bench's top edge a little past its side
    expect(p.pos.x).toBeLessThan(4.35 - 0.2);
    expect(p.pos.y).toBeCloseTo(0, 6);
  });

  it('is blocked by the side of the 0.6 m stage, and can jump onto it', () => {
    p.place(7.5, 0, -62.5);
    sim(p, 1.5, { x: -1 }); // walk west into the stage side at x = 6
    expect(p.pos.x).toBeGreaterThan(6);
    expect(p.pos.y).toBeCloseTo(0, 6);
    p.step(STEP, { ...idle, x: -1, jump: true });
    sim(p, 1, { x: -1 });
    expect(p.pos.y).toBeCloseTo(0.6, 3);
    expect(p.pos.x).toBeLessThan(6);
  });

  it('walks up escalator A (a 30° slope) to the sky bridge', () => {
    p.place(-2, 0, -11);
    const { maxY } = sim(p, 8, { y: 1 });
    expect(maxY).toBeGreaterThan(7.5);
    expect(p.pos.y).toBeCloseTo(7.6, 1);
    expect(p.pos.z).toBeLessThan(-25);
  });

  it('does not slide down the escalator when standing still', () => {
    p.place(-2, 0, -11);
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
    p.place(-2, 7.6, -28);
    sim(p, 0.2);
    let airborne = 0;
    for (let t = 0; t < 7; t += STEP) {
      p.step(STEP, { ...idle, y: -1 }); // backwards = +z = down escalator A
      if (!p.grounded) airborne++;
    }
    expect(p.pos.y).toBeLessThan(0.1);
    expect(airborne).toBeLessThan(10);
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
    p.place(0, 0.1, -6); // inside the planter
    sim(p, 1);
    const inside = Math.abs(p.pos.x) < 1 && p.pos.z < -5 && p.pos.z > -7 && p.pos.y < 0.55;
    expect(inside).toBe(false);
  });

  it('respawns after falling out of the world', () => {
    p.place(0, 0, -2.5);
    p.pos.set(0, -30, 20);
    p.step(STEP, idle);
    expect(p.pos.z).toBeCloseTo(-2.5, 1);
  });
});
