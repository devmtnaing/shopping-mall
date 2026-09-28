// Talking to the server's content API as the host. The token lives in memory only: reloading the
// page means signing in again (by design, see docs/adr/0006).

import { signal } from '@preact/signals';
import type { MallConfig, Shop } from '@shopping-mall/shared/config';
import { httpUrl, signInAsHost } from '../net/socket';

export const token = signal<string | null>(null);

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

export type Asset = { id: string; kind: string; url: string; contentType: string; bytes: number };

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
  if (res.status === 401) token.value = null; // expired: back to the sign-in screen
  if (!res.ok) throw new ApiError(res.status, data.error ?? `Request failed (${res.status}).`, data.fields);
  return data as T;
}

export const api = {
  async signIn(secret: string) {
    const r = await signInAsHost(secret);
    if (!r.token) throw new ApiError(401, r.error ?? 'Sign-in failed.');
    token.value = r.token;
  },
  content: () => call<{ version: number; config: MallConfig }>('GET', '/api/content'),
  saveMall: (m: MallConfig['mall']) => call<{ version: number }>('PUT', '/api/mall', m),
  saveShop: (s: Shop) => call<{ version: number }>('PUT', `/api/shops/${s.id}`, s),
  deleteShop: (id: string) => call<{ version: number }>('DELETE', `/api/shops/${id}`),
  reorder: (ids: string[]) => call<{ version: number }>('POST', '/api/shops/order', ids),
  assets: () => call<Asset[]>('GET', '/api/assets'),
  upload: (kind: string, file: File) =>
    call<Asset>('POST', `/api/assets?kind=${encodeURIComponent(kind)}`, file),
  deleteAsset: (id: string) => call<{ deleted: string }>('DELETE', `/api/assets/${id}`),
};
