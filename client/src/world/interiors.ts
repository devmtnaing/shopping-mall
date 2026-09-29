// What's inside the shops: each shop's unit is furnished by its category (a café gets tables and a
// counter, a bookshop gets shelves), so a shop looks like what it sells before anyone opens its
// panel. Vacant units stay empty. The furniture is props from the packs, and solid: the obstacle
// boxes go to the player controller, since shops (and so their furniture) change without the mall's
// collision mesh changing.
//
// Layouts are in the unit's own frame: x across the unit (+ is to your right as you walk in), d the
// distance in from the door, and yaw relative to facing into the shop (π faces the door, π/2 faces
// left). Every layout keeps a clear aisle from the door to the back.
//
// A big unit (wider than MAX_UNIT, like the flagship) gets a bay of its category's layout down
// each side, an open middle from the door, and a showcase of the category's signature piece at
// the back. Everything stands on whatever floor is under it (the flagship's back is a stage).
import type { Shop } from '@shopping-mall/shared/config';
import type { MallMeta, Slot } from '@shopping-mall/shared/meta';
import { Box3, Vector3 } from 'three';
import type { Footprint, Placement } from './props';

type Item = { kind: string; x: number; d: number; yaw: number };
export type Layout = 'cafe' | 'books' | 'fashion' | 'home' | 'games' | 'store';

const PI = Math.PI;
/** Units wider than this are furnished as big stores (bays and a showcase); deeper ones not at all. */
const MAX_UNIT = 12;
/** A standard unit's width: a big store's bays are this wide. */
const BAY = 8;

/** A category (free text, set by the host) to a layout, by keyword. Unknown categories get a store. */
const KEYWORDS: [Layout, RegExp][] = [
  ['cafe', /food|drink|coffee|caf[eé]|tea|bak|restaurant|dessert|juice/i],
  ['books', /book|stationer|paper|librar|comic/i],
  ['fashion', /fashion|cloth|apparel|shoe|sneaker|wear|boutique|jewel|accessor/i],
  ['home', /home|plant|garden|decor|furnitur|living|flower/i],
  ['games', /game|toy|arcade|play|hobby/i],
];

/** The side walls' faces, from the unit's centre line. */
const WALL = 3.85;
/** A piece `depth` deep against each side wall at `d`, facing the aisle. */
const walls = (kind: string, d: number, depth: number): Item[] => {
  const x = WALL - depth / 2 - 0.05;
  return [
    { kind, x: -x, d, yaw: -PI / 2 },
    { kind, x, d, yaw: PI / 2 },
  ];
};
/** The till at the back, facing the door. */
const counter = (back: number): Item => ({ kind: 'register', x: 1.8, d: back - 1.3, yaw: PI });
const sofa = (back: number): Item => ({ kind: 'sofa', x: -1.6, d: back - 1.4, yaw: PI });

const LAYOUTS: Record<Layout, (depth: number) => Item[]> = {
  cafe: (D) => [
    { kind: 'coffee-bar', x: 1.2, d: D - 1.1, yaw: PI },
    ...[-2.3, 2.3].flatMap((x) =>
      [3, 5.6].flatMap((d) => [
        { kind: 'table', x, d, yaw: 0 },
        { kind: 'chair', x: x - 0.8, d, yaw: -PI / 2 },
        { kind: 'chair', x: x + 0.8, d, yaw: PI / 2 },
      ]),
    ),
  ],
  // bookcases down both walls and one on the back wall
  books: (D) => [
    ...[2.2, 3.9, 5.6].flatMap((d) => walls('bookshelf', d, 0.6)),
    { kind: 'bookshelf', x: -2, d: D - 0.4, yaw: PI },
    counter(D),
  ],
  fashion: (D) => [
    ...walls('sneakers', 2.6, 0.3),
    ...walls('sneakers', 5, 0.3),
    ...walls('shelf-bags', 7.2, 1.5),
    counter(D),
  ],
  home: (D) => [
    ...walls('plant-stand', 2.2, 0.75),
    ...walls('plant-stand', 4.2, 0.75),
    ...walls('plant', 6.2, 0.6),
    sofa(D),
    counter(D),
  ],
  // a row of arcade cabinets down each wall
  games: (D) => [...[2, 3, 4, 5, 6].flatMap((d) => walls('arcade', d, 0.9)), sofa(D), counter(D)],
  store: (D) => [
    ...walls('shelf', 3, 1.5),
    ...walls('shelf-bags', 5.2, 1.5),
    { kind: 'cart', x: -2.4, d: 1.2, yaw: PI / 4 },
    counter(D),
  ],
};

