// node tools/assets/software-props.ts — writes the software house's furniture to
// assets-src/props/blockout/: a workstation (desk, monitor showing code, office chair) and a course
// screen (a big video-lesson display on a media console). Built from flat-coloured boxes in metres,
// front facing −Z, so they sit with the low-poly props. They stand in until Higgsfield models are
// generated from the prompts in assets-src/props/higgsfield/prompts.md: then swap the `src` in
// tools/greybox/props.ts and run `pnpm assets`.
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { Document, type Material, NodeIO } from '@gltf-transform/core';

const OUT = resolve(import.meta.dirname, '../../assets-src/props/blockout');

type V3 = [number, number, number];
type Part = { min: V3; max: V3; color: string } | { tri: [V3, V3, V3]; depth: number; color: string };

const hex = (c: string): [number, number, number, number] => {
  const n = Number.parseInt(c.slice(1), 16);
  // sRGB → linear, as glTF wants for baseColorFactor
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return [lin((n >> 16) & 255), lin((n >> 8) & 255), lin(n & 255), 1];
};

/** A box `size` big whose centre is `c`. */
const box = (c: V3, size: V3, color: string): Part => ({
  min: [c[0] - size[0] / 2, c[1] - size[1] / 2, c[2] - size[2] / 2],
  max: [c[0] + size[0] / 2, c[1] + size[1] / 2, c[2] + size[2] / 2],
  color,
});

/** Flat-shaded triangles for a part: positions and normals, unindexed. */
function triangles(p: Part): { pos: number[]; nrm: number[] } {
  const pos: number[] = [];
  const nrm: number[] = [];
  const quad = (a: V3, b: V3, c: V3, d: V3, n: V3) => {
    for (const v of [a, b, c, a, c, d]) pos.push(...v);
    for (let i = 0; i < 6; i++) nrm.push(...n);
  };
  if ('min' in p) {
    const [x0, y0, z0] = p.min;
    const [x1, y1, z1] = p.max;
    quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [1, 0, 0]);
    quad([x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0], [-1, 0, 0]);
    quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [0, 1, 0]);
    quad([x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [0, -1, 0]);
    quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]);
    quad([x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z0], [0, 0, -1]);
    return { pos, nrm };
  }
  // a triangle in the xy plane (at its z), pushed back by `depth`: only its front face is seen
  const [a, b, c] = p.tri;
  for (const v of [a, b, c]) pos.push(...v);
  for (let i = 0; i < 3; i++) nrm.push(0, 0, -1);
  const back = (v: V3): V3 => [v[0], v[1], v[2] + p.depth];
  quad(a, back(a), back(b), b, [0, 1, 0]);
  quad(b, back(b), back(c), c, [1, 0, 0]);
  quad(c, back(c), back(a), a, [-1, 0, 0]);
  return { pos, nrm };
}

async function write(name: string, parts: Part[]) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene(name);
  const mats = new Map<string, Material>();
  const byColor = new Map<string, Part[]>();
  for (const p of parts) byColor.set(p.color, [...(byColor.get(p.color) ?? []), p]);
  const mesh = doc.createMesh(name);
  for (const [color, ps] of byColor) {
    let m = mats.get(color);
    if (!m) {
      m = doc
        .createMaterial(color)
        .setBaseColorFactor(hex(color))
        .setRoughnessFactor(0.8)
        .setMetallicFactor(0);
      mats.set(color, m);
    }
    const pos: number[] = [];
    const nrm: number[] = [];
    for (const p of ps) {
      // parts are laid out with +x to the right of someone facing them; facing −Z, that's −x
      const t = triangles(p);
      pos.push(...t.pos.map((v, i) => (i % 3 ? v : -v)));
      nrm.push(...t.nrm.map((v, i) => (i % 3 ? v : -v)));
    }
    // glTF's front faces wind counter-clockwise: turn round any triangle that faces away from its normal
    const at = (i: number) => pos[i] as number;
    for (let i = 0; i < pos.length; i += 9) {
      const [ux, uy, uz] = [at(i + 3) - at(i), at(i + 4) - at(i + 1), at(i + 5) - at(i + 2)];
      const [vx, vy, vz] = [at(i + 6) - at(i), at(i + 7) - at(i + 1), at(i + 8) - at(i + 2)];
      const facing =
        (uy * vz - uz * vy) * (nrm[i] as number) +
        (uz * vx - ux * vz) * (nrm[i + 1] as number) +
        (ux * vy - uy * vx) * (nrm[i + 2] as number);
      if (facing < 0)
        for (let k = 0; k < 3; k++) [pos[i + 3 + k], pos[i + 6 + k]] = [at(i + 6 + k), at(i + 3 + k)];
    }
    mesh.addPrimitive(
      doc
        .createPrimitive()
        .setMaterial(m)
        .setAttribute(
          'POSITION',
          doc.createAccessor().setType('VEC3').setArray(new Float32Array(pos)).setBuffer(buffer),
        )
        .setAttribute(
          'NORMAL',
          doc.createAccessor().setType('VEC3').setArray(new Float32Array(nrm)).setBuffer(buffer),
        ),
    );
  }
  scene.addChild(doc.createNode(name).setMesh(mesh));
  await new NodeIO().write(`${OUT}/${name}.glb`, doc);
}

