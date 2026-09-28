// ?debug gizmos for mall meta: spawns, doors, signs, seats, zones and escalator paths.
import type { MallMeta, Vec3 } from '@plaza/shared/meta';
import {
  ArrowHelper,
  Box3,
  Box3Helper,
  BufferGeometry,
  Color,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Vector3,
} from 'three';

const v = (p: Vec3) => new Vector3(p[0], p[1], p[2]);
/** Forward direction for a yaw (yaw 0 faces −Z). */
const fwd = (yaw: number) => new Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));

export function createGizmos(meta: MallMeta) {
  const g = new Group();
  g.name = 'gizmos';
  for (const s of meta.spawns)
    g.add(new ArrowHelper(fwd(s.yaw), v(s.pos).setY(s.pos[1] + 0.1), 1.5, 0x33ff88));
  const signMat = new MeshBasicMaterial({
    color: 0xff44aa,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  });
  for (const slot of meta.slots) {
    g.add(new ArrowHelper(fwd(slot.door.yaw), v(slot.door.pos).setY(slot.door.pos[1] + 0.05), 1.2, 0xffcc33));
    const sign = new Mesh(new PlaneGeometry(slot.sign.size[0], slot.sign.size[1]), signMat);
    sign.position.copy(v(slot.sign.pos));
    // a PlaneGeometry faces +Z; rotating by yaw + π makes it face along fwd(yaw)
    sign.rotation.y = slot.sign.yaw + Math.PI;
    g.add(sign);
  }
  for (const seat of meta.seats) g.add(new ArrowHelper(fwd(seat.yaw), v(seat.pos), 0.6, 0x44aaff));
  for (const zone of meta.zones) {
    const color = new Color().setHSL((zone.priority * 0.13 + 0.55) % 1, 0.8, 0.6);
    g.add(new Box3Helper(new Box3(v(zone.min), v(zone.max)), color));
  }
  const pathMat = new LineBasicMaterial({ color: 0xff8833 });
  for (const e of meta.escalators)
    g.add(new Line(new BufferGeometry().setFromPoints([v(e.from), v(e.to)]), pathMat));
  return g;
}
