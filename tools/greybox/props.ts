// Prop kinds: where each model comes from and its real size. The greybox places them (meta.props) and
// gives them collision boxes of `footprint`; tools/assets/props.ts builds the models to match.

/**
 * Props ship in packs by area (props/<pack>.glb), with shop furniture in a pack per kind of shop.
 * The client loads the packs near a visitor first and the rest in the background, so a new batch of
 * props doesn't grow what everyone waits for, and a pack nothing uses never downloads.
 */
export const PACKS = [
  'entrance',
  'concourse',
  'atrium',
  'court',
  'shops',
  'shop-cafe',
  'shop-books',
  'shop-fashion',
  'shop-home',
  'shop-games',
] as const;
export type Pack = (typeof PACKS)[number];

export type PropSpec = {
  /** Which pack the model ships in. */
  pack: Pack;
  /** Source file under assets-src/props/. */
  src: string;
  /** The dimension to scale to `size` metres (the others follow in proportion). */
  axis: 'x' | 'y' | 'z';
  size: number;
  /** Turn (radians around +Y) that makes the source model face −Z. */
  turn: number;
  /** Collision box [width x, height, depth z] at yaw 0, or null for nothing solid. */
  footprint: [number, number, number] | null;
};

const H = 'higgsfield';
const F = 'kenney-furniture-kit';
const M = 'kenney-mini-market';

export const PROPS: Record<string, PropSpec> = {
  bench: {
    pack: 'concourse',
    src: `${H}/bench.glb`,
    axis: 'x',
    size: 1.9,
    turn: Math.PI / 2,
    footprint: [1.9, 0.45, 0.7],
  }, // seat height: sit on it, step onto it
  fountain: {
    pack: 'court',
    src: `${H}/fountain.glb`,
    axis: 'x',
    size: 4.4,
    turn: 0,
    footprint: [4.2, 0.7, 4.2],
  },
  /** Stands on a planter (the planter is the solid part). */
  tree: { pack: 'concourse', src: `${H}/tree.glb`, axis: 'y', size: 3.2, turn: 0, footprint: null },
  kiosk: {
    pack: 'entrance',
    src: `${H}/kiosk.glb`,
    axis: 'y',
    size: 1.45,
    turn: Math.PI / 2,
    footprint: [1.3, 1, 1.3],
  },
  welcome: {
    pack: 'entrance',
    src: `${H}/welcome.glb`,
    axis: 'y',
    size: 2.3,
    turn: -Math.PI / 2,
    footprint: [0.7, 2.3, 0.5],
  },
  palm: { pack: 'entrance', src: `${H}/palm.glb`, axis: 'y', size: 2.3, turn: 0, footprint: [0.8, 1, 0.8] },
  /** Hangs in the atrium: placed by its lowest point. */
  lanterns: { pack: 'atrium', src: `${H}/lanterns.glb`, axis: 'y', size: 2.6, turn: 0, footprint: null },
  /** A ring bench around a low planter (a tree stands on it); seat height, so you can step onto it. */
  island: {
    pack: 'atrium',
    src: `${H}/island.glb`,
    axis: 'y',
    size: 0.45,
    turn: 0,
    footprint: [2.6, 0.45, 3.2],
  },
  recycling: {
    pack: 'concourse',
    src: `${H}/recycling.glb`,
    axis: 'x',
    size: 1.2,
    turn: Math.PI / 2,
    footprint: [1.2, 1.1, 0.45],
  },
  plant: {
    pack: 'concourse',
    src: `${F}/pottedPlant.glb`,
    axis: 'y',
    size: 1.5,
    turn: 0,
    footprint: [0.6, 1, 0.6],
  },
  lamp: {
    pack: 'concourse',
    src: `${F}/lampRoundFloor.glb`,
    axis: 'y',
    size: 2.4,
    turn: 0,
    footprint: [0.35, 2.4, 0.35],
  },
  sofa: {
    pack: 'concourse',
    src: `${F}/loungeSofa.glb`,
    axis: 'x',
    size: 2.2,
    turn: 0,
    footprint: [2.2, 0.8, 0.9],
  },
  table: {
    pack: 'court',
    src: `${F}/tableRound.glb`,
    axis: 'y',
    size: 0.75,
    turn: 0,
    footprint: [1, 0.75, 1],
  },
  /** The source chair faces +Z (its backrest is on −Z). */
  chair: { pack: 'court', src: `${F}/chair.glb`, axis: 'y', size: 0.95, turn: Math.PI, footprint: null },
  'coffee-bar': {
    pack: 'shop-cafe',
    src: `${H}/coffee-bar.glb`,
    axis: 'x',
    size: 3,
    turn: Math.PI,
    footprint: [3, 1.1, 1],
  },
  bookshelf: {
    pack: 'shop-books',
    src: `${H}/bookshelf.glb`,
    axis: 'y',
    size: 2,
    turn: Math.PI / 2,
    footprint: [1.6, 2, 0.6],
  },
  sneakers: {
    pack: 'shop-fashion',
    src: `${H}/sneakers.glb`,
    axis: 'x',
    size: 2.2,
    turn: Math.PI / 2,
    footprint: [2.2, 1.95, 0.3],
  },
  'plant-stand': {
    pack: 'shop-home',
    src: `${H}/plant-stand.glb`,
    axis: 'y',
    size: 1.3,
    turn: Math.PI,
    footprint: [1.1, 1.3, 0.75],
  },
  arcade: {
    pack: 'shop-games',
    src: `${H}/arcade.glb`,
    axis: 'y',
    size: 1.8,
    turn: Math.PI / 2,
    footprint: [0.8, 1.8, 0.9],
  },
  shelf: {
    pack: 'shops',
    src: `${M}/shelf-boxes.glb`,
    axis: 'y',
    size: 1.8,
    turn: 0,
    footprint: [1.7, 1.8, 1.5],
  },
  'shelf-bags': {
    pack: 'shop-fashion',
    src: `${M}/shelf-bags.glb`,
    axis: 'y',
    size: 1.8,
    turn: 0,
    footprint: [1.7, 1.8, 1.5],
  },
  register: {
    pack: 'shops',
    src: `${M}/cash-register.glb`,
    axis: 'y',
    size: 1.1,
    turn: 0,
    footprint: [1.6, 1.1, 1.6],
  },
  cart: { pack: 'shops', src: `${M}/shopping-cart.glb`, axis: 'y', size: 1, turn: 0, footprint: null },
  fruit: {
    pack: 'shops',
    src: `${M}/display-fruit.glb`,
    axis: 'y',
    size: 1,
    turn: 0,
    footprint: [1.2, 1, 1.2],
  },
};
