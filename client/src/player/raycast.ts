// A ray against the collision BVH that allocates nothing. three-mesh-bvh's raycastFirst builds a
// full hit object for every candidate triangle, which at 60 Hz (ground probes, camera clearance)
// came to several MB of garbage a second. Returns one shared result: copy what you keep.
import { DoubleSide, FrontSide, type Ray, type Side, Vector3 } from 'three';
import type { MeshBVH } from 'three-mesh-bvh';

export type RayHit = { distance: number; point: Vector3; normalY: number; normal: Vector3 };

const hit: RayHit = { distance: 0, point: new Vector3(), normalY: 0, normal: new Vector3() };
const p = new Vector3();
const n = new Vector3();
const entry = new Vector3();

/** Nearest hit within `far`, or null. `normal` is the hit triangle's (`normalY` its y, for walkability). */
export function castRay(bvh: MeshBVH, ray: Ray, far = Number.POSITIVE_INFINITY, side: Side = DoubleSide) {
  let best = far;
  let found = false;
  bvh.shapecast({
    intersectsBounds: (box) =>
      box.containsPoint(ray.origin) ||
      (ray.intersectBox(box, entry) !== null && ray.origin.distanceTo(entry) < best),
    intersectsTriangle: (tri) => {
      if (!ray.intersectTriangle(tri.a, tri.b, tri.c, side === FrontSide, p)) return false;
      const d = ray.origin.distanceTo(p);
      if (d < best) {
        best = d;
        found = true;
        hit.point.copy(p);
        hit.normalY = tri.getNormal(n).y;
        hit.normal.copy(n);
      }
      return false;
    },
  });
  if (!found) return null;
  hit.distance = best;
  return hit;
}
