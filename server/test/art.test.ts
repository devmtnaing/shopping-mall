import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseConfig } from '@shopping-mall/shared/config';
import type { MallMeta } from '@shopping-mall/shared/meta';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import config from '../../mall.config';
import { seedIfEmpty } from '../src/db/content';
import type { Sql } from '../src/db/db';
import { issueHostToken } from '../src/host';
import { startServer } from '../src/server';
import { Storage } from '../src/storage';
import { freshSchema, TEST_DB } from './db';

const S3 = process.env.TEST_S3_ENDPOINT;
const SECRET = 'test-secret';
const host = { Authorization: `Bearer ${issueHostToken(SECRET)}` };
const DIR = resolve(import.meta.dirname, '../../client/public/assets/mall');
const file = (name: string) => new Uint8Array(readFileSync(`${DIR}/${name}`));
const greyMeta = (): MallMeta => JSON.parse(readFileSync(`${DIR}/mall.meta.json`, 'utf8'));

// The built-in greybox is a valid mall package, so it doubles as the upload under test.
describe.runIf(TEST_DB && S3)('mall art', () => {
  let db: { sql: Sql; drop: () => Promise<void> };
  let server: Awaited<ReturnType<typeof startServer>>;
  let base = '';
  const upload = async (kind: string, body: Uint8Array) => {
    const res = await fetch(`${base}/api/assets?kind=${kind}`, { method: 'POST', headers: host, body });
    expect(res.status).toBe(201);
    return ((await res.json()) as { id: string }).id;
  };
  const uploadMeta = (meta: MallMeta) => upload('mall-meta', new TextEncoder().encode(JSON.stringify(meta)));
  const replace = (ids: object) =>
    fetch(`${base}/api/art/mall`, {
      method: 'PUT',
      headers: { ...host, 'Content-Type': 'application/json' },
      body: JSON.stringify(ids),
    });
  const art = async () =>
    ((await (await fetch(`${base}/api/content`)).json()) as { art: Record<string, string> | null }).art;

  beforeEach(async () => {
    db = await freshSchema();
    await seedIfEmpty(db.sql, parseConfig(config));
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

  it('starts on the built-in mall', async () => {
    expect(await art()).toBeNull();
  });

  it('takes a package, bakes the same navgrid as pnpm navgrid, and protects its files', async () => {
    const model = await upload('mall-model', file('greybox.glb'));
    const collision = await upload('mall-collision', file('greybox.collision.glb'));
    const meta = await upload('mall-meta', file('mall.meta.json'));
    const res = await replace({ model, collision, meta });
    expect(res.status).toBe(200);

    const now = await art();
    expect(now).toMatchObject({
      model: expect.stringMatching(/^\/files\/mall-model\//),
      navgrid: expect.stringMatching(/^\/files\/navgrid\/.+\.bin$/),
    });
    const baked = new Uint8Array(await (await fetch(base + now?.navgrid)).arrayBuffer());
    expect(baked).toEqual(file('navgrid.bin'));

    // a file the building uses can't be deleted until the building changes
    const del = () => fetch(`${base}/api/assets/${model}`, { method: 'DELETE', headers: host });
    expect((await del()).status).toBe(409);
    expect((await fetch(`${base}/api/art/mall`, { method: 'DELETE', headers: host })).status).toBe(200);
    expect(await art()).toBeNull();
    expect((await del()).status).toBe(200);
  });

  it('rejects a package that does not fit, with a reason, and keeps the current building', async () => {
    const model = await upload('mall-model', file('greybox.glb'));
    const collision = await upload('mall-collision', file('greybox.collision.glb'));
    const expectRefused = async (ids: object, reason: RegExp) => {
      const res = await replace(ids);
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string; fields?: { path: string }[] };
      expect(body.error + JSON.stringify(body.fields ?? [])).toMatch(reason);
      expect(await art()).toBeNull();
    };

    // not the meta format
    const bad = await uploadMeta({ ...greyMeta(), version: 2 as 1 });
    await expectRefused({ model, collision, meta: bad }, /meta\.version/);

    // a shop's unit is missing
    const fewer = greyMeta();
    fewer.slots = fewer.slots.filter((s) => s.id !== 'w0');
    await expectRefused({ model, collision, meta: await uploadMeta(fewer) }, /lumen-coffee \(w0\)/);

    // spawning inside a wall
    const walled = greyMeta();
    walled.spawns[0] = { id: 'entrance', pos: [-15.9, 0, -20], yaw: 0 };
    await expectRefused({ model, collision, meta: await uploadMeta(walled) }, /Spawn point "entrance"/);

    // files of the wrong kind, and missing ones
    const meta = await upload('mall-meta', file('mall.meta.json'));
    await expectRefused({ model, collision: model, meta }, /collision must be an uploaded mall-collision/);
    await expectRefused({ model, meta }, /collision/);
  });

  it('is host only', async () => {
    const res = await fetch(`${base}/api/art/mall`, { method: 'DELETE' });
    expect(res.status).toBe(401);
  });
});
