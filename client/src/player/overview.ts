// Overview: an eased move from the follow camera to a high, tilted view of the whole mall,
// with everything above the player's floor clipped away so you can see inside.
import { Plane, Vector3 } from 'three';

const DURATION = 0.7; // seconds
/** Clip this far above the floor you're looking at: walls stay, the ceiling goes. */
const CUT_ABOVE = 3.4;
const OFF = 1e6;

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const high = new Vector3();
const look = new Vector3();

export class Overview {
  active = false;
  /** 0 = follow camera, 1 = fully in overview. */
  t = 0;
  /** One global clipping plane, always installed; parked far away when not needed. */
  readonly clip = new Plane(new Vector3(0, -1, 0), OFF);
  readonly position = new Vector3();
  readonly target = new Vector3();

  /**
   * @param bounds mall footprint {minX, maxX, minZ, maxZ} in metres
   * @param floorY height of the floor to show
   * @param fov vertical field of view (degrees) and `aspect` of the camera
   */
  update(
    dt: number,
    instant: boolean,
    from: { position: Vector3; target: Vector3 },
    bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
    floorY: number,
    fov: number,
    aspect: number,
  ) {
    const goal = this.active ? 1 : 0;
    // step toward the goal and stop there (no overshoot, no flip-flopping once reached)
    const step = instant ? 1 : dt / DURATION;
    this.t = goal > this.t ? Math.min(goal, this.t + step) : Math.max(goal, this.t - step);

    // far enough back to fit the whole footprint in both directions
    const halfW = (bounds.maxX - bounds.minX) / 2 + 2;
    const halfD = (bounds.maxZ - bounds.minZ) / 2 + 2;
    const v = Math.tan(((fov / 2) * Math.PI) / 180);
    const dist = Math.max(halfD / v, halfW / (v * aspect));
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cz = (bounds.minZ + bounds.maxZ) / 2;
    look.set(cx, floorY, cz);
    high.set(cx, floorY + dist * 0.97, cz + dist * 0.25); // tilted ~15° so walls read as walls

    const e = ease(this.t);
    this.position.lerpVectors(from.position, high, e);
    this.target.lerpVectors(from.target, look, e);
    this.clip.constant = this.t > 0.35 ? floorY + CUT_ABOVE : OFF;
  }

  /** Height above which the world is currently cut away (Infinity when not clipping). */
  get clipY() {
    return this.clip.constant >= OFF ? Number.POSITIVE_INFINITY : this.clip.constant;
  }
}
