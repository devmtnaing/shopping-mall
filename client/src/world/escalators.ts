// Escalators as moving surfaces: while you stand on one, it carries you the way its steps run, landings
// included (A up, B down).
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
    // the steps run flat across a landing at each end too, so they carry you off at the far end
    const landing = ESCALATOR.landing / Math.sqrt(flat2);
    if (t < -landing || t > 1 + landing) continue;
    const side = Math.abs(px * dz - pz * dx) / Math.sqrt(flat2);
    if (side > e.width / 2) continue;
    const incline = t >= 0 && t <= 1;
    const surfaceY = e.from[1] + dy * Math.min(1, Math.max(0, t));
    if (Math.abs(feet.y - surfaceY) > RIDE_TOLERANCE) continue;
    if (!incline) {
      const flat = Math.sqrt(flat2);
      return out.set((dx / flat) * e.speed, 0, (dz / flat) * e.speed);
    }
    const len = Math.hypot(dx, dy, dz);
    return out.set((dx / len) * e.speed, (dy / len) * e.speed, (dz / len) * e.speed);
  }
  return out;
}

/** The steps' tread (dark metal) and the yellow strip along each step's edge. */
const TREAD = new MeshStandardMaterial({ color: '#3b3c3f', metalness: 0.6, roughness: 0.45 });
const EDGE = new MeshStandardMaterial({ color: '#e2b43a', roughness: 0.6 });
/** How far a step reaches below its tread on the incline, so the risers close up. On the flat it's
 * only as deep as the drop to its neighbours: a full-depth step on the top landing would hang out of
 * the bridge's underside. */
const RISER = 0.26;
/** The upper floor's thickness (m): steps must stay inside it where they reach over the top landing. */
const SLAB = 0.3;
/** The comb plates at each end (m, tools/greybox/layout.ts): steps slip under them. */
const PLATE = 0.5;

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
      top: Math.max(from.y, to.y), // the upper landing's floor
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
  const gone = new Vector3(0, 0, 0);
  const deep = new Vector3(1, 1, 1);
  const update = (dt: number) => {
    t += dt;
    let k = 0;
    for (const r of runs) {
      q.setFromAxisAngle(up, r.yaw);
      const shift = (t * r.speed) % step;
      for (let i = 0; i < r.count; i++) {
        const a = i * step + shift;
        const height = (x: number) => Math.min(1, Math.max(0, (x - F) / r.run)) * r.rise;
        at.copy(r.start).addScaledVector(r.dir, a);
        at.y += height(a) + 0.015;
        const drop = Math.max(Math.abs(height(a) - height(a - step)), Math.abs(height(a + step) - height(a)));
        let depth = Math.min(RISER, drop + 0.04);
        // a step reaching over the top landing stays inside its floor (0.3 m: the bridge), even one
        // still half on the incline
        const onTop = r.rise > 0 ? a + step / 2 > F + r.run : a - step / 2 < F;
        if (onTop) depth = Math.min(depth, at.y - (r.top - SLAB + 0.02));
        deep.set(1, Math.max(0.01, depth) / RISER, 1);
        // under a comb plate (or past the end): dip just below it, then vanish. They mustn't sink
        // further: at the top the landing is the bridge, only 0.3 m thick, with people under it.
        const under = Math.max(PLATE + step / 2 - a, a - (r.end - PLATE - step / 2), 0);
        at.y -= Math.min(under, 0.03);
        const hidden = under > step / 2;
        treads.setMatrixAt(k, m.compose(at, q, hidden ? gone : deep));
        edges.setMatrixAt(k, m.compose(at, q, hidden ? gone : one));
        k++;
      }
    }
    treads.instanceMatrix.needsUpdate = edges.instanceMatrix.needsUpdate = true;
  };
  update(0);
  return { group, update };
}
