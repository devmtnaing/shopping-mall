// Which animation a player is in, from how they're moving. The same state drives your own avatar
// and goes over the wire (packAnim) so everyone else animates you the same way.
import { ANIM } from '@shopping-mall/shared/protocol';
import type { PlayerController } from './controller';

export function animState(p: PlayerController, seated = false): number {
  if (seated) return ANIM.sit;
  if (!p.grounded) return p.vel.y > 0 ? ANIM.jump : ANIM.fall;
  if (p.speed > 4.5) return ANIM.run;
  return p.speed > 0.3 ? ANIM.walk : ANIM.idle;
}
