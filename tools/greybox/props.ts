// Prop kinds: where each model comes from and its real size. The greybox places them (meta.props) and
// gives them collision boxes of `footprint`; tools/assets/props.ts builds the models to match.

/**
 * Props ship in packs by area (props/<pack>.glb), and the client loads a pack once a visitor comes
 * near any of its placements, so a new batch of props doesn't grow what everyone downloads up front.
 */
export const PACKS = ['entrance', 'concourse', 'atrium', 'court', 'shops'] as const;
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
  chair: { pack: 'court', src: `${F}/chair.glb`, axis: 'y', size: 0.95, turn: 0, footprint: null },
  'coffee-bar': {
    pack: 'shops',
    src: `${H}/coffee-bar.glb`,
    axis: 'x',
    size: 3,
    turn: Math.PI,
    footprint: [3, 1.1, 1],
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
    pack: 'shops',
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
