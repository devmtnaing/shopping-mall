// Shop owners in the content API: signing in (set-password links, email + password) and what an
// owner may change: their own shop, within OWNER_LIMITS. The host's routes for inviting and
// removing owners are here too. Mounted by content-api.ts, which owns the rest of /api.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { type Shop, shopSchema } from '@shopping-mall/shared/config';
import { OWNER_LIMITS } from '@shopping-mall/shared/owners';
import { z } from 'zod';
import { storeAsset } from '../assets.ts';
import type { Sql } from '../db/db.ts';
import {
  clearUnusedPhotos,
  inviteFor,
  inviteOwner,
  listOwners,
  ownerByEmail,
  ownerEmail,
  ownerSessionValid,
  photoCount,
  removeOwner,
  setOwnerPassword,
} from '../db/owners.ts';
import { hashPassword, issueOwnerToken, passwordMatches, readOwnerToken } from '../owners.ts';
import type { Storage } from '../storage.ts';
import { HttpError, json, readBody, readJson } from './util.ts';

const OWNER_OF = /^\/api\/shops\/([a-z0-9][a-z0-9-]*)\/owner$/;
/** What owners may upload: photos only. */
const OWNER_KINDS = new Set(['logo', 'product-image']);
const password = z
  .string()
  .min(OWNER_LIMITS.passwordMin, `At least ${OWNER_LIMITS.passwordMin} characters.`)
  .max(200, 'At most 200 characters.');
/** Hashed once, so a sign-in for an unknown email takes as long as one with a wrong password. */
const decoy = hashPassword('not-a-real-password');

export type OwnerApiOptions = {
  sql: Sql;
  /** HOST_SECRET: signs owners' tokens. Without it nobody can sign in as an owner. */
  secret?: string;
  storage?: Storage | null;
  /** Rate limit for sign-in and set-password attempts. */
  allowSignIn: (req: IncomingMessage) => boolean;
  parse: <T>(schema: z.ZodType<T>, body: unknown) => T;
};

