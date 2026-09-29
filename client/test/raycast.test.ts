import { DoubleSide, FrontSide, Ray, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { castRay } from '../src/player/raycast';
import { collider } from './greybox';

// a deterministic spray of rays through the mall
function* rays(n: number) {
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed / 2147483647) * 2 - 1;
  };
  for (let i = 0; i < n; i++) {
    const origin = new Vector3(rnd() * 14, 1 + Math.abs(rnd()) * 10, -30 + rnd() * 30);
    yield new Ray(origin, new Vector3(rnd(), rnd(), rnd()).normalize());
  }
}

describe('castRay', () => {
  it('finds the same nearest hit as three-mesh-bvh raycastFirst', () => {
    for (const side of [DoubleSide, FrontSide]) {
      for (const ray of rays(300)) {
        const ref = collider.raycastFirst(ray, side);
        const got = castRay(collider, ray, Number.POSITIVE_INFINITY, side);
        if (!ref) {
          expect(got).toBeNull();
          continue;
        }
        expect(got?.distance).toBeCloseTo(ref.distance, 4);
        expect(got?.normalY).toBeCloseTo(ref.face?.normal.y ?? 0, 4);
      }
    }
  });

  it('respects the far limit', () => {
    const down = new Ray(new Vector3(0, 3, -5.5), new Vector3(0, -1, 0));
    expect(castRay(collider, down)?.distance).toBeCloseTo(3, 3);
    expect(castRay(collider, down, 2)).toBeNull();
  });
});
