import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseConfig } from '@shopping-mall/shared/config';
import { PLAYER } from '@shopping-mall/shared/constants';
import { Box3, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import config from '../../mall.config';
import { furnish, layoutFor } from '../src/world/interiors';
import type { PropIndex } from '../src/world/props';
import { greybox } from './greybox';

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
      const furnished = shop && layoutFor(shop) && slot.id !== 'flagship';
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
});
