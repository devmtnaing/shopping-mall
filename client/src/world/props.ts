// Furniture and decoration: props.glb holds one model per kind, and the mall's meta says where each
// goes. Every part of every kind is one InstancedMesh, so a mall full of benches, bins and lamps
// costs a handful of draw calls. Loaded after the mall; the collision boxes are in the mall's
// collision mesh already, so props are purely visual.
import type { MallMeta } from '@shopping-mall/shared/meta';
import { Euler, Group, InstancedMesh, Matrix4, type Mesh, type Object3D, Quaternion, Vector3 } from 'three';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const URL = `${import.meta.env.BASE_URL}assets/props/props.glb`;

export async function loadProps(meta: MallMeta): Promise<Group> {
  const group = new Group();
  const placements = meta.props ?? [];
  if (!placements.length) return group;
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(URL);
  gltf.scene.updateMatrixWorld(true);

  const kinds = new Map<string, Object3D>();
  for (const child of gltf.scene.children) kinds.set(child.name, child);

  const place = new Matrix4();
  const local = new Matrix4();
  const q = new Quaternion();
  const one = new Vector3(1, 1, 1);
  const byKind = new Map<string, typeof placements>();
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
