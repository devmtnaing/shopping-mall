import type { SizeRow } from '@shopping-mall/shared/fit';
import { describe, expect, it } from 'vitest';
import { estimateFromHeight, fitForMe, fromUnit, type MyFit, toUnit } from '../src/fit/mine';

const tee: SizeRow[] = [
  { size: 'M', cm: { shoulder: 45.5, chest: 104, length: 70 } },
  { size: 'L', cm: { shoulder: 48, chest: 112, length: 72 } },
];
const me = (patch: Partial<MyFit>): MyFit => ({
  body: {},
  top: {},
  bottom: {},
  unit: 'cm',
  asked: true,
  estimated: [],
  ...patch,
});

describe('fitForMe', () => {
  it('prefers a piece you own of the same kind, then your body', () => {
    const both = me({ body: { chest: 98 }, top: { chest: 112, shoulder: 48 } });
    expect(fitForMe(tee, both)).toMatchObject({ basis: 'piece', best: 'L', fits: true });
    expect(fitForMe(tee, me({ body: { chest: 98 } }))).toMatchObject({ basis: 'body', best: 'M' });
    // trousers you own say nothing about a top
    expect(fitForMe(tee, me({ body: { chest: 98 }, bottom: { waist: 84 } }))?.basis).toBe('body');
    expect(fitForMe(tee, me({}))).toBeNull();
  });
});

describe('estimateFromHeight', () => {
  it('estimates lengths only, and only for a believable height', () => {
    expect(estimateFromHeight(175)).toEqual({ shoulder: 45.5, sleeve: 58, inseam: 79 });
    expect(estimateFromHeight(30)).toEqual({});
    expect(estimateFromHeight(Number.NaN)).toEqual({});
  });
});

describe('units', () => {
  it('shows inches to a tenth and cm to half a cm', () => {
    expect(toUnit(100, 'in')).toBe(39.4);
    expect(toUnit(100.3, 'cm')).toBe(100.5);
    expect(fromUnit(10, 'in')).toBeCloseTo(25.4);
  });
});
