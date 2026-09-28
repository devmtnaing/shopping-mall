import { STEP } from '@plaza/shared/constants';
import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { ZoneTracker } from '../src/world/zones';
import { greybox } from './greybox';

const { zones } = greybox.meta;

describe('ZoneTracker', () => {
  it('picks the most specific zone: a shop beats the hall, the bridge beats the gallery', () => {
    const t = new ZoneTracker(zones);
    expect(t.best(new Vector3(0, 0, -2.5))?.id).toBe('entrance');
    expect(t.best(new Vector3(0, 0, -20))?.id).toBe('main-hall');
    expect(t.best(new Vector3(-12, 0, -32))?.id).toBe('shop-w3');
    expect(t.best(new Vector3(0, 7.6, -28))?.id).toBe('sky-bridge');
    expect(t.best(new Vector3(4.5, 7.6, -12))?.id).toBe('upper-gallery');
    expect(t.best(new Vector3(0, 0.6, -62))?.id).toBe('shop-flagship');
  });

  it('changes once when you walk across a boundary, even while wobbling on it', () => {
    const t = new ZoneTracker(zones);
    const p = new Vector3(0, 0, -6);
    t.update(STEP, p);
    let changes = 0;
    // walk from the entrance into the main hall, jittering ±0.15 m around the boundary at z = −8
    for (let i = 0; i < 240; i++) {
      p.z = -6 - Math.min(i, 120) * (4 / 120) + Math.sin(i) * 0.15;
      if (t.update(STEP, p)) changes++;
    }
    expect(changes).toBe(1);
    expect(t.current?.id).toBe('main-hall');
  });

  it('switches into a shop promptly when you step through the door', () => {
    const t = new ZoneTracker(zones);
    const p = new Vector3(4, 0, -8);
    t.update(STEP, p);
    p.set(7.5, 0, -8);
    let frames = 0;
    while (!t.update(STEP, p) && frames < 60) frames++;
    expect(t.current?.id).toBe('shop-e0');
    expect(frames * STEP).toBeLessThan(0.3);
  });
});
