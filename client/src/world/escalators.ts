// Escalators as moving surfaces: while you stand on one, it carries you from its bottom to its top.
import type { Escalator } from '@plaza/shared/meta';
import type { Vector3 } from 'three';

/** How close (vertically) your feet must be to the moving surface to ride it. */
const RIDE_TOLERANCE = 0.25;

/**
 * Sets `out` to the velocity of the escalator under `feet`, or zero when not on one.
 * Pure function of the escalator list, so it's cheap to call every step and easy to test.
 */
export function escalatorCarry(escalators: readonly Escalator[], feet: Vector3, out: Vector3): Vector3 {
  out.set(0, 0, 0);
  for (const e of escalators) {
    const dx = e.to[0] - e.from[0];
    const dy = e.to[1] - e.from[1];
    const dz = e.to[2] - e.from[2];
    const flat2 = dx * dx + dz * dz;
    // progress along the run (0 = bottom, 1 = top) and sideways offset, in the XZ plane
    const px = feet.x - e.from[0];
    const pz = feet.z - e.from[2];
    const t = (px * dx + pz * dz) / flat2;
    if (t < 0 || t > 1) continue;
    const side = Math.abs(px * dz - pz * dx) / Math.sqrt(flat2);
    if (side > e.width / 2) continue;
    const surfaceY = e.from[1] + dy * t;
    if (Math.abs(feet.y - surfaceY) > RIDE_TOLERANCE) continue;
    const len = Math.hypot(dx, dy, dz);
    return out.set((dx / len) * e.speed, (dy / len) * e.speed, (dz / len) * e.speed);
  }
  return out;
}
