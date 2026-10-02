// Dresses each shop slot from mall.config.ts: a painted sign and an accent light strip over the door.
// Moving a shop to another slot in the config moves it here; the mall model never changes.
import type { Shop } from '@shopping-mall/shared/config';
import type { MallMeta, Slot } from '@shopping-mall/shared/meta';
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
// gold accent: the subtitle invites people to rent, so it should read from across the hall
const VACANT_COLORS = { bg: '#2a2926', accent: '#e2b857' };

function texture(canvas: HTMLCanvasElement): CanvasTexture {
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export type Storefronts = {
  group: Group;
  /** The shop whose door the player is standing near (or inside), if any. */
  nearby(feet: Vector3): Shop | null;
  /** The vacant unit whose door the player is near (or inside), if any: they can apply to rent it. */
  vacantNearby(feet: Vector3): Slot | null;
  /** Repaint the shared "Coming soon" signs (e.g. after a language change). */
  setVacantText(text: VacantText): Promise<void>;
  /** Which vacant units have an application waiting: their signs say "requested" instead. */
  setRequested(slots: readonly string[]): void;
  /** Free geometries, materials and textures (before replacing it with a rebuilt one). */
  dispose(): void;
};

/** What vacant units' signs say: free to rent, or already applied for. */
export type VacantText = { title: string; available: string; requested: string };

export async function buildStorefronts(
  meta: MallMeta,
  shops: readonly Shop[],
  vacant: VacantText,
): Promise<Storefronts> {
  const group = new Group();
  group.name = 'storefronts';
  const bySlot = new Map(shops.map((s) => [s.slot, s]));
  await loadSignFonts(
    shops.flatMap((s) => [s.name, s.tagline ?? '']).concat(vacant.title, vacant.available, vacant.requested),
  );

  // every vacant unit shares one of two textures: free to rent, or requested
  let vacantAspect = 4;
  const paintVacant = (text: VacantText, which: 'available' | 'requested') =>
    paintSign({
      title: text.title,
      subtitle: text[which],
      ...VACANT_COLORS,
      width: SIGN_PX,
      aspect: vacantAspect,
    });
  let availableTex: CanvasTexture | null = null;
  let requestedTex: CanvasTexture | null = null;
  const placed: { slot: Slot; shop: Shop }[] = [];
  const vacantSlots: { slot: Slot; material: MeshBasicMaterial }[] = [];
  for (const slot of meta.slots) {
    const shop = bySlot.get(slot.id);
    const [w, h] = slot.sign.size;
    let map: Texture;
    let vacantSlot = false;
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
      vacantSlot = true;
      vacantAspect = w / h;
      availableTex ??= texture(paintVacant(vacant, 'available'));
      requestedTex ??= texture(paintVacant(vacant, 'requested'));
      map = availableTex;
    }
    // unlit and not tone-mapped: signs read as glowing panels
    const material = new MeshBasicMaterial({ map, toneMapped: false });
    if (vacantSlot) vacantSlots.push({ slot, material });
    const sign = new Mesh(new PlaneGeometry(w, h), material);
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
        new MeshBasicMaterial({
          color: shop.colors.accent,
          transparent: true,
          opacity: 0.16,
          depthWrite: false,
        }),
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

  /** The unit whose door is nearest (or that the feet are inside), within range. */
  function nearest<T extends { slot: Slot }>(feet: Vector3, units: readonly T[]): T | null {
    let best: T | null = null;
    let bestD = PROMPT_RANGE;
    for (const unit of units) {
      const { slot } = unit;
      const { min, max } = slot.interior;
      const inside =
        feet.x >= min[0] &&
        feet.x <= max[0] &&
        feet.z >= min[2] &&
        feet.z <= max[2] &&
        feet.y >= min[1] - 0.5 &&
        feet.y <= max[1];
      if (inside) return unit;
      if (Math.abs(feet.y - slot.door.pos[1]) > 1.5) continue;
      const d = Math.hypot(feet.x - slot.door.pos[0], feet.z - slot.door.pos[2]);
      if (d < bestD) {
        bestD = d;
        best = unit;
      }
    }
    return best;
  }
  const nearby = (feet: Vector3) => nearest(feet, placed)?.shop ?? null;
  const vacantNearby = (feet: Vector3) => nearest(feet, vacantSlots)?.slot ?? null;

  async function setVacantText(text: VacantText) {
    if (!availableTex || !requestedTex) return;
    await loadSignFonts([text.title, text.available, text.requested]);
    availableTex.image = paintVacant(text, 'available');
    requestedTex.image = paintVacant(text, 'requested');
    availableTex.needsUpdate = true;
    requestedTex.needsUpdate = true;
  }

  function setRequested(slots: readonly string[]) {
    for (const { slot, material } of vacantSlots)
      material.map = slots.includes(slot.id) ? requestedTex : availableTex;
  }

  function dispose() {
    group.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      const mat = mesh.material as MeshBasicMaterial;
      mat.map?.dispose();
      mat.dispose();
    });
    // a vacant sign shows only one of the two at a time
    availableTex?.dispose();
    requestedTex?.dispose();
  }

  return { group, nearby, vacantNearby, setVacantText, setRequested, dispose };
}
