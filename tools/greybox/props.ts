// Prop kinds: where each model comes from and its real size. The greybox places them (meta.props) and
// gives them collision boxes of `footprint`; tools/assets/props.ts builds the models to match.
export type PropSpec = {
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
  bench: { src: `${H}/bench.glb`, axis: 'x', size: 1.9, turn: Math.PI / 2, footprint: [1.9, 0.45, 0.7] }, // seat height: sit on it, step onto it
  fountain: { src: `${H}/fountain.glb`, axis: 'x', size: 4.4, turn: 0, footprint: [4.2, 0.7, 4.2] },
  /** Stands on a planter (the planter is the solid part). */
  tree: { src: `${H}/tree.glb`, axis: 'y', size: 3.2, turn: 0, footprint: null },
  plant: { src: `${F}/pottedPlant.glb`, axis: 'y', size: 1.5, turn: 0, footprint: [0.6, 1, 0.6] },
  bin: { src: `${F}/trashcan.glb`, axis: 'y', size: 0.85, turn: 0, footprint: [0.45, 0.85, 0.45] },
  lamp: { src: `${F}/lampRoundFloor.glb`, axis: 'y', size: 2.4, turn: 0, footprint: [0.35, 2.4, 0.35] },
  sofa: { src: `${F}/loungeSofa.glb`, axis: 'x', size: 2.2, turn: 0, footprint: [2.2, 0.8, 0.9] },
  table: { src: `${F}/tableRound.glb`, axis: 'y', size: 0.75, turn: 0, footprint: [1, 0.75, 1] },
  chair: { src: `${F}/chair.glb`, axis: 'y', size: 0.95, turn: 0, footprint: null },
  shelf: { src: `${M}/shelf-boxes.glb`, axis: 'y', size: 1.8, turn: 0, footprint: [1.7, 1.8, 1.5] },
  'shelf-bags': { src: `${M}/shelf-bags.glb`, axis: 'y', size: 1.8, turn: 0, footprint: [1.7, 1.8, 1.5] },
  register: { src: `${M}/cash-register.glb`, axis: 'y', size: 1.1, turn: 0, footprint: [1.6, 1.1, 1.6] },
  cart: { src: `${M}/shopping-cart.glb`, axis: 'y', size: 1, turn: 0, footprint: null },
  fruit: { src: `${M}/display-fruit.glb`, axis: 'y', size: 1, turn: 0, footprint: [1.2, 1, 1.2] },
};
