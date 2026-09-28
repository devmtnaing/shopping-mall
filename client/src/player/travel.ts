// Directory travel: go to a shop's door. Walk when the route is short, otherwise fade out, move,
// fade in (instant with reduced motion). The shop's panel opens once you're there.
import type { Shop } from '@shopping-mall/shared/config';
import type { MallMeta } from '@shopping-mall/shared/meta';
import { faded } from '../state';
import type { OrbitCamera } from './camera';
import type { PlayerController } from './controller';
import type { PathFollower } from './follow';
import type { PathFinder } from './path';

/** Routes longer than this (m) teleport instead of walking. */
const WALK_LIMIT = 40;
/** How far outside the doorway to stand (m). */
const STAND_OFF = 1.2;
const FADE_MS = 230;

export class Travel {
  private pending: string | null = null;
  private readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  /** Called just before the player jumps somewhere far (the server needs to be told). */
  onTeleport: () => void = () => {};

  constructor(
    private readonly shops: () => readonly Shop[],
    private readonly meta: MallMeta,
    private readonly player: PlayerController,
    private readonly orbit: OrbitCamera,
    private readonly finder: PathFinder,
    private readonly follower: PathFollower,
  ) {}

  /** Where to stand for a shop: just outside its doorway, facing in. */
  private standFor(id: string) {
    const shop = this.shops().find((s) => s.id === id);
    const slot = shop && this.meta.slots.find((s) => s.id === shop.slot);
    if (!slot) return null;
    // door yaw faces into the shop, so step back along it to stand outside
    const [dx, dy, dz] = slot.door.pos;
    const yaw = slot.door.yaw;
    return { x: dx + Math.sin(yaw) * STAND_OFF, y: dy, z: dz + Math.cos(yaw) * STAND_OFF, yaw };
  }

  /** Put the player at a shop straight away (shared links). Returns false for an unknown shop. */
  placeAt(id: string): boolean {
    const at = this.standFor(id);
    if (!at) return false;
    this.player.place(at.x, at.y, at.z, at.yaw);
    this.orbit.yaw = at.yaw;
    this.pending = id;
    return true;
  }

  toShop(id: string) {
    const out = this.standFor(id);
    if (!out) return;
    this.pending = id;

    const path = this.finder.find(this.player.pos, out);
    if (path) {
      let length = 0;
      let prev: { x: number; y: number; z: number } = this.player.pos;
      for (const p of path) {
        length += Math.hypot(p.x - prev.x, p.y - prev.y, p.z - prev.z);
        prev = p;
      }
      if (length <= WALK_LIMIT) {
        this.follower.start(path, this.player.pos);
        return;
      }
    }

    const jump = () => {
      this.onTeleport();
      this.follower.stop();
      this.player.place(out.x, out.y, out.z, out.yaw);
      this.orbit.yaw = out.yaw;
    };
    if (this.reducedMotion.matches) return jump();
    faded.value = true;
    setTimeout(() => {
      jump();
      setTimeout(() => (faded.value = false), 60);
    }, FADE_MS);
  }

  /** Call every step with the shop the player is near. Returns the shop id once, on arrival. */
  arrived(nearbyShop: string | null): string | null {
    if (!this.pending || this.follower.active || faded.value || nearbyShop !== this.pending) return null;
    const id = this.pending;
    this.pending = null;
    return id;
  }

  cancel() {
    this.pending = null;
  }
}
