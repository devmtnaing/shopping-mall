import { describe, expect, it } from 'vitest';
import { columnsOf, fromDraftSizes, parsePasted, ROUND, scale, toDraftSizes } from '../src/admin/sizes';

describe('pasting a size chart', () => {
  it('reads a spreadsheet with a header row, whatever it calls the columns', () => {
    const { rows, columns } = parsePasted(
      'Size\tBust\tWaist\tSleeve length\nS\t86\t70\t60\nM\t92\t76\t61',
      [],
    );
    expect(columns).toEqual(['chest', 'waist', 'sleeve']);
    expect(rows).toEqual([
      { size: 'S', cm: { chest: '86', waist: '70', sleeve: '60' } },
      { size: 'M', cm: { chest: '92', waist: '76', sleeve: '61' } },
    ]);
  });

  it('without a header, fills the columns already shown, in order', () => {
    const { rows } = parsePasted('S 96 68\nM 104 70', ['chest', 'length']);
    expect(rows[1]).toEqual({ size: 'M', cm: { chest: '104', length: '70' } });
  });

  it('takes the middle of a range, and accepts commas for decimals or between cells', () => {
    expect(parsePasted('M\t96-100\t70,5', ['chest', 'length']).rows[0]?.cm).toEqual({
      chest: '98',
      length: '70.5',
    });
    expect(parsePasted('Size,Chest\nL,110', []).rows[0]).toEqual({ size: 'L', cm: { chest: '110' } });
  });

  it('skips columns it doesn’t recognise', () => {
    const { rows, columns } = parsePasted('Size\tColour\tChest\nM\tRed\t100', []);
    expect(columns).toEqual(['chest']);
    expect(rows[0]?.cm).toEqual({ chest: '100' });
  });
});

describe('draft size charts', () => {
  it('round-trips, dropping blank sizes and blank cells', () => {
    const draft = toDraftSizes([{ size: 'M', cm: { chest: 100, length: 70 } }]);
    expect(
      fromDraftSizes([
        ...draft,
        { size: ' ', cm: { chest: '90' } },
        { size: 'L', cm: { chest: '', waist: '88,5' } },
      ]),
    ).toEqual([
      { size: 'M', cm: { chest: 100, length: 70 } },
      { size: 'L', cm: { waist: 88.5 } },
    ]);
    expect(fromDraftSizes([{ size: '', cm: {} }])).toBeUndefined();
  });

  it('converts inches, and doubles flat measurements only where they go round', () => {
    const rows = [{ size: 'M', cm: { chest: '20', length: '28' } }];
    expect(scale(rows, 2.54)[0]?.cm).toEqual({ chest: '51', length: '71' });
    expect(scale(rows, 2, ROUND)[0]?.cm).toEqual({ chest: '40', length: '28' });
  });

  it('shows the columns a chart uses, or a starting set', () => {
    expect(columnsOf([{ size: 'M', cm: { length: '70', chest: '100' } }], ['waist'])).toEqual([
      'chest',
      'length',
    ]);
    expect(columnsOf([], ['waist'])).toEqual(['waist']);
  });
});
