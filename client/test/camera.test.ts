import { CAMERA } from '@shopping-mall/shared/constants';
import { DoubleSide, Ray, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { OrbitCamera } from '../src/player/camera';
import { collider } from './greybox';

const still = { yaw: 0, pitch: 0 };
/** Walkable spots all over the greybox, many of them tight against walls and under the bridge. */
const SPOTS: [number, number, number][] = [
  [0, 0, -5.5],
  [5.6, 0, -2],
  [-5.6, 0, -30],
  [5.6, 0, -50],
  [0, 0, -28.5],
  [-2, 0, -26],
  [0, 0, -45.5],
  [-10, 0, -8],
  [-15.6, 0, -11.6],
  [12, 0, -40],
  [15.6, 0, -4.4],
  [0, 0.6, -63.5],
  [-15.6, 0, -54.5],
  [4.5, 7.6, -12],
  [-4.5, 7.6, -50],
  [0, 7.6, -28.5],
  [-5.6, 7.6, -2],
  [10, 7.6, -20],
  [0, 7.6, -63.5],
  [15.6, 7.6, -63.5],
];

function sightBlocked(from: Vector3, to: Vector3) {
  const d = to.distanceTo(from);
  const ray = new Ray(from.clone(), to.clone().sub(from).normalize());
  const hit = collider.raycastFirst(ray, DoubleSide);
  return !!hit && hit.distance < d - 1e-3;
}

describe('OrbitCamera', () => {
  it('never ends up inside or behind a wall, from 20 spots × 24 directions × 3 pitches', () => {
    const failures: string[] = [];
    for (const [x, y, z] of SPOTS) {
      const feet = new Vector3(x, y, z);
      const head = feet.clone().setY(y + CAMERA.pivotHeight);
      for (let i = 0; i < 24; i++) {
        for (const pitch of [-1.0, -0.3, 0.4]) {
          const cam = new OrbitCamera(collider, (i / 24) * Math.PI * 2);
          cam.pitch = pitch;
          cam.zoom = CAMERA.maxDistance;
          cam.update(1 / 60, feet, 0, false, still, 0);
          const gap = collider.closestPointToPoint(cam.position)?.distance ?? Number.POSITIVE_INFINITY;
          if (gap < 0.1 || sightBlocked(head, cam.target) || sightBlocked(cam.target, cam.position))
            failures.push(`spot ${x},${y},${z} yaw#${i} pitch ${pitch}: gap ${gap.toFixed(3)}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('eases back out to the requested zoom once the wall is gone', () => {
    const cam = new OrbitCamera(collider, 0);
    cam.zoom = 6;
    const feet = new Vector3(0, 0, -20);
    for (let i = 0; i < 180; i++) cam.update(1 / 60, feet, 0, false, still, 0);
    expect(cam.position.distanceTo(cam.target)).toBeCloseTo(6, 1);
  });

  it('clamps zoom and pitch', () => {
    const cam = new OrbitCamera(collider, 0);
    const feet = new Vector3(0, 0, -20);
    cam.update(1 / 60, feet, 0, false, { yaw: 0, pitch: 10 }, 50);
    expect(cam.pitch).toBe(CAMERA.maxPitch);
    expect(cam.zoom).toBe(CAMERA.maxDistance);
    cam.update(1 / 60, feet, 0, false, { yaw: 0, pitch: -10 }, -50);
    expect(cam.pitch).toBe(CAMERA.minPitch);
    expect(cam.zoom).toBe(CAMERA.minDistance);
  });

  it('swings back behind a walking player after they stop looking around', () => {
    const cam = new OrbitCamera(collider, 1.2);
    const feet = new Vector3(0, 0, -20);
    for (let i = 0; i < 60 * 5; i++) cam.update(1 / 60, feet, 0, true, still, 0);
    expect(Math.abs(cam.yaw)).toBeLessThan(0.05);
  });

  it('does not recenter while the player is standing still', () => {
    const cam = new OrbitCamera(collider, 1.2);
    const feet = new Vector3(0, 0, -20);
    for (let i = 0; i < 60 * 5; i++) cam.update(1 / 60, feet, 0, false, still, 0);
    expect(cam.yaw).toBe(1.2);
  });
});
