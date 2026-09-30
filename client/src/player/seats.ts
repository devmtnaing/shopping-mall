// Sitting on benches and sofas (T-507): walk up to one, press E (or tap "Sit down"), and your avatar
// sits; any movement stands you up. Each seat has three spots along its length, so friends can sit
// side by side. A spot is where your back goes; the avatar slides itself forward onto the seat by
// its own body's depth (avatars/kit.ts), so every character fits. Everyone sees it: sitting goes
// over the wire as ANIM.sit.
import type { MallMeta } from '@shopping-mall/shared/meta';

/** How a seat is sat on: its top's height above the floor (m), and whether the legs lie flat along it. */
export type Seat = { height: number; flat: boolean };
/**
 * By kind, measured off the models. A bench is shallow, so legs hang over its front edge. A sofa's
 * cushion is higher and 0.7 m deep, so short legs lie along it instead of sinking into it.
 */
export const SEATS: Record<string, Seat> = {
  bench: { height: 0.46, flat: false },
  chair: { height: 0.46, flat: false },
  sofa: { height: 0.52, flat: true },
};
export const seatOf = (kind: string): Seat => SEATS[kind] ?? (SEATS.bench as Seat);

export type SeatSpot = { x: number; y: number; z: number; yaw: number; seat: Seat };

/** How close (m, on the floor plane) you need to be to a spot (at the backrest) to sit down. */
const REACH = 1.6;
/** Spacing of the spots along a bench (m). */
const SPREAD = 0.6;
/** Getting up, you step this far forward of the backrest: clear of the deepest seat (the sofa's). */
const STEP_OUT = 1.1;

/** Every place to sit: on the floor at the backrest (the avatar lifts and slides itself onto the seat), facing the way the seat faces. */
export function seatSpots(meta: MallMeta): SeatSpot[] {
  return meta.seats.flatMap((s) => {
    const [x, y, z] = s.pos;
    // the bench runs across the direction you face when sitting
    const ax = Math.cos(s.yaw);
    const az = -Math.sin(s.yaw);
    const seat = seatOf(s.kind);
    return [-SPREAD, 0, SPREAD].map((o) => ({
      x: x + ax * o,
      y: y - seat.height, // the floor
      z: z + az * o,
      yaw: s.yaw,
      seat,
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

/** Where to stand when getting up: a step forward, clear of the seat. */
export function standSpot(s: SeatSpot): SeatSpot {
  return {
    x: s.x - Math.sin(s.yaw) * STEP_OUT,
    y: s.y,
    z: s.z - Math.cos(s.yaw) * STEP_OUT,
    yaw: s.yaw,
    seat: s.seat,
  };
}
