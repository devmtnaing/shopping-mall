// Reading and seeding mall content. The shape matches MallConfig (shared/src/config.ts), so the
// client consumes the same thing whether it comes from the database or from mall.config.ts.
import type { MallConfig, Shop } from '@shopping-mall/shared/config';
import type { Sql } from './db.ts';

/** Public URL of an uploaded asset (the storage layer arrives in T-703). */
export type AssetUrl = (assetId: string) => string;

type ShopRow = {
  id: string;
  slot: string;
  name: string;
  tagline: string | null;
  category: string | null;
  bg: string;
  accent: string;
  logo_asset: string | null;
  logo_url: string | null;
  description: string | null;
  features: string[];
  links: { label: string; url: string }[];
  products_url: string | null;
};
type ProductRow = {
  shop_id: string;
  id: string;
  name: string;
  price: string;
  compare_at: string | null;
  image_asset: string | null;
  image_url: string | null;
  url: string | null;
};

/** If the database has no mall yet, import it from the config file. Returns true if it seeded. */
export async function seedIfEmpty(sql: Sql, config: MallConfig): Promise<boolean> {
  return sql.begin(async (tx) => {
    // lock so two servers starting at once can't both seed
    await tx`lock table mall in exclusive mode`;
    const [existing] = await tx`select 1 from mall`;
    if (existing) return false;
    const m = config.mall;
    await tx`insert into mall (name, tagline, accent, currency, locales)
             values (${m.name}, ${m.tagline}, ${m.accent}, ${m.currency}, ${m.locales})`;
    for (const [i, s] of config.shops.entries()) {
      await tx`insert into shops (id, slot, name, tagline, category, bg, accent, logo_url, description, features, links, products_url, sort)
               values (${s.id}, ${s.slot}, ${s.name}, ${s.tagline ?? null}, ${s.category ?? null}, ${s.colors.bg},
                       ${s.colors.accent}, ${s.logo ?? null}, ${s.description ?? null}, ${s.features},
                       ${tx.json(s.links)}, ${s.products?.adapter === 'json-url' ? s.products.url : null}, ${i})`;
      if (s.products?.adapter !== 'static') continue;
      for (const [j, p] of s.products.items.entries()) {
        await tx`insert into products (shop_id, id, name, price, compare_at, image_url, url, sort)
                 values (${s.id}, ${p.id}, ${p.name}, ${p.price}, ${p.compareAt ?? null}, ${p.image ?? null}, ${p.url ?? null}, ${j})`;
      }
    }
    return true;
  });
}

/** The whole mall as the client sees it, plus the content version (for caching and live updates). */
export async function loadContent(
  sql: Sql,
  assetUrl: AssetUrl,
): Promise<{ version: number; config: MallConfig }> {
  const [mall] = await sql<
    { name: string; tagline: string; accent: string; currency: string; locales: string[]; version: string }[]
  >`select name, tagline, accent, currency, locales, version from mall`;
  if (!mall) throw new Error('content: the mall has not been seeded');
  const shops = await sql<ShopRow[]>`select * from shops order by sort, id`;
  const products = await sql<ProductRow[]>`select * from products order by shop_id, sort, id`;

  const byShop = new Map<string, ProductRow[]>();
  for (const p of products) byShop.set(p.shop_id, [...(byShop.get(p.shop_id) ?? []), p]);

  const toShop = (s: ShopRow): Shop => ({
    id: s.id,
    slot: s.slot,
    name: s.name,
    ...(s.tagline ? { tagline: s.tagline } : {}),
    ...(s.category ? { category: s.category } : {}),
    colors: { bg: s.bg, accent: s.accent },
    ...(s.logo_asset ? { logo: assetUrl(s.logo_asset) } : s.logo_url ? { logo: s.logo_url } : {}),
    ...(s.description ? { description: s.description } : {}),
    features: s.features,
    links: s.links,
    ...(s.products_url
      ? { products: { adapter: 'json-url' as const, url: s.products_url } }
      : byShop.has(s.id)
        ? {
            products: {
              adapter: 'static' as const,
              items: (byShop.get(s.id) ?? []).map((p) => ({
                id: p.id,
                name: p.name,
                price: Number(p.price),
                ...(p.compare_at !== null ? { compareAt: Number(p.compare_at) } : {}),
                ...(p.image_asset
                  ? { image: assetUrl(p.image_asset) }
                  : p.image_url
                    ? { image: p.image_url }
                    : {}),
                ...(p.url ? { url: p.url } : {}),
              })),
            },
          }
        : {}),
  });

  return {
    version: Number(mall.version),
    config: {
      mall: {
        name: mall.name,
        tagline: mall.tagline,
        accent: mall.accent,
        currency: mall.currency,
        locales: mall.locales,
      },
      shops: shops.map(toShop),
      outfits: [],
    },
  };
}
