// Ambient life (T-213): a few shoppers who wander the mall on their own, in every visitor's view
// (they're local, not multiplayer). They walk the navgrid from shop window to shop window, stop to
// look, and sit on free benches for a while. Kinematic (no physics); animated only when nearby.
import { AVATARS } from '@shopping-mall/shared/avatars';
import type { MallMeta } from '@shopping-mall/shared/meta';
import { ANIM } from '@shopping-mall/shared/protocol';
import { Group, type Vector3 } from 'three';
import type { Avatar, AvatarKit } from '../avatars/kit';
import type { PathFinder, Waypoint } from '../player/path';

const SPEED = 1.3; // m/s: an unhurried stroll
const TURN = 6; // how quickly they turn to face where they're going (1/s)
const ANIMATE_WITHIN = 30; // m from the camera

type Spot = { x: number; y: number; z: number; yaw: number; seat?: string };
type Shopper = {
  avatar: Avatar;
  path: Waypoint[];
  next: number;
  wait: number;
  spot: Spot | null;
  x: number;
  y: number;
  z: number;
  yaw: number;
};

export class Shoppers {
  readonly group = new Group();
  private readonly list: Shopper[] = [];
  private readonly windows: Spot[];
  private readonly seats: Spot[];
  private readonly taken = new Set<string>();

  constructor(
    kit: AvatarKit,
    meta: MallMeta,
    private readonly finder: PathFinder,
    count: number,
    private readonly random: () => number = Math.random,
  ) {
    // stand just outside a shop's door, facing in; sit on a bench, facing where it faces
    this.windows = meta.slots.map((s) => {
      const [x, y, z] = s.door.pos;
      const yaw = s.door.yaw;
      return { x: x + Math.sin(yaw) * 1.6, y, z: z + Math.cos(yaw) * 1.6, yaw };
    });
    this.seats = meta.seats.map((s) => ({
      x: s.pos[0],
      y: s.pos[1] - 0.45,
      z: s.pos[2],
      yaw: s.yaw,
      seat: s.id,
    }));
    for (let i = 0; i < count && this.windows.length; i++) {
      const start = this.pick(this.windows);
      const avatar = kit.create(AVATARS[Math.floor(this.random() * AVATARS.length)]);
      this.group.add(avatar.object);
      const s: Shopper = { avatar, path: [], next: 0, wait: this.random() * 4, spot: start, ...start };
      this.list.push(s);
    }
  }

  update(dt: number, camera: Vector3) {
    for (const s of this.list) {
      if (s.wait > 0) {
        s.wait -= dt;
        if (s.wait <= 0) this.leave(s);
      } else this.walk(s, dt);
      const o = s.avatar.object;
      o.position.set(s.x, s.y, s.z);
      o.rotation.y = s.yaw;
      if (o.position.distanceToSquared(camera) < ANIMATE_WITHIN * ANIMATE_WITHIN) s.avatar.update(dt);
    }
  }

  private pick(from: Spot[]): Spot {
    return from[Math.floor(this.random() * from.length)] as Spot;
  }

  /** Done looking or sitting: choose somewhere else and set off. */
  private leave(s: Shopper) {
    if (s.spot?.seat) this.taken.delete(s.spot.seat);
    const free = this.seats.filter((x) => !this.taken.has(x.seat as string));
    const target = this.random() < 0.35 && free.length ? this.pick(free) : this.pick(this.windows);
    const path = this.finder.find(s, target);
    if (!path?.length) {
      s.wait = 2; // unreachable from here: try somewhere else in a moment
      return;
    }
    if (target.seat) this.taken.add(target.seat);
    s.spot = target;
    s.path = path;
    s.next = 0;
    s.avatar.setState(ANIM.walk, SPEED);
  }

  private walk(s: Shopper, dt: number) {
    const p = s.path[s.next];
    if (!p) return this.arrive(s);
    const dx = p.x - s.x;
    const dz = p.z - s.z;
    const d = Math.hypot(dx, dz);
    const step = SPEED * dt;
    if (d <= step) {
      s.x = p.x;
      s.z = p.z;
      s.y = p.y;
      s.next++;
    } else {
      s.x += (dx / d) * step;
      s.z += (dz / d) * step;
      s.y += (p.y - s.y) * Math.min(1, step / d); // ramps and escalators
      turnToward(s, Math.atan2(-dx, -dz), dt);
    }
  }

  private arrive(s: Shopper) {
    const spot = s.spot;
    if (!spot) return;
    s.x = spot.x;
    s.y = spot.y;
    s.z = spot.z;
    s.yaw = spot.yaw;
    s.path = [];
    if (spot.seat) {
      s.avatar.setState(ANIM.sit, 0);
      s.wait = 10 + this.random() * 15;
    } else {
      s.avatar.setState(ANIM.idle, 0);
      s.wait = 3 + this.random() * 6;
    }
  }
}

function turnToward(s: Shopper, target: number, dt: number) {
  let diff = target - s.yaw;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  s.yaw += diff * Math.min(1, TURN * dt);
}
