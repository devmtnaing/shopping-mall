// Sign-in tokens (JWT, HS256, signed with HOST_SECRET) valid for 12 hours, kept in memory by the
// client. Host tokens say `sub: "host"`; shop owners' say `sub: "owner"` and name their shop
// (owners.ts). Without HOST_SECRET there is no host role and no owner sign-in.
import { createHmac, timingSafeEqual } from 'node:crypto';

const TTL_S = 12 * 60 * 60;
const b64 = (s: string | Buffer) => Buffer.from(s).toString('base64url');

/** Sign `claims` (plus an expiry 12 hours from now) into a token. */
export function signToken(secret: string, claims: Record<string, unknown>, now = Date.now()): string {
  const header = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64(JSON.stringify({ ...claims, exp: Math.floor(now / 1000) + TTL_S }));
  const sig = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

/** The claims in a token signed with `secret` that hasn't expired, or null. */
export function readToken(secret: string, token: string, now = Date.now()): Record<string, unknown> | null {
  const [header, payload, sig] = token.split('.');
  if (!header || !payload || !sig) return null;
  const expected = createHmac('sha256', secret).update(`${header}.${payload}`).digest();
  const got = Buffer.from(sig, 'base64url');
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString()) as Record<string, unknown>;
    return typeof claims.exp === 'number' && claims.exp * 1000 > now ? claims : null;
  } catch {
    return null;
  }
}

export function issueHostToken(secret: string, now = Date.now()): string {
  return signToken(secret, { sub: 'host' }, now);
}

export function verifyHostToken(secret: string, token: string, now = Date.now()): boolean {
  return readToken(secret, token, now)?.sub === 'host';
}

/** Constant-time comparison of the typed secret with HOST_SECRET. */
export function secretMatches(secret: string, attempt: string): boolean {
  const a = createHmac('sha256', 'cmp').update(secret).digest();
  const b = createHmac('sha256', 'cmp').update(attempt).digest();
  return timingSafeEqual(a, b);
}
