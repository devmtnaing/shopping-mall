import { parseConfig } from '@shopping-mall/shared/config';
import type { RentalApplication } from '@shopping-mall/shared/rentals';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import config from '../../mall.config';
import { seedIfEmpty } from '../src/db/content';
import type { Sql } from '../src/db/db';
import { issueHostToken } from '../src/host';
import { startServer } from '../src/server';
import { freshSchema, TEST_DB } from './db';

const SECRET = 'test-secret';
const taken = config.shops[0]?.slot as string;
const apply = (over: Record<string, unknown> = {}) => ({
  slot: 'e3',
  name: 'Mya Mya',
  email: 'mya@example.com',
  business: 'Golden Tea',
  kind: 'cafe',
  about: 'Tea leaf salad and milk tea.',
  ...over,
});

describe.runIf(TEST_DB)('rental applications', () => {
  let db: { sql: Sql; drop: () => Promise<void> };
  let server: Awaited<ReturnType<typeof startServer>>;
  let base = '';
  const host = { Authorization: `Bearer ${issueHostToken(SECRET)}` };
  const post = (body: unknown, ip = '10.0.0.1') =>
    fetch(`${base}/api/rentals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Client-IP': ip },
      body: JSON.stringify(body),
    });
  const list = async () =>
    (await (await fetch(`${base}/api/rentals`, { headers: host })).json()) as RentalApplication[];

  beforeEach(async () => {
    db = await freshSchema();
    await seedIfEmpty(db.sql, parseConfig(config));
    server = await startServer({ port: 0, db: db.sql, hostSecret: SECRET });
    base = `http://127.0.0.1:${server.port}`;
  });
  afterEach(async () => {
    await server.close();
    await db.drop();
  });

  it('takes an application from anyone, and shows it only to the host', async () => {
    const res = await post(apply({ phone: '09 123' }));
    expect(res.status).toBe(201);
    expect((await fetch(`${base}/api/rentals`)).status).toBe(401);
    const [a] = await list();
    expect(a).toMatchObject({
      slot: 'e3',
      business: 'Golden Tea',
      kind: 'cafe',
      phone: '09 123',
      status: 'pending',
    });
    // not mall content: the version doesn't move
    expect((await fetch(`${base}/api/content`)).headers.get('etag')).toBe('"v1"');
  });

  it('rejects bad fields with their paths, and units that are taken', async () => {
    const bad = await post(apply({ email: 'nope', business: '', kind: 'casino' }));
    expect(bad.status).toBe(400);
    const body = (await bad.json()) as { fields: { path: string }[] };
    expect(body.fields.map((f) => f.path).sort()).toEqual(['business', 'email', 'kind']);
    expect((await post(apply({ slot: taken }))).status).toBe(409);
    expect(await list()).toEqual([]);
  });

  it('keeps nothing a bot sends through the honeypot', async () => {
    expect((await post(apply({ website: 'http://spam.example' }))).status).toBe(201);
    expect(await list()).toEqual([]);
  });

  it('limits applications per address', async () => {
    for (let i = 0; i < 3; i++) expect((await post(apply())).status).toBe(201);
    expect((await post(apply())).status).toBe(429);
    expect((await post(apply(), '10.0.0.2')).status).toBe(201);
  });

  it('approving one turns down the others for the same unit only', async () => {
    await post(apply({ business: 'A' }), '10.0.0.1');
    await post(apply({ business: 'B' }), '10.0.0.2');
    await post(apply({ business: 'C', slot: 'u-e0' }), '10.0.0.3');
    const a = (await list()).find((r) => r.business === 'A') as RentalApplication;
    const res = await fetch(`${base}/api/rentals/${a.id}/approve`, { method: 'POST', headers: host });
    expect(res.status).toBe(200);
    const by = Object.fromEntries((await list()).map((r) => [r.business, r.status]));
    expect(by).toEqual({ A: 'approved', B: 'rejected', C: 'pending' });
    // decided once
    expect(
      (await fetch(`${base}/api/rentals/${a.id}/reject`, { method: 'POST', headers: host })).status,
    ).toBe(409);
    expect((await fetch(`${base}/api/rentals/${a.id}`, { method: 'DELETE', headers: host })).status).toBe(
      200,
    );
    expect((await list()).map((r) => r.business).sort()).toEqual(['B', 'C']);
    expect((await fetch(`${base}/api/rentals/999/approve`, { method: 'POST', headers: host })).status).toBe(
      404,
    );
  });
});
