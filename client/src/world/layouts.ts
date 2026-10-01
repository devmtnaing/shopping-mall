// Shop layouts: which furniture goes where inside a unit, picked from the shop's category. Plain
// data and arithmetic, no three.js, so the admin and the rental form can draw a plan of it too
// (see interiors.ts for how it's placed in the world).
//
// Layouts are in the unit's own frame: x across the unit (+ is to your right as you walk in), d the
// distance in from the door, and yaw relative to facing into the shop (π faces the door, π/2 faces
// left). Every layout keeps a clear aisle from the door to the back.
//
// A big unit (wider than MAX_UNIT, like the flagship) gets a bay of its category's layout down
// each side, an open middle from the door, and a showcase of the category's signature piece at
// the back.
import type { Shop } from '@shopping-mall/shared/config';
import type { Slot } from '@shopping-mall/shared/meta';

export type Item = { kind: string; x: number; d: number; yaw: number };
export type Layout = 'cafe' | 'books' | 'fashion' | 'home' | 'games' | 'store';

const PI = Math.PI;
/** Units wider than this are furnished as big stores (bays and a showcase); deeper ones not at all. */
const MAX_UNIT = 14;
/** A standard unit's width: a big store's bays are this wide. */
const BAY = 10;
/** The dividers between units stand this far into a unit's width. */
const DIVIDER = 0.15;

/** A category (free text, set by the host) to a layout, by keyword. Unknown categories get a store. */
const KEYWORDS: [Layout, RegExp][] = [
  ['cafe', /food|drink|coffee|caf[eé]|tea|bak|restaurant|dessert|juice/i],
  ['books', /book|stationer|paper|librar|comic/i],
  ['fashion', /fashion|cloth|apparel|shoe|sneaker|wear|boutique|jewel|accessor/i],
  ['home', /home|plant|garden|decor|furnitur|living|flower/i],
  ['games', /game|toy|arcade|play|hobby/i],
];

/**
 * A layout for a unit `D` deep whose side walls' faces are `W` either side of its centre line.
 * Rows repeat every so often from the door and stop short of the counter at the back.
 */
type LayoutFn = (D: number, W: number) => Item[];

/** A piece `depth` deep against each side wall at `d`, facing the aisle. */
const walls = (W: number, kind: string, d: number, depth: number): Item[] => {
  const x = W - depth / 2 - 0.05;
  return [
    { kind, x: -x, d, yaw: -PI / 2 },
    { kind, x, d, yaw: PI / 2 },
  ];
};
/** Distances from the door, every `step` from `first`, that leave room for the back of the unit. */
const rows = (D: number, first: number, step: number, clear = 2.6) => {
  const out: number[] = [];
  for (let d = first; d <= D - clear; d += step) out.push(d);
  return out;
};
/** The till at the back, facing the door. */
const counter = (back: number): Item => ({ kind: 'register', x: 1.8, d: back - 1.3, yaw: PI });
const sofa = (back: number): Item => ({ kind: 'sofa', x: -1.6, d: back - 1.4, yaw: PI });

const LAYOUTS: Record<Layout, LayoutFn> = {
  cafe: (D, W) => [
    { kind: 'coffee-bar', x: 1.2, d: D - 1.1, yaw: PI },
    ...[-(W - 1.55), W - 1.55].flatMap((x) =>
      rows(D, 3, 2.6, 3).flatMap((d) => [
        { kind: 'table', x, d, yaw: 0 },
        { kind: 'chair', x: x - 0.8, d, yaw: -PI / 2 },
        { kind: 'chair', x: x + 0.8, d, yaw: PI / 2 },
      ]),
    ),
  ],
  // bookcases down both walls and one on the back wall
  books: (D, W) => [
    ...rows(D, 2.2, 1.7).flatMap((d) => walls(W, 'bookshelf', d, 0.6)),
    { kind: 'bookshelf', x: -2, d: D - 0.4, yaw: PI },
    counter(D),
  ],
  fashion: (D, W) => [
    ...rows(D - 2.2, 2.6, 2.4).flatMap((d) => walls(W, 'sneakers', d, 0.3)),
    ...walls(W, 'shelf-bags', D - 2.8, 1.5),
    counter(D),
  ],
  home: (D, W) => [
    ...rows(D - 2, 2.2, 2).flatMap((d) => walls(W, 'plant-stand', d, 0.75)),
    ...walls(W, 'plant', D - 3.8, 0.6),
    sofa(D),
    counter(D),
  ],
  // a row of arcade cabinets down each wall
  games: (D, W) => [...rows(D, 2, 1, 3.4).flatMap((d) => walls(W, 'arcade', d, 0.9)), sofa(D), counter(D)],
  store: (D, W) => [
    ...rows(D, 3, 2.2).flatMap((d, i) => walls(W, i % 2 ? 'shelf-bags' : 'shelf', d, 1.5)),
    { kind: 'cart', x: -(W - 1.45), d: 1.2, yaw: PI / 4 },
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

export function layoutFor(shop: Pick<Shop, 'category'>): Layout | null {
  if (shop.category && /rent|vacan|available/i.test(shop.category)) return null;
  return KEYWORDS.find(([, re]) => re.test(shop.category ?? ''))?.[0] ?? 'store';
}

/** A unit's depth (door to back wall) and width, from its interior box and door. */
export function unitSize(slot: Slot): { depth: number; width: number } {
  const yaw = slot.door.yaw;
  const [fx, fz] = [-Math.sin(yaw), -Math.cos(yaw)];
  const [rx, rz] = [Math.cos(yaw), -Math.sin(yaw)];
  const [dx, , dz] = slot.door.pos;
  const { min, max } = slot.interior;
  let depth = 0;
  let width = 0;
  for (const x of [min[0], max[0]])
    for (const z of [min[2], max[2]]) {
      depth = Math.max(depth, (x - dx) * fx + (z - dz) * fz);
      width = Math.max(width, 2 * Math.abs((x - dx) * rx + (z - dz) * rz));
    }
  return { depth, width };
}

/** The furniture for a unit of this size, in its own frame; none for a unit too deep to furnish. */
export function unitItems(layout: Layout, depth: number, width: number): Item[] {
  if (depth > MAX_UNIT) return [];
  if (width <= MAX_UNIT) return LAYOUTS[layout](depth, width / 2 - DIVIDER);
  // a big store: the category's layout in a bay down each side, and its showcase at the back
  return [
    ...[-1, 1].flatMap((side) =>
      LAYOUTS[layout](depth, BAY / 2 - DIVIDER).map((it) => {
        // a bay's inner row turns round to face the open middle, not its own bay
        const inner = Math.abs(Math.abs(it.yaw) - PI / 2) < 0.01 && Math.sign(it.x) === -side;
        return { ...it, x: it.x + side * (width / 2 - BAY / 2 - 0.15), yaw: inner ? it.yaw + PI : it.yaw };
      }),
    ),
    ...SHOWCASE[layout](depth),
  ];
}
