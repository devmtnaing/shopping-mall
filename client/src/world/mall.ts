// Loads the mall: visual model, collision mesh and gameplay meta (slots, seats, zones, escalators).
import type { MallMeta } from '@plaza/shared/meta';
import { decodeNavGrid, type NavGrid } from '@plaza/shared/navgrid';
import type { Group, Mesh } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshBVH } from 'three-mesh-bvh';

const BASE = `${import.meta.env.BASE_URL}assets/mall/`;

/** `collider` is the BVH over the collision mesh, shared by the player controller and the camera. */
export type Mall = { visual: Group; collider: MeshBVH; meta: MallMeta; nav: NavGrid };

export async function loadMall(): Promise<Mall> {
  const loader = new GLTFLoader();
  const [visual, collision, meta, nav] = await Promise.all([
    loader.loadAsync(`${BASE}greybox.glb`),
    loader.loadAsync(`${BASE}greybox.collision.glb`),
    fetch(`${BASE}mall.meta.json`).then((r) => r.json() as Promise<MallMeta>),
    fetch(`${BASE}navgrid.bin`).then(async (r) => decodeNavGrid(await r.arrayBuffer())),
  ]);
  let mesh: Mesh | undefined;
  collision.scene.traverse((o) => {
    if (!mesh && (o as Mesh).isMesh) mesh = o as Mesh;
  });
  if (!mesh) throw new Error('mall: collision mesh missing');
  visual.scene.traverse((o) => {
    o.matrixAutoUpdate = false; // static world: matrices never change
    o.updateMatrix();
  });
  return { visual: visual.scene, collider: new MeshBVH(mesh.geometry), meta, nav };
}
