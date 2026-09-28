// Server-side sanity checks on client movement. The client is authoritative for its own position
// (no combat, nothing to win), so we only stop the obviously impossible: flying across the mall
// or leaving the world. Directory travel announces itself with a `teleport` message first.
import { PLAYER } from '@shopping-mall/shared/constants';
import type { Pose } from '@shopping-mall/shared/protocol';

/** Fastest legitimate horizontal speed: running on an escalator, plus generous slack. */
const MAX_SPEED = (PLAYER.runSpeed + 1.2) * 1.3;
/** Allowance for jitter and packet bunching (metres). */
const SLACK = 0.75;
const Y_MIN = -30;
const Y_MAX = 100;

/**
 * Is moving from `from` to `to` in `dtMs` believable?
 * `teleport` = the client announced a jump (directory travel) and it's still valid.
 */
export function plausibleMove(from: Pose, to: Pose, dtMs: number, teleport: boolean): boolean {
  if (to.y < Y_MIN || to.y > Y_MAX) return false;
  if (teleport) return true;
  const dist = Math.hypot(to.x - from.x, to.z - from.z);
  return dist <= MAX_SPEED * (Math.max(dtMs, 0) / 1000) + SLACK;
}
