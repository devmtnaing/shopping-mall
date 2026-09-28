import type { Shop } from '@plaza/shared/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearProductCache, formatPrice, loadProducts, normalize } from '../src/shops/products';

const base = {
  id: 's',
  slot: 'w0',
  name: 'S',
  colors: { bg: '#000000', accent: '#ffffff' },
  features: [],
  links: [],
};
const remote: Shop = { ...base, products: { adapter: 'json-url', url: 'https://shop.test/p.json' } };

function memStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}
const ok = (body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));
const down = () => vi.fn(async () => new Response('nope', { status: 503 }));

beforeEach(() => clearProductCache());

describe('normalize', () => {
  it('accepts an array or { products }, and drops malformed items', () => {
    const items = [
      { id: 1, name: 'Cup', price: 12 },
      { name: '', price: 3 },
      { name: 'Free?', price: 'abc' },
      { name: 'Bag', price: '20', compareAt: 25 },
    ];
    expect(normalize(items).map((p) => p.name)).toEqual(['Cup', 'Bag']);
    expect(normalize({ products: items })).toHaveLength(2);
    expect(normalize('garbage')).toEqual([]);
  });

  it('ignores a compare-at price that is not higher than the price', () => {
    expect(normalize([{ name: 'A', price: 10, compareAt: 8 }])[0]?.compareAt).toBeUndefined();
  });
});

describe('loadProducts', () => {
  it('returns static products straight from the config', async () => {
    const shop: Shop = {
      ...base,
      products: { adapter: 'static', items: [{ id: 'a', name: 'A', price: 1 }] },
    };
    expect(await loadProducts(shop)).toEqual({ status: 'ok', items: [{ id: 'a', name: 'A', price: 1 }] });
  });

  it('says so when a shop has no products', async () => {
    expect(await loadProducts({ ...base })).toEqual({ status: 'none' });
  });

  it('fetches a JSON feed and caches it for 5 minutes', async () => {
    const f = ok([{ id: 1, name: 'Cup', price: 12 }]);
    let t = 0;
    const deps = { fetch: f as unknown as typeof fetch, now: () => t, storage: memStorage() };
    expect((await loadProducts(remote, deps)).status).toBe('ok');
    t = 4 * 60_000;
    await loadProducts(remote, deps);
    expect(f).toHaveBeenCalledTimes(1);
    t = 6 * 60_000;
    await loadProducts(remote, deps);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('reports an honest error when the feed is down and nothing is saved', async () => {
    const r = await loadProducts(remote, { fetch: down() as unknown as typeof fetch, storage: memStorage() });
    expect(r.status).toBe('error');
    expect(r).not.toHaveProperty('items');
  });

  it('falls back to the last saved copy, marked stale, when the feed goes down', async () => {
    const storage = memStorage();
    await loadProducts(remote, {
      fetch: ok([{ name: 'Cup', price: 12 }]) as unknown as typeof fetch,
      storage,
    });
    clearProductCache();
    const r = await loadProducts(remote, { fetch: down() as unknown as typeof fetch, storage });
    expect(r).toMatchObject({ status: 'ok', stale: true, items: [{ name: 'Cup' }] });
  });
});

describe('formatPrice', () => {
  it('formats in the mall currency', () => {
    expect(formatPrice(14, 'USD', 'en-US')).toBe('$14.00');
    expect(formatPrice(32000, 'MMK', 'en-US')).toMatch(/32,000/);
  });
});
