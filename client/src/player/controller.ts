// Character controller against the mall's collision mesh (three-mesh-bvh).
//
// "Floating capsule" design: the capsule only covers the body from stepHeight up to the head, so
// walls and anything taller than a step block it. Below that, a few downward rays find the ground
// and set the feet height directly. Steps and slopes need no special cases, and nothing slides.
//
// Pure simulation (no DOM, no rendering), so it runs in unit tests exactly as in the browser.
import { PLAYER } from '@shopping-mall/shared/constants';
import { Box3, FrontSide, Line3, Ray, Vector3 } from 'three';
import type { MeshBVH } from 'three-mesh-bvh';
import { castRay } from './raycast';

/** What the player wants this step. x = strafe right, y = forward, both relative to `yaw`. */
export type Intent = { x: number; y: number; run: boolean; jump: boolean; yaw: number };

const { radius: R, height: H, stepHeight: STEP_H } = PLAYER;
const WALKABLE_Y = Math.cos((PLAYER.maxSlope * Math.PI) / 180);
/** Ground rays: centre plus four around it, so you don't drop off a ledge the moment your centre passes it. */
const PROBE = [
  [0, 0],
  [0.6 * R, 0],
  [-0.6 * R, 0],
  [0, 0.6 * R],
  [0, -0.6 * R],
] as const;

// scratch objects: nothing allocates per step
const seg = new Line3();
const box = new Box3();
const triPoint = new Vector3();
const capPoint = new Vector3();
const dir = new Vector3();
const wish = new Vector3();
const before = new Vector3();
const ray = new Ray(new Vector3(), new Vector3(0, -1, 0));

export class PlayerController {
  /** Feet position. */
  readonly pos = new Vector3();
  readonly vel = new Vector3();
  /** Position at the previous step, for render interpolation. */
  readonly prev = new Vector3();
  /** The direction the body faces (radians, 0 = −Z). */
  facing = 0;
  grounded = false;
  /** Horizontal speed actually achieved last step (m/s), for animation. */
  speed = 0;
  /** Extra velocity from moving surfaces (escalators, T-105), applied while grounded. */
  readonly carry = new Vector3();

  private readonly spawn = new Vector3();
  private spawnYaw = 0;

  constructor(private readonly bvh: MeshBVH) {}

  place(x: number, y: number, z: number, yaw = 0) {
    this.spawn.set(x, y, z);
    this.spawnYaw = yaw;
    this.pos.set(x, y, z);
    this.prev.copy(this.pos);
    this.vel.set(0, 0, 0);
    this.facing = yaw;
    this.grounded = false;
  }

  step(dt: number, intent: Intent) {
    this.prev.copy(this.pos);
    before.copy(this.pos);

    // desired horizontal velocity, relative to the camera yaw
    const sin = Math.sin(intent.yaw);
    const cos = Math.cos(intent.yaw);
    const speed = intent.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
    wish.set(intent.x * cos - intent.y * sin, 0, -intent.x * sin - intent.y * cos).multiplyScalar(speed);
    const k = 1 - Math.exp(-(this.grounded ? PLAYER.groundAccel : PLAYER.airAccel) * dt);
    this.vel.x += (wish.x - this.vel.x) * k;
    this.vel.z += (wish.z - this.vel.z) * k;

    const onGround = this.grounded;
    if (onGround && intent.jump) {
      this.vel.y = PLAYER.jumpSpeed;
      this.grounded = false;
    }
    if (!this.grounded) this.vel.y -= PLAYER.gravity * dt;

    const cx = onGround ? this.carry.x : 0;
    const cz = onGround ? this.carry.z : 0;
    this.pos.x += (this.vel.x + cx) * dt;
    this.pos.z += (this.vel.z + cz) * dt;
    this.pos.y += this.grounded ? this.carry.y * dt : this.vel.y * dt;

    this.pushOut(this.pos);
    this.findGround(onGround, dt);

    // walls cancel the velocity pointing into them (otherwise you'd shoot off when sliding past a corner)
    this.vel.x = (this.pos.x - before.x) / dt - cx;
    this.vel.z = (this.pos.z - before.z) / dt - cz;
    this.speed = Math.hypot(this.vel.x, this.vel.z);

    // turn the body toward where it's going
    if (wish.lengthSq() > 0.01) {
      let d = Math.atan2(-wish.x, -wish.z) - this.facing;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.facing += d * (1 - Math.exp(-PLAYER.turnRate * dt));
    }

    if (this.pos.y < PLAYER.killY) this.place(this.spawn.x, this.spawn.y, this.spawn.z, this.spawnYaw);
  }

  /**
   * Snap the feet to walkable ground below. While grounded we also reach down one step height,
   * so walking down stairs and slopes keeps you on them instead of hopping off.
   */
  private findGround(wasGrounded: boolean, dt: number) {
    if (this.vel.y > 0 && !this.grounded) return; // rising from a jump
    const top = this.pos.y + STEP_H + 0.02; // just inside the capsule's bottom
    const reach = STEP_H + 0.02 + (wasGrounded ? STEP_H : Math.max(0.01, -this.vel.y * dt));
    let best = Number.NEGATIVE_INFINITY;
    for (const [ox, oz] of PROBE) {
      ray.origin.set(this.pos.x + ox, top, this.pos.z + oz);
      const hit = castRay(this.bvh, ray, reach, FrontSide);
      if (!hit || hit.normalY < WALKABLE_Y) continue;
      best = Math.max(best, hit.point.y);
    }
    if (best === Number.NEGATIVE_INFINITY) {
      this.grounded = false;
      return;
    }
    this.pos.y = best;
    this.vel.y = 0;
    this.grounded = true;
  }

  /** Push the body capsule (from step height to the head) out of walls, rails, ceilings. */
  private pushOut(p: Vector3) {
    for (let pass = 0; pass < 3; pass++) {
      seg.start.set(p.x, p.y + STEP_H + R, p.z);
      seg.end.set(p.x, p.y + H - R, p.z);
      box.makeEmpty().expandByPoint(seg.start).expandByPoint(seg.end);
      box.min.addScalar(-R);
      box.max.addScalar(R);
      let hit = false;
      this.bvh.shapecast({
        intersectsBounds: (b) => b.intersectsBox(box),
        intersectsTriangle: (tri) => {
          const d = tri.closestPointToSegment(seg, triPoint, capPoint);
          if (d >= R) return false;
          if (d > 1e-6) dir.subVectors(capPoint, triPoint).divideScalar(d);
          else tri.getNormal(dir); // centre exactly on the surface: use the face normal
          if (dir.y < -0.5 && this.vel.y > 0) this.vel.y = 0; // bumped head
          seg.start.addScaledVector(dir, R - d);
          seg.end.addScaledVector(dir, R - d);
          hit = true;
          return false;
        },
      });
      p.set(seg.start.x, seg.start.y - STEP_H - R, seg.start.z);
      if (!hit) break;
    }
  }
}
