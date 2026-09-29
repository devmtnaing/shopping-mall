import { describe, expect, it } from 'vitest';
import { nearestSpot, seatSpots, standSpot } from '../src/player/seats';
import { greybox } from './greybox';

const spots = seatSpots(greybox.meta);

describe('bench seats', () => {
  it('gives every bench three spots along its length, feet on the floor', () => {
    expect(spots).toHaveLength(greybox.meta.seats.length * 3);
    const bench = spots.filter((s) => Math.abs(s.x - 4.6) < 0.01 && Math.abs(s.z + 20) < 1);
    expect(bench.map((s) => s.z).sort((a, b) => a - b)).toEqual(
      [-20.6, -20, -19.4].map((z) => expect.closeTo(z, 5)),
    );
    expect(bench.every((s) => s.y === 0)).toBe(true);
  });

  it('finds a spot within reach on the same floor only', () => {
    expect(nearestSpot(spots, { x: 3.6, y: 0, z: -20 })).toMatchObject({ x: expect.closeTo(4.6, 5), z: -20 });
    expect(nearestSpot(spots, { x: 0, y: 0, z: -20 })).toBeNull(); // too far
    expect(nearestSpot(spots, { x: 3.6, y: 7.6, z: -20 })).toBeNull(); // upstairs
  });

  it('stands you up a step in front of the bench', () => {
    const s = nearestSpot(spots, { x: 3.6, y: 0, z: -20 });
    if (!s) throw new Error('no spot');
    expect(standSpot(s).x).toBeCloseTo(3.9, 5); // the east bench faces west (−x)
  });
});
