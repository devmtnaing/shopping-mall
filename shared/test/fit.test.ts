import { describe, expect, it } from 'vitest';
import { cleanSizes, fitFor, garmentOf, type SizeRow } from '../src/fit';

const tee: SizeRow[] = [
  { size: 'S', cm: { shoulder: 43, chest: 96, length: 68 } },
  { size: 'M', cm: { shoulder: 45.5, chest: 104, length: 70 } },
  { size: 'L', cm: { shoulder: 48, chest: 112, length: 72 } },
  { size: 'XL', cm: { shoulder: 50.5, chest: 120, length: 74 } },
];
const trousers: SizeRow[] = [
  { size: '30', cm: { waist: 78, hips: 98, inseam: 79 } },
  { size: '32', cm: { waist: 83, hips: 103, inseam: 80 } },
  { size: '34', cm: { waist: 88, hips: 108, inseam: 81 } },
];
const status = (fit: ReturnType<typeof fitFor>, size: string) =>
  Object.fromEntries(fit?.sizes.find((s) => s.size === size)?.checks.map((c) => [c.measure, c.status]) ?? []);

describe('fitFor', () => {
  it('picks the size that fits, and says why the others don’t', () => {
    const fit = fitFor(tee, { shoulder: 45, chest: 98 });
    expect(fit).toMatchObject({
      garment: 'top',
      basis: 'body',
      based: ['shoulder', 'chest'],
      best: 'M',
      fits: true,
    });
    expect(status(fit, 'S')).toEqual({ shoulder: 'tight', chest: 'tight' });
    expect(status(fit, 'XL')).toEqual({ shoulder: 'loose', chest: 'loose' });
    // by how much: S's chest is 2 cm smaller than you, 6 cm short of the 4 cm of room it needs
    expect(fit?.sizes[0]?.checks.find((c) => c.measure === 'chest')?.by).toBe(6);
  });

  it('when nothing fits everywhere, picks the closest and says where', () => {
    // broad shoulders, slim chest: every size is either tight at the shoulders or loose at the
    // chest. M is only tight, but a little loose beats too tight: L
    const fit = fitFor(tee, { shoulder: 51, chest: 92 });
    expect(fit?.fits).toBe(false);
    expect(fit?.best).toBe('L');
    expect(status(fit, 'L')).toEqual({ shoulder: 'tight', chest: 'loose' });
  });

  it('says every size is too small, rather than guessing', () => {
    const fit = fitFor(tee, { chest: 130 });
    expect(fit?.fits).toBe(false);
    expect(fit?.best).toBe('XL');
    expect(fit?.sizes.every((s) => s.checks[0]?.status === 'tight')).toBe(true);
  });

  it('fits trousers by waist, hips and inseam, and calls lengths short or long', () => {
    const fit = fitFor(trousers, { waist: 82, hips: 99, inseam: 84 });
    expect(fit).toMatchObject({ garment: 'bottom', best: '32', fits: false });
    expect(status(fit, '32')).toEqual({ waist: 'fits', hips: 'fits', inseam: 'short' });
    expect(fitFor(trousers, { waist: 82, hips: 99, inseam: 80 })).toMatchObject({ best: '32', fits: true });
  });

  it('doesn’t call short sleeves or shorts too short', () => {
    const shortSleeves = tee.map((r) => ({ ...r, cm: { ...r.cm, sleeve: 20 } }));
    const fit = fitFor(shortSleeves, { shoulder: 45, chest: 98, sleeve: 60 });
    expect(fit).toMatchObject({ based: ['shoulder', 'chest'], best: 'M', fits: true });
    const longSleeves = tee.map((r) => ({ ...r, cm: { ...r.cm, sleeve: 55 } }));
    expect(status(fitFor(longSleeves, { chest: 98, sleeve: 60 }), 'M')).toEqual({
      chest: 'fits',
      sleeve: 'short',
    });
    const shorts = trousers.map((r) => ({ ...r, cm: { ...r.cm, inseam: 20 } }));
    expect(fitFor(shorts, { waist: 82, hips: 99, inseam: 80 })?.based).toEqual(['waist', 'hips']);
  });

  it('compares only what both sides have', () => {
    expect(fitFor(tee, { waist: 80, inseam: 80 })).toBeNull();
    expect(fitFor(tee, { chest: 98 })?.based).toEqual(['chest']);
    // a body has no "length"; a piece you own does
    expect(fitFor(tee, { chest: 98, length: 70 })?.based).toEqual(['chest']);
    expect(fitFor(tee, { chest: 104, length: 70 }, 'piece')?.based).toEqual(['chest', 'length']);
  });

  it('against a piece you own, the same measurements fit', () => {
    const fit = fitFor(tee, { shoulder: 46, chest: 105, length: 70 }, 'piece');
    expect(fit).toMatchObject({ best: 'M', fits: true });
    expect(status(fit, 'L')).toEqual({ shoulder: 'loose', chest: 'loose', length: 'fits' });
    expect(status(fit, 'XL')).toMatchObject({ length: 'long' });
  });

  it('skips sizes the chart leaves blank for a measurement', () => {
    const gappy: SizeRow[] = [
      { size: 'S', cm: { chest: 96 } },
      { size: 'M', cm: { shoulder: 46 } },
    ];
    const fit = fitFor(gappy, { chest: 90, shoulder: 45 });
    expect(fit?.sizes.map((s) => s.checks.map((c) => c.measure))).toEqual([['chest'], ['shoulder']]);
  });
});

describe('garmentOf', () => {
  it('tells tops from bottoms', () => {
    expect(garmentOf(tee)).toBe('top');
    expect(garmentOf(trousers)).toBe('bottom');
    expect(garmentOf([{ size: 'M', cm: { waist: 70, hips: 96, length: 60 } }])).toBe('bottom'); // a skirt
  });
});

describe('cleanSizes', () => {
  it('returns undefined for nothing usable', () => {
    expect(cleanSizes(undefined)).toBeUndefined();
    expect(cleanSizes([{ size: 'M', cm: { chest: 'big' } }])).toBeUndefined();
  });
  it('keeps at most 8 sizes', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ size: `S${i}`, cm: { chest: 80 + i } }));
    expect(cleanSizes(many)).toHaveLength(8);
  });
});
