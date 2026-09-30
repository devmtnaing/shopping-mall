// Apples (T-507): pick one at a fruit stand (it shows in your hand), throw it where you're looking,
// one at a time. A throw is an origin and a velocity; every client flies it the same way (gravity, a
// few bounces off the mall's collision mesh, then it rests and fades), so only the throw goes over
// the wire. All flying apples are one InstancedMesh: two draw calls however many are in the air.
import {
  ConeGeometry,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  Ray,
  SphereGeometry,
  Vector3,
} from 'three';
import type { MeshBVH } from 'three-mesh-bvh';
import { castRay } from '../player/raycast';

const MAX = 24;
const GRAVITY = 9.8;
const RADIUS = 0.07;
/** Seconds an apple lasts, the last FADE of them shrinking away. */
const LIFE = 8;
const FADE = 0.6;
/** Speed kept after a bounce, and the speed below which an apple on the floor stops. */
const BOUNCE = 0.42;
const REST = 0.7;

/** How close to a fruit stand's middle you must be to pick an apple (m): about touching it (it's 1.2 m square). */
export const STAND_REACH = 1.3;

// one apple's model, shared by the flying ones and the one in your hand
const SKIN = new SphereGeometry(RADIUS, 12, 8).scale(1, 0.9, 1);
const LEAF = new ConeGeometry(0.025, 0.05, 4).translate(0.012, RADIUS * 0.95, 0).rotateZ(-0.5);
const RED = new MeshStandardMaterial({ color: '#c8242b', roughness: 0.45 });
const GREEN = new MeshStandardMaterial({ color: '#4e8a2e', roughness: 0.8 });

/** An apple to hold (Avatar.hold). */
export function handApple(): Group {
  const g = new Group();
  g.add(new Mesh(SKIN, RED), new Mesh(LEAF, GREEN));
  return g;
}

/** The fruit stand within reach of `pos` (same floor), or null. */
export function standWithin(
  stands: readonly (readonly number[])[],
  pos: { x: number; y: number; z: number },
  reach = STAND_REACH,
): readonly number[] | null {
  return (
    stands.find(
      (s) =>
        Math.abs((s[1] ?? 0) - pos.y) < 1 && Math.hypot((s[0] ?? 0) - pos.x, (s[2] ?? 0) - pos.z) < reach,
    ) ?? null
  );
}

type Apple = { pos: Vector3; vel: Vector3; age: number; resting: boolean; spin: number; axis: Vector3 };

// scratch: nothing allocates per frame
const ray = new Ray();
const step = new Vector3();
const m = new Matrix4();
const q = new Quaternion();
const s = new Vector3();

export class Apples {
  readonly group = new Group();
  private readonly apples: Apple[] = [];
  private readonly body: InstancedMesh;
  private readonly leaf: InstancedMesh;

  constructor(private readonly collider: MeshBVH) {
    this.body = new InstancedMesh(SKIN, RED, MAX);
    this.leaf = new InstancedMesh(LEAF, GREEN, MAX);
    for (const mesh of [this.body, this.leaf]) {
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.count = 0;
      mesh.frustumCulled = false; // they move every frame; a handful of vertices each
    }
    this.group.add(this.body, this.leaf);
  }

  throw(o: readonly number[], v: readonly number[]) {
    if (this.apples.length >= MAX) this.apples.shift();
    const axis = new Vector3(Math.random() - 0.5, 0.3, Math.random() - 0.5).normalize();
    this.apples.push({
      pos: new Vector3(o[0], o[1], o[2]),
      vel: new Vector3(v[0], v[1], v[2]),
      age: 0,
      resting: false,
      spin: 0,
      axis,
    });
  }

  update(dt: number) {
    for (let i = this.apples.length - 1; i >= 0; i--) {
      const a = this.apples[i] as Apple;
      a.age += dt;
      if (a.age > LIFE) {
        this.apples.splice(i, 1);
        continue;
      }
      if (!a.resting) this.fly(a, dt);
    }
    this.draw();
  }

  private fly(a: Apple, dt: number) {
    a.vel.y -= GRAVITY * dt;
    a.spin += dt * a.vel.length() * 2;
    step.copy(a.vel).multiplyScalar(dt);
    const len = step.length();
    if (len === 0) return;
    ray.origin.copy(a.pos);
    ray.direction.copy(step).divideScalar(len);
    const hit = castRay(this.collider, ray, len + RADIUS);
    if (!hit) {
      a.pos.add(step);
      return;
    }
    // stop just short of the surface, then bounce off it, losing most of the speed
    a.pos.copy(hit.point).addScaledVector(ray.direction, -RADIUS);
    const n = hit.normal;
    if (n.dot(ray.direction) > 0) n.negate(); // the side we came from
    a.vel.addScaledVector(n, -2 * a.vel.dot(n)).multiplyScalar(BOUNCE);
    if (n.y > 0.7 && a.vel.length() < REST) {
      a.resting = true;
      a.pos.y = hit.point.y + RADIUS * 0.9;
    }
  }

  private draw() {
    let k = 0;
    for (const a of this.apples) {
      const size = a.age > LIFE - FADE ? (LIFE - a.age) / FADE : 1;
      q.setFromAxisAngle(a.axis, a.spin);
      m.compose(a.pos, q, s.setScalar(size));
      this.body.setMatrixAt(k, m);
      this.leaf.setMatrixAt(k, m);
      k++;
    }
    this.body.count = this.leaf.count = k;
    this.body.instanceMatrix.needsUpdate = this.leaf.instanceMatrix.needsUpdate = true;
  }

  get count() {
    return this.apples.length;
  }
}
