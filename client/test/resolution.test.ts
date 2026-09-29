import { beforeEach, describe, expect, it } from 'vitest';
import { DynamicResolution, resolutionScale } from '../src/render/resolution';

const frames = (d: DynamicResolution, n: number, ms: number) => {
  for (let i = 0; i < n; i++) d.frame(ms);
};

describe('dynamic resolution', () => {
  beforeEach(() => {
    resolutionScale.value = 1;
  });

  it('scales down after 30 slow frames, never below 0.75', () => {
    const d = new DynamicResolution(1000 / 60);
    frames(d, 29, 25);
    expect(resolutionScale.value).toBe(1);
    frames(d, 1, 25);
    expect(resolutionScale.value).toBe(0.95);
    frames(d, 300, 25);
    expect(resolutionScale.value).toBe(0.75);
  });

  it('ignores a single hitch, and climbs back slowly with headroom', () => {
    const d = new DynamicResolution(1000 / 60);
    frames(d, 20, 25);
    frames(d, 1, 12); // the streak is broken
    frames(d, 20, 25);
    expect(resolutionScale.value).toBe(1);
    resolutionScale.value = 0.8;
    frames(d, 180, 8);
    expect(resolutionScale.value).toBe(0.85);
  });
});
