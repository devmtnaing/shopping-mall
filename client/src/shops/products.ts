// Product adapters: where a shop's products come from. Each returns the same Product shape.
//   static   → listed in plaza.config.ts
//   json-url → fetched from a URL returning Product[] or { products: Product[] }
// Fetched lists are cached in memory for 5 minutes, and the last good copy is kept in
// localStorage so the panel can still show something (clearly marked) when the store is offline.
// We never show made-up demo products.
import type { Shop } from '@plaza/shared/config';

export type Product = {
  id: string;
  name: string;
  price: number;
  compareAt?: number;
  image?: string;
  url?: string;
};

export type ProductsResult =
  | { status: 'none' }
  | { status: 'ok'; items: Product[]; stale?: boolean }
  | { status: 'error' };

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;
type Deps = { fetch: typeof fetch; now: () => number; storage: Storage | null };

const TTL = 5 * 60_000;
const TIMEOUT = 6_000;
const memory = new Map<string, { at: number; items: Product[] }>();

function defaultStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null; // private mode / blocked storage
  }
}

/** Keep only well-formed products; anything else from a remote feed is dropped. */
export function normalize(data: unknown): Product[] {
  const list = Array.isArray(data) ? data : (data as { products?: unknown })?.products;
  if (!Array.isArray(list)) return [];
  const out: Product[] = [];
  list.forEach((raw, i) => {
    const p = raw as Record<string, unknown>;
    const price = Number(p.price);
    if (typeof p.name !== 'string' || !p.name || !Number.isFinite(price) || price < 0) return;
    const compareAt = Number(p.compareAt);
    out.push({
      id: typeof p.id === 'string' || typeof p.id === 'number' ? String(p.id) : String(i),
      name: p.name,
      price,
      compareAt: Number.isFinite(compareAt) && compareAt > price ? compareAt : undefined,
      image: typeof p.image === 'string' ? p.image : undefined,
      url: typeof p.url === 'string' ? p.url : undefined,
    });
  });
  return out;
}

export async function loadProducts(shop: Shop, deps: Partial<Deps> = {}): Promise<ProductsResult> {
  const { fetch: f = globalThis.fetch, now = Date.now, storage = defaultStorage() } = deps;
  const src = shop.products;
  if (!src) return { status: 'none' };
  if (src.adapter === 'static') return { status: 'ok', items: normalize(src.items) };

  const key = `plaza:products:${src.url}`;
  const hit = memory.get(key);
  if (hit && now() - hit.at < TTL) return { status: 'ok', items: hit.items };

  try {
    const res = await f(src.url, {
      signal: AbortSignal.timeout(TIMEOUT),
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const items = normalize(await res.json());
    memory.set(key, { at: now(), items });
    try {
      storage?.setItem(key, JSON.stringify(items));
    } catch {
      /* storage full or blocked: the memory cache still works */
    }
    return { status: 'ok', items };
  } catch {
    const saved = storage?.getItem(key);
    if (saved) {
      try {
        return { status: 'ok', items: normalize(JSON.parse(saved)), stale: true };
      } catch {
        /* corrupt copy: fall through */
      }
    }
    return { status: 'error' };
  }
}

/** For tests: forget the in-memory cache. */
export function clearProductCache() {
  memory.clear();
}

/** "$14.00", "32,000 Ks" … in the mall's currency and the visitor's locale. */
export function formatPrice(value: number, currency: string, locale?: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value);
  } catch {
    return `${value} ${currency}`;
  }
}
