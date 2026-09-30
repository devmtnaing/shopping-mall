// Escalators as moving surfaces: while you stand on one, it carries you from its bottom to its top.
// And their moving steps, drawn here since they move (the rest of the escalator is in the mall).
import { ESCALATOR } from '@shopping-mall/shared/constants';
import type { Escalator } from '@shopping-mall/shared/meta';
import {
  BoxGeometry,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from 'three';

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

/** The steps' tread (dark metal) and the yellow strip along each step's edge. */
const TREAD = new MeshStandardMaterial({ color: '#3b3c3f', metalness: 0.6, roughness: 0.45 });
const EDGE = new MeshStandardMaterial({ color: '#e2b43a', roughness: 0.6 });
/** How far a step reaches below its tread, so the risers on the incline close up. */
const RISER = 0.26;

export type EscalatorSteps = { group: Group; update(dt: number): void };

/**
 * The moving steps: they come out of the comb plate flat, climb, flatten and go under the comb
 * plate at the top, at the escalator's speed. Two draw calls for all of them. The walking surface
 * is the invisible ramp in the mall's collision, level with the middle of each tread.
 */
export function escalatorSteps(escalators: readonly Escalator[]): EscalatorSteps {
  const { width, landing: F, step } = ESCALATOR;
  const runs = escalators.map((e) => {
    const from = new Vector3(...e.from);
    const to = new Vector3(...e.to);
    const dir = new Vector3(to.x - from.x, 0, to.z - from.z);
    const run = dir.length();
    dir.divideScalar(run);
    const rise = to.y - from.y;
    return {
      start: from.clone().addScaledVector(dir, -F), // the bottom end
      dir,
      yaw: Math.atan2(-dir.x, -dir.z), // yaw 0 faces −z
      run,
      rise,
      end: run + 2 * F,
      speed: (e.speed * run) / Math.hypot(run, rise), // along the floor
      count: Math.ceil((run + 2 * F) / step),
    };
  });
  const total = runs.reduce((n, r) => n + r.count, 0);
  const tread = new BoxGeometry(width, RISER, step * 0.96);
  tread.translate(0, -RISER / 2, 0);
  const edge = new BoxGeometry(width, 0.012, 0.05);
  edge.translate(0, 0.004, -step * 0.48 + 0.025); // along the step's leading (upper) edge
  const treads = new InstancedMesh(tread, TREAD, total);
  const edges = new InstancedMesh(edge, EDGE, total);
  for (const m of [treads, edges]) {
    m.instanceMatrix.setUsage(DynamicDrawUsage);
    m.frustumCulled = false; // they move every frame; a few hundred vertices
  }
  const group = new Group();
  group.add(treads, edges);

  let t = 0;
  const m = new Matrix4();
  const q = new Quaternion();
  const up = new Vector3(0, 1, 0);
  const at = new Vector3();
  const one = new Vector3(1, 1, 1);
  const update = (dt: number) => {
    t += dt;
    let k = 0;
    for (const r of runs) {
      q.setFromAxisAngle(up, r.yaw);
      const shift = (t * r.speed) % step;
      for (let i = 0; i < r.count; i++) {
        const a = Math.min(i * step + shift, r.end);
        const climb = Math.min(1, Math.max(0, (a - F) / r.run));
        at.copy(r.start).addScaledVector(r.dir, a);
        at.y += climb * r.rise + 0.015;
        m.compose(at, q, one);
        treads.setMatrixAt(k, m);
        edges.setMatrixAt(k, m);
        k++;
      }
    }
    treads.instanceMatrix.needsUpdate = edges.instanceMatrix.needsUpdate = true;
  };
  update(0);
  return { group, update };
}
