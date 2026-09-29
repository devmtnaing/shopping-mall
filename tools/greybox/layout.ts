// The greybox mall: geometry + gameplay meta from one description. Dimensions: docs/greybox.md.
// Coordinates: metres, Y up, the mall runs along −Z from the entrance (z = 0).
// Side s = −1 is west (left as you walk in), s = +1 is east.
import type { MallMeta } from '@shopping-mall/shared/meta';
import { Geo } from './geometry.ts';
import { PROPS } from './props.ts';

const PI = Math.PI;
const X_CON = 6; // concourse half-width
const X_OUT = 16; // outer wall (inner face)
const T = 0.3; // wall and slab thickness
const SLOTS = 6; // shops per side per floor
const SLOT_LEN = 8;
const SLOT_Z0 = -4; // south edge of slot 0
const Z_SHOPS_END = SLOT_Z0 - SLOTS * SLOT_LEN; // −52
const Z_FLAG = -54; // flagship storefront
const Z_END = -64; // north wall
const UP = 7.6; // upper floor level
const CEIL = UP - T; // underside of the upper slab
const ROOF = 13.6;
const VOID = { x: 3, z0: -8, z1: Z_SHOPS_END }; // atrium opening in the upper floor
const BRIDGE = { z0: -25, z1: -32 };
const DOOR_W = 6;
const DOOR_H = 4;
const RAIL_H = 1.1;

export function buildGreybox() {
  const g = new Geo();
  const meta: MallMeta = {
    version: 1,
    floors: [
      { id: 'ground', y: 0 },
      { id: 'upper', y: UP },
    ],
    spawns: [{ id: 'entrance', pos: [0, 0, -5.5], yaw: 0 }],
    slots: [],
    seats: [],
    zones: [],
    escalators: [],
  };

  shell(g);
  for (const s of [-1, 1] as const) for (const upper of [false, true]) shopRow(g, meta, s, upper);
  flagship(g, meta);
  upperFloor(g);
  escalator(g, meta, 'a', -2, -12, BRIDGE.z0);
  escalator(g, meta, 'b', 2, -45, BRIDGE.z1);
  props(g, meta);
  zones(meta);
  return { geo: g, meta };
}

/** Floor slab, outer walls, glass entrance, roof with a skylight over the atrium. */
function shell(g: Geo) {
  g.box('floor', [-X_OUT, -T, Z_END], [X_OUT, 0, T]);
  // south wall with the entrance (glass doors are solid: you spawn inside)
  g.box('wall', [-X_OUT, 0, 0], [-4, ROOF, T]);
  g.box('wall', [4, 0, 0], [X_OUT, ROOF, T]);
  g.box('wall', [-4, DOOR_H, 0], [4, ROOF, T]);
  g.box('glass', [-4, 0, 0.05], [4, DOOR_H, 0.15]);
  g.box('trim', [-4.1, DOOR_H, -0.02], [4.1, DOOR_H + 0.15, 0.05], false);
  g.box('wall', [-X_OUT, 0, Z_END - T], [X_OUT, ROOF, Z_END]);
  g.box('wall', [-X_OUT - T, 0, Z_END - T], [-X_OUT, ROOF, T]);
  g.box('wall', [X_OUT, 0, Z_END - T], [X_OUT + T, ROOF, T]);
  // close off the dead corners beside the lobby and beside the flagship, both floors
  for (const s of [-1, 1]) {
    g.box('wall', xs(s, X_CON, X_CON + T, 0, SLOT_Z0), xs(s, X_CON, X_CON + T, ROOF, 0, true));
    g.box('wall', xs(s, X_CON, X_CON + T, 0, Z_FLAG), xs(s, X_CON, X_CON + T, ROOF, Z_SHOPS_END, true));
  }
  // roof, open over the atrium, where a skylight sits instead
  roofOrSlab(g, 'ceiling', ROOF, ROOF + T, false);
  g.box('skylight', [-VOID.x, ROOF, VOID.z1], [VOID.x, ROOF + 0.1, VOID.z0]);
}

/**
 * Box corners for something on side s spanning |x| ∈ [a, b].
 * Returns the min corner, or the max corner when `max` is true, so callers write
 * g.box(mat, xs(s, a, b, y0, z0), xs(s, a, b, y1, z1, true)).
 */
