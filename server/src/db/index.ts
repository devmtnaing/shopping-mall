// Content database: connect, migrate, seed from mall.config.ts on first start.
import type { MallConfig } from '@shopping-mall/shared/config';
import { seedIfEmpty } from './content.ts';
import { connect, migrate, type Sql } from './db.ts';

export { loadContent } from './content.ts';
export type { Sql } from './db.ts';

export async function openDatabase(url: string, seed: MallConfig, log = console.log): Promise<Sql> {
  const sql = connect(url);
  const applied = await migrate(sql);
  if (applied.length) log(`db: applied ${applied.join(', ')}`);
  if (await seedIfEmpty(sql, seed)) log('db: seeded the mall from mall.config.ts');
  return sql;
}