export function ownerApi(opts: OwnerApiOptions) {
  const { sql, secret, storage, allowSignIn, parse } = opts;
  const needSecret = () => {
    if (!secret) throw new HttpError(404, 'Shop owner sign-in is not set up on this server.');
    return secret;
  };
  const slow = (req: IncomingMessage) => {
    if (!allowSignIn(req)) throw new HttpError(429, 'Too many tries. Wait a minute.');
  };

  /** The shop a request's token signs in to, or null for no owner token. Throws for an ended session. */
  async function ownerOf(token: string): Promise<string | null> {
    const claims = secret && token ? readOwnerToken(secret, token) : null;
    if (!claims) return null;
    if (!(await ownerSessionValid(sql, claims.shop, claims.epoch)))
      throw new HttpError(401, 'You were signed out. Sign in again.');
    return claims.shop;
  }

  /** Routes anyone may call (signing in). Returns true if it answered. */
  async function publicRoute(req: IncomingMessage, res: ServerResponse, path: string, method: string) {
    if (path === '/api/owner/invite' && method === 'GET') {
      const token = new URL(req.url ?? '', 'http://x').searchParams.get('token') ?? '';
      const invite = token ? await inviteFor(sql, token) : null;
      if (!invite)
        throw new HttpError(404, 'This link has expired or been used. Ask the mall’s host for a new one.');
      json(res, 200, invite);
      return true;
    }
    if (path === '/api/owner/password' && method === 'POST') {
      const s = needSecret();
      const body = parse(z.object({ token: z.string().max(100), password }), await readJson(req, 4096));
      slow(req);
      const done = await setOwnerPassword(sql, body.token, await hashPassword(body.password));
      if (!done)
        throw new HttpError(404, 'This link has expired or been used. Ask the mall’s host for a new one.');
      json(res, 200, { token: issueOwnerToken(s, done.shop, done.epoch), shop: done.shop });
      return true;
    }
    if (path === '/api/owner/sign-in' && method === 'POST') {
      const s = needSecret();
      const body = parse(
        z.object({ email: z.string().max(120), password: z.string().max(200) }),
        await readJson(req, 4096),
      );
      slow(req);
      const owner = await ownerByEmail(sql, body.email.trim());
      // an unknown email still checks a password, so it takes as long as a wrong one
      const ok = await passwordMatches(owner?.passwordHash ?? (await decoy), body.password);
      if (!owner || !ok) throw new HttpError(401, 'That email and password don’t match.');
      json(res, 200, { token: issueOwnerToken(s, owner.shop, owner.epoch), shop: owner.shop });
      return true;
    }
    return false;
  }

  /**
   * Routes for a signed-in owner of `shop`: who am I, upload a photo, save my shop. `save` is
   * content-api's shop save (it bumps the version, tells visitors and returns the version). Returns true if it answered.
   */
  async function ownerRoute(
    req: IncomingMessage,
    res: ServerResponse,
    path: string,
    method: string,
    shop: string,
    current: () => Promise<Shop | undefined>,
    save: (s: Shop) => Promise<number>,
  ) {
    if (path === '/api/owner/me' && method === 'GET') {
      json(res, 200, {
        shop,
        email: await ownerEmail(sql, shop),
        limits: OWNER_LIMITS,
        photos: await photoCount(sql, shop),
      });
      return true;
    }
    if (path === '/api/assets' && method === 'POST') {
      if (!storage) throw new HttpError(503, 'Uploads are not set up on this server (S3_* settings).');
      const kind = new URL(req.url ?? '', 'http://x').searchParams.get('kind') ?? '';
      if (!OWNER_KINDS.has(kind)) throw new HttpError(403, 'Shop owners can upload photos only.');
      // full: clear photos nothing uses any more (not ones from the last half hour, which may be
      // in a form not saved yet), then look again
      if ((await photoCount(sql, shop)) >= OWNER_LIMITS.photos) {
        await clearUnusedPhotos(sql, storage, shop, 30);
        if ((await photoCount(sql, shop)) >= OWNER_LIMITS.photos)
          throw new HttpError(
            409,
            `Your shop can keep ${OWNER_LIMITS.photos} photos. Remove one you don’t use and save, then try again.`,
          );
      }
      const body = await readBody(req, OWNER_LIMITS.photoBytes);
      json(res, 201, await storeAsset(sql, storage, kind, body, { shop, maxBytes: OWNER_LIMITS.photoBytes }));
      return true;
    }
    if (path === `/api/shops/${shop}` && method === 'PUT') {
      const before = await current();
      if (!before) throw new HttpError(404, 'Your shop has been removed. Ask the mall’s host.');
      const next = parse(shopSchema, await readJson(req, 64 * 1024));
      const version = await save(withinLimits(next, before));
      // photos they took out of the shop are gone for good: don't keep paying for them
      if (storage) await clearUnusedPhotos(sql, storage, shop, 0);
      json(res, 200, { version });
      return true;
    }
    if (path.startsWith('/api/')) throw new HttpError(403, 'Shop owners can change their own shop only.');
    return false;
  }

  /** The host's routes for owners. Returns true if it answered. */
  async function hostRoute(req: IncomingMessage, res: ServerResponse, path: string, method: string) {
    if (path === '/api/owners' && method === 'GET') {
      json(res, 200, await listOwners(sql));
      return true;
    }
    const shop = OWNER_OF.exec(path)?.[1];
    if (!shop) return false;
    if (method === 'POST') {
      needSecret();
      const { email } = parse(
        z.object({ email: z.email('That email address doesn’t look right.').max(120) }),
        await readJson(req, 4096),
      );
      json(res, 201, { token: await inviteOwner(sql, shop, email.trim()) });
    } else if (method === 'DELETE') {
      if (!(await removeOwner(sql, shop))) throw new HttpError(404, 'This shop has no owner.');
      json(res, 200, { removed: shop });
    } else throw new HttpError(405, 'Method not allowed.');
    return true;
  }

  return { ownerOf, publicRoute, ownerRoute, hostRoute };
}

/**
 * An owner's save, kept to what they may change: the unit stays the host's, the product list is
 * at most OWNER_LIMITS.products and typed in (no feeds), and photos are ones uploaded here.
 */
export function withinLimits(next: Shop, before: Shop): Shop {
  const fields: { path: string; message: string }[] = [];
  const uploaded = (u: string | undefined, was: string | undefined) =>
    !u || u === was || u.startsWith('/files/');
  if (next.products?.adapter === 'json-url' && before.products?.adapter !== 'json-url')
    fields.push({ path: 'products', message: 'Ask the mall’s host to set up a product feed.' });
  if (next.products?.adapter === 'static') {
    if (next.products.items.length > OWNER_LIMITS.products)
      fields.push({ path: 'products', message: `At most ${OWNER_LIMITS.products} products.` });
    const was = new Map(
      before.products?.adapter === 'static' ? before.products.items.map((p) => [p.id, p.image]) : [],
    );
    next.products.items.forEach((p, i) => {
      if (!uploaded(p.image, was.get(p.id)))
        fields.push({ path: `products.items.${i}.image`, message: 'Upload the photo here.' });
    });
  }
  if (!uploaded(next.logo, before.logo)) fields.push({ path: 'logo', message: 'Upload the logo here.' });
  if (fields.length) throw new HttpError(400, 'Some fields are not valid.', fields);
  // a feed the host set up stays as it is
  const keepFeed = next.products?.adapter === 'json-url' && before.products?.adapter === 'json-url';
  return { ...next, slot: before.slot, ...(keepFeed ? { products: before.products } : {}) };
}