function xs(s: number, a: number, b: number, y: number, z: number, max = false): [number, number, number] {
  const lo = s < 0 ? -b : a;
  const hi = s < 0 ? -a : b;
  return [max ? hi : lo, y, z];
}

/** Six shops along one side of one floor. */
function shopRow(g: Geo, meta: MallMeta, s: -1 | 1, upper: boolean) {
  const y0 = upper ? UP : 0;
  const top = upper ? ROOF : CEIL;
  // dividers between units, including both ends of the row. They start behind the storefront (the
  // pillars already close the front), so their end caps don't overlap the pillars' faces: coplanar
  // faces flicker, and bake black.
  for (let k = 0; k <= SLOTS; k++) {
    const z = SLOT_Z0 - k * SLOT_LEN;
    g.box('wall', xs(s, X_CON + T, X_OUT, y0, z - 0.15), xs(s, X_CON + T, X_OUT, top, z + 0.15, true));
  }
  for (let i = 0; i < SLOTS; i++) {
    const zA = SLOT_Z0 - i * SLOT_LEN; // south edge (nearer the entrance)
    const zB = zA - SLOT_LEN;
    const zc = (zA + zB) / 2;
    const pillar = (SLOT_LEN - DOOR_W) / 2;
    // storefront: two pillars and a header above the doorway
    g.box('wall', xs(s, X_CON, X_CON + T, y0, zA - pillar), xs(s, X_CON, X_CON + T, top, zA, true));
    g.box('wall', xs(s, X_CON, X_CON + T, y0, zB), xs(s, X_CON, X_CON + T, top, zB + pillar, true));
    g.box(
      'wall',
      xs(s, X_CON, X_CON + T, y0 + DOOR_H, zB + pillar),
      xs(s, X_CON, X_CON + T, top, zA - pillar, true),
    );
    g.box(
      'trim',
      xs(s, X_CON - 0.04, X_CON, y0 + DOOR_H - 0.12, zB + pillar),
      xs(s, X_CON - 0.04, X_CON, y0 + DOOR_H, zA - pillar, true),
      false,
    );
    g.box(
      'shopfloor',
      xs(s, X_CON + T, X_OUT, y0, zB + 0.15),
      xs(s, X_CON + T, X_OUT, y0 + 0.01, zA - 0.15, true),
      false,
    );

    const id = `${upper ? 'u-' : ''}${s < 0 ? 'w' : 'e'}${i}`;
    const inward = s < 0 ? PI / 2 : -PI / 2; // yaw facing into the shop
    meta.slots.push({
      id,
      floor: upper ? 'upper' : 'ground',
      door: { pos: [s * (X_CON + T / 2), y0, zc], yaw: inward },
      sign: { pos: [s * (X_CON - 0.02), y0 + DOOR_H + 0.9, zc], size: [DOOR_W - 0.4, 1.3], yaw: -inward },
      interior: { min: xs(s, X_CON + T, X_OUT, y0, zB), max: xs(s, X_CON + T, X_OUT, top, zA, true) },
    });
  }
}

/** The big store at the far end: wide doorway, a stage with three steps (tests step-up). */
function flagship(g: Geo, meta: MallMeta) {
  const z0 = Z_FLAG;
  const z1 = Z_FLAG + T;
  g.box('wall', [-X_OUT, 0, z0], [-5, CEIL, z1]);
  g.box('wall', [5, 0, z0], [X_OUT, CEIL, z1]);
  g.box('wall', [-5, 4.5, z0], [5, CEIL, z1]);
  g.box('trim', [-5, 4.38, z1], [5, 4.5, z1 + 0.04], false);
  g.box('shopfloor', [-X_OUT, 0, Z_END], [X_OUT, 0.01, z0], false);
  g.box('dark', [-6, 0, Z_END], [6, 0.6, -61]);
  g.box('dark', [-6, 0, -61], [6, 0.4, -60.6]);
  g.box('dark', [-6, 0, -60.6], [6, 0.2, -60.2]);
  meta.slots.push({
    id: 'flagship',
    floor: 'ground',
    door: { pos: [0, 0, z0 + T / 2], yaw: 0 },
    sign: { pos: [0, 5.9, z1 + 0.02], size: [8, 1.8], yaw: PI },
    interior: { min: [-X_OUT, 0, Z_END], max: [X_OUT, CEIL, z0] },
  });
}

