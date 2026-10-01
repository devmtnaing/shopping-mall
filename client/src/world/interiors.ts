// What's inside the shops: each shop's unit is furnished by its category (a café gets tables and a
// counter, a bookshop gets shelves), so a shop looks like what it sells before anyone opens its
// panel. Vacant units stay empty. The layouts themselves are in layouts.ts; this places them in the
// world. The furniture is props from the packs, and solid: the obstacle boxes go to the player
// controller, since shops (and so their furniture) change without the mall's collision mesh changing.
// Everything stands on whatever floor is under it (the flagship's back is a stage).
import type { Shop } from '@shopping-mall/shared/config';
import type { MallMeta, Slot } from '@shopping-mall/shared/meta';
import { Box3, Vector3 } from 'three';
import { layoutFor, unitItems, unitSize } from './layouts';
import type { Footprint, Placement } from './props';

export { type Layout, layoutFor } from './layouts';

/** The unit's frame: forward (in from the door), right, and its depth and width. */
function frame(slot: Slot) {
  const yaw = slot.door.yaw;
  const f = new Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const r = new Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  return { yaw, f, r, door: new Vector3(...slot.door.pos), ...unitSize(slot) };
}

/** Height of the floor under (x, z), looking down from `above`. */
export type FloorAt = (x: number, z: number, above: number) => number;

/** Every furnished unit's props, and their collision boxes. */
export function furnish(
  meta: MallMeta,
  shops: readonly Shop[],
  footprints: Record<string, Footprint | null>,
  floorAt: FloorAt = (_x, _z, above) => above,
): { placements: Placement[]; obstacles: Box3[] } {
  const placements: Placement[] = [];
  const obstacles: Box3[] = [];
  const bySlot = new Map(shops.map((s) => [s.slot, s]));
  for (const slot of meta.slots) {
    const shop = bySlot.get(slot.id);
    const layout = shop && layoutFor(shop);
    if (!layout) continue;
    const u = frame(slot);
    const items = unitItems(layout, u.depth, u.width);
    for (const it of items) {
      const pos = u.door.clone().addScaledVector(u.f, it.d).addScaledVector(u.r, it.x);
      pos.y = Math.max(u.door.y, floorAt(pos.x, pos.z, u.door.y)); // never below the unit's floor (ray noise)
      const yaw = u.yaw + it.yaw;
      placements.push({ kind: it.kind, pos: [pos.x, pos.y, pos.z], yaw });
      const fp = footprints[it.kind];
      if (!fp) continue;
      const [w, h, d] = fp;
      // quarter turns only: swap width and depth when it's turned sideways
      const [hx, hz] = Math.abs(Math.sin(yaw)) > 0.5 ? [d / 2, w / 2] : [w / 2, d / 2];
      obstacles.push(
        new Box3(new Vector3(pos.x - hx, pos.y, pos.z - hz), new Vector3(pos.x + hx, pos.y + h, pos.z + hz)),
      );
    }
  }
  return { placements, obstacles };
}
