// pnpm mall — the built-in mall (issue #2): takes the Blender output in .cache/mall (see
// tools/blender/build.py) and writes client/public/assets/mall/mall.glb with the lightmap embedded.
//
// Lightmap convention (also for uploaded buildings): each lit material carries the lightmap as its
// occlusionTexture on TEXCOORD_1, plus extras { lightmap: <scale> }. The texture holds
// sRGB(L / scale); the client renders base colour × L and ignores scene lights for those surfaces.
// Other viewers just see it as ambient occlusion, which degrades nicely.
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, textureCompress, weld } from '@gltf-transform/functions';
import sharp from 'sharp';

const SRC = resolve(import.meta.dirname, '../../.cache/mall');
const OUT = resolve(import.meta.dirname, '../../client/public/assets/mall');
/** Must match LIGHT_SCALE in tools/blender/build.py. */
const LIGHT_SCALE = 2;
/** Surfaces that make their own light or are see-through: no lightmap. */
const UNLIT = new Set(['glass', 'railglass', 'skylight', 'lightpanel']);
/** Lightmapped surfaces that also show a faint reflection of the mall (polished stone). */
const REFLECT: Record<string, number> = { floor: 0.12 };

if (!existsSync(`${SRC}/mall.glb`)) {
  console.log(
    'mall: no .cache/mall/mall.glb (run pnpm mall, which needs Blender); keeping the committed one',
  );
  process.exit(0);
}
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(`${SRC}/mall.glb`);
// quality 80: smooth lighting survives it well, and it keeps the model under its 1.5 MB budget
const png = await sharp(`${SRC}/lightmap.png`).webp({ quality: 80 }).toBuffer();
const lightmap = doc.createTexture('lightmap').setImage(new Uint8Array(png)).setMimeType('image/webp');

let lit = 0;
for (const m of doc.getRoot().listMaterials()) {
  const name = m.getName().split('.')[0] ?? '';
  if (UNLIT.has(name)) continue;
  m.setOcclusionTexture(lightmap);
  m.getOcclusionTextureInfo()?.setTexCoord(1);
  m.setExtras({
    ...m.getExtras(),
    lightmap: LIGHT_SCALE,
    ...(REFLECT[name] ? { reflect: REFLECT[name] } : {}),
  });
  lit++;
}
await doc.transform(
  dedup(),
  prune({ keepAttributes: true }),
  weld(),
  // the detail textures leave Blender as PNG; from photos (assets-src/mall/textures) that's ~250 KB each
  textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 85, slots: /^baseColorTexture$/ }),
);
await io.write(`${OUT}/mall.glb`, doc);
console.log(
  `mall: ${lit} lightmapped materials, lightmap ${(png.byteLength / 1024).toFixed(0)} KB, ` +
    `mall.glb ${(statSync(`${OUT}/mall.glb`).size / 1024).toFixed(0)} KB`,
);
