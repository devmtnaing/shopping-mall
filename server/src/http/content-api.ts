// Content API (docs/adr/0006). Public read, host-only writes, validated with the same zod schemas
// as mall.config.ts. Every write bumps the content version and calls onChange (live updates).
import type { IncomingMessage, ServerResponse } from 'node:http';
import { mallSchema, shopSchema } from '@shopping-mall/shared/config';
import { z } from 'zod';
import {
  type AssetUrl,
  contentVersion,
  deleteShop,
  loadContent,
  reorderShops,
  saveMall,
  saveShop,
} from '../db/content.ts';
import type { Sql } from '../db/db.ts';
import { bearer, HttpError, json, readJson } from './util.ts';

export type ContentApiOptions = {
  sql: Sql;
  assetUrl: AssetUrl;
  isHost: (token: string) => boolean;
  onChange: (version: number) => void;
};

const SHOP_ID = /^\/api\/shops\/([a-z0-9][a-z0-9-]*)$/;

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
  const { sql, assetUrl, isHost, onChange } = opts;

  async function route(req: IncomingMessage, res: ServerResponse) {
    const path = (req.url ?? '').split('?')[0] ?? '';
    const method = req.method ?? 'GET';

    if (path === '/api/content' && method === 'GET') {
      // cheap version check first: most requests are "has anything changed?"
      const etag = `"v${await contentVersion(sql)}"`;
      if (req.headers['if-none-match'] === etag) {
        res.writeHead(304, {
          ETag: etag,
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Expose-Headers': 'ETag',
        });
        res.end();
        return;
      }
      const content = await loadContent(sql, assetUrl);
      json(res, 200, content, { ETag: `"v${content.version}"`, 'Cache-Control': 'no-cache' });
      return;
    }

    // everything below changes content: host only
    if (!isHost(bearer(req))) throw new HttpError(401, 'Sign in as the host to change the mall.');
    let version: number | null = null;

    if (path === '/api/mall' && method === 'PUT') {
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
