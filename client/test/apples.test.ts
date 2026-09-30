import { STEP } from '@shopping-mall/shared/constants';
import { APPLE } from '@shopping-mall/shared/protocol';
import { describe, expect, it } from 'vitest';
import { Apples } from '../src/world/apples';
import { collider } from './greybox';

/** Fly apples for `seconds`, and return the first one's position (via the apple's matrix). */
function fly(apples: Apples, seconds: number) {
  for (let t = 0; t < seconds; t += STEP) apples.update(STEP);
}
const first = (apples: Apples) =>
  (apples as unknown as { apples: { pos: { x: number; y: number; z: number }; resting: boolean }[] })
    .apples[0];

describe('apples', () => {
  it('arc down the concourse, bounce and come to rest on the floor', () => {
    const apples = new Apples(collider);
    apples.throw([0, 1.25, -6], [0, APPLE.lift, -APPLE.speed]);
    fly(apples, 0.3);
    expect(first(apples)?.pos.y).toBeGreaterThan(1.25); // still rising
    fly(apples, 4);
    const a = first(apples);
    expect(a?.resting).toBe(true);
    expect(a?.pos.y).toBeGreaterThan(0);
    expect(a?.pos.y).toBeLessThan(0.15);
    expect(a?.pos.z).toBeLessThan(-10); // it went somewhere
  });

  it('bounce off a wall instead of passing through it', () => {
    const apples = new Apples(collider);
    // inside unit w0, thrown hard at the outer west wall (x = −22)
    apples.throw([-15, 1.25, -11], [-APPLE.maxSpeed, 1, 0]);
    fly(apples, 3);
    expect(first(apples)?.pos.x).toBeGreaterThan(-22);
  });

  it('disappear after a while', () => {
    const apples = new Apples(collider);
    apples.throw([0, 1.25, -6], [0, APPLE.lift, -APPLE.speed]);
    fly(apples, 9);
    expect(apples.count).toBe(0);
  });
});
