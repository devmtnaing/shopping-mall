// The greybox mall: geometry + gameplay meta from one description. Dimensions: docs/greybox.md.
// Coordinates: metres, Y up, the mall runs along −Z from the entrance (z = 0).
// Side s = −1 is west (left as you walk in), s = +1 is east.

import { ESCALATOR } from '@shopping-mall/shared/constants';
import type { MallMeta } from '@shopping-mall/shared/meta';
import { Geo } from './geometry.ts';
import { PROPS } from './props.ts';

const PI = Math.PI;
const X_CON = 10; // concourse half-width
const X_OUT = 22; // outer wall (inner face)
const T = 0.3; // wall and slab thickness
const SLOTS = 6; // shops per side per floor
const SLOT_LEN = 10;
const SLOT_Z0 = -6; // south edge of slot 0
const Z_SHOPS_END = SLOT_Z0 - SLOTS * SLOT_LEN; // −66
const Z_FLAG = -68; // flagship storefront
const Z_END = -80; // north wall
const UP = 8; // upper floor level
const CEIL = UP - T; // underside of the upper slab
const ROOF = 15;
const VOID = { x: 6, z0: -10, z1: Z_SHOPS_END }; // atrium opening in the upper floor
const BRIDGE = { z0: -33, z1: -41 };
const DOOR_W = 7;
const DOOR_H = 4.2;
const RAIL_H = 1.1;
const ENTRANCE = 5; // half-width of the glass entrance
const FLAG_DOOR = 7; // half-width of the flagship's doorway
/** Escalator A (west, up to the bridge's south edge) and B (east, down from its north edge): centre x, width. */
const ESC = { a: -3, b: 3, w: ESCALATOR.width + 0.5 }; // w: overall, balustrades included
/** Escalators rise at 30°, like real ones: this much run for the climb to the upper floor. */
const ESC_RUN = UP / Math.tan(Math.PI / 6);

export function buildGreybox() {
  const g = new Geo();
  const meta: MallMeta = {
    version: 1,
    floors: [
      { id: 'ground', y: 0 },
      { id: 'upper', y: UP },
    ],
    spawns: [{ id: 'entrance', pos: [0, 0, -6], yaw: 0 }],
    slots: [],
    seats: [],
    zones: [],
    escalators: [],
  };

  shell(g);
  for (const s of [-1, 1] as const) for (const upper of [false, true]) shopRow(g, meta, s, upper);
  flagship(g, meta);
  upperFloor(g);
  escalator(g, meta, 'a', ESC.a, BRIDGE.z0 + ESC_RUN, BRIDGE.z0);
  escalator(g, meta, 'b', ESC.b, BRIDGE.z1 - ESC_RUN, BRIDGE.z1, 'down');
  props(g, meta);
  zones(meta);
  return { geo: g, meta };
}

/** Floor slab, outer walls, glass entrance, roof with a skylight over the atrium. */
function shell(g: Geo) {
  g.box('floor', [-X_OUT, -T, Z_END], [X_OUT, 0, T]);
  // south wall with the entrance (glass doors are solid: you spawn inside)
  const E = ENTRANCE;
  g.box('wall', [-X_OUT, 0, 0], [-E, ROOF, T]);
  g.box('wall', [E, 0, 0], [X_OUT, ROOF, T]);
  g.box('wall', [-E, DOOR_H, 0], [E, ROOF, T]);
  g.box('glass', [-E, 0, 0.05], [E, DOOR_H, 0.15]);
  g.box('trim', [-E - 0.1, DOOR_H, -0.02], [E + 0.1, DOOR_H + 0.15, 0.05], false);
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
  const D = FLAG_DOOR;
  const H = 4.8; // doorway height
  g.box('wall', [-X_OUT, 0, z0], [-D, CEIL, z1]);
  g.box('wall', [D, 0, z0], [X_OUT, CEIL, z1]);
  g.box('wall', [-D, H, z0], [D, CEIL, z1]);
  g.box('trim', [-D, H - 0.12, z1], [D, H, z1 + 0.04], false);
  g.box('shopfloor', [-X_OUT, 0, Z_END], [X_OUT, 0.01, z0], false);
  // the stage at the back, reached by two steps
  const s = Z_END + 3; // front of the stage
  g.box('dark', [-8, 0, Z_END], [8, 0.6, s]);
  g.box('dark', [-8, 0, s], [8, 0.4, s + 0.4]);
  g.box('dark', [-8, 0, s + 0.4], [8, 0.2, s + 0.8]);
  meta.slots.push({
    id: 'flagship',
    floor: 'ground',
    door: { pos: [0, 0, z0 + T / 2], yaw: 0 },
    sign: { pos: [0, H + 1.4, z1 + 0.02], size: [10, 2], yaw: PI },
    interior: { min: [-X_OUT, 0, Z_END], max: [X_OUT, CEIL, z0] },
  });
}

