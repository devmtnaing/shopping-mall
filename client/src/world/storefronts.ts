// Dresses each shop slot from plaza.config.ts: a painted sign and an accent light strip over the door.
// Moving a shop to another slot in the config moves it here; the mall model never changes.
import type { Shop } from '@plaza/shared/config';
import type { MallMeta, Slot } from '@plaza/shared/meta';
import {
  BoxGeometry,
  CanvasTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  type Texture,
  type Vector3,
} from 'three';
import { loadSignFonts, paintSign } from '../render/signs';

const SIGN_PX = 1024;
/** How close (m) to a door you need to be for the "Visit" prompt. */
const PROMPT_RANGE = 2.6;
const VACANT = { title: 'Coming soon', subtitle: 'This unit is available', bg: '#2a2926', accent: '#8e8b86' };

function texture(canvas: HTMLCanvasElement): Texture {
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export type Storefronts = {
  group: Group;
  /** The shop whose door the player is standing near (or inside), if any. */
  nearby(feet: Vector3): Shop | null;
};

export async function buildStorefronts(meta: MallMeta, shops: readonly Shop[]): Promise<Storefronts> {
  const group = new Group();
  group.name = 'storefronts';
  const bySlot = new Map(shops.map((s) => [s.slot, s]));
  await loadSignFonts(shops.flatMap((s) => [s.name, s.tagline ?? '']).concat(VACANT.title, VACANT.subtitle));

  let vacantTex: Texture | null = null;
  const placed: { slot: Slot; shop: Shop }[] = [];
  for (const slot of meta.slots) {
    const shop = bySlot.get(slot.id);
    const [w, h] = slot.sign.size;
    let map: Texture;
    if (shop) {
      map = texture(
        paintSign({
          title: shop.name,
          subtitle: shop.tagline,
          bg: shop.colors.bg,
          accent: shop.colors.accent,
          width: SIGN_PX,
          aspect: w / h,
        }),
      );
      placed.push({ slot, shop });
    } else {
      // every vacant unit shares one texture (they all say the same thing)
      vacantTex ??= texture(paintSign({ ...VACANT, width: SIGN_PX / 2, aspect: w / h }));
      map = vacantTex;
    }
    // unlit and not tone-mapped: signs read as glowing panels
    const sign = new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ map, toneMapped: false }));
    sign.position.fromArray(slot.sign.pos);
    // a plane faces +Z; yaw + π turns it to face along the slot's "out" direction
    sign.rotation.y = slot.sign.yaw + Math.PI;
    // nudge off the wall to avoid z-fighting
    sign.translateZ(0.01);
    group.add(sign);

    if (shop) {
      // accent-tinted floor: gives each shop an identity inside, and from the overview camera
      const { min, max } = slot.interior;
      const floor = new Mesh(
        new PlaneGeometry(max[0] - min[0] - 0.6, max[2] - min[2] - 0.6),
        new MeshBasicMaterial({ color: shop.colors.accent, transparent: true, opacity: 0.16, depthWrite: false }),
      );
      floor.rotation.x = -Math.PI / 2;
      floor.position.set((min[0] + max[0]) / 2, min[1] + 0.015, (min[2] + max[2]) / 2);
      group.add(floor);

      const strip = new Mesh(
        new BoxGeometry(w, 0.05, 0.03),
        new MeshBasicMaterial({ color: shop.colors.accent, toneMapped: false }),
      );
      strip.position.copy(sign.position);
      strip.rotation.copy(sign.rotation);
      strip.translateY(-h / 2 - 0.12);
      group.add(strip);
    }
  }
  group.traverse((o) => {
    o.updateMatrix();
    o.matrixAutoUpdate = false;
  });

  function nearby(feet: Vector3): Shop | null {
    let best: Shop | null = null;
    let bestD = PROMPT_RANGE;
    for (const { slot, shop } of placed) {
      const { min, max } = slot.interior;
      const inside =
        feet.x >= min[0] &&
        feet.x <= max[0] &&
        feet.z >= min[2] &&
        feet.z <= max[2] &&
        feet.y >= min[1] - 0.5 &&
        feet.y <= max[1];
      if (inside) return shop;
      if (Math.abs(feet.y - slot.door.pos[1]) > 1.5) continue;
      const d = Math.hypot(feet.x - slot.door.pos[0], feet.z - slot.door.pos[2]);
      if (d < bestD) {
        bestD = d;
        best = shop;
      }
    }
    return best;
  }

  return { group, nearby };
}
