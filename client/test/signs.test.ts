import { describe, expect, it } from 'vitest';
import { fitFontSize, luminance } from '../src/render/signs';

// a fake font where every character is 0.6 × the font size wide
const measure = (text: string) => (size: number) => text.length * size * 0.6;

describe('fitFontSize', () => {
  it('uses the maximum size when the text already fits', () => {
    expect(fitFontSize(measure('Shop'), 1000, 10, 100)).toBe(100);
  });

  it('finds the largest size that fits', () => {
    const size = fitFontSize(measure('A much longer shop name'), 500, 10, 100);
    expect(measure('A much longer shop name')(size)).toBeLessThanOrEqual(500);
    expect(measure('A much longer shop name')(size + 1)).toBeGreaterThan(500);
  });

  it('never goes below the minimum', () => {
    expect(fitFontSize(measure('x'.repeat(500)), 100, 12, 100)).toBe(12);
  });
});

describe('luminance', () => {
  it('ranks colours from dark to light', () => {
    expect(luminance('#000000')).toBe(0);
    expect(luminance('#ffffff')).toBeCloseTo(1);
    expect(luminance('#efece6')).toBeGreaterThan(0.45); // light sign → dark text
    expect(luminance('#2b1d14')).toBeLessThan(0.45); // dark sign → light text
  });
});
