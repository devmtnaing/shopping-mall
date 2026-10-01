// Shop owners' passwords, set-password links and sign-in tokens. Passwords are kept as scrypt
// hashes; set-password links as a SHA-256 of their random token; neither can be read back.
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { readToken, signToken } from './host.ts';

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, 32);
  return `s1$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export async function passwordMatches(stored: string, attempt: string): Promise<boolean> {
  const [v, salt, hash] = stored.split('$');
  if (v !== 's1' || !salt || !hash) return false;
  const want = Buffer.from(hash, 'base64url');
  const got = await scryptAsync(attempt, Buffer.from(salt, 'base64url'), want.length);
  return timingSafeEqual(got, want);
}

/** A new set-password token (goes in the link) and the hash that's stored. */
export function newInvite(): { token: string; hash: string } {
  const token = randomBytes(24).toString('base64url');
  return { token, hash: hashInvite(token) };
}
export const hashInvite = (token: string) => createHash('sha256').update(token).digest('hex');

/** An owner's sign-in token. `epoch` changes when their access is reset, which signs them out. */
export function issueOwnerToken(secret: string, shop: string, epoch: number, now = Date.now()): string {
  return signToken(secret, { sub: 'owner', shop, epoch }, now);
}

export function readOwnerToken(
  secret: string,
  token: string,
  now = Date.now(),
): { shop: string; epoch: number } | null {
  const c = readToken(secret, token, now);
  if (c?.sub !== 'owner' || typeof c.shop !== 'string' || typeof c.epoch !== 'number') return null;
  return { shop: c.shop, epoch: c.epoch };
}
