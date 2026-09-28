import type { Shop } from '@shopping-mall/shared/config';
import { describe, expect, it } from 'vitest';
import { fold, searchShops } from '../src/shops/search';

const shop = (id: string, name: string, extra: Partial<Shop> = {}): Shop => ({
  id,
  slot: id,
  name,
  colors: { bg: '#000000', accent: '#ffffff' },
  features: [],
  links: [],
  ...extra,
});
const shops = [
  shop('lumen', 'Lumen Coffee', { category: 'Food & drink', tagline: 'Small-batch roasts' }),
  shop('paper', 'Paper Trail', { category: 'Books' }),
  shop('shwe', 'Shwe Tea House', { tagline: 'မြန်မာ လက်ဖက်ရည်ဆိုင်', category: 'Food & drink' }),
  shop('cafe', 'Café Olé'),
];
const ids = (q: string) => searchShops(shops, q).map((s) => s.id);

describe('searchShops', () => {
  it('returns every shop in config order for an empty query', () => {
    expect(ids('')).toEqual(['lumen', 'paper', 'shwe', 'cafe']);
  });

  it('ranks name prefixes above other matches', () => {
    expect(ids('tea')[0]).toBe('shwe');
    expect(ids('p')[0]).toBe('paper');
  });

  it('matches categories and taglines', () => {
    expect(ids('food')).toEqual(['lumen', 'shwe']);
    expect(ids('roasts')).toEqual(['lumen']);
  });

  it('ignores case and accents', () => {
    expect(ids('CAFE OLE')).toEqual(['cafe']);
    expect(fold('  Café   Olé ')).toBe('cafe ole');
  });

  it('finds Burmese text', () => {
    expect(ids('လက်ဖက်ရည်')).toEqual(['shwe']);
  });

  it('tolerates skipped letters', () => {
    expect(ids('lmncof')).toEqual(['lumen']);
  });

  it('returns nothing for nonsense', () => {
    expect(ids('zzzq')).toEqual([]);
  });
});
