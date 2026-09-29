import { beforeEach, describe, expect, it } from 'vitest';
import { AutoQuality, qualitySetting, setQuality, tier } from '../src/quality';

/** Feed 3 s worth of frames of the given duration. */
const run = (auto: AutoQuality, ms: number) => {
  for (let t = 0; t < 3000 + ms; t += ms) auto.frame(ms);
};

describe('quality tiers', () => {
  beforeEach(() => setQuality('auto'));

  it('starts on medium and steps down on a slow device, one step per sample', () => {
    const auto = new AutoQuality();
    expect(tier.value).toBe('medium');
    run(auto, 30);
    expect(tier.value).toBe('low');
    run(auto, 30);
    expect(tier.value).toBe('low'); // nowhere lower to go
  });

  it('a manual choice wins, and auto leaves it alone', () => {
    setQuality('high');
    const auto = new AutoQuality();
    run(auto, 40);
    expect(tier.value).toBe('high');
    expect(qualitySetting.value).toBe('high');
  });
});
