// Turns a path into the same movement intent the keyboard produces, so tap-to-walk uses exactly
// the same controller (collisions, steps, escalators) as manual walking.
import type { Vector3 } from 'three';
import type { Waypoint } from './path';

/** Close enough to a corner to head for the next one. */
const CORNER = 0.45;
/** Close enough to the destination to stop. */
const ARRIVE = 0.2;
/** Give up if we make less than this much progress in STUCK_TIME seconds. */
const STUCK_DIST = 0.15;
const STUCK_TIME = 1.5;

export class PathFollower {
  path: Waypoint[] | null = null;
  private next = 0;
  private stuckT = 0;
  private stuckX = 0;
  private stuckZ = 0;

  get active() {
    return this.path !== null;
  }

  /** The destination, if walking somewhere. */
  get goal(): Waypoint | null {
    return this.path?.[this.path.length - 1] ?? null;
  }

  start(path: Waypoint[], from: Vector3) {
    this.path = path;
    this.next = 0;
    this.stuckT = 0;
    this.stuckX = from.x;
    this.stuckZ = from.z;
  }

  stop() {
    this.path = null;
  }

  /**
   * Movement intent (x = strafe right, y = forward, relative to `yaw`) toward the next waypoint.
   * Returns null when there's no path, we've arrived, or we're stuck.
   */
  update(dt: number, pos: Vector3, yaw: number): { x: number; y: number } | null {
    const path = this.path;
    if (!path) return null;
    let wp = path[this.next];
    while (wp) {
      const last = this.next === path.length - 1;
      const d = Math.hypot(wp.x - pos.x, wp.z - pos.z);
      // on the right floor and close enough → next corner (floors differ on escalator legs)
      if (d > (last ? ARRIVE : CORNER) || Math.abs(wp.y - pos.y) > 1) break;
      this.next++;
      wp = path[this.next];
    }
    if (!wp) {
      this.stop();
      return null;
    }

    this.stuckT += dt;
    if (this.stuckT >= STUCK_TIME) {
      if (Math.hypot(pos.x - this.stuckX, pos.z - this.stuckZ) < STUCK_DIST) {
        this.stop();
        return null;
      }
      this.stuckT = 0;
      this.stuckX = pos.x;
      this.stuckZ = pos.z;
    }

    const dx = wp.x - pos.x;
    const dz = wp.z - pos.z;
    const len = Math.hypot(dx, dz) || 1;
    // slow down over the last metre so we don't overshoot the destination
    const last = this.next === path.length - 1;
    const scale = last ? Math.min(1, 0.35 + len) : 1;
    const wx = (dx / len) * scale;
    const wz = (dz / len) * scale;
    // world direction → camera-relative intent (inverse of the controller's mapping)
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    return { x: wx * cos - wz * sin, y: -wx * sin - wz * cos };
  }
}