/** Upper slab (open over the atrium, with a bridge across) and solid parapets around the opening. */
function upperFloor(g: Geo) {
  roofOrSlab(g, 'floor', CEIL, UP, true);
  g.box('floor', [-VOID.x, CEIL, BRIDGE.z1], [VOID.x, UP, BRIDGE.z0]);

  const y0 = UP;
  const y1 = UP + RAIL_H;
  const r = 0.2; // a solid stone parapet, not a glass balustrade, standing on the slab's edge
  for (const s of [-1, 1]) {
    const x0 = s < 0 ? -VOID.x - r : VOID.x;
    g.box('rail', [x0, y0, VOID.z1], [x0 + r, y1, BRIDGE.z1]);
    g.box('rail', [x0, y0, BRIDGE.z0], [x0 + r, y1, VOID.z0]);
  }
  g.box('rail', [-VOID.x - r, y0, VOID.z0], [VOID.x + r, y1, VOID.z0 + r]);
  g.box('rail', [-VOID.x - r, y0, VOID.z1 - r], [VOID.x + r, y1, VOID.z1]);
  // bridge edges, with gaps where the escalators arrive
  const gap = ESC.w / 2 + 0.1;
  g.box('rail', [-VOID.x, y0, BRIDGE.z0 - r], [ESC.a - gap, y1, BRIDGE.z0]);
  g.box('rail', [ESC.a + gap, y0, BRIDGE.z0 - r], [VOID.x, y1, BRIDGE.z0]);
  g.box('rail', [-VOID.x, y0, BRIDGE.z1], [ESC.b - gap, y1, BRIDGE.z1 + r]);
  g.box('rail', [ESC.b + gap, y0, BRIDGE.z1], [VOID.x, y1, BRIDGE.z1 + r]);
}

/** A horizontal slab covering the whole mall except the atrium opening. */
function roofOrSlab(g: Geo, mat: string, y0: number, y1: number, collide: boolean) {
  g.box(mat, [-X_OUT, y0, VOID.z0], [X_OUT, y1, 0], collide);
  g.box(mat, [-X_OUT, y0, Z_END], [X_OUT, y1, VOID.z1], collide);
  g.box(mat, [-X_OUT, y0, VOID.z1], [-VOID.x, y1, VOID.z0], collide);
  g.box(mat, [VOID.x, y0, VOID.z1], [X_OUT, y1, VOID.z0], collide);
}

/**
 * Escalator from zBottom (ground) to zTop (the bridge), built like a real one: a flat landing at
 * each end, a steel truss under the incline, stainless skirts either side of the steps, glass
 * balustrades and black handrails. The steps themselves move, so the client draws them
 * (client/src/world/escalators.ts); here the walking surface is an invisible ramp under them, and
 * invisible walls along the balustrades keep you on it.
 */
