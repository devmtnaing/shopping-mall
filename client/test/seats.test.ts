import { describe, expect, it } from 'vitest';
import { nearestSpot, seatSpots, standSpot } from '../src/player/seats';
import { greybox } from './greybox';

const spots = seatSpots(greybox.meta);

describe('bench seats', () => {
  it('gives every bench three spots along its length, on the floor, back towards the backrest', () => {
    expect(spots).toHaveLength(greybox.meta.seats.length * 3);
    const bench = spots.filter((s) => Math.abs(s.x - 8.7) < 0.01 && Math.abs(s.z + 26) < 1);
    expect(bench.map((s) => s.z).sort((a, b) => a - b)).toEqual(
      [-26.6, -26, -25.4].map((z) => expect.closeTo(z, 5)),
    );
    expect(bench.every((s) => s.y === 0)).toBe(true);
  });

  it('finds a spot within reach on the same floor only', () => {
    expect(nearestSpot(spots, { x: 7.6, y: 0, z: -26 })).toMatchObject({ x: expect.closeTo(8.7, 5), z: -26 });
    expect(nearestSpot(spots, { x: 4, y: 0, z: -26 })).toBeNull(); // too far
    expect(nearestSpot(spots, { x: 7.6, y: 8, z: -26 })).toBeNull(); // upstairs
  });

  it('stands you up a step in front of the bench', () => {
    const s = nearestSpot(spots, { x: 7.6, y: 0, z: -26 });
    if (!s) throw new Error('no spot');
    expect(standSpot(s).x).toBeCloseTo(8, 5); // the east bench faces west (−x)
  });
});
