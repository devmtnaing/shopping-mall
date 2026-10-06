import { randomBytes } from 'node:crypto';
import { parseConfig, type Shop } from '@shopping-mall/shared/config';
import { OWNER_LIMITS } from '@shopping-mall/shared/owners';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import config from '../../mall.config';
import { seedIfEmpty } from '../src/db/content';
import type { Sql } from '../src/db/db';
import { issueHostToken } from '../src/host';
import type { Email, Mailer } from '../src/mail';
import { startServer } from '../src/server';
import { Storage } from '../src/storage';
import { freshSchema, TEST_DB } from './db';

const S3 = process.env.TEST_S3_ENDPOINT;
const SECRET = 'test-secret';
const host = { Authorization: `Bearer ${issueHostToken(SECRET)}`, 'Content-Type': 'application/json' };
const png = (seed: number) =>
  new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, seed, seed >> 8, 2, 3]);
const seeded = parseConfig(config);
const mine = seeded.shops[0] as Shop;
const other = seeded.shops[1] as Shop;

describe.runIf(TEST_DB && S3)('shop owners', () => {
  let db: { sql: Sql; drop: () => Promise<void> };
  let server: Awaited<ReturnType<typeof startServer>>;
  let base = '';
  let ip = 0;
  /** What the server emailed, and whether the next send fails. */
  let mail: Email[] = [];
  let mailFails = false;
  const mailer: Mailer = {
    name: 'test',
    async send(email) {
      if (mailFails) throw new Error('provider down');
      mail.push(email);
    },
  };
  const call = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
    fetch(base + path, {
      method,
      // a different address per call, so the sign-in rate limit doesn't get in the way
      headers: { 'Content-Type': 'application/json', 'X-Client-IP': `10.0.0.${++ip % 250}`, ...headers },
      body: body === undefined ? undefined : body instanceof Uint8Array ? body : JSON.stringify(body),
    });
  const invite = async (shop = mine.id, email = 'owner@example.com') => {
    const res = await call('POST', `/api/shops/${shop}/owner`, { email }, host);
    expect(res.status).toBe(201);
    return ((await res.json()) as { token: string }).token;
  };
  /** Invite, set a password, and return the owner's Authorization header. */
  const owner = async () => {
    const token = await invite();
    const res = await call('POST', '/api/owner/password', { token, password: 'tea-leaf-salad' });
    expect(res.status).toBe(200);
    return { Authorization: `Bearer ${((await res.json()) as { token: string }).token}` };
  };
  const shopNow = async (id = mine.id) =>
    ((await (await fetch(`${base}/api/content`)).json()) as { config: { shops: Shop[] } }).config.shops.find(
      (s) => s.id === id,
    ) as Shop;

  beforeEach(async () => {
    db = await freshSchema();
    await seedIfEmpty(db.sql, seeded);
    const storage = new Storage({
      endpoint: S3 as string,
      bucket: `t-${randomBytes(4).toString('hex')}`,
      accessKeyId: process.env.TEST_S3_KEY ?? 'mall',
      secretAccessKey: process.env.TEST_S3_SECRET ?? 'mall-secret',
    });
    await storage.ensureBucket();
    mail = [];
    mailFails = false;
    server = await startServer({
      port: 0,
      db: db.sql,
      hostSecret: SECRET,
      storage,
      mailer,
      publicUrl: 'https://mall.example',
    });
    base = `http://127.0.0.1:${server.port}`;
  });
  afterEach(async () => {
    await server.close();
    await db.drop();
  });

  it('emails the set-password link to the new owner, and says when it couldn’t', async () => {
    const res = await call('POST', `/api/shops/${mine.id}/owner`, { email: 'owner@example.com' }, host);
    const body = (await res.json()) as { token: string; emailed: boolean };
    expect(body.emailed).toBe(true);
    expect(mail).toHaveLength(1);
    expect(mail[0]?.to).toBe('owner@example.com');
    expect(mail[0]?.subject).toContain(mine.name);
    expect(mail[0]?.text).toContain(`https://mall.example/admin/?invite=${body.token}`);

    mailFails = true;
    const again = await call('POST', `/api/shops/${mine.id}/owner`, { email: 'owner@example.com' }, host);
    expect(again.status).toBe(201); // the link is still made, for the host to send by hand
    expect(await again.json()).toMatchObject({ emailed: false, mailError: expect.any(String) });
  });

  it('greets the owner by the name they applied with, and says which mall it is', async () => {
    await db.sql`insert into rental_applications (slot, name, email, business, about, kind, status)
      values (${mine.slot}, 'Aye Aye', 'Owner@Example.com', ${mine.name}, 'x', 'cafe', 'approved')`;
    await call('POST', `/api/shops/${mine.id}/owner`, { email: 'owner@example.com' }, host);
    expect(mail[0]?.text).toMatch(/^Hi Aye Aye,/);
    expect(mail[0]?.subject).toBe(`${mine.name} is ready at ${seeded.mall.name}`);
    expect(mail[0]?.text).toContain('https://mall.example/admin/');
    // someone else's address: no name to go by
    await call('POST', `/api/shops/${mine.id}/owner`, { email: 'other@example.com' }, host);
    expect(mail[1]?.text).toMatch(/^Hello,/);
  });

  it('invites by a one-time link, then signs in with email and password', async () => {
    expect((await call('POST', `/api/shops/${mine.id}/owner`, { email: 'x@example.com' })).status).toBe(401);
    const token = await invite();
    const info = await call('GET', `/api/owner/invite?token=${token}`);
    expect(await info.json()).toMatchObject({ shop: mine.id, email: 'owner@example.com', name: mine.name });
    expect((await call('POST', '/api/owner/password', { token, password: 'short' })).status).toBe(400);
    expect((await call('POST', '/api/owner/password', { token, password: 'tea-leaf-salad' })).status).toBe(
      200,
    );
    // the link works once
    expect((await call('GET', `/api/owner/invite?token=${token}`)).status).toBe(404);
    expect((await call('POST', '/api/owner/password', { token, password: 'another-one' })).status).toBe(404);

    const bad = await call('POST', '/api/owner/sign-in', {
      email: 'owner@example.com',
      password: 'nope-nope',
    });
    expect(bad.status).toBe(401);
    const unknown = await call('POST', '/api/owner/sign-in', { email: 'who@example.com', password: 'x' });
    expect(unknown.status).toBe(401);
    const ok = await call('POST', '/api/owner/sign-in', {
      email: 'OWNER@example.com',
      password: 'tea-leaf-salad',
    });
    expect(ok.status).toBe(200);
    const { token: session } = (await ok.json()) as { token: string };
    const me = await call('GET', '/api/owner/me', undefined, { Authorization: `Bearer ${session}` });
    expect(await me.json()).toMatchObject({ shop: mine.id, photos: 0, limits: OWNER_LIMITS });

    const list = (await (await call('GET', '/api/owners', undefined, host)).json()) as unknown[];
    expect(list).toEqual([{ shop: mine.id, email: 'owner@example.com', status: 'active' }]);
  });

  it('lets an owner change their own shop only, within the limits', async () => {
    const auth = await owner();
    const put = (shop: Shop) => call('PUT', `/api/shops/${shop.id}`, shop, auth);
    const res = await put({ ...mine, tagline: 'Fresh every morning', slot: 'e5' });
    expect(res.status).toBe(200);
    const now = await shopNow();
    expect(now.tagline).toBe('Fresh every morning');
    expect(now.slot).toBe(mine.slot); // the unit stays the host's

    expect((await put({ ...other, tagline: 'mine now' })).status).toBe(403);
    expect((await call('PUT', '/api/mall', seeded.mall, auth)).status).toBe(403);
    expect((await call('GET', '/api/rentals', undefined, auth)).status).toBe(403);

    const items = Array.from({ length: OWNER_LIMITS.products + 1 }, (_, i) => ({
      id: `p${i}`,
      name: `Thing ${i}`,
      price: 1,
    }));
    const tooMany = await put({ ...mine, products: { adapter: 'static', items } });
    expect(tooMany.status).toBe(400);
    const feed = await put({ ...mine, products: { adapter: 'json-url', url: 'https://example.com/p.json' } });
    expect(feed.status).toBe(400);
    const hotlink = await put({ ...mine, logo: 'https://elsewhere.example/logo.png' });
    expect(((await hotlink.json()) as { fields: { path: string }[] }).fields[0]?.path).toBe('logo');
  });

  it('caps photos, and clears the ones a saved shop no longer uses', async () => {
    const auth = await owner();
    const upload = (seed: number, kind = 'product-image') =>
      call('POST', `/api/assets?kind=${kind}`, png(seed), auth);
    expect((await upload(1, 'mall-model')).status).toBe(403);
    expect((await upload(1, 'logo')).status).toBe(201);
    const big = new Uint8Array(OWNER_LIMITS.photoBytes + 1);
    big.set(png(2));
    expect(
      (await upload(0, 'logo').then(() => call('POST', '/api/assets?kind=logo', big, auth))).status,
    ).toBe(413);

    const urls: string[] = [];
    for (let i = 10; urls.length < OWNER_LIMITS.photos - 2; i++)
      urls.push(((await (await upload(i)).json()) as { url: string }).url);
    // full (the 8th was the second logo above): fresh uploads aren't cleared, so it says so
    expect((await upload(99)).status).toBe(409);

    // saving a shop that uses one photo clears the rest
    const items = [{ id: 'p0', name: 'Tea', price: 2, image: urls[0] as string }];
    expect(
      (await call('PUT', `/api/shops/${mine.id}`, { ...mine, products: { adapter: 'static', items } }, auth))
        .status,
    ).toBe(200);
    const me = (await (await call('GET', '/api/owner/me', undefined, auth)).json()) as { photos: number };
    expect(me.photos).toBe(1);
    expect((await upload(99)).status).toBe(201);
  });

  it('a new invite or removing the owner signs them out', async () => {
    const auth = await owner();
    expect((await call('GET', '/api/owner/me', undefined, auth)).status).toBe(200);
    await invite(); // the host sends a fresh link (say they forgot their password)
    expect((await call('GET', '/api/owner/me', undefined, auth)).status).toBe(401);

    const again = await owner();
    expect((await call('DELETE', `/api/shops/${mine.id}/owner`, undefined, host)).status).toBe(200);
    expect((await call('GET', '/api/owner/me', undefined, again)).status).toBe(401);
  });

  it('one shop per email', async () => {
    await invite(mine.id, 'owner@example.com');
    const res = await call('POST', `/api/shops/${other.id}/owner`, { email: 'Owner@Example.com' }, host);
    expect(res.status).toBe(409);
  });
});
