// What's inside the shops: each shop's unit is furnished by its category (a café gets tables and a
// counter, a bookshop gets shelves), so a shop looks like what it sells before anyone opens its
// panel. Vacant units stay empty. The furniture is props from the packs, and solid: the obstacle
// boxes go to the player controller, since shops (and so their furniture) change without the mall's
// collision mesh changing.
//
// Layouts are in the unit's own frame: x across the unit (+ is to your right as you walk in), d the
// distance in from the door, and yaw relative to facing into the shop (π faces the door, π/2 faces
// left). Every layout keeps a clear aisle from the door to the back.
import type { Shop } from '@shopping-mall/shared/config';
import type { MallMeta, Slot } from '@shopping-mall/shared/meta';
import { Box3, Vector3 } from 'three';
import type { Footprint, Placement } from './props';

type Item = { kind: string; x: number; d: number; yaw: number };
export type Layout = 'cafe' | 'books' | 'fashion' | 'home' | 'games' | 'store';

const PI = Math.PI;
/** Units wider or deeper than this (a flagship store) bring their own interior. */
const MAX_UNIT = 12;

/** A category (free text, set by the host) to a layout, by keyword. Unknown categories get a store. */
const KEYWORDS: [Layout, RegExp][] = [
  ['cafe', /food|drink|coffee|caf[eé]|tea|bak|restaurant|dessert|juice/i],
  ['books', /book|stationer|paper|librar|comic/i],
  ['fashion', /fashion|cloth|apparel|shoe|sneaker|wear|boutique|jewel|accessor/i],
  ['home', /home|plant|garden|decor|furnitur|living|flower/i],
  ['games', /game|toy|arcade|play|hobby/i],
];

/** A shelf against each side wall, facing the aisle. */
const walls = (kind: string, d: number, x = 3.05): Item[] => [
  { kind, x: -x, d, yaw: -PI / 2 },
  { kind, x, d, yaw: PI / 2 },
];
/** The counter at the back, facing the door. */
const counter = (back: number): Item => ({ kind: 'register', x: 1.8, d: back - 1.3, yaw: PI });

const LAYOUTS: Record<Layout, (depth: number) => Item[]> = {
  cafe: (D) => [
    counter(D),
    ...[-2.3, 2.3].flatMap((x) =>
      [3, 5.6].flatMap((d) => [
        { kind: 'table', x, d, yaw: 0 },
        { kind: 'chair', x: x - 0.8, d, yaw: -PI / 2 },
        { kind: 'chair', x: x + 0.8, d, yaw: PI / 2 },
      ]),
    ),
  ],
  books: (D) => [...walls('shelf', 2.6), ...walls('shelf', 4.4), ...walls('shelf', 6.2), counter(D)],
  fashion: (D) => [...walls('shelf-bags', 3), ...walls('shelf-bags', 5.2), counter(D)],
  home: (D) => [
    ...walls('plant', 2, 3.3),
    ...walls('plant', 4.2, 3.3),
    { kind: 'sofa', x: -1.6, d: D - 1.4, yaw: PI },
    counter(D),
  ],
  games: (D) => [
    ...walls('shelf', 3),
    ...walls('shelf', 5.2),
    { kind: 'sofa', x: -1.6, d: D - 1.4, yaw: PI },
    counter(D),
  ],
  store: (D) => [
    ...walls('shelf', 3),
    ...walls('shelf-bags', 5.2),
    { kind: 'cart', x: -2.4, d: 1.2, yaw: PI / 4 },
    counter(D),
  ],
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

/** Every furnished unit's props, and their collision boxes. */
export function furnish(
  meta: MallMeta,
  shops: readonly Shop[],
  footprints: Record<string, Footprint | null>,
): { placements: Placement[]; obstacles: Box3[] } {
  const placements: Placement[] = [];
  const obstacles: Box3[] = [];
  const bySlot = new Map(shops.map((s) => [s.slot, s]));
  for (const slot of meta.slots) {
    const shop = bySlot.get(slot.id);
    const layout = shop && layoutFor(shop);
    if (!layout) continue;
    const u = frame(slot);
    if (u.depth > MAX_UNIT || u.width > MAX_UNIT) continue;
    for (const it of LAYOUTS[layout](u.depth)) {
      const pos = u.door.clone().addScaledVector(u.f, it.d).addScaledVector(u.r, it.x);
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
