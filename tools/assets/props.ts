// pnpm assets — builds client/public/assets/props/<pack>.glb from assets-src/props: one node per prop
// kind (named by kind), scaled to real-world size, standing on y = 0, centred on x/z, front facing −Z
// (the mall's yaw 0). index.json says which pack holds which kinds, and their collision boxes. The mall's meta places them
// (meta.props); the client loads a pack when a visitor nears its props and instances each kind.
import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Document, getBounds, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  dedup,
  flatten,
  join,
  mergeDocuments,
  meshopt,
  palette,
  prune,
  textureCompress,
  unpartition,
  weld,
} from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import { PACKS, type Pack, PROPS } from '../greybox/props.ts';

const SRC = resolve(import.meta.dirname, '../../assets-src/props');
const OUT = resolve(import.meta.dirname, '../../client/public/assets/props');

await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

async function buildPack(pack: Pack) {
  const out = new Document();
  const scene = out.createScene(pack);
  for (const [kind, p] of Object.entries(PROPS)) {
    if (p.pack !== pack) continue;
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
    // flat-coloured models (Kenney's) have a material per colour: bake those into one palette
    // texture, then join each model's parts, so a shelf is one draw call instead of eleven
    palette({ min: 2 }),
    join(),
    prune(),
    weld(),
    // generated models come with 1–2k textures; props are never seen close enough to need more than 384
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [384, 384], quality: 80 }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  return out;
}

mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(OUT)) rmSync(`${OUT}/${f}`); // drop packs that no longer exist
/** Which pack holds which kinds, and each kind's collision box (for props the client places itself). */
const index: {
  packs: Record<string, string[]>;
  footprints: Record<string, [number, number, number] | null>;
} = {
  packs: {},
  footprints: Object.fromEntries(Object.entries(PROPS).map(([k, p]) => [k, p.footprint])),
};
for (const pack of PACKS) {
  const kinds = Object.keys(PROPS).filter((k) => PROPS[k]?.pack === pack);
  if (!kinds.length) continue;
  await io.write(`${OUT}/${pack}.glb`, await buildPack(pack));
  index.packs[pack] = kinds;
  console.log(
    `props/${pack}: ${kinds.length} kinds, ${(statSync(`${OUT}/${pack}.glb`).size / 1024).toFixed(0)} KB`,
  );
}
writeFileSync(`${OUT}/index.json`, `${JSON.stringify(index)}\n`);
