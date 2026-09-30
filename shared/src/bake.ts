// Navgrid baking, shared by `pnpm navgrid` (the built-in greybox) and the server (uploaded malls).
// A cell is walkable when (1) walkable ground lies under it within a metre of its floor and
// (2) the player's body capsule fits there. Same rules as the character controller, so any
// cell A* picks is somewhere the player can actually stand. Escalators become one-way links between
// floors, from the end the steps leave to the end they arrive at.
import { WebIO } from '@gltf-transform/core';
import { Box3, BufferAttribute, BufferGeometry, DoubleSide, Line3, Matrix4, Ray, Vector3 } from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { PLAYER } from './constants.ts';
import type { MallMeta } from './meta.ts';
import { NavGrid, type NavLink } from './navgrid.ts';

const CELL = 0.25;
/** Keep paths a little off walls so the capsule doesn't scrape along them. */
const MARGIN = 0.05;
const WALKABLE_Y = Math.cos((PLAYER.maxSlope * Math.PI) / 180);
/** Cells per floor we're willing to bake (and ship): 1500 × 1500 m² at 0.25 m would be silly. */
const MAX_CELLS = 1_000_000;

/** All triangles of a .glb, in world space, as one indexed geometry. Throws on a file that isn't glTF. */
export async function readTriangles(glb: Uint8Array): Promise<BufferGeometry> {
  const doc = await new WebIO().readBinary(glb);
  const positions: number[] = [];
  const indices: number[] = [];
  const m = new Matrix4();
  const v = new Vector3();
  for (const scene of doc.getRoot().listScenes()) {
    scene.traverse((node) => {
      const mesh = node.getMesh();
      if (!mesh) return;
      m.fromArray(node.getWorldMatrix());
      for (const prim of mesh.listPrimitives()) {
        if (prim.getMode() !== 4) continue; // triangles only
        const pos = prim.getAttribute('POSITION');
        if (!pos) continue;
        const base = positions.length / 3;
        for (let i = 0; i < pos.getCount(); i++) {
          const [x = 0, y = 0, z = 0] = pos.getElement(i, []);
          v.set(x, y, z).applyMatrix4(m);
          positions.push(v.x, v.y, v.z);
        }
        const index = prim.getIndices();
        if (index) for (let i = 0; i < index.getCount(); i++) indices.push(base + index.getScalar(i));
        else for (let i = 0; i < pos.getCount(); i++) indices.push(base + i);
      }
    });
  }
  if (!indices.length) throw new Error('The collision model has no triangles.');
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setIndex(new BufferAttribute(new Uint32Array(indices), 1));
  geometry.computeBoundingBox();
  return geometry;
}

const ray = new Ray(new Vector3(), new Vector3(0, -1, 0));
const seg = new Line3();
const box = new Box3();
const a = new Vector3();
const b = new Vector3();

/** Ground height under (x, z) for a floor at y, or null. */
function ground(bvh: MeshBVH, x: number, z: number, y: number): number | null {
  ray.origin.set(x, y + 2, z);
  const hit = bvh.raycastFirst(ray, DoubleSide);
  if (!hit?.face || hit.face.normal.y < WALKABLE_Y) return null;
  const h = hit.point.y;
  return h >= y - 0.05 && h <= y + 1 ? h : null;
}

/** True when the body capsule standing at (x, h, z) overlaps geometry. */
function blocked(bvh: MeshBVH, x: number, h: number, z: number): boolean {
  const r = PLAYER.radius + MARGIN;
  seg.start.set(x, h + PLAYER.stepHeight + PLAYER.radius, z);
  seg.end.set(x, h + PLAYER.height - PLAYER.radius, z);
  box.makeEmpty().expandByPoint(seg.start).expandByPoint(seg.end);
  box.min.addScalar(-r);
  box.max.addScalar(r);
  return bvh.shapecast({
    intersectsBounds: (bb) => bb.intersectsBox(box),
    intersectsTriangle: (tri) => tri.closestPointToSegment(seg, a, b) < r,
  });
}

function onEscalator(meta: MallMeta, x: number, z: number) {
  return meta.escalators.some((e) => {
    const [x0, x1] = [e.from[0] - e.width / 2 - 0.15, e.from[0] + e.width / 2 + 0.15];
    const [z0, z1] = [Math.min(e.from[2], e.to[2]), Math.max(e.from[2], e.to[2])];
    return x >= x0 && x <= x1 && z >= z0 && z <= z1;
  });
}

/** Bake the navgrid for a collision mesh and its meta. Throws a readable Error when they don't fit together. */
export function bakeNavGrid(geometry: BufferGeometry, meta: MallMeta): NavGrid {
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const bounds = geometry.boundingBox as Box3;
  const bvh = new MeshBVH(geometry);
  const originX = Math.floor(bounds.min.x);
  const originZ = Math.floor(bounds.min.z);
  const cols = Math.ceil((bounds.max.x - originX) / CELL);
  const rows = Math.ceil((bounds.max.z - originZ) / CELL);
  if (cols * rows > MAX_CELLS)
    throw new Error(
      `The collision model is too large (${Math.round(cols * CELL)} × ${Math.round(rows * CELL)} m).`,
    );
  const floorY = meta.floors.map((f) => f.y);

  const cells = floorY.map((y) => {
    const out = new Uint8Array(cols * rows);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = originX + (c + 0.5) * CELL;
        const z = originZ + (r + 0.5) * CELL;
        if (onEscalator(meta, x, z)) continue;
        const h = ground(bvh, x, z, y);
        if (h === null || blocked(bvh, x, h, z)) continue;
        out[r * cols + c] = 1 + Math.round(Math.max(0, h - y) * 100);
      }
    }
    return out;
  });

  const grid = new NavGrid(CELL, originX, originZ, cols, rows, floorY, cells, []);
  const floorOf = (y: number) =>
    floorY.reduce((best, fy, i) => (Math.abs(fy - y) < Math.abs((floorY[best] ?? 0) - y) ? i : best), 0);
  for (const s of meta.spawns) {
    const [x, y, z] = s.pos;
    if (!grid.walkable(floorOf(y), grid.index(x, z)))
      throw new Error(`Spawn point "${s.id}" isn't on walkable floor.`);
  }
  const links: NavLink[] = meta.escalators.map((e) => {
    const dx = e.to[0] - e.from[0];
    const dz = e.to[2] - e.from[2];
    const flat = Math.hypot(dx, dz);
    const foot = grid.index(e.from[0] - (dx / flat) * 0.6, e.from[2] - (dz / flat) * 0.6);
    const head = grid.index(e.to[0] + (dx / flat) * 0.6, e.to[2] + (dz / flat) * 0.6);
    const floorA = floorOf(e.from[1]);
    const floorB = floorOf(e.to[1]);
    if (!grid.walkable(floorA, foot) || !grid.walkable(floorB, head))
      throw new Error(`Escalator "${e.id}" doesn't start and end on walkable floor.`);
    return { floorA, cellA: foot, floorB, cellB: head, cost: Math.hypot(dx, e.to[1] - e.from[1], dz) + 1.2 };
  });

  bvh.geometry.dispose();
  return new NavGrid(CELL, originX, originZ, cols, rows, floorY, cells, links);
}
