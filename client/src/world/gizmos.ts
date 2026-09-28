// ?debug gizmos for mall meta: spawns, doors, signs, seats, zones and escalator paths.
import type { MallMeta, Vec3 } from '@plaza/shared/meta';
import type { NavGrid } from '@plaza/shared/navgrid';
import {
  ArrowHelper,
  Box3,
  Box3Helper,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Vector3,
} from 'three';

const v = (p: Vec3) => new Vector3(p[0], p[1], p[2]);
/** Forward direction for a yaw (yaw 0 faces −Z). */
const fwd = (yaw: number) => new Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));

export function createGizmos(meta: MallMeta, nav?: NavGrid) {
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
  if (nav) g.add(navPoints(nav));
  return g;
}

/** One dot per walkable navgrid cell (green ground floor, blue upper), plus escalator links. */
function navPoints(nav: NavGrid) {
  const group = new Group();
  const colors = [0x55dd77, 0x55aaff, 0xffaa55];
  nav.cells.forEach((cells, f) => {
    const pos: number[] = [];
    for (let i = 0; i < cells.length; i++) {
      if (!cells[i]) continue;
      const [x, z] = nav.center(i);
      pos.push(x, nav.height(f, i) + 0.03, z);
    }
    const geo = new BufferGeometry().setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    group.add(
      new Points(
        geo,
        new PointsMaterial({ color: colors[f % colors.length], size: 3, sizeAttenuation: false }),
      ),
    );
  });
  const linkMat = new LineBasicMaterial({ color: 0xffffff });
  for (const l of nav.links) {
    const [ax, az] = nav.center(l.cellA);
    const [bx, bz] = nav.center(l.cellB);
    const a = new Vector3(ax, nav.height(l.floorA, l.cellA) + 0.1, az);
    const b = new Vector3(bx, nav.height(l.floorB, l.cellB) + 0.1, bz);
    group.add(new Line(new BufferGeometry().setFromPoints([a, b]), linkMat));
  }
  return group;
}
