// Furniture and decoration: props ship in packs by area (props/<pack>.glb, one model per kind, with
// index.json saying which pack holds which kinds), and a layer of placements says where each goes:
// the mall's meta for the fixed furniture, interiors.ts for what's inside the shops. A layer loads
// the packs within LOAD_RADIUS of where you start first, the rest one at a time once the browser is
// idle (nearest first), and walking up to one moves it to the front. So a new batch of props adds
// to what loads in the background, not to what you wait for. A pack nothing places never loads.
// Every part of every kind is one InstancedMesh, so a mall full of benches, bins and lamps costs a
// handful of draw calls. Props are purely visual: collision is the mall's collision mesh, or
// obstacle boxes for the shop interiors.
import type { MallMeta } from '@shopping-mall/shared/meta';
import { Euler, Group, InstancedMesh, Matrix4, type Mesh, type Object3D, Quaternion, Vector3 } from 'three';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { asset } from '../assets';

/** Metres: packs with a placement this close load right away. */
const LOAD_RADIUS = 35;

export type Placement = NonNullable<MallMeta['props']>[number];
/** Collision box [width x, height, depth z] at yaw 0. */
export type Footprint = [number, number, number];
export type PropIndex = { packs: Record<string, string[]>; footprints: Record<string, Footprint | null> };

/** The packs, each loaded at most once and shared by every layer. */
export class PropLibrary {
  private readonly loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  private readonly loaded = new Map<string, Promise<Object3D>>();
  private readonly packOf = new Map<string, string>();

  constructor(readonly index: PropIndex) {
    for (const [pack, kinds] of Object.entries(index.packs)) for (const k of kinds) this.packOf.set(k, pack);
  }

  static async load(): Promise<PropLibrary> {
    return new PropLibrary(await fetch(asset('props/index.json')).then((r) => r.json()));
  }

  pack(kind: string): string | undefined {
    return this.packOf.get(kind);
  }

  model(pack: string): Promise<Object3D> {
    let m = this.loaded.get(pack);
    if (!m) {
      m = this.loader.loadAsync(asset(`props/${pack}.glb`)).then((g) => {
        g.scene.updateMatrixWorld(true);
        return g.scene;
      });
      this.loaded.set(pack, m);
    }
    return m;
  }
}

export type PropLayer = {
  group: Group;
  /** Resolves once the packs near where you start are in. */
  near: Promise<void>;
  /** Call with the visitor's position; starts loading any pack that's now close enough. */
  update(pos: Vector3): void;
  /** Resolves once the pack holding `kind` has loaded in this layer (never, if nothing places it). */
  whenLoaded(kind: string): Promise<void>;
  /** Remove it from the scene and stop loading (the packs stay cached in the library). */
  dispose(): void;
};

type Pending = { pack: string; placements: Placement[] };

export function propLayer(lib: PropLibrary, placements: readonly Placement[], start: Vector3): PropLayer {
  const group = new Group();
  const byPack = new Map<string, Placement[]>();
  for (const p of placements) {
    const pack = lib.pack(p.kind);
    if (pack) byPack.set(pack, [...(byPack.get(pack) ?? []), p]); // a kind no pack has: skip it
  }
  let pending: Pending[] = [...byPack].map(([pack, placements]) => ({ pack, placements }));
  let disposed = false;
  const done = new Map<string, { promise: Promise<void>; resolve: () => void }>();
  const signal = (pack: string) => {
    let d = done.get(pack);
    if (!d) {
      let resolve = () => {};
      const promise = new Promise<void>((r) => {
        resolve = r;
      });
      d = { promise, resolve };
      done.set(pack, d);
    }
    return d;
  };

  const load = (p: Pending) =>
    lib
      .model(p.pack)
      .then((scene) => {
        if (disposed) return;
        group.add(instance(scene, p.placements));
        signal(p.pack).resolve();
      })
      .catch((e) => console.warn(`props/${p.pack}:`, e));
  const at = new Vector3();
  const dist = (p: Pending, pos: Vector3) =>
    Math.min(...p.placements.map((q) => at.set(q.pos[0], q.pos[1], q.pos[2]).distanceTo(pos)));
  /** Starts every pending pack near `pos`, and returns their loads. */
  const reach = (pos: Vector3) => {
    const now = pending.filter((p) => dist(p, pos) < LOAD_RADIUS);
    if (!now.length) return [];
    pending = pending.filter((p) => !now.includes(p));
    return now.map(load);
  };

  const near = Promise.all(reach(start)).then(() => undefined);
  // then the rest in the background, nearest first, one at a time so they don't compete with the mall
  const idle = (f: () => void) =>
    'requestIdleCallback' in window ? requestIdleCallback(f, { timeout: 3000 }) : setTimeout(f, 1000);
  const next = () => {
    const p = disposed ? undefined : pending.sort((a, b) => dist(a, start) - dist(b, start)).shift();
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
    whenLoaded(kind) {
      const pack = lib.pack(kind);
      return pack ? signal(pack).promise : new Promise(() => {});
    },
    dispose() {
      disposed = true;
      pending = [];
      group.removeFromParent();
      group.traverse((o) => {
        if ((o as InstancedMesh).isInstancedMesh) (o as InstancedMesh).dispose(); // geometry stays: it's shared
      });
    },
  };
}

/** One InstancedMesh per part of each placed kind in a loaded pack. */
function instance(scene: Object3D, placements: Placement[]): Group {
  const group = new Group();
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
    if (!root) continue;
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