function escalator(
  g: Geo,
  meta: MallMeta,
  id: string,
  xc: number,
  zBottom: number,
  zTop: number,
  runs: 'up' | 'down' = 'up',
) {
  const { width: W, landing: F } = ESCALATOR;
  const run = Math.abs(zTop - zBottom);
  const top = F + run; // where the incline ends, along the escalator from its bottom end
  const end = top + F;
  const slope = UP / run;
  const toTop = zTop < zBottom ? -1 : 1;
  const z0 = zBottom - toTop * F; // the bottom end
  /** A prism across x0…x1 from an outline in (along, y), along = 0 at the bottom end. */
  const piece = (
    mat: string | null,
    x0: number,
    x1: number,
    outline: [number, number][],
    collide = false,
  ) => {
    const zy = outline.map(([a, y]) => [z0 + toTop * a, y] as [number, number]);
    if (toTop < 0) zy.reverse(); // mirrored in z, so the winding flips
    g.xprism(mat, x0, x1, zy, mat === null || collide);
  };
  /** Pieces that follow the steps: flat, climbing, flat, from `lo` to `hi` above the steps. */
  const alongSteps = (mat: string, x0: number, x1: number, lo: number, hi: number) => {
    piece(mat, x0, x1, [
      [0, lo],
      [F, lo],
      [F, hi],
      [0, hi],
    ]);
    piece(mat, x0, x1, [
      [F, lo],
      [top, UP + lo],
      [top, UP + hi],
      [F, hi],
    ]);
    piece(mat, x0, x1, [
      [top, UP + lo],
      [end, UP + lo],
      [end, UP + hi],
      [top, UP + hi],
    ]);
  };
  const hw = W / 2; // steps
  const deck = 0.25; // the skirt's width either side, which the balustrade stands on
  const under = 0.26 / slope; // where the truss (0.26 m under the steps) comes out of the floor
  // the walking surface, and walls along both balustrades
  piece(null, xc - hw, xc + hw, [
    [F, 0],
    [top, 0],
    [top, UP],
  ]);
  for (const s of [-1, 1]) {
    const [a, b] = s < 0 ? [xc - hw - deck, xc - hw] : [xc + hw, xc + hw + deck];
    piece(null, a, b, [
      [0, 0],
      [end, 0],
      [end, UP + 1],
      [F, 1],
      [0, 1],
    ]);
  }
  // the truss under the incline
  piece('panel', xc - hw - deck, xc + hw + deck, [
    [F + under, 0],
    [top, 0],
    [top, UP - 0.26],
  ]);
  for (const s of [-1, 1]) {
    const [a, b] = s < 0 ? [xc - hw - deck, xc - hw] : [xc + hw, xc + hw + deck];
    // the skirt: from the truss up to just above the steps
    piece('panel', a, b, [
      [F, 0],
      [F + under, 0],
      [top, UP - 0.26],
      [top, UP + 0.12],
      [F, 0.12],
    ]);
    alongSteps('panel', a, b, 0, 0.12);
    // glass balustrade on the skirt, and the handrail along its top
    const x = xc + s * (hw + deck / 2);
    alongSteps('glass', x - 0.012, x + 0.012, 0.12, 0.95);
    alongSteps('rubber', x - 0.045, x + 0.045, 0.95, 1.02);
  }
  // comb plates where the steps go into the floor at each end
  piece('escalator', xc - hw, xc + hw, [
    [0, 0],
    [0.5, 0],
    [0.5, 0.03],
    [0, 0.03],
  ]);
  piece('escalator', xc - hw, xc + hw, [
    [end - 0.5, UP],
    [end, UP],
    [end, UP + 0.03],
    [end - 0.5, UP + 0.03],
  ]);
  // from → to is the way the steps move: A takes you up to the bridge, B brings you back down
  const bottom: [number, number, number] = [xc, 0, zBottom];
  const topEnd: [number, number, number] = [xc, UP, zTop];
  const [from, to] = runs === 'up' ? [bottom, topEnd] : [topEnd, bottom];
  meta.escalators.push({ id, from, to, width: W, speed: 1.2 });
}

