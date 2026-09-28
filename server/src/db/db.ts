// Postgres connection and migrations. Migrations are numbered .sql files in server/migrations,
// each applied once inside a transaction and recorded in the `migrations` table.
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import postgres from 'postgres';

export type Sql = ReturnType<typeof postgres>;

const MIGRATIONS = resolve(import.meta.dirname, '../../migrations');

/** Connect to Postgres. `schema` puts every table in that schema (tests use a throwaway one). */
export function connect(url: string, schema?: string): Sql {
  return postgres(url, {
    max: 5,
    idle_timeout: 30,
    onnotice: () => {},
    ...(schema ? { connection: { search_path: schema } } : {}),
  });
}

/** Apply any migrations not yet recorded. Safe to run on every start. Returns the ones applied. */
export async function migrate(sql: Sql): Promise<string[]> {
  await sql`create table if not exists migrations (id text primary key, applied_at timestamptz not null default now())`;
  const done = new Set((await sql<{ id: string }[]>`select id from migrations`).map((r) => r.id));
  const files = readdirSync(MIGRATIONS)
    .filter((f) => /^\d+_.+\.sql$/.test(f))
    .sort();
  const applied: string[] = [];
  for (const file of files) {
    if (done.has(file)) continue;
    const text = readFileSync(resolve(MIGRATIONS, file), 'utf8');
    await sql.begin(async (tx) => {
      await tx.unsafe(text);
      await tx`insert into migrations (id) values (${file})`;
    });
    applied.push(file);
  }
  return applied;
}
