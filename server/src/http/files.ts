// GET /files/<kind>/<sha256>.<ext>: uploaded files, streamed from object storage on the same origin
// (no bucket CORS needed, canvases stay untainted). The key contains the content hash, so the
// response never changes and is cached for a year.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import type { Storage } from '../storage.ts';

const KEY = /^\/files\/([a-z-]+\/[0-9a-f]{64}\.(?:png|jpg|webp|glb|json|bin))$/;

export function filesHandler(storage: Storage | null) {
  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    if (!(req.url ?? '').startsWith('/files/')) return false;
    const key = KEY.exec((req.url ?? '').split('?')[0] ?? '')?.[1];
    if (!storage || !key || (req.method !== 'GET' && req.method !== 'HEAD')) {
      res.writeHead(404).end();
      return true;
    }
    const upstream = await storage.get(key);
    if (!upstream.ok || !upstream.body) {
      res.writeHead(upstream.status === 404 ? 404 : 502).end();
      return true;
    }
    res.writeHead(200, {
      'Content-Type': upstream.headers.get('content-type') ?? 'application/octet-stream',
      'Content-Length': upstream.headers.get('content-length') ?? undefined,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Access-Control-Allow-Origin': '*',
      'X-Content-Type-Options': 'nosniff',
    } as Record<string, string>);
    if (req.method === 'HEAD') {
      res.end();
      return true;
    }
    Readable.fromWeb(upstream.body as import('node:stream/web').ReadableStream).pipe(res);
    return true;
  };
}
