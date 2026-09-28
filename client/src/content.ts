// The mall's content (name, shops, products) as a signal. It starts as the built-in mall.config.ts
// and, when a server with a database is around, is replaced by /api/content and kept up to date:
// the server announces every change and we refetch. UI reading `content.value` re-renders by itself.

import builtIn from 'virtual:mall-config';
import { signal } from '@preact/signals';
import type { MallConfig } from '@shopping-mall/shared/config';
import { httpUrl } from './net/socket';

export const content = signal<MallConfig>(builtIn);
/** Version of what's in `content` (0 = the built-in config). */
export let contentVersion = 0;

let etag = '';
let inflight: Promise<void> | null = null;

/** Uploaded files are served by the server; make their URLs absolute when it's on another origin. */
function resolveFiles(c: MallConfig, base: string): MallConfig {
  const abs = (u?: string) => (u?.startsWith('/files/') ? base + u : u);
  return {
    ...c,
    shops: c.shops.map((s) => ({
      ...s,
      ...(s.logo ? { logo: abs(s.logo) } : {}),
      ...(s.products?.adapter === 'static'
        ? {
            products: {
              ...s.products,
              items: s.products.items.map((p) => ({ ...p, ...(p.image ? { image: abs(p.image) } : {}) })),
            },
          }
        : {}),
    })),
  };
}

/** Fetch the latest content (no-op without a server, or if it hasn't changed). Never throws. */
export function loadContent(): Promise<void> {
  const url = httpUrl('/api/content');
  if (!url) return Promise.resolve();
  inflight ??= (async () => {
    try {
      const res = await fetch(url, {
        headers: etag ? { 'If-None-Match': etag } : {},
        signal: AbortSignal.timeout(4000),
      });
      if (res.status === 304 || !res.ok) return; // unchanged, or no database: keep what we have
      const body = (await res.json()) as { version: number; config: MallConfig };
      etag = res.headers.get('etag') ?? '';
      contentVersion = body.version;
      content.value = resolveFiles(body.config, new URL(url).origin);
    } catch {
      /* offline or no server: the built-in config stays */
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** The server says content is now at `version`: refetch if we're behind. */
export function onContentVersion(version: number) {
  if (version > contentVersion) void loadContent();
}
