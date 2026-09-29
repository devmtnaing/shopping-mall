// pnpm greybox — writes the greybox mall: visual .glb, collision .glb and mall.meta.json.
// Stands in for the Blender export until the real mall exists (docs/roadmap.md, Phase 2).
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';
import { metaSchema } from '@shopping-mall/shared/meta';
import { buildGreybox } from './layout.ts';

const OUT = resolve(import.meta.dirname, '../../client/public/assets/mall');

/** sRGB hex, roughness, metalness, [opacity], [emissive]. glTF wants linear colour. */
const MATERIALS: Record<string, [string, number, number, number?, boolean?]> = {
  floor: ['#d9d3c7', 0.22, 0], // polished stone: picks up the environment reflection
  wall: ['#ece7df', 0.9, 0],
  ceiling: ['#f4f1ec', 0.95, 0],
  shopfloor: ['#b9b0a1', 0.6, 0],
  trim: ['#b08d57', 0.35, 0.9],
  dark: ['#34322e', 0.6, 0],
  rail: ['#8e8b86', 0.4, 0.6],
  glass: ['#a9c4cf', 0.05, 0, 0.25],
  escalator: ['#5d5a55', 0.5, 0.3],
  wood: ['#9a6a3f', 0.7, 0],
  planter: ['#e6dfd3', 0.8, 0],
  plant: ['#4d7a45', 0.9, 0],
  water: ['#6fb3c8', 0.1, 0, 0.8],
  skylight: ['#fff8ea', 1, 0, 1, true],
};

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const rgb = (hex: string) => [1, 3, 5].map((i) => toLinear(Number.parseInt(hex.slice(i, i + 2), 16) / 255));

function visualGlb(parts: ReturnType<typeof buildGreybox>['geo']['parts']) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene('greybox');
  for (const [name, part] of parts) {
    const spec = MATERIALS[name];
    if (!spec) throw new Error(`greybox: no material "${name}"`);
    const [hex, roughness, metalness, opacity = 1, emissive = false] = spec;
    const material = doc
      .createMaterial(name)
      .setBaseColorFactor([...rgb(hex), opacity] as [number, number, number, number])
      .setRoughnessFactor(roughness)
      .setMetallicFactor(metalness)
      .setAlphaMode(opacity < 1 ? 'BLEND' : 'OPAQUE');
    if (emissive) material.setEmissiveFactor(rgb(hex) as [number, number, number]);
    const prim = doc
      .createPrimitive()
      .setMaterial(material)
      .setAttribute(
        'POSITION',
        doc.createAccessor().setType('VEC3').setArray(new Float32Array(part.positions)).setBuffer(buffer),
      )
      .setAttribute(
        'NORMAL',
        doc.createAccessor().setType('VEC3').setArray(new Float32Array(part.normals)).setBuffer(buffer),
      );
    scene.addChild(doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(prim)));
  }
  return doc;
}

function collisionGlb(positions: number[]) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const count = positions.length / 3;
  const index = count > 65535 ? new Uint32Array(count) : new Uint16Array(count);
  for (let i = 0; i < count; i++) index[i] = i;
  const prim = doc
    .createPrimitive()
    .setAttribute(
      'POSITION',
      doc.createAccessor().setType('VEC3').setArray(new Float32Array(positions)).setBuffer(buffer),
    )
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(index).setBuffer(buffer));
  doc
    .createScene('collision')
    .addChild(doc.createNode('collision').setMesh(doc.createMesh('collision').addPrimitive(prim)));
  return doc;
}

const { geo, meta } = buildGreybox();
metaSchema.parse(meta);
mkdirSync(OUT, { recursive: true });
const io = new NodeIO();
const visual = await io.writeBinary(visualGlb(geo.parts));
const collision = await io.writeBinary(collisionGlb(geo.collision));
writeFileSync(`${OUT}/greybox.glb`, visual);
writeFileSync(`${OUT}/greybox.collision.glb`, collision);
writeFileSync(`${OUT}/mall.meta.json`, `${JSON.stringify(meta, null, 1)}\n`);

const tris = [...geo.parts.values()].reduce((n, p) => n + p.positions.length / 9, 0);
console.log(
  `greybox: ${geo.parts.size} materials, ${tris} tris (${(visual.byteLength / 1024).toFixed(0)} KB), ` +
    `collision ${geo.collision.length / 9} tris (${(collision.byteLength / 1024).toFixed(0)} KB), ` +
    `${meta.slots.length} slots, ${meta.seats.length} seats, ${meta.zones.length} zones`,
);
