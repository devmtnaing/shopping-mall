// pnpm db:migrate — apply migrations and seed an empty database (DATABASE_URL).
import { parseConfig } from '@shopping-mall/shared/config';
import config from '../../../mall.config.ts';
import { openDatabase } from './index.ts';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Set DATABASE_URL, e.g. postgres://mall:mall@localhost:5432/mall');
  process.exit(1);
}
const sql = await openDatabase(url, parseConfig(config));
console.log('db: up to date');
await sql.end();
