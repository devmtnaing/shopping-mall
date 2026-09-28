// Tap / click to walk: turn a screen point into a destination, find a path, show a marker.
import type { MallMeta } from '@plaza/shared/meta';
import {
  Box3,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  type PerspectiveCamera,
  Raycaster,
  RingGeometry,
  Vector2,
  Vector3,
} from 'three';
import type { MeshBVH } from 'three-mesh-bvh';
import type { PlayerController } from './controller';
import type { PathFollower } from './follow';
import type { PathFinder, Waypoint } from './path';

/** Surfaces flatter than this count as floor you want to walk onto. */
const FLOOR_NORMAL_Y = 0.7;

const raycaster = new Raycaster();
const ndc = new Vector2();
const box = new Box3();
const p = new Vector3();

export class WalkTo {
  readonly marker: Mesh;
  private pulse = 0;

  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly collider: MeshBVH,
    private readonly meta: MallMeta,
    private readonly finder: PathFinder,
    private readonly follower: PathFollower,
  ) {
    const mat = new MeshBasicMaterial({
      color: '#e2b857',
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
    });
    this.marker = new Mesh(new RingGeometry(0.22, 0.32, 32), mat);
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.visible = false;
    this.marker.renderOrder = 1;
  }

  /** Handle a tap at client pixel (x, y). Returns false when there's nowhere to walk. */
  tap(x: number, y: number, player: PlayerController, canvas: HTMLCanvasElement): boolean {
    const rect = canvas.getBoundingClientRect();
    ndc.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, this.camera);
    const hit = this.collider.raycastFirst(raycaster.ray, DoubleSide);
    if (!hit?.face) return false;

    const goal = this.goalFor(hit.point, hit.face.normal.y);
    const path = this.finder.find(player.pos, goal);
    if (!path) return false;
    this.start(path, player);
    return true;
  }

  /** Walk to a known world point (minimap clicks). Returns false when it can't be reached. */
  walkToPoint(goal: Waypoint, player: PlayerController): boolean {
    const path = this.finder.find(player.pos, goal);
    if (!path) return false;
    this.start(path, player);
    return true;
  }

  private start(path: Waypoint[], player: PlayerController) {
    this.follower.start(path, player.pos);
    const end = path[path.length - 1] as Waypoint;
    this.marker.position.set(end.x, end.y + 0.03, end.z);
    this.marker.visible = true;
    this.pulse = 0;
  }

  /** Floor → that spot. A shop's front (sign, wall, window) → its door. Other walls → the floor beside them. */
  private goalFor(point: Vector3, normalY: number): Waypoint {
    if (normalY >= FLOOR_NORMAL_Y) return point;
    for (const slot of this.meta.slots) {
      box.min.fromArray(slot.interior.min);
      box.max.fromArray(slot.interior.max);
      if (box.containsPoint(point)) break; // a wall inside a shop: just walk near it
      box.expandByScalar(0.6);
      if (box.containsPoint(point)) return { x: slot.door.pos[0], y: slot.door.pos[1], z: slot.door.pos[2] };
    }
    // a wall: aim at the floor below the hit, nudged toward the camera so it lands on the walkable side
    p.copy(point).sub(this.camera.position).setY(0).normalize();
    return { x: point.x - p.x * 0.5, y: this.floorBelow(point.y), z: point.z - p.z * 0.5 };
  }

  private floorBelow(y: number) {
    let best = this.meta.floors[0]?.y ?? 0;
    for (const f of this.meta.floors) if (f.y <= y + 0.1) best = Math.max(best, f.y);
    return best;
  }

  /** Animate the marker; hide it when the walk ends. */
  update(dt: number) {
    if (!this.follower.active) {
      this.marker.visible = false;
      return;
    }
    this.pulse += dt;
    const s = 1 + 0.12 * Math.sin(this.pulse * 6);
    this.marker.scale.set(s, s, s);
  }
}
