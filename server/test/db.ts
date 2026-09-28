// Test helper: a throwaway schema in the test Postgres (TEST_DATABASE_URL), migrated and dropped after.
import { randomBytes } from 'node:crypto';
import { connect, migrate, type Sql } from '../src/db/db';

export const TEST_DB = process.env.TEST_DATABASE_URL;

export async function freshSchema(): Promise<{ sql: Sql; drop: () => Promise<void> }> {
  if (!TEST_DB) throw new Error('TEST_DATABASE_URL is not set');
  const schema = `t_${randomBytes(4).toString('hex')}`;
  const admin = connect(TEST_DB);
  await admin.unsafe(`create schema ${schema}`);
  const sql = connect(TEST_DB, schema);
  await migrate(sql);
  return {
    sql,
    async drop() {
      await sql.end();
      await admin.unsafe(`drop schema ${schema} cascade`);
      await admin.end();
    },
  };
}
