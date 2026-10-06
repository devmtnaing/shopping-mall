import { parseConfig } from '@shopping-mall/shared/config';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import config from '../../mall.config';
import { seedIfEmpty } from '../src/db/content';
import type { Sql } from '../src/db/db';
import { issueHostToken } from '../src/host';
import { startServer } from '../src/server';
import { freshSchema, TEST_DB } from './db';
import { TestClient } from './helpers';

const SECRET = 'test-secret';
const shop = {
  id: 'new-shop',
  slot: 'e3',
  name: 'New Shop',
  colors: { bg: '#101010', accent: '#ff8800' },
  features: ['Brand new'],
  links: [{ label: 'Site', url: 'https://example.com' }],
  products: { adapter: 'static', items: [{ id: 'p1', name: 'Thing', price: 9.5 }] },
};

describe.runIf(TEST_DB)('content API', () => {
  let db: { sql: Sql; drop: () => Promise<void> };
  let server: Awaited<ReturnType<typeof startServer>>;
  let base = '';
  const host = { Authorization: `Bearer ${issueHostToken(SECRET)}`, 'Content-Type': 'application/json' };
  const put = (path: string, body: unknown, headers: Record<string, string> = host) =>
    fetch(base + path, { method: 'PUT', headers, body: JSON.stringify(body) });

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

  it('serves content with an ETag, and 304 when nothing changed', async () => {
    const res = await fetch(`${base}/api/content`);
    expect(res.status).toBe(200);
    const etag = res.headers.get('etag');
    expect(etag).toBe('"v1"');
    const body = (await res.json()) as { version: number; config: { shops: unknown[] } };
    expect(body.config.shops).toHaveLength(config.shops.length);
    const again = await fetch(`${base}/api/content`, { headers: { 'If-None-Match': etag as string } });
    expect(again.status).toBe(304);
  });

  it('serves the content and the directory from memory until something changes', async () => {
    const read = async () =>
      ((await (await fetch(`${base}/api/content`)).json()) as { version: number }).version;
    const page = async () => (await fetch(`${base}/directory/`)).text();
    expect(await read()).toBe(1);
    expect(await page()).not.toContain('New Shop');
    expect(await read()).toBe(1); // cached
    expect((await put('/api/shops/new-shop', shop)).status).toBe(200);
    expect(await read()).toBe(2);
    expect(await page()).toContain('New Shop');
  });

  it('refuses writes without a valid host token', async () => {
    expect((await put('/api/shops/new-shop', shop, { 'Content-Type': 'application/json' })).status).toBe(401);
    const forged = { ...host, Authorization: `Bearer ${issueHostToken('wrong-secret')}` };
    expect((await put('/api/shops/new-shop', shop, forged)).status).toBe(401);
  });

  it('adds a shop with products, bumps the version and tells connected visitors', async () => {
    const visitor = new TestClient(server.port);
    await visitor.join('Visitor');
    const res = await put('/api/shops/new-shop', shop);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ version: 2 });
    expect(await visitor.waitFor((m) => m.t === 'content')).toEqual({ t: 'content', version: 2 });
    visitor.close();
    const { config: live } = (await (await fetch(`${base}/api/content`)).json()) as {
      config: { shops: { id: string; products?: unknown }[] };
    };
    const added = live.shops.find((s) => s.id === 'new-shop');
    expect(added?.products).toEqual({ adapter: 'static', items: [{ id: 'p1', name: 'Thing', price: 9.5 }] });
  });

  it('explains invalid data field by field', async () => {
    const res = await put('/api/shops/new-shop', { ...shop, colors: { bg: 'red', accent: '#ffffff' } });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ fields: [{ path: 'colors.bg' }] });
  });

  it('says clearly when a slot is taken', async () => {
    const res = await put('/api/shops/new-shop', { ...shop, slot: 'w0' });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'Slot "w0" is already taken.' });
  });

  it('updates, reorders and deletes', async () => {
    expect((await put('/api/mall', { name: 'Renamed Mall' })).status).toBe(200);
    const order = await fetch(`${base}/api/shops/order`, {
      method: 'POST',
      headers: host,
      body: JSON.stringify(['verde', 'stride']),
    });
    expect(order.status).toBe(200);
    // removing a shop needs a reason, and keeps it with a copy of the shop
    const remove = (reason?: string) =>
      fetch(`${base}/api/shops/lumen-coffee`, {
        method: 'DELETE',
        headers: host,
        body: JSON.stringify({ reason }),
      });
    expect((await remove()).status).toBe(400);
    expect((await remove('Closed for good')).status).toBe(200);
    expect((await remove('again')).status).toBe(404);
    const removed = (await (await fetch(`${base}/api/removed-shops`, { headers: host })).json()) as unknown[];
    expect(removed).toMatchObject([
      { shop: 'lumen-coffee', name: 'Lumen Coffee', reason: 'Closed for good' },
    ]);
    expect((await fetch(`${base}/api/removed-shops`)).status).toBe(401);
    const { version, config: live } = (await (await fetch(`${base}/api/content`)).json()) as {
      version: number;
      config: { mall: { name: string }; shops: { id: string }[] };
    };
    expect(version).toBe(4); // three successful writes after the seed
    expect(live.mall.name).toBe('Renamed Mall');
    expect(live.shops.slice(0, 2).map((s) => s.id)).toEqual(['verde', 'stride']);
    expect(live.shops.some((s) => s.id === 'lumen-coffee')).toBe(false);
  });

  it('has no API without a database', async () => {
    const plain = await startServer({ port: 0 });
    expect((await fetch(`http://127.0.0.1:${plain.port}/api/content`)).status).toBe(404);
    await plain.close();
  });
});
