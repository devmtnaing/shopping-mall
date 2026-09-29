// pnpm assets — builds client/public/assets/avatars/ from assets-src/avatars (Kenney Mini Characters, CC0,
// plus characters generated with Higgsfield and put on the Kenney rig by `pnpm rig`):
//   avatars.glb   every character as its own skinned mesh (body + head joined: one draw call each),
//                 one shared texture, and one set of animation clips (all characters share the rig)
//   <id>.png      64 px preview for the character picker
// Deterministic: the same sources always give the same bytes.
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { Document, getBounds, type Node, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  dedup,
  joinPrimitives,
  mergeDocuments,
  meshopt,
  prune,
  resample,
  textureCompress,
  unpartition,
  weld,
} from '@gltf-transform/functions';
import { AVATARS, CLIPS } from '@shopping-mall/shared/avatars';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

const SRC = resolve(import.meta.dirname, '../../assets-src/avatars/kenney-mini-characters');
const RIGGED = resolve(import.meta.dirname, '../../assets-src/avatars/higgsfield/rigged');
/** A Kenney character's model and preview, or a generated one's (rigged by tools/blender/rig.py). */
const kenney = (id: string) => existsSync(`${SRC}/models/character-${id}.glb`);
const model = (id: string) => (kenney(id) ? `${SRC}/models/character-${id}.glb` : `${RIGGED}/${id}.glb`);
const preview = (id: string) => (kenney(id) ? `${SRC}/previews/character-${id}.png` : `${RIGGED}/${id}.png`);
const OUT = resolve(import.meta.dirname, '../../client/public/assets/avatars');
/** Standing height in metres: the source characters are about 0.6 m, the player capsule 1.75 m. */
const HEIGHT = 1.55;

await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

/** One character, reduced to a single skinned mesh under a node named by its id. */
async function character(id: string, keepClips: boolean): Promise<Document> {
  const doc = await io.read(model(id));
  const root = doc.getRoot();
  for (const a of root.listAnimations()) {
    if (keepClips && (CLIPS as readonly string[]).includes(a.getName())) continue;
    // samplers outlive their animation otherwise, and keep every keyframe alive through prune()
    for (const x of [...a.listChannels(), ...a.listSamplers(), a]) x.dispose();
  }
  const top = root.listScenes()[0]?.listChildren()[0] as Node;
  const parts = top.listChildren().filter((n) => n.getMesh());
  const skin = parts[0]?.getSkin();
  const joints = (n: Node) =>
    n
      .getSkin()
      ?.listJoints()
      .map((j) => j.getName())
      .join();
  if (!skin || parts.some((n) => joints(n) !== joints(parts[0] as Node)))
    throw new Error(`${id}: expected meshes skinned to the same joints`);
  const prims = parts.map((n) => n.getMesh()?.listPrimitives()[0]).filter((p) => p !== undefined);
  for (const p of prims) for (const s of ['TANGENT', 'TEXCOORD_1']) p.setAttribute(s, null); // unused
  const joined = joinPrimitives(prims);
  const body = parts[0] as Node;
  body.setName(`${id}-mesh`).setMesh(doc.createMesh(id).addPrimitive(joined));
  for (const n of parts.slice(1)) n.dispose();

  const [, minY] = getBounds(top).min;
  const [, maxY] = getBounds(top).max;
  const s = HEIGHT / (maxY - minY);
  top.setName(id).setScale([s, s, s]);
  return doc;
}

const out = new Document();
const scene = out.createScene('avatars');
for (const [i, id] of AVATARS.entries()) {
  mergeDocuments(out, await character(id, i === 0));
}
// mergeDocuments brings each character's scene along: gather the characters into one
for (const s of out.getRoot().listScenes()) {
  if (s === scene) continue;
  for (const n of s.listChildren()) scene.addChild(n);
  s.dispose();
}
out.getRoot().setDefaultScene(scene);

await out.transform(
  unpartition(),
  dedup(), // twelve copies of the same colormap become one texture and one material
  prune(),
  // a generated character brings its own 2048 px texture; at the size a character is seen, 256 is plenty
  textureCompress({
    encoder: sharp,
    targetFormat: 'webp',
    resize: [256, 256],
    quality: 85,
    pattern: /^(?!colormap)/,
  }),
  resample(),
  weld(),
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
);

mkdirSync(OUT, { recursive: true });
await io.write(`${OUT}/avatars.glb`, out);
for (const id of AVATARS) copyFileSync(preview(id), `${OUT}/${id}.png`);

const clips = out
  .getRoot()
  .listAnimations()
  .map((a) => a.getName());
console.log(
  `avatars: ${AVATARS.length} characters, clips ${clips.join(' ')}, ` +
    `${(statSync(`${OUT}/avatars.glb`).size / 1024).toFixed(0)} KB`,
);
