// Content API (docs/adr/0006). Public read, host-only writes, validated with the same zod schemas
// as mall.config.ts. Every write bumps the content version and calls onChange (live updates).
import type { IncomingMessage, ServerResponse } from 'node:http';
import { mallSchema, type Shop, shopSchema } from '@shopping-mall/shared/config';
import { type RentalApplication, rentalRequestSchema } from '@shopping-mall/shared/rentals';
import { z } from 'zod';
import { loadArt, replaceMallArt } from '../art.ts';
import { deleteAsset, KINDS, listAssets, storeAsset } from '../assets.ts';
import {
  type AssetUrl,
  contentVersion,
  deleteShop,
  loadContent,
  reorderShops,
  saveMall,
  saveShop,
  setMallArt,
} from '../db/content.ts';
import type { Sql } from '../db/db.ts';
import { decideRental, deleteRental, listRentals, saveRental, slotTaken } from '../db/rentals.ts';
import type { Mailer } from '../mail.ts';
import type { Storage } from '../storage.ts';
import { ownerApi } from './owner-api.ts';
import { bearer, CORS, HttpError, json, readBody, readJson } from './util.ts';

export type ContentApiOptions = {
  sql: Sql;
  assetUrl: AssetUrl;
  isHost: (token: string) => boolean;
  onChange: (version: number) => void;
  /** Object storage for uploads; without it the asset endpoints answer 503. */
  storage?: Storage | null;
  /** HOST_SECRET, which also signs shop owners' tokens (owner-api.ts). */
  secret?: string;
  /** Rate limits: may this request send a rental application, or try to sign in, now? (default yes) */
  allow?: (req: IncomingMessage, what: 'rental' | 'sign-in') => boolean;
  /** A visitor applied to rent a unit (to tell the host). */
  onRental?: (application: RentalApplication) => void;
  /** Sends set-password links to new shop owners (mail.ts). */
  mailer?: Mailer | null;
  /** PUBLIC_URL: the mall's address, for links in emails. */
  publicUrl?: string;
};

const SHOP_ID = /^\/api\/shops\/([a-z0-9][a-z0-9-]*)$/;
const RENTAL = /^\/api\/rentals\/(\d{1,15})(?:\/(approve|reject))?$/;

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) {
    const fields = r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    throw new HttpError(400, 'Some fields are not valid.', fields);
  }
  return r.data;
}