/** A big store's showcase at the back, centred and facing the door: the category's signature piece. */
const SHOWCASE: Record<Layout, (depth: number) => Item[]> = {
  cafe: (D) => [{ kind: 'coffee-bar', x: 0, d: D - 1.6, yaw: PI }],
  books: (D) => [-1.7, 0, 1.7].map((x) => ({ kind: 'bookshelf', x, d: D - 1.2, yaw: PI })),
  fashion: (D) => [-2.4, 0, 2.4].map((x) => ({ kind: 'sneakers', x, d: D - 1.2, yaw: PI })),
  home: (D) => [-2.4, 0, 2.4].map((x) => ({ kind: 'plant-stand', x, d: D - 1.5, yaw: PI })),
  games: (D) => [-2.5, -1.5, -0.5, 0.5, 1.5, 2.5].map((x) => ({ kind: 'arcade', x, d: D - 1.5, yaw: PI })),
  store: (D) => [-2, 2].map((x) => ({ kind: 'shelf', x, d: D - 1.6, yaw: PI })),
};

export function layoutFor(shop: Shop): Layout | null {
  if (shop.category && /rent|vacan|available/i.test(shop.category)) return null;
  return KEYWORDS.find(([, re]) => re.test(shop.category ?? ''))?.[0] ?? 'store';
}

/** The unit's frame: forward (in from the door), right, and its depth and width. */
function frame(slot: Slot) {
  const yaw = slot.door.yaw;
  const f = new Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const r = new Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const door = new Vector3(...slot.door.pos);
  const { min, max } = slot.interior;
  let depth = 0;
  let width = 0;
  for (const x of [min[0], max[0]])
    for (const z of [min[2], max[2]]) {
      const v = new Vector3(x - door.x, 0, z - door.z);
      depth = Math.max(depth, v.dot(f));
      width = Math.max(width, 2 * Math.abs(v.dot(r)));
    }
  return { yaw, f, r, door, depth, width };
}

/** Height of the floor under (x, z), looking down from `above`. */
export type FloorAt = (x: number, z: number, above: number) => number;

/** Every furnished unit's props, and their collision boxes. */
export function furnish(
  meta: MallMeta,
  shops: readonly Shop[],
  footprints: Record<string, Footprint | null>,
  floorAt: FloorAt = (_x, _z, above) => above,
): { placements: Placement[]; obstacles: Box3[] } {
  const placements: Placement[] = [];
  const obstacles: Box3[] = [];
  const bySlot = new Map(shops.map((s) => [s.slot, s]));
  for (const slot of meta.slots) {
    const shop = bySlot.get(slot.id);
    const layout = shop && layoutFor(shop);
    if (!layout) continue;
    const u = frame(slot);
    if (u.depth > MAX_UNIT) continue;
    // a big store: the category's layout in a bay down each side, and its showcase at the back
    const items =
      u.width > MAX_UNIT
        ? [
            ...[-1, 1].flatMap((side) =>
              LAYOUTS[layout](u.depth).map((it) => {
                // a bay's inner row turns round to face the open middle, not its own bay
                const inner = Math.abs(Math.abs(it.yaw) - PI / 2) < 0.01 && Math.sign(it.x) === -side;
                return {
                  ...it,
                  x: it.x + side * (u.width / 2 - BAY / 2 - 0.15),
                  yaw: inner ? it.yaw + PI : it.yaw,
                };
              }),
            ),
            ...SHOWCASE[layout](u.depth),
          ]
        : LAYOUTS[layout](u.depth);
    for (const it of items) {
      const pos = u.door.clone().addScaledVector(u.f, it.d).addScaledVector(u.r, it.x);
      pos.y = floorAt(pos.x, pos.z, u.door.y);
      const yaw = u.yaw + it.yaw;
      placements.push({ kind: it.kind, pos: [pos.x, pos.y, pos.z], yaw });
      const fp = footprints[it.kind];
      if (!fp) continue;
      const [w, h, d] = fp;
      // quarter turns only: swap width and depth when it's turned sideways
      const [hx, hz] = Math.abs(Math.sin(yaw)) > 0.5 ? [d / 2, w / 2] : [w / 2, d / 2];
      obstacles.push(
        new Box3(new Vector3(pos.x - hx, pos.y, pos.z - hz), new Vector3(pos.x + hx, pos.y + h, pos.z + hz)),
      );
    }
  }
  return { placements, obstacles };
}
