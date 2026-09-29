// Furniture and decoration: props ship in packs by area (props/<pack>.glb, one model per kind, with
// index.json saying which pack holds which kinds), and the mall's meta says where each goes. The
// packs within LOAD_RADIUS of where you start load first, the rest one at a time once the browser is
// idle (nearest first), and walking up to one moves it to the front. So a new batch of props adds to
// what loads in the background, not to what you wait for. A pack nothing places never loads. Every part of every kind is one InstancedMesh, so a mall full of
// benches, bins and lamps costs a handful of draw calls. The collision boxes are in the mall's
// collision mesh already, so props are purely visual.
import type { MallMeta } from '@shopping-mall/shared/meta';
import { Euler, Group, InstancedMesh, Matrix4, type Mesh, type Object3D, Quaternion, Vector3 } from 'three';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const BASE = `${import.meta.env.BASE_URL}assets/props/`;
/** Metres: packs with a placement this close load right away. */
const LOAD_RADIUS = 35;

type Placement = NonNullable<MallMeta['props']>[number];
type Pending = { pack: string; placements: Placement[] };

export type Props = {
  group: Group;
  /** Resolves once the packs near where you start are in. */
  near: Promise<void>;
  /** Call with the visitor's position; starts loading any pack that's now close enough. */
  update(pos: Vector3): void;
};

export async function loadProps(meta: MallMeta, start: Vector3): Promise<Props> {
  const group = new Group();
  const placements = meta.props ?? [];
  const index: Record<string, string[]> = placements.length
    ? await fetch(`${BASE}index.json`).then((r) => r.json())
    : {};
  let pending: Pending[] = [];
  for (const [pack, kinds] of Object.entries(index)) {
    const mine = placements.filter((p) => kinds.includes(p.kind));
    if (mine.length) pending.push({ pack, placements: mine }); // a pack with nothing placed never loads
  }

  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const load = (p: Pending) =>
    loader
      .loadAsync(`${BASE}${p.pack}.glb`)
      .then((gltf) => group.add(instance(gltf.scene, p.placements)))
      .catch((e) => console.warn(`props/${p.pack}:`, e));
  const at = new Vector3();
  const close = (p: Pending, pos: Vector3) =>
    p.placements.some((q) => at.set(q.pos[0], q.pos[1], q.pos[2]).distanceTo(pos) < LOAD_RADIUS);
  /** Starts every pending pack near `pos`, and returns their loads. */
  const reach = (pos: Vector3) => {
    const now = pending.filter((p) => close(p, pos));
    if (!now.length) return [];
    pending = pending.filter((p) => !now.includes(p));
    return now.map(load);
  };

  const near = Promise.all(reach(start)).then(() => undefined);
  // then the rest in the background, nearest first, one at a time so they don't compete with the mall
  const dist = (p: Pending) =>
    Math.min(...p.placements.map((q) => at.set(q.pos[0], q.pos[1], q.pos[2]).distanceTo(start)));
  const idle = (f: () => void) =>
    'requestIdleCallback' in window ? requestIdleCallback(f, { timeout: 3000 }) : setTimeout(f, 1000);
  const next = () => {
    const p = pending.sort((a, b) => dist(a) - dist(b)).shift();
    if (p) load(p).then(() => idle(next));
  };
  near.then(() => idle(next));
  let wait = 0;
  return {
    group,
    near,
    update(pos) {
      if (!pending.length || ++wait < 30) return; // every half second or so is plenty
      wait = 0;
      reach(pos);
    },
  };
}

/** One InstancedMesh per part of each placed kind in a loaded pack. */
function instance(scene: Object3D, placements: Placement[]): Group {
  const group = new Group();
  scene.updateMatrixWorld(true);
  const kinds = new Map<string, Object3D>();
  for (const child of scene.children) kinds.set(child.name, child);

  const place = new Matrix4();
  const local = new Matrix4();
  const q = new Quaternion();
  const one = new Vector3(1, 1, 1);
  const byKind = new Map<string, Placement[]>();
  for (const p of placements) byKind.set(p.kind, [...(byKind.get(p.kind) ?? []), p]);
  for (const [kind, list] of byKind) {
    const root = kinds.get(kind);
    if (!root) continue; // a prop this pack doesn't have: skip it
    const inverse = root.matrixWorld.clone().invert();
    root.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      // the part's placement inside its kind (scale, centring, facing), then each placement
      local.multiplyMatrices(inverse, mesh.matrixWorld);
      const inst = new InstancedMesh(mesh.geometry, mesh.material, list.length);
      list.forEach((p, i) => {
        q.setFromEuler(new Euler(0, p.yaw, 0));
        place.compose(new Vector3(...p.pos), q, one);
        inst.setMatrixAt(i, place.multiply(local));
      });
      inst.computeBoundingSphere();
      inst.matrixAutoUpdate = false;
      group.add(inst);
    });
  }
  return group;
}
