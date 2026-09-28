// Which named area is the player in? Highest-priority zone containing them, with hysteresis so the
// label doesn't flicker when standing on a boundary.
import type { Zone } from '@plaza/shared/meta';
import type { Vector3 } from 'three';

/** Stay in the current zone until you're this far outside it (metres)... */
const MARGIN = 0.4;
/** ...or a new zone has been the best match for this long (seconds). */
const SETTLE = 0.2;

const contains = (z: Zone, p: Vector3, m = 0) =>
  p.x >= z.min[0] - m &&
  p.x <= z.max[0] + m &&
  p.y >= z.min[1] - m &&
  p.y <= z.max[1] + m &&
  p.z >= z.min[2] - m &&
  p.z <= z.max[2] + m;

const volume = (z: Zone) => (z.max[0] - z.min[0]) * (z.max[1] - z.min[1]) * (z.max[2] - z.min[2]);

export class ZoneTracker {
  current: Zone | null = null;
  private pending: Zone | null = null;
  private pendingT = 0;

  constructor(private readonly zones: readonly Zone[]) {}

  /** Best zone at `p`: highest priority, then the smallest (most specific). */
  best(p: Vector3): Zone | null {
    let best: Zone | null = null;
    for (const z of this.zones) {
      if (!contains(z, p)) continue;
      if (!best || z.priority > best.priority || (z.priority === best.priority && volume(z) < volume(best)))
        best = z;
    }
    return best;
  }

  /** Advance by dt; returns true when `current` changed. */
  update(dt: number, p: Vector3): boolean {
    const best = this.best(p);
    const cur = this.current;
    if (best === cur) {
      this.pending = null;
      return false;
    }
    if (cur && contains(cur, p, MARGIN) && (!best || best.priority <= cur.priority)) {
      this.pending = null; // still (nearly) inside the current zone and nothing more specific: stay
      return false;
    }
    if (!cur) {
      this.current = best; // first placement: no delay
      return true;
    }
    if (this.pending !== best) {
      this.pending = best;
      this.pendingT = 0;
      return false;
    }
    this.pendingT += dt;
    if (this.pendingT < SETTLE) return false;
    this.current = best;
    this.pending = null;
    return true;
  }
}
