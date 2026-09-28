// Swappable art (docs/adr/0006): the host uploads a mall package (visual model, collision model,
// meta) and the server checks it fits together, bakes its navgrid and makes it the building.
// Visitors get it on their next visit; nothing else changes (shops keep their units).
import { WebIO } from '@gltf-transform/core';
import { bakeNavGrid, readTriangles } from '@shopping-mall/shared/bake';
import { type MallArt, type MallMeta, metaSchema } from '@shopping-mall/shared/meta';
import { encodeNavGrid } from '@shopping-mall/shared/navgrid';
import { storeAsset } from './assets.ts';
import { setMallArt } from './db/content.ts';
import type { Sql } from './db/db.ts';
import { HttpError } from './http/util.ts';
import type { Storage } from './storage.ts';

export type ArtUpload = { model: string; collision: string; meta: string };

const KIND: Record<keyof ArtUpload, string> = {
  model: 'mall-model',
  collision: 'mall-collision',
  meta: 'mall-meta',
};

/** The current building's file URLs, or null for the built-in one. */
export async function loadArt(sql: Sql): Promise<MallArt | null> {
  const [row] = await sql<{ model: string; collision: string; meta: string; navgrid: string }[]>`
    select m.key as model, c.key as collision, t.key as meta, n.key as navgrid
    from mall
    join assets m on m.id = mall.art_model
    join assets c on c.id = mall.art_collision
    join assets t on t.id = mall.art_meta
    join assets n on n.id = mall.art_navgrid`;
  if (!row) return null;
  return {
    model: `/files/${row.model}`,
    collision: `/files/${row.collision}`,
    meta: `/files/${row.meta}`,
    navgrid: `/files/${row.navgrid}`,
  };
}

async function fetchAsset(sql: Sql, storage: Storage, part: keyof ArtUpload, id: string) {
  const [row] = await sql<{ kind: string; key: string }[]>`select kind, key from assets where id = ${id}`;
  if (!row || row.kind !== KIND[part])
    throw new HttpError(400, `The ${part} must be an uploaded ${KIND[part]} file.`);
  const res = await storage.get(row.key);
  if (!res.ok) throw new Error(`art: can't read ${row.key} (${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}

/** Check a mall package and make it the building. Throws HttpError 400 with a clear reason if it doesn't fit. */
export async function replaceMallArt(sql: Sql, storage: Storage, ids: ArtUpload): Promise<number> {
  const [model, collision, metaBytes] = await Promise.all([
    fetchAsset(sql, storage, 'model', ids.model),
    fetchAsset(sql, storage, 'collision', ids.collision),
    fetchAsset(sql, storage, 'meta', ids.meta),
  ]);

  const parsed = metaSchema.safeParse(JSON.parse(new TextDecoder().decode(metaBytes)));
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => ({ path: `meta.${i.path.join('.')}`, message: i.message }));
    throw new HttpError(
      400,
      'The meta file doesn’t match the mall meta format (docs/art-direction.md).',
      fields,
    );
  }
  const meta: MallMeta = parsed.data;

  // every shop must still have its unit
  const units = new Set(meta.slots.map((s) => s.id));
  const homeless = (
    await sql<{ id: string; slot: string }[]>`select id, slot from shops order by sort`
  ).filter((s) => !units.has(s.slot));
  if (homeless.length)
    throw new HttpError(
      400,
      `The new mall has no unit for ${homeless.map((s) => `${s.id} (${s.slot})`).join(', ')}. Move or delete those shops first.`,
    );

  try {
    await new WebIO().readBinary(model);
  } catch {
    throw new HttpError(400, 'The mall model isn’t a valid .glb file.');
  }
  let navgrid: Uint8Array<ArrayBuffer>;
  try {
    const grid = bakeNavGrid(await readTriangles(collision), meta);
    navgrid = encodeNavGrid(grid) as Uint8Array<ArrayBuffer>;
  } catch (e) {
    throw new HttpError(400, `Couldn’t work out where people can walk: ${(e as Error).message}`);
  }
  const nav = await storeAsset(sql, storage, 'navgrid', navgrid);
  return setMallArt(sql, { ...ids, navgrid: nav.id });
}
