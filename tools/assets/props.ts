// pnpm assets — builds client/public/assets/props/props.glb from assets-src/props: one node per prop
// kind (named by kind), scaled to real-world size, standing on y = 0, centred on x/z, front facing −Z
// (the mall's yaw 0). The mall's meta places them (meta.props); the client instances each kind.
import { mkdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { Document, getBounds, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  dedup,
  flatten,
  mergeDocuments,
  meshopt,
  prune,
  textureCompress,
  unpartition,
  weld,
} from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import { PROPS } from '../greybox/props.ts';

const SRC = resolve(import.meta.dirname, '../../assets-src/props');
const OUT = resolve(import.meta.dirname, '../../client/public/assets/props');

await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

const out = new Document();
const scene = out.createScene('props');
for (const [kind, p] of Object.entries(PROPS)) {
  const doc = await io.read(`${SRC}/${p.src}`);
  await doc.transform(flatten()); // bake the source's node hierarchy into its meshes' placement
  const src = doc.getRoot().listScenes()[0];
  if (!src) throw new Error(`${kind}: no scene`);
  // kind (placed by the mall) → fit (scale to real size, stand on the floor, centre) → model (face −Z)
  const model = doc
    .createNode(`${kind}-model`)
    .setRotation([0, Math.sin(p.turn / 2), 0, Math.cos(p.turn / 2)]);
  for (const n of src.listChildren()) model.addChild(n);
  const fit = doc.createNode(`${kind}-fit`).addChild(model);
  const root = doc.createNode(kind).addChild(fit);
  src.addChild(root);
  const b = getBounds(fit);
  const dims = { x: b.max[0] - b.min[0], y: b.max[1] - b.min[1], z: b.max[2] - b.min[2] };
  const s = p.size / dims[p.axis];
  fit.setScale([s, s, s]);
  const c = getBounds(fit);
  fit.setTranslation([-(c.min[0] + c.max[0]) / 2, -c.min[1], -(c.min[2] + c.max[2]) / 2]);
  mergeDocuments(out, doc);
}
for (const s of out.getRoot().listScenes()) {
  if (s === scene) continue;
  for (const n of s.listChildren()) scene.addChild(n);
  s.dispose();
}
out.getRoot().setDefaultScene(scene);
await out.transform(
  unpartition(),
  dedup(),
  prune(),
  weld(),
  // generated models come with 1–2k textures; props are never seen close enough to need more than 384
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [384, 384], quality: 80 }),
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
);

mkdirSync(OUT, { recursive: true });
await io.write(`${OUT}/props.glb`, out);
console.log(
  `props: ${Object.keys(PROPS).length} kinds, ${(statSync(`${OUT}/props.glb`).size / 1024).toFixed(0)} KB`,
);