/** Handle /api/* requests. Returns false if the path isn't ours. */
export function contentApi(opts: ContentApiOptions) {
  const {
    sql,
    assetUrl,
    isHost,
    onChange,
    storage,
    secret,
    allow = () => true,
    onRental,
    mailer,
    publicUrl,
  } = opts;
  const owners = ownerApi({
    sql,
    secret,
    storage,
    parse,
    mailer,
    publicUrl,
    allowSignIn: (req) => allow(req, 'sign-in'),
  });
  const needStorage = () => {
    if (!storage) throw new HttpError(503, 'Uploads are not set up on this server (S3_* settings).');
    return storage;
  };

  /**
   * The last content response, kept until the version changes: a flood of reads costs one cheap
   * version lookup each, not a full load. Shared while it loads, so a cold start loads it once.
   */
  let cached: { version: number; body: Promise<string> } | null = null;
  const contentBody = (version: number) => {
    if (cached?.version !== version) {
      const body = Promise.all([loadContent(sql, assetUrl), loadArt(sql)]).then(([content, art]) =>
        JSON.stringify({ ...content, art }),
      );
      cached = { version, body };
      body.catch(() => {
        if (cached?.body === body) cached = null; // try again next time
      });
    }
    return cached.body;
  };

  async function route(req: IncomingMessage, res: ServerResponse) {
    const path = (req.url ?? '').split('?')[0] ?? '';
    const method = req.method ?? 'GET';

    if (path === '/api/content' && method === 'GET') {
      // cheap version check first: most requests are "has anything changed?"
      const version = await contentVersion(sql);
      const etag = `"v${version}"`;
      if (req.headers['if-none-match'] === etag) {
        res.writeHead(304, {
          ETag: etag,
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Expose-Headers': 'ETag',
        });
        res.end();
        return;
      }
      const body = await contentBody(version);
      res.writeHead(200, {
        'Content-Type': 'application/json',
        ...CORS,
        ETag: etag,
        'Cache-Control': 'no-cache',
      });
      res.end(body);
      return;
    }

    // a visitor asks to rent a vacant unit (the one public write)
    if (path === '/api/rentals' && method === 'POST') {
      // validate first, so fixing a typo in the form doesn't count against the limit
      const r = parse(rentalRequestSchema, await readJson(req, 8 * 1024));
      if (!allow(req, 'rental'))
        throw new HttpError(429, 'Too many applications from here. Try again later.');
      // the honeypot was filled in: a bot. Say thanks and keep nothing.
      if (r.website) return json(res, 201, { ok: true });
      if (await slotTaken(sql, r.slot)) throw new HttpError(409, 'Sorry, this unit has just been taken.');
      onRental?.(await saveRental(sql, r));
      json(res, 201, { ok: true });
      return;
    }

    if (await owners.publicRoute(req, res, path, method)) return;

    // a shop owner, signed in: their own shop only (owner-api.ts)
    const token = bearer(req);
    const host = isHost(token);
    const shopOwned = host ? null : await owners.ownerOf(token);
    if (shopOwned) {
      const current = async () =>
        (await loadContent(sql, assetUrl)).config.shops.find((s) => s.id === shopOwned);
      const save = async (shop: Shop) => {
        const v = await saveShop(sql, shop);
        onChange(v);
        return v;
      };
      await owners.ownerRoute(req, res, path, method, shopOwned, current, save);
      return;
    }

    // everything below is for the host only
    if (!host) throw new HttpError(401, 'Sign in as the host to change the mall.');
    if (await owners.hostRoute(req, res, path, method)) return;
    let version: number | null = null;

    // asset library: upload (raw body, ?kind=…), list, delete. Uploads don't change content by
    // themselves; using an asset (e.g. as a logo) does, through the shop endpoints.
    if (path === '/api/assets' && method === 'POST') {
      const kind = new URL(req.url ?? '', 'http://x').searchParams.get('kind') ?? '';
      const limit = KINDS[kind]?.maxBytes;
      if (!limit) throw new HttpError(400, `Unknown asset kind "${kind}".`);
      json(res, 201, await storeAsset(sql, needStorage(), kind, await readBody(req, limit)));
      return;
    }
    if (path === '/api/assets' && method === 'GET') {
      json(res, 200, await listAssets(sql));
      return;
    }
    const assetId = /^\/api\/assets\/([0-9a-f-]{36})$/.exec(path)?.[1];
    if (assetId && method === 'DELETE') {
      if (!(await deleteAsset(sql, needStorage(), assetId))) throw new HttpError(404, 'No such asset.');
      json(res, 200, { deleted: assetId });
      return;
    }

    // rental applications: list, approve or turn down, delete. They aren't mall content, so no version bump.
    if (path === '/api/rentals' && method === 'GET') {
      json(res, 200, await listRentals(sql));
      return;
    }
    const rental = RENTAL.exec(path);
    if (rental) {
      const id = Number(rental[1]);
      const action = rental[2];
      if (action && method === 'POST') {
        const done = await decideRental(sql, id, action === 'approve' ? 'approved' : 'rejected');
        if (!done) throw new HttpError(404, 'No such application.');
        if (done === 'decided') throw new HttpError(409, 'This application has already been decided.');
        json(res, 200, done);
      } else if (!action && method === 'DELETE') {
        if (!(await deleteRental(sql, id))) throw new HttpError(404, 'No such application.');
        json(res, 200, { deleted: id });
      } else throw new HttpError(405, 'Method not allowed.');
      return;
    }

    const upload = z.uuid({ error: 'Upload the file first.' });
    if (path === '/api/art/mall' && method === 'PUT') {
      const ids = parse(z.object({ model: upload, collision: upload, meta: upload }), await readJson(req));
      version = await replaceMallArt(sql, needStorage(), ids);
    } else if (path === '/api/art/mall' && method === 'DELETE') {
      version = await setMallArt(sql, null);
    } else if (path === '/api/mall' && method === 'PUT') {
      version = await saveMall(sql, parse(mallSchema, await readJson(req)));
    } else if (path === '/api/shops/order' && method === 'POST') {
      version = await reorderShops(sql, parse(z.array(z.string()).max(500), await readJson(req)));
    } else {
      const id = SHOP_ID.exec(path)?.[1];
      if (!id) throw new HttpError(404, 'No such endpoint.');
      if (method === 'PUT') {
        const shop = parse(shopSchema, await readJson(req, 256 * 1024));
        if (shop.id !== id) throw new HttpError(400, 'The shop id in the body must match the URL.');
        try {
          version = await saveShop(sql, shop);
        } catch (e) {
          if ((e as { code?: string }).code === '23505')
            throw new HttpError(409, `Slot "${shop.slot}" is already taken.`);
          throw e;
        }
      } else if (method === 'DELETE') {
        version = await deleteShop(sql, id);
        if (version === null) throw new HttpError(404, `No shop "${id}".`);
      } else throw new HttpError(405, 'Method not allowed.');
    }

    onChange(version);
    json(res, 200, { version });
  }

  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    if (!(req.url ?? '').startsWith('/api/')) return false;
    try {
      await route(req, res);
    } catch (e) {
      if (e instanceof HttpError)
        json(res, e.status, { error: e.message, ...(e.details ? { fields: e.details } : {}) });
      else {
        console.error('api error:', e);
        json(res, 500, { error: 'Something went wrong.' });
      }
    }
    return true;
  };
}
