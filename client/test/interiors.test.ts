import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseConfig } from '@shopping-mall/shared/config';
import { PLAYER } from '@shopping-mall/shared/constants';
import { Box3, Ray, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import config from '../../mall.config';
import { castRay } from '../src/player/raycast';
import { furnish, layoutFor } from '../src/world/interiors';
import type { PropIndex } from '../src/world/props';
import { collider, greybox } from './greybox';

const { meta } = greybox;
const shops = parseConfig(config).shops;
const index: PropIndex = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../public/assets/props/index.json'), 'utf8'),
);
const known = new Set(Object.values(index.packs).flat());
const { placements, obstacles } = furnish(meta, shops, index.footprints);
const inside = (b: Box3, p: [number, number, number]) => b.containsPoint(new Vector3(...p));

describe('shop interiors', () => {
  it('picks a layout from the category, and none for units to rent', () => {
    const shop = (category?: string) => ({ ...shops[0], category }) as (typeof shops)[number];
    expect(layoutFor(shop('Food & drink'))).toBe('cafe');
    expect(layoutFor(shop('Books'))).toBe('books');
    expect(layoutFor(shop('Sneakers'))).toBe('fashion');
    expect(layoutFor(shop('Home'))).toBe('home');
    expect(layoutFor(shop('Games'))).toBe('games');
    expect(layoutFor(shop('Electronics'))).toBe('store');
    expect(layoutFor(shop(undefined))).toBe('store');
    expect(layoutFor(shop('For rent'))).toBeNull();
  });

  it('furnishes every shop with a layout, with kinds the packs have, and leaves the rest empty', () => {
    expect(placements.length).toBeGreaterThan(20);
    for (const p of placements) expect(known).toContain(p.kind);
    for (const slot of meta.slots) {
      const shop = shops.find((s) => s.slot === slot.id);
      const room = new Box3(new Vector3(...slot.interior.min), new Vector3(...slot.interior.max));
      const here = placements.filter((p) => inside(room, p.pos));
      const furnished = shop && layoutFor(shop);
      expect(here.length > 0, slot.id).toBe(Boolean(furnished));
    }
  });

  it('keeps every solid piece inside its unit, and a clear aisle from the door to the counter', () => {
    for (const slot of meta.slots) {
      const room = new Box3(new Vector3(...slot.interior.min), new Vector3(...slot.interior.max));
      const mine = obstacles.filter((b) => room.intersectsBox(b));
      for (const b of mine) expect(room.containsBox(b), slot.id).toBe(true);
      // walk from the doorway straight in, 6 m, a body's width either side of the centre line
      const door = new Vector3(...slot.door.pos);
      const f = new Vector3(-Math.sin(slot.door.yaw), 0, -Math.cos(slot.door.yaw));
      for (let d = 0; d <= 6; d += 0.25) {
        const at = door
          .clone()
          .addScaledVector(f, d)
          .setY(door.y + 1);
        for (const b of mine)
          expect(b.clone().expandByScalar(PLAYER.radius).containsPoint(at), slot.id).toBe(false);
      }
    }
  });

  it('furnishes a flagship: a bay down each side and a showcase on the stage, the middle kept open', () => {
    const down = new Ray(new Vector3(), new Vector3(0, -1, 0));
    const floorAt = (x: number, z: number, above: number) => {
      down.origin.set(x, above + 2.5, z);
      return castRay(collider, down, 3.5)?.point.y ?? above;
    };
    const games = {
      ...shops[0],
      id: 'big-arcade',
      slot: 'flagship',
      category: 'Games',
    } as (typeof shops)[number];
    const big = furnish(meta, [games], index.footprints, floorAt);
    const slot = meta.slots.find((s) => s.id === 'flagship');
    if (!slot) throw new Error('no flagship');
    const room = new Box3(new Vector3(...slot.interior.min), new Vector3(...slot.interior.max));
    expect(big.placements.length).toBeGreaterThan(20);
    for (const p of big.placements) expect(room.containsPoint(new Vector3(...p.pos)), p.kind).toBe(true);
    for (const b of big.obstacles) expect(room.containsBox(b)).toBe(true);
    // the showcase stands on the stage (0.6 m up), and there's furniture on both sides
    const onStage = big.placements.filter((p) => p.pos[1] > 0.5);
    expect(onStage.length).toBeGreaterThanOrEqual(6);
    expect(onStage.every((p) => p.kind === 'arcade')).toBe(true);
    expect(big.placements.some((p) => p.pos[0] < -8)).toBe(true);
    expect(big.placements.some((p) => p.pos[0] > 8)).toBe(true);
    // walk in through the doors, 6 m, to the foot of the stage steps: nothing in the way
    for (let d = 0; d <= 6; d += 0.25)
      for (const x of [-1.5, 0, 1.5]) {
        const at = new Vector3(x, 1, slot.door.pos[2] - d);
        for (const b of big.obstacles)
          expect(b.clone().expandByScalar(PLAYER.radius).containsPoint(at)).toBe(false);
      }
  });
});
