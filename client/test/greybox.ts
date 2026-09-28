// Test helper: the greybox collision mesh as a BVH, built once per test file.
import { BufferAttribute, BufferGeometry } from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { buildGreybox } from '../../tools/greybox/layout';

export const greybox = buildGreybox();
const geometry = new BufferGeometry();
geometry.setAttribute('position', new BufferAttribute(new Float32Array(greybox.geo.collision), 3));
export const collider = new MeshBVH(geometry);
