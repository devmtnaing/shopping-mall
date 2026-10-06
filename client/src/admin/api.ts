// Talking to the server's content API as the host. The token lives in memory only: reloading the
// page means signing in again (by design, see docs/adr/0006).

import { signal } from '@preact/signals';
import type { MallConfig, Shop } from '@shopping-mall/shared/config';
import type { MallArt } from '@shopping-mall/shared/meta';
import type { OWNER_LIMITS, OwnerInfo } from '@shopping-mall/shared/owners';
import type { RentalApplication } from '@shopping-mall/shared/rentals';
import { httpUrl, signInAsHost } from '../net/socket';

export const token = signal<string | null>(null);
/** The shop a shop owner signed in to; null for the host (or nobody). */
export const ownShop = signal<string | null>(null);

/** Sign out (also what an expired session does). */
export function signOut() {
  token.value = null;
  ownShop.value = null;
}

export type FieldError = { path: string; message: string };
export class ApiError extends Error {
  readonly status: number;
  readonly fields: FieldError[];
  constructor(status: number, message: string, fields: FieldError[] = []) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

export type Asset = {
  id: string;
  kind: string;
  url: string;
  contentType: string;
  bytes: number;
  /** Uploaded by this shop's owner. */
  shop?: string;
};

export const serverBase = () => new URL(httpUrl('/') ?? location.origin).origin;
/** Uploaded file URLs are relative to the server; make them loadable from this page. */
export const fileUrl = (u?: string) => (u?.startsWith('/files/') ? serverBase() + u : (u ?? ''));

async function call<T>(
  method: string,
  path: string,
  body?: BodyInit | object,
  headers: Record<string, string> = {},
): Promise<T> {
  const url = httpUrl(path);
  if (!url) throw new ApiError(0, 'No server is configured for this site.');
  const isRaw = body instanceof Blob || body instanceof ArrayBuffer;
  const res = await fetch(url, {
    method,
    headers: {
      ...(token.value ? { Authorization: `Bearer ${token.value}` } : {}),
      ...(body && !isRaw ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : isRaw ? (body as BodyInit) : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; fields?: FieldError[] };
  if (res.status === 401 && token.value) signOut(); // expired: back to the sign-in screen
  if (!res.ok) throw new ApiError(res.status, data.error ?? `Request failed (${res.status}).`, data.fields);
  return data as T;
}

export const api = {
  async signIn(secret: string) {
    const r = await signInAsHost(secret);
    if (!r.token) throw new ApiError(401, r.error ?? 'Sign-in failed.');
    ownShop.value = null;
    token.value = r.token;
  },
  /** A shop owner signs in with their email and password. */
  async ownerSignIn(email: string, password: string) {
    const r = await call<{ token: string; shop: string }>('POST', '/api/owner/sign-in', { email, password });
    ownShop.value = r.shop;
    token.value = r.token;
  },
  /** Who a set-password link is for. */
  invite: (t: string) =>
    call<{ shop: string; email: string; name: string }>(
      'GET',
      `/api/owner/invite?token=${encodeURIComponent(t)}`,
    ),
  /** Use a set-password link; signs the owner in. */
  async setPassword(t: string, password: string) {
    const r = await call<{ token: string; shop: string }>('POST', '/api/owner/password', {
      token: t,
      password,
    });
    ownShop.value = r.shop;
    token.value = r.token;
  },
  ownerMe: () =>
    call<{ shop: string; email: string; limits: typeof OWNER_LIMITS; photos: number }>(
      'GET',
      '/api/owner/me',
    ),
  owners: () => call<OwnerInfo[]>('GET', '/api/owners'),
  inviteOwner: (shop: string, email: string) =>
    call<{ token: string; emailed?: boolean; mailError?: string }>('POST', `/api/shops/${shop}/owner`, {
      email,
    }),
  removeOwner: (shop: string) => call<{ removed: string }>('DELETE', `/api/shops/${shop}/owner`),
  content: () => call<{ version: number; config: MallConfig; art?: MallArt | null }>('GET', '/api/content'),
  saveMall: (m: MallConfig['mall']) => call<{ version: number }>('PUT', '/api/mall', m),
  saveShop: (s: Shop) => call<{ version: number }>('PUT', `/api/shops/${s.id}`, s),
  deleteShop: (id: string) => call<{ version: number }>('DELETE', `/api/shops/${id}`),
  reorder: (ids: string[]) => call<{ version: number }>('POST', '/api/shops/order', ids),
  assets: () => call<Asset[]>('GET', '/api/assets'),
  upload: (kind: string, file: Blob) =>
    call<Asset>('POST', `/api/assets?kind=${encodeURIComponent(kind)}`, file),
  deleteAsset: (id: string) => call<{ deleted: string }>('DELETE', `/api/assets/${id}`),
  replaceArt: (ids: { model: string; collision: string; meta: string }) =>
    call<{ version: number }>('PUT', '/api/art/mall', ids),
  resetArt: () => call<{ version: number }>('DELETE', '/api/art/mall'),
  rentals: () => call<RentalApplication[]>('GET', '/api/rentals'),
  decideRental: (id: number, action: 'approve' | 'reject') =>
    // approving also emails the applicant, when the server has a mail service
    call<RentalApplication & { emailed?: boolean; mailError?: string }>(
      'POST',
      `/api/rentals/${id}/${action}`,
    ),
  deleteRental: (id: number) => call<{ deleted: number }>('DELETE', `/api/rentals/${id}`),
};
