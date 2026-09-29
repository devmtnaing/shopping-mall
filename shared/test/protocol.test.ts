import { describe, expect, it } from 'vitest';
import { parseClientMessage } from '../src/messages';
import {
  ANIM,
  decodeInput,
  decodeSnapshot,
  encodeInput,
  encodeSnapshot,
  INPUT_BYTES,
  PLAYER_BYTES,
  type Pose,
  packAnim,
  snapshotBytes,
  unpackAnim,
} from '../src/protocol';

// deterministic pseudo-random numbers so failures are reproducible
let seed = 42;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 2 ** 32;
  return seed / 2 ** 32;
};
const randomPose = (): Pose => ({
  x: (rand() - 0.5) * 600,
  y: (rand() - 0.5) * 60,
  z: (rand() - 0.5) * 600,
  yaw: (rand() - 0.5) * 20,
  anim: Math.floor(rand() * 256),
  flags: Math.floor(rand() * 256),
});
const angleDiff = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

function expectClose(a: Pose, b: Pose) {
  expect(Math.abs(a.x - b.x)).toBeLessThanOrEqual(0.005);
  expect(Math.abs(a.y - b.y)).toBeLessThanOrEqual(0.005);
  expect(Math.abs(a.z - b.z)).toBeLessThanOrEqual(0.005);
  expect(angleDiff(a.yaw, b.yaw)).toBeLessThanOrEqual(Math.PI / 256 + 1e-9);
  expect(b.anim).toBe(a.anim);
  expect(b.flags).toBe(a.flags);
}

describe('binary protocol', () => {
  it('INPUT is 12 bytes and round-trips within 1 cm and 1/256 turn (1000 random poses)', () => {
    const buf = new ArrayBuffer(INPUT_BYTES);
    const out = {} as Pose;
    for (let i = 0; i < 1000; i++) {
      const p = randomPose();
      encodeInput(i, p, buf);
      const r = decodeInput(buf, out);
      expect(r?.seq).toBe(i & 255);
      expectClose(p, out);
    }
  });

  it('SNAPSHOT is 4 + 11 bytes per player and round-trips', () => {
    expect(PLAYER_BYTES).toBe(11);
    const players = Array.from({ length: 40 }, (_, i) => ({ id: i * 97 + 1, pose: randomPose() }));
    const buf = new ArrayBuffer(snapshotBytes(players.length));
    const len = encodeSnapshot(70000, players, buf);
    expect(len).toBe(4 + 40 * 11);
    const got: { id: number; pose: Pose }[] = [];
    const tick = decodeSnapshot(buf, {} as Pose, (id, pose) => got.push({ id, pose: { ...pose } }));
    expect(tick).toBe(70000 & 0xffff);
    expect(got.map((g) => g.id)).toEqual(players.map((p) => p.id));
    got.forEach((g, i) => {
      expectClose(players[i]?.pose as Pose, g.pose);
    });
  });

  it('clamps positions outside ±327 m instead of wrapping', () => {
    const buf = encodeInput(0, { x: 1000, y: -1000, z: 0, yaw: 0, anim: 0, flags: 0 });
    const out = {} as Pose;
    decodeInput(buf, out);
    expect(out.x).toBeCloseTo(327.67);
    expect(out.y).toBeCloseTo(-327.68);
  });

  it('rejects malformed frames', () => {
    expect(decodeInput(new ArrayBuffer(5), {} as Pose)).toBeNull();
    expect(decodeSnapshot(new Uint8Array([2, 0, 0, 3]), {} as Pose, () => {})).toBeNull(); // says 3 players, has 0
  });

  it('packs animation state and speed into one byte', () => {
    expect(unpackAnim(packAnim(ANIM.run, 6.4))).toEqual({ state: ANIM.run, speed: 6.5 });
  });
});

describe('parseClientMessage', () => {
  it('accepts valid messages', () => {
    expect(parseClientMessage('{"t":"join","name":"Mya","look":{"color":"#e2b857"}}')).toMatchObject({
      t: 'join',
    });
    expect(parseClientMessage('{"t":"emote","e":"👋"}')).toEqual({ t: 'emote', e: '👋' });
  });

  it('rejects junk, unknown types, bad colours and unknown emotes', () => {
    expect(parseClientMessage('not json')).toBeNull();
    expect(parseClientMessage('{"t":"hack"}')).toBeNull();
    expect(parseClientMessage('{"t":"join","name":"a","look":{"color":"red"}}')).toBeNull();
    expect(parseClientMessage('{"t":"emote","e":"💣"}')).toBeNull();
  });

  it('carries a known avatar, and refuses made-up ones', () => {
    const join = (avatar: string) =>
      parseClientMessage(JSON.stringify({ t: 'join', name: 'Mya', look: { color: '#e2b857', avatar } }));
    expect(join('male-c')).toMatchObject({ look: { avatar: 'male-c' } });
    expect(join('../../etc')).toBeNull();
  });
});
