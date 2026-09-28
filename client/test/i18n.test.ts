import { describe, expect, it } from 'vitest';
import { en, type Key } from '../src/i18n/en';
import { my } from '../src/i18n/my';
import { translate } from '../src/i18n/translate';

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('translate', () => {
  it('fills placeholders', () => {
    expect(translate(undefined, 'landing.enterAs', { name: 'Mya' })).toBe('Enter as Mya →');
    expect(translate(my, 'landing.enterAs', { name: 'Mya' })).toContain('Mya');
  });

  it('falls back to English for a missing string', () => {
    expect(translate({}, 'dock.shops')).toBe('Shops');
  });
});

describe('Burmese table', () => {
  it('translates every English string', () => {
    const missing = (Object.keys(en) as Key[]).filter((k) => !my[k]);
    expect(missing).toEqual([]);
  });

  it('keeps the same {placeholders} as English', () => {
    for (const k of Object.keys(en) as Key[]) {
      const tr = my[k];
      if (tr) expect(placeholders(tr), k).toEqual(placeholders(en[k]));
    }
  });
});