/** Upper slab (open over the atrium, with a bridge across) and railings around the opening. */
function upperFloor(g: Geo) {
  roofOrSlab(g, 'floor', CEIL, UP, true);
  g.box('floor', [-VOID.x, CEIL, BRIDGE.z1], [VOID.x, UP, BRIDGE.z0]);

  const y0 = UP;
  const y1 = UP + RAIL_H;
  const r = 0.08;
  for (const s of [-1, 1]) {
    const x0 = s < 0 ? -VOID.x : VOID.x - r;
    g.box('rail', [x0, y0, VOID.z1], [x0 + r, y1, BRIDGE.z1]);
    g.box('rail', [x0, y0, BRIDGE.z0], [x0 + r, y1, VOID.z0]);
  }
  g.box('rail', [-VOID.x, y0, VOID.z0], [VOID.x, y1, VOID.z0 + r]);
  g.box('rail', [-VOID.x, y0, VOID.z1 - r], [VOID.x, y1, VOID.z1]);
  // bridge edges, with gaps where the escalators arrive
  g.box('rail', [-VOID.x, y0, BRIDGE.z0 - r], [-2.6, y1, BRIDGE.z0]);
  g.box('rail', [-1.4, y0, BRIDGE.z0 - r], [VOID.x, y1, BRIDGE.z0]);
  g.box('rail', [-VOID.x, y0, BRIDGE.z1], [1.4, y1, BRIDGE.z1 + r]);
  g.box('rail', [2.6, y0, BRIDGE.z1], [VOID.x, y1, BRIDGE.z1 + r]);
}

/** A horizontal slab covering the whole mall except the atrium opening. */
function roofOrSlab(g: Geo, mat: string, y0: number, y1: number, collide: boolean) {
  g.box(mat, [-X_OUT, y0, VOID.z0], [X_OUT, y1, 0], collide);
  g.box(mat, [-X_OUT, y0, Z_END], [X_OUT, y1, VOID.z1], collide);
  g.box(mat, [-X_OUT, y0, VOID.z1], [-VOID.x, y1, VOID.z0], collide);
  g.box(mat, [VOID.x, y0, VOID.z1], [X_OUT, y1, VOID.z0], collide);
}

/** Escalator: a solid wedge whose top is the walking surface, with side panels. Rises from zBottom to zTop. */
function escalator(g: Geo, meta: MallMeta, id: string, xc: number, zBottom: number, zTop: number) {
  const w = 1.2;
  const x0 = xc - w / 2;
  const x1 = xc + w / 2;
  const north = zTop < zBottom; // rises toward −z
  const zl = Math.min(zBottom, zTop);
  const zr = Math.max(zBottom, zTop);
  // polygons in (z, y), counter-clockwise with z to the right
  const wedge: [number, number][] = north
    ? [
        [zl, 0],
        [zr, 0],
        [zl, UP],
      ]
    : [
        [zl, 0],
        [zr, 0],
        [zr, UP],
      ];
  const panel: [number, number][] = north
    ? [
        [zl, 0],
        [zr, 0],
        [zr, 1],
        [zl, UP + 1],
      ]
    : [
        [zl, 0],
        [zr, 0],
        [zr, UP + 1],
        [zl, 1],
      ];
  g.xprism('escalator', x0, x1, wedge);
  g.xprism('panel', x0 - 0.1, x0, panel);
  g.xprism('panel', x1, x1 + 0.1, panel);
  meta.escalators.push({ id, from: [xc, 0, zBottom], to: [xc, UP, zTop], width: w, speed: 1.2 });
}

