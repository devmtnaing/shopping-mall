import { parseConfig, type Shop } from '@shopping-mall/shared/config';
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
  /** What the server emailed. */
  let mail: Email[] = [];
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
    mail = [];
    server = await startServer({
      port: 0,
      db: db.sql,
      hostSecret: SECRET,
      mailer: { name: 'test', send: async (email) => void mail.push(email) },
      publicUrl: 'https://mall.example',
    });
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

  const approve = async (business: string) => {
    const a = (await list()).find((r) => r.business === business) as RentalApplication;
    const res = await fetch(`${base}/api/rentals/${a.id}/approve`, { method: 'POST', headers: host });
    expect(res.status).toBe(200);
    return (await res.json()) as RentalApplication & {
      shop?: string;
      invite?: { token: string; emailed?: boolean };
      inviteError?: string;
    };
  };
  const shops = async () =>
    ((await (await fetch(`${base}/api/content`)).json()) as { config: { shops: Shop[] } }).config.shops;

  it('approving opens the shop with what they sent, and emails them a link to look after it', async () => {
    await post(apply());
    const done = await approve('Golden Tea');
    expect(done).toMatchObject({ status: 'approved', shop: 'golden-tea', invite: { emailed: true } });
    expect((await shops()).find((s) => s.slot === 'e3')).toMatchObject({
      id: 'golden-tea',
      name: 'Golden Tea',
      category: 'Food & drink',
      description: 'Tea leaf salad and milk tea.',
    });
    expect(mail).toHaveLength(1);
    expect(mail[0]).toMatchObject({ to: 'mya@example.com', subject: 'Set up Golden Tea in the mall' });
    expect(mail[0]?.text).toContain(`https://mall.example/admin/?invite=${done.invite?.token}`);
    const owners = (await (await fetch(`${base}/api/owners`, { headers: host })).json()) as unknown[];
    expect(owners).toMatchObject([{ shop: 'golden-tea', email: 'mya@example.com', status: 'invited' }]);
  });

  it('gives a second shop with the same name its own id, and says when its email already has a shop', async () => {
    await post(apply(), '10.0.0.1');
    await approve('Golden Tea');
    await post(apply({ slot: 'u-e0', business: 'Golden  Tea!' }), '10.0.0.2');
    const second = await approve('Golden  Tea!');
    expect(second.shop).toBe('golden-tea-2');
    expect(second.invite).toBeUndefined();
    expect(second.inviteError).toContain('already looks after "golden-tea"');
    expect(mail).toHaveLength(1);
  });

  it('leaves a unit alone if the host has put a shop in it meanwhile', async () => {
    await post(apply());
    const theirs = { ...(config.shops[0] as Shop), id: 'pop-up', slot: 'e3' };
    const put = await fetch(`${base}/api/shops/pop-up`, {
      method: 'PUT',
      headers: { ...host, 'Content-Type': 'application/json' },
      body: JSON.stringify(theirs),
    });
    expect(put.status).toBe(200);
    const done = await approve('Golden Tea');
    expect(done.status).toBe('approved');
    expect(done.shop).toBeUndefined();
    expect((await shops()).filter((s) => s.slot === 'e3').map((s) => s.id)).toEqual(['pop-up']);
    expect(mail).toEqual([]);
  });
});
