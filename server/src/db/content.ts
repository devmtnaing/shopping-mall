// Reading and seeding mall content. The shape matches MallConfig (shared/src/config.ts), so the
// client consumes the same thing whether it comes from the database or from mall.config.ts.
import type { MallConfig, Shop } from '@shopping-mall/shared/config';
import type { RemovedShop } from '@shopping-mall/shared/rentals';
import type { TransactionSql } from 'postgres';
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

/** The mall's name, for emails. */
export async function mallName(sql: Sql): Promise<string> {
  const [row] = await sql<{ name: string }[]>`select name from mall`;
  return row?.name ?? 'The mall';
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

// ---- writes (host only; each bumps the content version in the same transaction) ---------------

type Tx = TransactionSql;

async function bump(tx: Tx): Promise<number> {
  const [row] = await tx<
    { version: string }[]
  >`update mall set version = version + 1, updated_at = now() returning version`;
  return Number(row?.version);
}

export async function saveMall(sql: Sql, m: MallConfig['mall']): Promise<number> {
  return sql.begin(async (tx) => {
    await tx`update mall set name = ${m.name}, tagline = ${m.tagline}, accent = ${m.accent},
             currency = ${m.currency}, locales = ${m.locales}`;
    return bump(tx);
  });
}

/** Create or replace a shop and its product list. Throws a unique violation if the slot is taken. */
export async function saveShop(sql: Sql, s: Shop): Promise<number> {
  return sql.begin(async (tx) => {
    const jsonUrl = s.products?.adapter === 'json-url' ? s.products.url : null;
    await tx`insert into shops (id, slot, name, tagline, category, bg, accent, logo_url, description, features, links, products_url, sort)
             values (${s.id}, ${s.slot}, ${s.name}, ${s.tagline ?? null}, ${s.category ?? null}, ${s.colors.bg},
                     ${s.colors.accent}, ${s.logo ?? null}, ${s.description ?? null}, ${s.features}, ${tx.json(s.links)},
                     ${jsonUrl}, (select coalesce(max(sort) + 1, 0) from shops))
             on conflict (id) do update set slot = excluded.slot, name = excluded.name, tagline = excluded.tagline,
               category = excluded.category, bg = excluded.bg, accent = excluded.accent, logo_url = excluded.logo_url,
               description = excluded.description, features = excluded.features, links = excluded.links,
               products_url = excluded.products_url, updated_at = now()`;
    await tx`delete from products where shop_id = ${s.id}`;
    if (s.products?.adapter === 'static') {
      for (const [j, p] of s.products.items.entries()) {
        await tx`insert into products (shop_id, id, name, price, compare_at, image_url, url, sort)
                 values (${s.id}, ${p.id}, ${p.name}, ${p.price}, ${p.compareAt ?? null}, ${p.image ?? null}, ${p.url ?? null}, ${j})`;
      }
    }
    return bump(tx);
  });
}

/** Delete a shop (its products go with it). Returns the new version, or null if there was no such shop. */
/**
 * Take a shop out of the mall, keeping a copy (with its products and owner's email) in
 * removed_shops with the reason. Its unit is free again. Returns the new content version, or null
 * if there's no such shop. Pass `tx` to do it inside a transaction already under way.
 */
export async function removeShop(sql: Sql, id: string, reason: string): Promise<number | null> {
  return sql.begin((tx) => removeShopIn(tx, id, reason));
}

export async function removeShopIn(tx: Tx, id: string, reason: string): Promise<number | null> {
  const kept = await tx`insert into removed_shops (shop_id, slot, name, owner_email, reason, shop)
    select s.id, s.slot, s.name, o.email, ${reason}, jsonb_build_object(
      'shop', to_jsonb(s),
      'products', coalesce((select jsonb_agg(to_jsonb(p) order by p.sort) from products p where p.shop_id = s.id), '[]'::jsonb)
    )
    from shops s left join shop_owners o on o.shop_id = s.id
    where s.id = ${id}
    returning id`;
  if (!kept.length) return null;
  await tx`delete from shops where id = ${id}`; // its products and owner go with it
  return bump(tx);
}

/** Shops taken out of the mall, the latest first. */
export async function listRemovedShops(sql: Sql): Promise<RemovedShop[]> {
  const rows = await sql<
    {
      id: string;
      shop_id: string;
      slot: string;
      name: string;
      owner_email: string | null;
      reason: string;
      removed_at: Date;
    }[]
  >`select id, shop_id, slot, name, owner_email, reason, removed_at from removed_shops order by removed_at desc`;
  return rows.map((r) => ({
    id: Number(r.id),
    shop: r.shop_id,
    slot: r.slot,
    name: r.name,
    ...(r.owner_email ? { ownerEmail: r.owner_email } : {}),
    reason: r.reason,
    removedAt: r.removed_at.toISOString(),
  }));
}

/** Put shops in this order (ids not listed keep their place after the listed ones). */
export async function reorderShops(sql: Sql, ids: string[]): Promise<number> {
  return sql.begin(async (tx) => {
    // unlisted shops move after the listed ones, keeping their relative order
    await tx`update shops set sort = sort + ${ids.length} where not (id = any(${ids}))`;
    for (const [i, id] of ids.entries()) await tx`update shops set sort = ${i} where id = ${id}`;
    return bump(tx);
  });
}

/** Make these assets the mall building, or null for the built-in one. */
export async function setMallArt(
  sql: Sql,
  art: { model: string; collision: string; meta: string; navgrid: string } | null,
): Promise<number> {
  return sql.begin(async (tx) => {
    await tx`update mall set art_model = ${art?.model ?? null}, art_collision = ${art?.collision ?? null},
             art_meta = ${art?.meta ?? null}, art_navgrid = ${art?.navgrid ?? null}`;
    return bump(tx);
  });
}

/** Current content version (cheap; used for ETags). */
export async function contentVersion(sql: Sql): Promise<number> {
  const [row] = await sql<{ version: string }[]>`select version from mall`;
  return Number(row?.version ?? 0);
}