const OAK = '#c89a64';
const WHITE = '#eceae4';
const CHARCOAL = '#2b2d33';
const SCREEN = '#16213a';
const TEAL = '#2ec4b6';
const CODE = ['#7aa2f7', '#e0af68', '#9ece6a', '#bb9af7', '#f7768e'];

/** Coloured lines of code on a screen whose face is at z, from (x, top) down, each `h` tall. */
const code = (x: number, top: number, z: number, width: number, lines: number, h: number): Part[] =>
  Array.from({ length: lines }, (_, i) => {
    const indent = [0, 1, 2, 2, 1, 2, 3, 1, 0][i % 9] as number;
    const len = width * (0.35 + ((i * 37) % 50) / 100) - indent * h * 2;
    const x0 = x + indent * h * 2;
    return box(
      [x0 + len / 2, top - i * h * 1.9, z - 0.004],
      [len, h, 0.006],
      CODE[i % CODE.length] as string,
    );
  });

// A workstation: the person sits on the −Z side, facing the monitor.
const workstation: Part[] = [
  // desk: white top on oak side panels, with a modesty panel at the back
  box([0, 0.74, 0], [1.4, 0.04, 0.7], WHITE),
  box([-0.66, 0.36, 0], [0.04, 0.72, 0.66], OAK),
  box([0.66, 0.36, 0], [0.04, 0.72, 0.66], OAK),
  box([0, 0.5, 0.3], [1.28, 0.4, 0.02], OAK),
  // monitor on a stand, showing code
  box([0, 0.79, 0.2], [0.24, 0.02, 0.16], CHARCOAL),
  box([0, 0.9, 0.24], [0.05, 0.22, 0.04], CHARCOAL),
  box([0, 1.12, 0.2], [0.66, 0.4, 0.03], CHARCOAL),
  box([0, 1.13, 0.183], [0.6, 0.34, 0.004], SCREEN),
  ...code(-0.27, 1.27, 0.181, 0.5, 9, 0.016),
  // keyboard, mouse and a mug
  box([0, 0.77, -0.1], [0.44, 0.02, 0.14], CHARCOAL),
  box([0.32, 0.77, -0.1], [0.06, 0.02, 0.1], CHARCOAL),
  box([-0.5, 0.81, 0.05], [0.08, 0.1, 0.08], TEAL),
  // office chair, facing the desk
  box([0, 0.46, -0.62], [0.5, 0.07, 0.48], CHARCOAL),
  box([0, 0.78, -0.86], [0.48, 0.5, 0.06], CHARCOAL),
  box([0, 0.6, -0.84], [0.06, 0.3, 0.04], '#8a8f99'),
  box([0, 0.24, -0.62], [0.06, 0.4, 0.06], '#8a8f99'),
  box([0, 0.03, -0.62], [0.56, 0.05, 0.06], '#8a8f99'),
  box([0, 0.03, -0.62], [0.06, 0.05, 0.56], '#8a8f99'),
];

// A course screen: a big display playing a video lesson, over a low oak media console.
const SW = 2.6;
const courseScreen: Part[] = [
  box([0, 0.25, 0], [2.4, 0.5, 0.45], OAK),
  box([0, 0.51, 0], [2.44, 0.03, 0.47], WHITE),
  // the display hangs on the wall behind the console
  box([0, 1.6, 0.18], [SW, 1.5, 0.06], CHARCOAL),
  box([0, 1.6, 0.147], [SW - 0.1, 1.4, 0.004], SCREEN),
  // the lesson's title bar
  box([0, 2.22, 0.143], [SW - 0.1, 0.16, 0.004], TEAL),
  box([-0.75, 2.22, 0.14], [0.9, 0.05, 0.004], WHITE),
  // the code being taught, left; the presenter's slide, right
  ...code(-1.18, 2.0, 0.143, 1.0, 11, 0.04),
  box([0.62, 1.62, 0.143], [0.9, 0.62, 0.004], '#24304f'),
  // play button
  box([0.62, 1.62, 0.14], [0.36, 0.36, 0.004], '#e8e6ff'),
  {
    tri: [
      [0.56, 1.72, 0.136],
      [0.56, 1.52, 0.136],
      [0.72, 1.62, 0.136],
    ],
    depth: 0.004,
    color: SCREEN,
  },
  // progress bar
  box([0, 1.0, 0.143], [SW - 0.4, 0.04, 0.004], '#55607a'),
  box([-0.6, 1.0, 0.14], [SW - 0.4 - 1.2, 0.04, 0.004], TEAL),
  // a laptop and a small speaker on the console
  box([-0.8, 0.54, -0.05], [0.36, 0.02, 0.25], '#b9bec8'),
  box([-0.8, 0.66, 0.07], [0.36, 0.24, 0.015], '#b9bec8'),
  box([-0.8, 0.66, 0.062], [0.32, 0.2, 0.002], SCREEN),
  box([0.9, 0.62, 0], [0.16, 0.2, 0.16], CHARCOAL),
];

mkdirSync(OUT, { recursive: true });
await write('workstation', workstation);
await write('course-screen', courseScreen);
console.log(`wrote workstation.glb and course-screen.glb to ${OUT}`);
