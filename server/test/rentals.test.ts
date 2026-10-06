import { parseConfig } from '@shopping-mall/shared/config';
import type { RentalApplication } from '@shopping-mall/shared/rentals';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import config from '../../mall.config';
import { seedIfEmpty } from '../src/db/content';
import type { Sql } from '../src/db/db';
import { issueHostToken } from '../src/host';
import type { Email } from '../src/mail';
import { startServer } from '../src/server';
import { freshSchema, TEST_DB } from './db';
import { TestClient } from './helpers';

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
    for (let i = 0; i < 3; i++) expect((await post(apply({ slot: `e${i + 3}` }))).status).toBe(201);
    expect((await post(apply({ slot: 'e9' }))).status).toBe(429);
    expect((await post(apply({ slot: 'e9' }), '10.0.0.2')).status).toBe(201);
  });

  it('lets the first to apply hold a unit, and says so to everyone else', async () => {
    const requested = async () =>
      ((await (await fetch(`${base}/api/rentals/requested`)).json()) as { slots: string[] }).slots;
    expect(await requested()).toEqual([]);
    expect((await post(apply({ business: 'A' }), '10.0.0.1')).status).toBe(201);
    const second = await post(apply({ business: 'B' }), '10.0.0.2');
    expect(second.status).toBe(409);
    expect(await second.json()).toMatchObject({ reason: 'requested' });
    expect(await requested()).toEqual(['e3']);
    // turned down: the unit opens again
    const a = (await list())[0] as RentalApplication;
    await fetch(`${base}/api/rentals/${a.id}/reject`, { method: 'POST', headers: host });
    expect(await requested()).toEqual([]);
    expect((await post(apply({ business: 'B' }), '10.0.0.2')).status).toBe(201);
  });

  it('tells everyone in the mall when a unit is requested and when it frees up', async () => {
    const visitor = new TestClient(server.port);
    await visitor.join('Visitor');
    await post(apply());
    expect(await visitor.waitFor((m) => m.t === 'requested')).toEqual({ t: 'requested', slots: ['e3'] });
    // someone arriving later is told on joining
    const late = new TestClient(server.port);
    await late.join('Late');
    expect(await late.waitFor((m) => m.t === 'requested')).toEqual({ t: 'requested', slots: ['e3'] });
    late.close();
    const a = (await list())[0] as RentalApplication;
    await fetch(`${base}/api/rentals/${a.id}/reject`, { method: 'POST', headers: host });
    expect(
      await visitor.waitFor((m) => m.t === 'requested' && (m as { slots: string[] }).slots.length === 0),
    ).toEqual({ t: 'requested', slots: [] });
    visitor.close();
  });

  it('keeps exactly one when several apply for the same unit at once', async () => {
    const results = await Promise.all(
      [1, 2, 3, 4, 5].map((i) => post(apply({ business: `Shop ${i}` }), `10.0.1.${i}`)),
    );
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([201, 409, 409, 409, 409]);
    for (const r of results.filter((x) => x.status === 409))
      expect(await r.json()).toMatchObject({ reason: 'requested' });
    expect(await list()).toHaveLength(1);
  });

  it('says a unit is taken, not requested, once a shop is in it', async () => {
    const res = await post(apply({ slot: taken }));
    expect(await res.json()).toMatchObject({ reason: 'taken' });
  });

  it('emails the applicant when they’re approved, and says when it couldn’t', async () => {
    const mail: Email[] = [];
    let fails = false;
    await server.close();
    server = await startServer({
      port: 0,
      db: db.sql,
      hostSecret: SECRET,
      publicUrl: 'https://mall.example',
      mailer: {
        name: 'test',
        async send(e) {
          if (fails) throw new Error('provider down');
          mail.push(e);
          return {};
        },
      },
    });
    base = `http://127.0.0.1:${server.port}`;
    await post(apply());
    await post(apply({ slot: 'u-e0', business: 'Other' }), '10.0.0.2');
    const [a, b] = (await list()).sort((x, y) => x.id - y.id) as RentalApplication[];
    const res = await fetch(`${base}/api/rentals/${a?.id}/approve`, { method: 'POST', headers: host });
    expect(await res.json()).toMatchObject({ status: 'approved', emailed: true });
    expect(mail).toHaveLength(1);
    expect(mail[0]).toMatchObject({ to: 'mya@example.com' });
    expect(mail[0]?.subject).toContain('Golden Tea');
    expect(mail[0]?.text).toMatch(/^Hi Mya Mya,/);
    // turning someone down sends nothing; a failed send still approves, and says so
    await fetch(`${base}/api/rentals/${b?.id}/reject`, { method: 'POST', headers: host });
    expect(mail).toHaveLength(1);
    await post(apply({ slot: 'u-e1', business: 'Third' }), '10.0.0.3');
    const c = (await list()).find((r) => r.business === 'Third') as RentalApplication;
    fails = true;
    const failed = await fetch(`${base}/api/rentals/${c.id}/approve`, { method: 'POST', headers: host });
    expect(await failed.json()).toMatchObject({
      status: 'approved',
      emailed: false,
      mailError: expect.any(String),
    });
  });

  it('approving one leaves other units’ applications alone', async () => {
    await post(apply({ business: 'A' }), '10.0.0.1');
    await post(apply({ business: 'C', slot: 'u-e0' }), '10.0.0.3');
    const a = (await list()).find((r) => r.business === 'A') as RentalApplication;
    const res = await fetch(`${base}/api/rentals/${a.id}/approve`, { method: 'POST', headers: host });
    expect(res.status).toBe(200);
    const by = Object.fromEntries((await list()).map((r) => [r.business, r.status]));
    expect(by).toEqual({ A: 'approved', C: 'pending' });
    // decided once
    expect(
      (await fetch(`${base}/api/rentals/${a.id}/reject`, { method: 'POST', headers: host })).status,
    ).toBe(409);
    expect((await fetch(`${base}/api/rentals/${a.id}`, { method: 'DELETE', headers: host })).status).toBe(
      200,
    );
    expect((await list()).map((r) => r.business).sort()).toEqual(['C']);
    expect((await fetch(`${base}/api/rentals/999/approve`, { method: 'POST', headers: host })).status).toBe(
      404,
    );
  });
});