/** Benches (seats), bins, lamps, plants, café tables, sofas, planters and a fountain. */
function props(g: Geo, meta: MallMeta) {
  const placed: NonNullable<MallMeta['props']> = [];
  meta.props = placed;
  /** A prop from the props pack, with an invisible collision box (yaw in quarter turns only). */
  const place = (kind: string, x: number, y: number, z: number, yaw = 0) => {
    const spec = PROPS[kind];
    if (!spec) throw new Error(`greybox: unknown prop "${kind}"`);
    placed.push({ kind, pos: [x, y, z], yaw });
    if (!spec.footprint) return;
    const [w, h, d] = spec.footprint;
    const [hx, hz] = Math.abs(Math.sin(yaw)) > 0.5 ? [d / 2, w / 2] : [w / 2, d / 2];
    g.box(null, [x - hx, y, z - hz], [x + hx, y + h, z + hz]);
  };

  const bench = (x: number, y: number, z: number) => {
    const faceIn = x > 0 ? PI / 2 : -PI / 2; // sit facing the middle of the mall
    place('bench', x, y, z, faceIn);
    meta.seats.push({ id: `bench-${meta.seats.length}`, kind: 'bench', pos: [x, y + 0.45, z], yaw: faceIn });
  };
  for (const z of [-8, -20, -36, -48]) {
    for (const x of [-4.6, 4.6]) {
      bench(x, 0, z);
      place('bin', x, 0, z + 1.5);
    }
  }
  for (const z of [-16, -40]) for (const x of [-4.5, 4.5]) bench(x, UP, z);

  // floor lamps between the benches, plants either side of the entrance and upstairs
  for (const z of [-14, -28, -42]) for (const x of [-5.3, 5.3]) place('lamp', x, 0, z);
  // the lobby (#4, batch 1): palms either side of the doors, an information kiosk and a welcome sign
  for (const x of [-4.6, 4.6]) place('palm', x, 0, -1.4);
  place('kiosk', 3, 0, -10.5, PI); // facing the entrance
  place('welcome', -2.4, 0, -10, PI);
  for (const z of [-10, -44]) for (const x of [-4.8, 4.8]) place('plant', x, UP, z);

  // café tables in the fountain court
  for (const [x, z] of [
    [-4, -49],
    [4, -49],
    [-4.2, -52],
    [4.2, -52],
  ] as const) {
    place('table', x, 0, z);
    place('chair', x - 0.8, 0, z, -PI / 2);
    place('chair', x + 0.8, 0, z, PI / 2);
  }
  // sofas along the upper gallery, facing the atrium
  for (const z of [-21, -36]) for (const x of [-4.8, 4.8]) place('sofa', x, UP, z, x > 0 ? PI / 2 : -PI / 2);

  const planter = (x: number, z: number) => {
    g.box('planter', [x - 1, 0, z - 1], [x + 1, 0.6, z + 1]);
    place('tree', x, 0.6, z);
  };
  planter(-3, -4.5); // off the centre line, so the view from the spawn is clear
  planter(-2, -38);

  place('fountain', 0, 0, -49);
}

function zones(meta: MallMeta) {
  const zs = meta.zones;
  zs.push({ id: 'entrance', name: 'Entrance', priority: 1, min: [-X_CON, 0, -8], max: [X_CON, CEIL, T] });
  zs.push({ id: 'main-hall', name: 'Main hall', priority: 1, min: [-X_CON, 0, -46], max: [X_CON, CEIL, -8] });
  zs.push({
    id: 'fountain-court',
    name: 'Fountain court',
    priority: 1,
    min: [-X_CON, 0, Z_FLAG],
    max: [X_CON, CEIL, -46],
  });
  zs.push({
    id: 'upper-gallery',
    name: 'Upper gallery',
    priority: 0,
    min: [-X_OUT, CEIL, Z_END],
    max: [X_OUT, ROOF, 0],
  });
  zs.push({
    id: 'sky-court',
    name: 'Sky court',
    priority: 1,
    min: [-X_OUT, CEIL, Z_END],
    max: [X_OUT, ROOF, Z_SHOPS_END],
  });
  zs.push({
    id: 'sky-bridge',
    name: 'Sky bridge',
    priority: 2,
    min: [-VOID.x, CEIL, BRIDGE.z1],
    max: [VOID.x, ROOF, BRIDGE.z0],
  });
  for (const slot of meta.slots)
    zs.push({ id: `shop-${slot.id}`, name: 'Vacant unit', priority: 10, slot: slot.id, ...slot.interior });
}
