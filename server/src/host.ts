// Host sign-in: HOST_SECRET → a signed token (JWT, HS256) valid for 12 hours. The client keeps it
// in memory only. Without HOST_SECRET there is no host role.
import { createHmac, timingSafeEqual } from 'node:crypto';

const TTL_S = 12 * 60 * 60;
const b64 = (s: string | Buffer) => Buffer.from(s).toString('base64url');

export function issueHostToken(secret: string, now = Date.now()): string {
  const header = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64(JSON.stringify({ sub: 'host', exp: Math.floor(now / 1000) + TTL_S }));
  const sig = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

export function verifyHostToken(secret: string, token: string, now = Date.now()): boolean {
  const [header, payload, sig] = token.split('.');
  if (!header || !payload || !sig) return false;
  const expected = createHmac('sha256', secret).update(`${header}.${payload}`).digest();
  const got = Buffer.from(sig, 'base64url');
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) return false;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { sub?: string; exp?: number };
    return claims.sub === 'host' && typeof claims.exp === 'number' && claims.exp * 1000 > now;
  } catch {
    return false;
  }
}

/** Constant-time comparison of the typed secret with HOST_SECRET. */
export function secretMatches(secret: string, attempt: string): boolean {
  const a = createHmac('sha256', 'cmp').update(secret).digest();
  const b = createHmac('sha256', 'cmp').update(attempt).digest();
  return timingSafeEqual(a, b);
}
