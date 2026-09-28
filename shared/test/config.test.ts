import { describe, expect, it } from 'vitest';
import config from '../../mall.config';
import { parseConfig } from '../src/config';

const shop = { id: 'a', slot: 'w0', name: 'A', colors: { bg: '#000000', accent: '#ffffff' } };

describe('parseConfig', () => {
  it('accepts the example mall.config.ts', () => {
    expect(parseConfig(config).shops.length).toBeGreaterThan(0);
  });

  it('fills defaults', () => {
    const cfg = parseConfig({ mall: { name: 'M' }, shops: [shop] });
    expect(cfg.mall.accent).toBe('#e2b857');
    expect(cfg.shops[0]?.links).toEqual([]);
  });

  it('reports the path of a bad colour', () => {
    const bad = { mall: { name: 'M' }, shops: [{ ...shop, colors: { bg: 'red', accent: '#ffffff' } }] };
    expect(() => parseConfig(bad)).toThrow(/shops\[0\]\.colors\.bg/);
  });

  it('rejects two shops in one slot', () => {
    const two = { mall: { name: 'M' }, shops: [shop, { ...shop, id: 'b' }] };
    expect(() => parseConfig(two)).toThrow(/slot "w0" is already used by shop "a"/);
  });
});
