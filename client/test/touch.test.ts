import { describe, expect, it } from 'vitest';
import { stickFromDrag } from '../src/player/touch';

describe('stickFromDrag', () => {
  it('maps up to forward and right to strafe right', () => {
    expect(stickFromDrag(0, -100)).toEqual({ x: 0, y: 1 });
    expect(stickFromDrag(100, 0)).toEqual({ x: 1, y: -0 });
  });

  it('never exceeds length 1', () => {
    const v = stickFromDrag(300, -400);
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1);
  });

  it('ignores tiny drags (dead zone) and scales smoothly after it', () => {
    expect(stickFromDrag(3, 3)).toEqual({ x: 0, y: 0 });
    const half = stickFromDrag(0, -28);
    expect(half.y).toBeGreaterThan(0.3);
    expect(half.y).toBeLessThan(0.5);
  });
});