/** Benches (seats), recycling stations, lamps, plants, lanterns, café tables, sofas, planters, fruit stands and a fountain. */
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

  /** A bench facing `yaw`; it's a seat too. */
  const bench = (x: number, y: number, z: number, yaw: number) => {
    place('bench', x, y, z, yaw);
    meta.seats.push({ id: `bench-${meta.seats.length}`, kind: 'bench', pos: [x, y + 0.45, z], yaw });
  };
  const inward = (x: number) => (x > 0 ? PI / 2 : -PI / 2); // facing the middle of the mall
  // Benches along the shop fronts on the ground floor, in front of the pillars between units (units
  // meet every SLOT_LEN from SLOT_Z0), with recycling stations beside some (#4, batch 2)
  const edge = X_CON - 1.4;
  for (const z of [-16, -26, -46, -56]) for (const x of [-edge, edge]) bench(x, 0, z, inward(x));
  for (const z of [-16, -46])
    for (const x of [-edge - 0.3, edge + 0.3]) place('recycling', x, 0, z + 1.9, inward(x));
  // upstairs, benches and sofas along the balustrade, looking out over the atrium
  const rail = VOID.x + 0.9;
  for (const z of [-16, -56]) for (const x of [-rail, rail]) bench(x, UP, z, inward(x));
  for (const z of [-26, -46]) for (const x of [-rail, rail]) place('sofa', x, UP, z, inward(x));

  // floor lamps in front of the pillars in the middle of each row, plants upstairs
  for (const z of [-36, -66]) for (const x of [-X_CON + 0.7, X_CON - 0.7]) place('lamp', x, 0, z);
  for (const z of [-14, -60]) for (const x of [-X_CON + 1.2, X_CON - 1.2]) place('plant', x, UP, z);
  // the lobby (#4, batch 1): palms either side of the doors, an information kiosk and a welcome sign
  for (const x of [-ENTRANCE - 1.3, ENTRANCE + 1.3]) place('palm', x, 0, -1.4);
  place('kiosk', 4.5, 0, -13, PI); // facing the entrance
  place('welcome', -4.5, 0, -12.5, PI);

  const fountain = { x: 0, z: -62 };
  place('fountain', fountain.x, 0, fountain.z);
  // café tables either side of the fountain
  for (const x of [-6, 6])
    for (const z of [fountain.z + 3, fountain.z - 2]) {
      place('table', x, 0, z);
      place('chair', x - 0.8, 0, z, -PI / 2);
      place('chair', x + 0.8, 0, z, PI / 2);
    }

  const planter = (x: number, z: number) => {
    g.box('planter', [x - 1, 0, z - 1], [x + 1, 0.6, z + 1]);
    place('tree', x, 0.6, z);
  };
  planter(-4.5, -5); // off the centre line, so the view from the spawn is clear
  for (const [x, z] of [
    [-6.5, -21],
    [6.5, -21],
    [6.5, -50],
  ] as const)
    planter(x, z);
  // a round seating island with a tree in the middle, seats either side (#4, batch 2)
  const island = { x: -6.5, z: -50 };
  place('island', island.x, 0, island.z);
  place('tree', island.x, 0.45, island.z);
  for (const dx of [-1.05, 1.05]) {
    const yaw = dx > 0 ? -PI / 2 : PI / 2; // facing out
    meta.seats.push({
      id: `bench-${meta.seats.length}`,
      kind: 'bench',
      pos: [island.x + dx, 0.45, island.z],
      yaw,
    });
  }
  // Myanmar festival lanterns hung in the atrium, clear of the bridge (#4, batch 2)
  for (const [x, z] of [
    [-3, -16],
    [3, -24],
    [-3, -50],
    [3, -58],
  ] as const)
    place('lanterns', x, UP + 3, z);

  // fruit stands under the bridge, between the escalators: pick an apple (F) and throw it (T-507)
  const under = (BRIDGE.z0 + BRIDGE.z1) / 2;
  for (const x of [-2.5, 2.5]) place('fruit', x, 0, under, inward(x));
}

function zones(meta: MallMeta) {
  const zs = meta.zones;
  const court = SLOT_Z0 - 5 * SLOT_LEN; // the fountain court: past the last pair of units' south edge
  zs.push({
    id: 'entrance',
    name: 'Entrance',
    priority: 1,
    min: [-X_CON, 0, VOID.z0],
    max: [X_CON, CEIL, T],
  });
  zs.push({
    id: 'main-hall',
    name: 'Main hall',
    priority: 1,
    min: [-X_CON, 0, court],
    max: [X_CON, CEIL, VOID.z0],
  });
  zs.push({
    id: 'fountain-court',
    name: 'Fountain court',
    priority: 1,
    min: [-X_CON, 0, Z_FLAG],
    max: [X_CON, CEIL, court],
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
