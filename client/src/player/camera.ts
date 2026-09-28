// Third-person orbit camera: follows the player, never goes through walls, drifts back behind
// you while you walk. Pure maths on vectors (no THREE.Camera), so tests can sweep it around the mall.
import { CAMERA } from '@plaza/shared/constants';
import { DoubleSide, Ray, Vector3 } from 'three';
import type { HitPointInfo, MeshBVH } from 'three-mesh-bvh';

const pivotTarget = new Vector3();
const back = new Vector3();
const side = new Vector3();
const ray = new Ray();
const probe = new Vector3();
const hit: HitPointInfo = { point: new Vector3(), distance: 0, faceIndex: 0 };
/** Rays around the main one so the camera's edges don't poke through thin geometry. */
const OFFSETS = [
  [0, 0],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

export class OrbitCamera {
  yaw: number;
  pitch: number = CAMERA.startPitch;
  /** Distance the user asked for (scroll / pinch). */
  zoom: number = CAMERA.startDistance;
  /** Where the camera is and what it looks at. Read these after update(). */
  readonly position = new Vector3();
  readonly target = new Vector3();

  private distance: number = CAMERA.startDistance;
  private readonly pivot = new Vector3();
  private idle = 0;
  private started = false;

  constructor(
    private readonly bvh: MeshBVH,
    yaw = 0,
  ) {
    this.yaw = yaw;
  }

  /**
   * @param feet player's (interpolated) feet position
   * @param facing player's body yaw; used to recenter while moving
   * @param moving whether the player is walking
   * @param look camera turn from input this frame
   * @param zoom zoom delta from input this frame
   */
  update(
    dt: number,
    feet: Vector3,
    facing: number,
    moving: boolean,
    look: { yaw: number; pitch: number },
    zoom: number,
  ) {
    this.yaw += look.yaw;
    this.pitch = Math.min(CAMERA.maxPitch, Math.max(CAMERA.minPitch, this.pitch + look.pitch));
    this.zoom = Math.min(CAMERA.maxDistance, Math.max(CAMERA.minDistance, this.zoom + zoom * this.zoom));

    // swing back behind the player after a while without manual looking
    this.idle = look.yaw !== 0 || look.pitch !== 0 ? 0 : this.idle + dt;
    if (moving && this.idle > CAMERA.recenterDelay) {
      const d = Math.atan2(Math.sin(facing - this.yaw), Math.cos(facing - this.yaw));
      this.yaw += d * (1 - Math.exp(-CAMERA.recenterRate * dt));
    }

    // follow the player with a spring; vertical is softer so stairs and escalators don't bob
    pivotTarget.set(feet.x, feet.y + CAMERA.pivotHeight, feet.z);
    if (!this.started) {
      this.pivot.copy(pivotTarget);
      this.started = true;
    } else {
      const kh = 1 - Math.exp(-CAMERA.followRate * dt);
      const kv = 1 - Math.exp(-CAMERA.verticalRate * dt);
      this.pivot.x += (pivotTarget.x - this.pivot.x) * kh;
      this.pivot.z += (pivotTarget.z - this.pivot.z) * kh;
      this.pivot.y += (pivotTarget.y - this.pivot.y) * kv;
    }

    // shoulder offset, pulled in if a wall is right beside the player
    side.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const shoulder = Math.min(CAMERA.shoulder, this.clearance(this.pivot, side, CAMERA.shoulder));
    this.target.copy(this.pivot).addScaledVector(side, shoulder);

    // back along the view direction until the requested zoom, or a wall, whichever is first
    const cp = Math.cos(this.pitch);
    back.set(Math.sin(this.yaw) * cp, -Math.sin(this.pitch), Math.cos(this.yaw) * cp);
    const free = this.clearance(this.target, back, this.zoom);
    const want = Math.min(this.zoom, free);
    // walls push the camera in instantly; easing back out is gentle
    this.distance =
      want < this.distance
        ? want
        : this.distance + (want - this.distance) * (1 - Math.exp(-CAMERA.zoomOutRate * dt));
    this.position.copy(this.target).addScaledVector(back, this.distance);

    // rays can slip past a thin edge; a closest-point check catches it and pulls the camera in
    for (let i = 0; i < 4 && this.distance > 0; i++) {
      const gap = this.bvh.closestPointToPoint(this.position, hit)?.distance ?? Number.POSITIVE_INFINITY;
      if (gap >= CAMERA.radius * 0.6) break;
      this.distance = Math.max(0, this.distance - (CAMERA.radius - gap));
      this.position.copy(this.target).addScaledVector(back, this.distance);
    }
  }

  /** How far from `from` along unit `dir` we can go (up to `max`) keeping CAMERA.radius off any surface. */
  private clearance(from: Vector3, dir: Vector3, max: number): number {
    let best = max;
    // two vectors perpendicular to dir, for the offset rays
    const ux = Math.abs(dir.y) < 0.9 ? 0 : 1;
    const a = probe
      .set(ux, 1 - ux, 0)
      .cross(dir)
      .normalize();
    const ax = a.x;
    const ay = a.y;
    const az = a.z;
    const bx = dir.y * az - dir.z * ay;
    const by = dir.z * ax - dir.x * az;
    const bz = dir.x * ay - dir.y * ax;
    const r = CAMERA.radius * 0.8;
    for (const [i, j] of OFFSETS) {
      ray.origin.set(
        from.x + (ax * i + bx * j) * r,
        from.y + (ay * i + by * j) * r,
        from.z + (az * i + bz * j) * r,
      );
      ray.direction.copy(dir);
      const hit = this.bvh.raycastFirst(ray, DoubleSide);
      if (hit && hit.distance - CAMERA.radius < best) best = hit.distance - CAMERA.radius;
    }
    return Math.max(0, best);
  }
}
