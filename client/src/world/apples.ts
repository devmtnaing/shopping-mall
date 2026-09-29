// Apples (T-507): pick one at a fruit stand, throw it where you're looking. A throw is an origin and
// a velocity; every client flies it the same way (gravity, a few bounces off the mall's collision
// mesh, then it rests and fades), so only the throw goes over the wire. All apples are one
// InstancedMesh: two draw calls however many are in the air.
import {
  ConeGeometry,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
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
    const skin = new SphereGeometry(RADIUS, 12, 8);
    skin.scale(1, 0.9, 1);
    this.body = new InstancedMesh(skin, new MeshStandardMaterial({ color: '#c8242b', roughness: 0.45 }), MAX);
    const leaf = new ConeGeometry(0.025, 0.05, 4);
    leaf.translate(0.012, RADIUS * 0.95, 0);
    leaf.rotateZ(-0.5);
    this.leaf = new InstancedMesh(leaf, new MeshStandardMaterial({ color: '#4e8a2e', roughness: 0.8 }), MAX);
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
