// Directory travel: go to a shop's door. Walk when the route is short, otherwise fade out, move,
// fade in (instant with reduced motion). The shop's panel opens once you're there.
import type { Shop } from '@plaza/shared/config';
import type { MallMeta } from '@plaza/shared/meta';
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

  constructor(
    private readonly shops: readonly Shop[],
    private readonly meta: MallMeta,
    private readonly player: PlayerController,
    private readonly orbit: OrbitCamera,
    private readonly finder: PathFinder,
    private readonly follower: PathFollower,
  ) {}

  toShop(id: string) {
    const shop = this.shops.find((s) => s.id === id);
    const slot = shop && this.meta.slots.find((s) => s.id === shop.slot);
    if (!slot) return;
    // door yaw faces into the shop, so step back along it to stand outside
    const [dx, dy, dz] = slot.door.pos;
    const out = {
      x: dx + Math.sin(slot.door.yaw) * STAND_OFF,
      y: dy,
      z: dz + Math.cos(slot.door.yaw) * STAND_OFF,
    };
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
      this.follower.stop();
      this.player.place(out.x, out.y, out.z, slot.door.yaw);
      this.orbit.yaw = slot.door.yaw;
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
