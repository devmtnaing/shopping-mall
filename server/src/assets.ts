// Uploaded assets: what kinds exist, how big they may be, and checking a file is what it claims.
import { createHash } from 'node:crypto';
import type { Sql } from './db/db.ts';
import { HttpError } from './http/util.ts';
import type { Storage } from './storage.ts';

type Format = 'png' | 'jpeg' | 'webp' | 'glb' | 'json' | 'bin';

const MB = 1024 * 1024;
/** Kinds of asset, the formats each accepts, and its size limit. No SVG: it can carry scripts. */
export const KINDS: Record<string, { formats: Format[]; maxBytes: number }> = {
  logo: { formats: ['png', 'jpeg', 'webp'], maxBytes: 2 * MB },
  'product-image': { formats: ['png', 'jpeg', 'webp'], maxBytes: 5 * MB },
  'mall-model': { formats: ['glb'], maxBytes: 25 * MB },
  'mall-collision': { formats: ['glb'], maxBytes: 5 * MB },
  'mall-meta': { formats: ['json'], maxBytes: 1 * MB },
  navgrid: { formats: ['bin'], maxBytes: 1 * MB },
  avatar: { formats: ['glb'], maxBytes: 5 * MB },
  'animation-pack': { formats: ['glb'], maxBytes: 5 * MB },
  prop: { formats: ['glb'], maxBytes: 5 * MB },
};

const TYPES: Record<Format, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  glb: 'model/gltf-binary',
  json: 'application/json',
  bin: 'application/octet-stream',
};
const EXT: Record<Format, string> = {
  png: 'png',
  jpeg: 'jpg',
  webp: 'webp',
  glb: 'glb',
  json: 'json',
  bin: 'bin',
};

/** Work out a file's real format from its first bytes (never trust the declared type). */
export function sniff(b: Uint8Array): Format | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
  if (b[0] === 0x89 && ascii(1, 4) === 'PNG') return 'png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp';
  if (ascii(0, 4) === 'glTF') return 'glb';
  if (ascii(0, 4) === 'PNAV') return 'bin';
  try {
    JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(b));
    return 'json';
  } catch {
    return null;
  }
}

export type Asset = {
  id: string;
  kind: string;
  key: string;
  url: string;
  contentType: string;
  bytes: number;
  hash: string;
};

const toAsset = (r: {
  id: string;
  kind: string;
  key: string;
  content_type: string;
  bytes: number;
  hash: string;
}): Asset => ({
  id: r.id,
  kind: r.kind,
  key: r.key,
  url: `/files/${r.key}`,
  contentType: r.content_type,
  bytes: r.bytes,
  hash: r.hash,
});

/** Store an uploaded file. The same file uploaded twice (same kind + hash) returns the existing asset. */
export async function storeAsset(
  sql: Sql,
  storage: Storage,
  kind: string,
  body: Uint8Array<ArrayBuffer>,
): Promise<Asset> {
  const rule = KINDS[kind];
  if (!rule) throw new HttpError(400, `Unknown asset kind "${kind}".`);
  if (body.byteLength === 0) throw new HttpError(400, 'The file is empty.');
  if (body.byteLength > rule.maxBytes)
    throw new HttpError(413, `That file is too big (max ${rule.maxBytes / MB} MB).`);
  const format = sniff(body);
  if (!format || !rule.formats.includes(format))
    throw new HttpError(415, `A ${kind} must be ${rule.formats.map((f) => f.toUpperCase()).join(', ')}.`);

  const hash = createHash('sha256').update(body).digest('hex');
  const [existing] = await sql<
    Parameters<typeof toAsset>[0][]
  >`select * from assets where kind = ${kind} and hash = ${hash}`;
  if (existing) return toAsset(existing);

  const key = `${kind}/${hash}.${EXT[format]}`;
  await storage.put(key, body, TYPES[format]);
  const [row] = await sql<Parameters<typeof toAsset>[0][]>`
    insert into assets (kind, key, content_type, bytes, hash)
    values (${kind}, ${key}, ${TYPES[format]}, ${body.byteLength}, ${hash})
    on conflict (kind, hash) do update set kind = excluded.kind
    returning *`;
  return toAsset(row as Parameters<typeof toAsset>[0]);
}

export async function listAssets(sql: Sql): Promise<Asset[]> {
  return (await sql<Parameters<typeof toAsset>[0][]>`select * from assets order by created_at desc`).map(
    toAsset,
  );
}

/** Delete an asset record and its file. Returns false if there was no such asset. */
export async function deleteAsset(sql: Sql, storage: Storage, id: string): Promise<boolean> {
  const [row] = await sql<{ key: string }[]>`delete from assets where id = ${id} returning key`;
  if (!row) return false;
  await storage.delete(row.key);
  return true;
}
