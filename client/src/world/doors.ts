// Doors that open and close: the restroom cubicles' (meta.doors). Each swings on its hinge, and a
// closed one is solid (an obstacle box for the player controller; it isn't in the collision mesh).
// Who closed a door comes from the server: only they can open it again (offline, it's always you).
import type { Door } from '@shopping-mall/shared/meta';
import { Box3, BoxGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, Vector3 } from 'three';

/** How long a door takes to swing (s, roughly: it eases). */
const SWING_TIME = 0.35;
/** Metres: how close the middle of a door must be to work it. */
const REACH = 1.2;
const THICK = 0.035;

const HANDLE = new MeshStandardMaterial({ color: '#c9cdd0', metalness: 0.8, roughness: 0.3 });
const VACANT = new MeshBasicMaterial({ color: '#3fae5a' });
const ENGAGED = new MeshBasicMaterial({ color: '#d6453d' });

export type DoorState = {
  def: Door;
  open: boolean;
  /** Who closed it: you, someone else, or nobody (it's open). */
  by: 'me' | 'other' | null;
  pivot: Group;
  indicator: Mesh;
  /** The middle of the closed panel, at floor level. */
  centre: Vector3;
  /** Solid while closed. */
  box: Box3;
};

export class Doors {
  readonly group = new Group();
  readonly doors = new Map<string, DoorState>();
  /** Called when a door opens or closes (the obstacles change). */
  onChange: () => void = () => {};

  constructor(defs: readonly Door[]) {
    this.group.name = 'doors';
    const materials = new Map<string, MeshStandardMaterial>();
    for (const def of defs) {
      const color = def.color ?? '#b9bcbf';
      let panelMat = materials.get(color);
      if (!panelMat) {
        panelMat = new MeshStandardMaterial({ color, roughness: 0.6 });
        materials.set(color, panelMat);
      }
      const pivot = new Group();
      pivot.position.set(...def.hinge);
      const panel = new Mesh(new BoxGeometry(def.width - 0.01, def.height, THICK), panelMat);
      panel.position.set(def.width / 2, def.lift + def.height / 2, 0);
      // a handle and a vacant/engaged indicator by the free edge, through the door (both faces)
      const handle = new Mesh(new BoxGeometry(0.12, 0.03, THICK + 0.07), HANDLE);
      handle.position.set(def.width - 0.1, def.lift + def.height * 0.48, 0);
      const indicator = new Mesh(new BoxGeometry(0.07, 0.035, THICK + 0.01), VACANT);
      indicator.position.set(def.width - 0.1, def.lift + def.height * 0.48 + 0.07, 0);
      pivot.add(panel, handle, indicator);
      pivot.rotation.y = def.yaw + def.swing;
      this.group.add(pivot);
      const [hx, hy, hz] = def.hinge;
      const [dx, dz] = [Math.cos(def.yaw), -Math.sin(def.yaw)]; // along the closed panel
      const end = new Vector3(hx + dx * def.width, hy, hz + dz * def.width);
      const box = new Box3().setFromPoints([new Vector3(hx, hy, hz), end]);
      box.max.y = hy + def.lift + def.height;
      box.expandByVector(new Vector3(THICK, 0, THICK));
      this.doors.set(def.id, {
        def,
        open: true,
        by: null,
        pivot,
        indicator,
        centre: new Vector3(hx + (dx * def.width) / 2, hy, hz + (dz * def.width) / 2),
        box,
      });
    }
  }

  /** The door within reach of `p` (feet), nearest first. */
  nearest(p: Vector3): DoorState | null {
    let best: DoorState | null = null;
    let d = REACH;
    for (const s of this.doors.values()) {
      if (Math.abs(p.y - s.centre.y) > 1) continue;
      const dist = Math.hypot(p.x - s.centre.x, p.z - s.centre.z);
      if (dist < d) {
        d = dist;
        best = s;
      }
    }
    return best;
  }

  set(id: string, open: boolean, by: 'me' | 'other' | null) {
    const s = this.doors.get(id);
    if (!s) return;
    const changed = s.open !== open;
    s.open = open;
    s.by = open ? null : by;
    s.indicator.material = open ? VACANT : ENGAGED;
    if (changed) this.onChange();
  }

  /** Everything open (before a fresh list of the closed ones arrives). */
  openAll() {
    for (const id of this.doors.keys()) this.set(id, true, null);
  }

  /** The closed doors' boxes, for the player controller. */
  obstacles(): Box3[] {
    const out: Box3[] = [];
    for (const s of this.doors.values()) if (!s.open) out.push(s.box);
    return out;
  }

  /** Swing each door towards open or closed. */
  update(dt: number) {
    const k = 1 - Math.exp((-4 * dt) / SWING_TIME);
    for (const s of this.doors.values()) {
      const target = s.def.yaw + (s.open ? s.def.swing : 0);
      const r = s.pivot.rotation;
      if (Math.abs(target - r.y) < 1e-3) r.y = target;
      else r.y += (target - r.y) * k;
    }
  }
}
