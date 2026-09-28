// Loads the mall: visual model, collision mesh, gameplay meta (slots, seats, zones, escalators) and
// navgrid. The built-in greybox ships with the app; a host can upload a replacement (docs/adr/0006).
import type { MallArt, MallMeta } from '@shopping-mall/shared/meta';
import { decodeNavGrid, type NavGrid } from '@shopping-mall/shared/navgrid';
import { BufferAttribute, BufferGeometry, type Group, type Mesh, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshBVH } from 'three-mesh-bvh';

const BASE = `${import.meta.env.BASE_URL}assets/mall/`;
export const BUILT_IN: MallArt = {
  model: `${BASE}greybox.glb`,
  collision: `${BASE}greybox.collision.glb`,
  meta: `${BASE}mall.meta.json`,
  navgrid: `${BASE}navgrid.bin`,
};

/** `collider` is the BVH over the collision mesh, shared by the player controller and the camera. */
export type Mall = { visual: Group; collider: MeshBVH; meta: MallMeta; nav: NavGrid };

/** Every triangle in the collision scene, in world space (the navgrid baker reads it the same way). */
function collisionGeometry(scene: Group): BufferGeometry {
  scene.updateMatrixWorld(true);
  const positions: number[] = [];
  const indices: number[] = [];
  const v = new Vector3();
  scene.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const pos = mesh.geometry.getAttribute('position');
    const index = mesh.geometry.getIndex();
    const first = positions.length / 3;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      positions.push(v.x, v.y, v.z);
    }
    const count = index ? index.count : pos.count;
    for (let i = 0; i < count; i++) indices.push(first + (index ? index.getX(i) : i));
  });
  if (!indices.length) throw new Error('mall: collision mesh missing');
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setIndex(new BufferAttribute(new Uint32Array(indices), 1));
  return geometry;
}

export async function loadMall(art: MallArt = BUILT_IN): Promise<Mall> {
  const loader = new GLTFLoader();
  const [visual, collision, meta, nav] = await Promise.all([
    loader.loadAsync(art.model),
    loader.loadAsync(art.collision),
    fetch(art.meta).then((r) => r.json() as Promise<MallMeta>),
    fetch(art.navgrid).then(async (r) => decodeNavGrid(await r.arrayBuffer())),
  ]);
  visual.scene.traverse((o) => {
    o.matrixAutoUpdate = false; // static world: matrices never change
    o.updateMatrix();
  });
  return { visual: visual.scene, collider: new MeshBVH(collisionGeometry(collision.scene)), meta, nav };
}
