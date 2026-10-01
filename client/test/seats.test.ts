import { describe, expect, it } from 'vitest';
import { capacity, nearestSpot, seatSpots, spotTaken, standSpot } from '../src/player/seats';
import { greybox } from './greybox';

const spots = seatSpots(greybox.meta);

describe('seats', () => {
  it('fits as many people on a seat as its length allows: two on a bench or a sofa, one each side of the island', () => {
    expect(capacity(1.9)).toBe(2); // a bench
    expect(capacity(2.2)).toBe(2); // a sofa
    expect(capacity(0.9)).toBe(1); // the island's sides
    const per = (kind: string) =>
      greybox.meta.seats
        .filter((s) => s.kind === kind)
        .map((s) => spots.filter((p) => p.id.startsWith(`${s.id}:`)).length);
    expect(new Set(per('bench').filter((n) => n !== 1))).toEqual(new Set([2]));
    expect(new Set(per('sofa'))).toEqual(new Set([2]));
    // the east bench at z −26: two spots, side by side, a person's width apart, on the floor at its backrest
    const bench = spots.filter((s) => Math.abs(s.x - 8.77) < 0.01 && Math.abs(s.z + 26) < 1);
    expect(bench.map((s) => s.z).sort((a, b) => a - b)).toEqual(
      [-26.475, -25.525].map((z) => expect.closeTo(z, 5)),
    );
    expect(bench.every((s) => s.y === 0)).toBe(true);
  });

  it('skips a spot someone is sitting in: with one end taken, you get the other end', () => {
    const near = { x: 7.6, y: 0, z: -26.4 }; // closest to the −z end
    const first = nearestSpot(spots, near);
    if (!first) throw new Error('no spot');
    expect(first.z).toBeCloseTo(-26.475, 5);
    const sitters = [{ x: first.x, y: first.y, z: first.z }];
    const second = nearestSpot(spots, near, (s) => spotTaken(s, sitters));
    expect(second?.z).toBeCloseTo(-25.525, 5);
    // both taken: nowhere to sit on this bench
    sitters.push({ x: first.x, y: 0, z: -25.525 });
    expect(nearestSpot(spots, near, (s) => spotTaken(s, sitters))).toBeNull();
  });

  it('finds a spot within reach on the same floor only', () => {
    const s = nearestSpot(spots, { x: 7.6, y: 0, z: -26 }); // in front of the middle: either end will do
    expect(s?.x).toBeCloseTo(8.77, 5);
    expect(Math.abs((s?.z ?? 0) + 26)).toBeCloseTo(0.475, 5);
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
