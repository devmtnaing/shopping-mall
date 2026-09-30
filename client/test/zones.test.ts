import { STEP } from '@shopping-mall/shared/constants';
import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { ZoneTracker } from '../src/world/zones';
import { greybox } from './greybox';

const { zones } = greybox.meta;

describe('ZoneTracker', () => {
  it('picks the most specific zone: a shop beats the hall, the bridge beats the gallery', () => {
    const t = new ZoneTracker(zones);
    expect(t.best(new Vector3(0, 0, -6))?.id).toBe('entrance');
    expect(t.best(new Vector3(0, 0, -24))?.id).toBe('main-hall');
    expect(t.best(new Vector3(-15, 0, -40))?.id).toBe('shop-w3');
    expect(t.best(new Vector3(0, 8, -37))?.id).toBe('sky-bridge');
    expect(t.best(new Vector3(8.5, 8, -14))?.id).toBe('upper-gallery');
    expect(t.best(new Vector3(0, 0.6, -78))?.id).toBe('shop-flagship');
  });

  it('changes once when you walk across a boundary, even while wobbling on it', () => {
    const t = new ZoneTracker(zones);
    const p = new Vector3(0, 0, -8);
    t.update(STEP, p);
    let changes = 0;
    // walk from the entrance into the main hall, jittering ±0.15 m around the boundary at z = −10
    for (let i = 0; i < 240; i++) {
      p.z = -8 - Math.min(i, 120) * (4 / 120) + Math.sin(i) * 0.15;
      if (t.update(STEP, p)) changes++;
    }
    expect(changes).toBe(1);
    expect(t.current?.id).toBe('main-hall');
  });

  it('switches into a shop promptly when you step through the door', () => {
    const t = new ZoneTracker(zones);
    const p = new Vector3(8, 0, -11);
    t.update(STEP, p);
    p.set(11.5, 0, -11);
    let frames = 0;
    while (!t.update(STEP, p) && frames < 60) frames++;
    expect(t.current?.id).toBe('shop-e0');
    expect(frames * STEP).toBeLessThan(0.3);
  });
});
