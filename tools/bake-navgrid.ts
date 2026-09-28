// pnpm navgrid — bakes client/public/assets/mall/navgrid.bin from the collision mesh and meta.
// A cell is walkable when (1) walkable ground lies under it within a metre of its floor and
// (2) the player's body capsule fits there. Same rules as the character controller, so any
// cell A* picks is somewhere the player can actually stand. Escalators become links between floors.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { PLAYER } from '@plaza/shared/constants';
import type { MallMeta } from '@plaza/shared/meta';
import { encodeNavGrid, NavGrid, type NavLink } from '@plaza/shared/navgrid';
import { Box3, BufferAttribute, BufferGeometry, DoubleSide, Line3, Ray, Vector3 } from 'three';
import { MeshBVH } from 'three-mesh-bvh';

const DIR = resolve(import.meta.dirname, '../client/public/assets/mall');
const CELL = 0.25;
/** Keep paths a little off walls so the capsule doesn't scrape along them. */
const MARGIN = 0.05;
const WALKABLE_Y = Math.cos((PLAYER.maxSlope * Math.PI) / 180);

async function loadCollider() {
  const doc = await new NodeIO().read(`${DIR}/greybox.collision.glb`);
  const prim = doc.getRoot().listMeshes()[0]?.listPrimitives()[0];
  const pos = prim?.getAttribute('POSITION')?.getArray();
  if (!prim || !pos) throw new Error('navgrid: collision mesh has no positions');
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  const index = prim.getIndices()?.getArray();
  if (index) geometry.setIndex(new BufferAttribute(new Uint32Array(index), 1));
  geometry.computeBoundingBox();
  return { bvh: new MeshBVH(geometry), bounds: geometry.boundingBox as Box3 };
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

const meta: MallMeta = JSON.parse(readFileSync(`${DIR}/mall.meta.json`, 'utf8'));
const { bvh, bounds } = await loadCollider();
const originX = Math.floor(bounds.min.x);
const originZ = Math.floor(bounds.min.z);
const cols = Math.ceil((bounds.max.x - originX) / CELL);
const rows = Math.ceil((bounds.max.z - originZ) / CELL);
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
const links: NavLink[] = meta.escalators.map((e) => {
  const dx = e.to[0] - e.from[0];
  const dz = e.to[2] - e.from[2];
  const flat = Math.hypot(dx, dz);
  const foot = grid.index(e.from[0] - (dx / flat) * 0.6, e.from[2] - (dz / flat) * 0.6);
  const head = grid.index(e.to[0] + (dx / flat) * 0.6, e.to[2] + (dz / flat) * 0.6);
  const floorA = floorOf(e.from[1]);
  const floorB = floorOf(e.to[1]);
  if (!grid.walkable(floorA, foot) || !grid.walkable(floorB, head))
    throw new Error(`navgrid: escalator ${e.id} doesn't start and end on walkable cells`);
  return { floorA, cellA: foot, floorB, cellB: head, cost: Math.hypot(dx, e.to[1] - e.from[1], dz) + 1.2 };
});

const bin = encodeNavGrid(new NavGrid(CELL, originX, originZ, cols, rows, floorY, cells, links));
writeFileSync(`${DIR}/navgrid.bin`, bin);
const walkable = cells.map((f) => f.reduce((n, v) => n + (v > 0 ? 1 : 0), 0));
console.log(
  `navgrid: ${cols}×${rows} cells × ${floorY.length} floors, walkable ${walkable.join(' / ')}, ` +
    `${links.length} links, ${(bin.byteLength / 1024).toFixed(1)} KB`,
);
