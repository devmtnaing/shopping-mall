import { randomBytes } from 'node:crypto';
import { parseConfig } from '@shopping-mall/shared/config';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import config from '../../mall.config';
import { sniff } from '../src/assets';
import { seedIfEmpty } from '../src/db/content';
import type { Sql } from '../src/db/db';
import { issueHostToken } from '../src/host';
import { startServer } from '../src/server';
import { Storage } from '../src/storage';
import { freshSchema, TEST_DB } from './db';

const S3 = process.env.TEST_S3_ENDPOINT;
const SECRET = 'test-secret';
const host = { Authorization: `Bearer ${issueHostToken(SECRET)}` };
// a minimal valid PNG header followed by some bytes (enough for sniffing)
const png = (seed = 0) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, seed, 1, 2, 3]);

describe('sniff', () => {
  it('recognises real formats and ignores the declared type', () => {
    expect(sniff(png())).toBe('png');
    expect(sniff(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpeg');
    expect(sniff(new TextEncoder().encode('glTF....'))).toBe('glb');
    expect(sniff(new TextEncoder().encode('{"version":1}'))).toBe('json');
    expect(sniff(new TextEncoder().encode('<svg onload="alert(1)"/>'))).toBeNull();
  });
});

describe.runIf(TEST_DB && S3)('asset uploads', () => {
  let db: { sql: Sql; drop: () => Promise<void> };
  let server: Awaited<ReturnType<typeof startServer>>;
  let base = '';
  const upload = (kind: string, body: Uint8Array, headers: Record<string, string> = host) =>
    fetch(`${base}/api/assets?kind=${kind}`, { method: 'POST', headers, body });

  beforeEach(async () => {
    db = await freshSchema();
    await seedIfEmpty(db.sql, parseConfig(config));
    // a fresh bucket per test run keeps runs independent
    const storage = new Storage({
      endpoint: S3 as string,
      bucket: `t-${randomBytes(4).toString('hex')}`,
      accessKeyId: process.env.TEST_S3_KEY ?? 'mall',
      secretAccessKey: process.env.TEST_S3_SECRET ?? 'mall-secret',
    });
    await storage.ensureBucket();
    server = await startServer({ port: 0, db: db.sql, hostSecret: SECRET, storage });
    base = `http://127.0.0.1:${server.port}`;
  });
  afterEach(async () => {
    await server.close();
    await db.drop();
  });

  it('uploads a logo, serves it back immutably cached, and dedupes a second upload', async () => {
    const res = await upload('logo', png(7));
    expect(res.status).toBe(201);
    const asset = (await res.json()) as { id: string; url: string; bytes: number; contentType: string };
    expect(asset).toMatchObject({ bytes: 12, contentType: 'image/png' });
    expect(asset.url).toMatch(/^\/files\/logo\/[0-9a-f]{64}\.png$/);

    const file = await fetch(base + asset.url);
    expect(file.status).toBe(200);
    expect(file.headers.get('cache-control')).toContain('immutable');
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(png(7));

    const again = (await (await upload('logo', png(7))).json()) as { id: string };
    expect(again.id).toBe(asset.id);
    const list = (await (await fetch(`${base}/api/assets`, { headers: host })).json()) as unknown[];
    expect(list).toHaveLength(1);
  });

  it('refuses files that are not what the kind needs, too big, or from non-hosts', async () => {
    expect((await upload('logo', new TextEncoder().encode('<svg/>'))).status).toBe(415);
    expect((await upload('mall-model', png())).status).toBe(415);
    expect((await upload('logo', new Uint8Array(3 * 1024 * 1024).fill(1))).status).toBe(413);
    expect((await upload('nonsense', png())).status).toBe(400);
    expect((await upload('logo', png(), {})).status).toBe(401);
  });

  it('deletes an asset and its file', async () => {
    const asset = (await (await upload('product-image', png(9))).json()) as { id: string; url: string };
    const del = await fetch(`${base}/api/assets/${asset.id}`, { method: 'DELETE', headers: host });
    expect(del.status).toBe(200);
    expect((await fetch(base + asset.url)).status).toBe(404);
  });
});
