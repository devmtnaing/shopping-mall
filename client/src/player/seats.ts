// Sitting on benches (T-507): walk up to a bench, press E (or tap "Sit down"), and your avatar sits;
// any movement stands you up. Each bench has three spots along its length, so friends can sit side
// by side. Everyone sees it: sitting goes over the wire as ANIM.sit.
import type { MallMeta } from '@shopping-mall/shared/meta';

export type SeatSpot = { x: number; y: number; z: number; yaw: number };

/** How close (m, on the floor plane) you need to be to sit down. */
const REACH = 1.4;
/** Spacing of the spots along a bench (m). */
const SPREAD = 0.6;
/** The rig's hips sit this far behind its origin when sitting (m), so the origin goes this far ahead of the seat. */
const HIPS_BEHIND = 0.06;

/** Every place to sit: on the floor under the seat (the avatar lifts itself onto it), facing the way the bench faces. */
export function seatSpots(meta: MallMeta): SeatSpot[] {
  return meta.seats.flatMap((s) => {
    const [x, y, z] = s.pos;
    // the bench runs across the direction you face when sitting
    const ax = Math.cos(s.yaw);
    const az = -Math.sin(s.yaw);
    // forward is (−sin, −cos): yaw 0 faces −z
    const bx = -Math.sin(s.yaw) * HIPS_BEHIND;
    const bz = -Math.cos(s.yaw) * HIPS_BEHIND;
    return [-SPREAD, 0, SPREAD].map((o) => ({
      x: x + ax * o + bx,
      y: y - 0.45,
      z: z + az * o + bz,
      yaw: s.yaw,
    }));
  });
}

/** The nearest spot within reach on the same floor, or null. */
export function nearestSpot(spots: SeatSpot[], p: { x: number; y: number; z: number }): SeatSpot | null {
  let best: SeatSpot | null = null;
  let bestD = REACH;
  for (const s of spots) {
    if (Math.abs(s.y - p.y) > 0.7) continue;
    const d = Math.hypot(s.x - p.x, s.z - p.z);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

/** Where to stand when getting up: a step forward from the seat. */
export function standSpot(s: SeatSpot): SeatSpot {
  return { x: s.x - Math.sin(s.yaw) * 0.7, y: s.y, z: s.z - Math.cos(s.yaw) * 0.7, yaw: s.yaw };
}
