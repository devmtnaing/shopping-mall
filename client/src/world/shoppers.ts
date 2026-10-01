// Ambient life (T-213): a few shoppers who wander the mall on their own, in every visitor's view
// (they're local, not multiplayer). They walk the navgrid from shop window to shop window, stop to
// look, and sit on free benches for a while. They stand and ride the escalators, like people do.
// Kinematic (no physics). Nearby ones animate every frame and far ones every third (so they never
// slide along without moving their legs); how many are shown, and where "far" starts, follow the
// quality tier.
import { AVATARS } from '@shopping-mall/shared/avatars';
import type { MallMeta } from '@shopping-mall/shared/meta';
import { ANIM } from '@shopping-mall/shared/protocol';
import { Group, type Vector3 } from 'three';
import type { Avatar, AvatarKit } from '../avatars/kit';
import type { PathFinder, Waypoint } from '../player/path';
import { type Seat, seatSpots } from '../player/seats';
import { TIERS, tier } from '../quality';

const SPEED = 1.3; // m/s: an unhurried stroll
const TURN = 6; // how quickly they turn to face where they're going (1/s)
/** Riding an escalator: its speed along the floor (1.2 m/s up a 30° slope). */
const RIDE = 1.2 * Math.cos(Math.PI / 6);
/** Far away, animate every this many frames. */
const FAR_EVERY = 3;

type Spot = { x: number; y: number; z: number; yaw: number; seat?: string; sits?: Seat };
type At = { x: number; y: number; z: number };
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
  /** On an escalator leg: standing still and carried, not walking. */
  riding: boolean;
  /** Animation time not yet applied (far ones catch up every FAR_EVERY frames). */
  lag: number;
};

export class Shoppers {
  readonly group = new Group();
  private readonly list: Shopper[] = [];
  private readonly windows: Spot[];
  private readonly seats: Spot[];
  /** Seat spots a shopper has, sitting or on the way. */
  private readonly taken = new Set<string>();
  /** Where real people (you, other players) are sitting: shoppers keep out of those spots. */
  people: () => readonly At[] = () => [];

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
    // the same spots people sit in (as many per seat as fit side by side)
    this.seats = seatSpots(meta).map((s) => ({
      x: s.x,
      y: s.y,
      z: s.z,
      yaw: s.yaw,
      seat: s.id,
      sits: s.seat,
    }));
    for (let i = 0; i < count && this.windows.length; i++) {
      const start = this.pick(this.windows);
      const avatar = kit.create(AVATARS[Math.floor(this.random() * AVATARS.length)]);
      this.group.add(avatar.object);
      const s: Shopper = {
        avatar,
        path: [],
        next: 0,
        wait: this.random() * 4,
        spot: start,
        ...start,
        riding: false,
        lag: 0,
      };
      this.list.push(s);
    }
  }

  private frame = 0;

  update(dt: number, camera: Vector3) {
    const { shoppers: visible, animateWithin } = TIERS[tier.value];
    this.frame++;
    for (let i = 0; i < this.list.length; i++) {
      const s = this.list[i] as Shopper;
      s.avatar.object.visible = i < visible; // lower tiers show fewer (they keep strolling unseen)
      if (s.wait > 0) {
        s.wait -= dt;
        // a person sat down where this shopper is sitting (another player's shoppers aren't ours to
        // see, so it can happen): get up and go
        if (s.spot?.seat && (this.frame + i) % 30 === 0 && this.overlaps(s.spot)) s.wait = 0;
        if (s.wait <= 0) this.leave(s);
      } else this.walk(s, dt);
      const o = s.avatar.object;
      o.position.set(s.x, s.y, s.z);
      o.rotation.y = s.yaw;
      if (!o.visible) continue;
      s.lag += dt;
      const near = o.position.distanceToSquared(camera) < animateWithin ** 2;
      if (near || (this.frame + i) % FAR_EVERY === 0) {
        s.avatar.update(s.lag);
        s.lag = 0;
      }
    }
  }

  /** A real person is sitting in this spot. */
  private overlaps(spot: Spot) {
    return this.people().some(
      (p) => Math.abs(p.y - spot.y) < 0.7 && Math.hypot(p.x - spot.x, p.z - spot.z) < 0.45,
    );
  }

  private pick(from: Spot[]): Spot {
    return from[Math.floor(this.random() * from.length)] as Spot;
  }

  /** Done looking or sitting: choose somewhere else and set off. */
  /** Where shoppers are sitting, or about to: people sitting down skip these spots. */
  sitters(): At[] {
    return this.seats.filter((x) => this.taken.has(x.seat as string));
  }

  private leave(s: Shopper) {
    if (s.spot?.seat) this.taken.delete(s.spot.seat);
    const free = this.seats.filter((x) => !this.taken.has(x.seat as string) && !this.overlaps(x));
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
    // a leg between floors is an escalator: stand and be carried
    const riding = Math.abs(p.y - s.y) > 1;
    if (riding !== s.riding) {
      s.riding = riding;
      s.avatar.setState(riding ? ANIM.idle : ANIM.walk, SPEED);
    }
    const dx = p.x - s.x;
    const dz = p.z - s.z;
    const d = Math.hypot(dx, dz);
    const step = (riding ? RIDE : SPEED) * dt;
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
    s.riding = false;
    if (spot.seat) {
      if (spot.sits) s.avatar.sitOn(spot.sits);
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
