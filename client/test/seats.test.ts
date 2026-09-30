import { describe, expect, it } from 'vitest';
import { nearestSpot, seatSpots, standSpot } from '../src/player/seats';
import { greybox } from './greybox';

const spots = seatSpots(greybox.meta);

describe('seats', () => {
  it('gives every seat three spots along its length, on the floor at its backrest', () => {
    expect(spots).toHaveLength(greybox.meta.seats.length * 3);
    const bench = spots.filter((s) => Math.abs(s.x - 8.77) < 0.01 && Math.abs(s.z + 26) < 1);
    expect(bench.map((s) => s.z).sort((a, b) => a - b)).toEqual(
      [-26.6, -26, -25.4].map((z) => expect.closeTo(z, 5)),
    );
    expect(bench.every((s) => s.y === 0)).toBe(true);
  });

  it('finds a spot within reach on the same floor only', () => {
    expect(nearestSpot(spots, { x: 7.6, y: 0, z: -26 })).toMatchObject({
      x: expect.closeTo(8.77, 5),
      z: -26,
    });
    expect(nearestSpot(spots, { x: 4, y: 0, z: -26 })).toBeNull(); // too far
    expect(nearestSpot(spots, { x: 9.5, y: 8, z: -26 })).toBeNull(); // upstairs, beyond the sofa's reach
  });

  it('stands you up a step in front of the bench', () => {
    const s = nearestSpot(spots, { x: 7.6, y: 0, z: -26 });
    if (!s) throw new Error('no spot');
    expect(standSpot(s).x).toBeCloseTo(7.67, 5); // the east bench faces west (−x)
  });

  it('seats the sofas upstairs, facing the walkway, and turns the benches there that way too', () => {
    const sofas = greybox.meta.seats.filter((s) => s.kind === 'sofa');
    expect(sofas).toHaveLength(4);
    // east of the atrium (x > 0) the walkway is further east: face +x, i.e. yaw −π/2
    for (const s of greybox.meta.seats.filter((q) => q.pos[1] > 7))
      expect(Math.sign(-Math.sin(s.yaw))).toBe(Math.sign(s.pos[0]));
  });
});
