import { parseConfig } from '@shopping-mall/shared/config';
import { afterEach, describe, expect, it } from 'vitest';
import config from '../../mall.config';
import { loadContent, seedIfEmpty } from '../src/db/content';
import { migrate, type Sql } from '../src/db/db';
import { freshSchema, TEST_DB } from './db';

const seed = parseConfig(config);
const assetUrl = (id: string) => `/assets/${id}`;

// Needs a real Postgres: `pnpm db:up` locally, a service container in CI.
describe.runIf(TEST_DB)('content database', () => {
  let db: { sql: Sql; drop: () => Promise<void> } | null = null;
  afterEach(async () => {
    await db?.drop();
    db = null;
  });

  it('migrations are idempotent', async () => {
    db = await freshSchema();
    expect(await migrate(db.sql)).toEqual([]); // freshSchema already migrated
    const tables =
      await db.sql`select table_name from information_schema.tables where table_schema = current_schema() order by 1`;
    expect(tables.map((t) => t.table_name)).toEqual([
      'assets',
      'chat',
      'mall',
      'migrations',
      'products',
      'rental_applications',
      'shop_owners',
      'shops',
    ]);
  });

  it('seeds an empty database once, and a second seed does nothing', async () => {
    db = await freshSchema();
    expect(await seedIfEmpty(db.sql, seed)).toBe(true);
    expect(await seedIfEmpty(db.sql, seed)).toBe(false);
    const rows = await db.sql<{ count: number }[]>`select count(*)::int as count from shops`;
    expect(rows[0]?.count).toBe(seed.shops.length);
  });

  it('reads back exactly what mall.config.ts describes', async () => {
    db = await freshSchema();
    await seedIfEmpty(db.sql, seed);
    const { version, config: loaded } = await loadContent(db.sql, assetUrl);
    expect(version).toBe(1);
    expect(loaded.mall).toEqual(seed.mall);
    expect(loaded.shops).toEqual(seed.shops);
    // and it passes the same validation the config file does
    expect(() => parseConfig(loaded)).not.toThrow();
  });

  it('refuses two shops in one slot, and removes products with their shop', async () => {
    db = await freshSchema();
    await seedIfEmpty(db.sql, seed);
    const clash = db.sql`insert into shops (id, slot, name, bg, accent) values ('dupe', 'w0', 'Dupe', '#000000', '#ffffff')`;
    await expect(clash).rejects.toThrow(/unique/);
    await db.sql`delete from shops where id = 'lumen-coffee'`;
    const rows = await db.sql<
      { count: number }[]
    >`select count(*)::int as count from products where shop_id = 'lumen-coffee'`;
    expect(rows[0]?.count).toBe(0);
  });
});
