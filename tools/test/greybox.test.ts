import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { metaSchema } from '@plaza/shared/meta';
import { describe, expect, it } from 'vitest';
import { buildGreybox } from '../greybox/layout.ts';

const { geo, meta } = buildGreybox();

describe('greybox', () => {
  it('produces meta that matches the schema', () => {
    expect(() => metaSchema.parse(meta)).not.toThrow();
  });

  it('committed mall.meta.json is up to date (run `pnpm greybox`)', () => {
    const file = resolve(import.meta.dirname, '../../client/public/assets/mall/mall.meta.json');
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(JSON.parse(JSON.stringify(meta)));
  });

  it('has 24 shop slots plus the flagship, with unique ids', () => {
    const ids = meta.slots.map((s) => s.id);
    expect(ids).toHaveLength(25);
    expect(new Set(ids).size).toBe(25);
    expect(ids).toContain('flagship');
  });

  it('puts every door in its doorway: one step forward is inside, one step back is outside', () => {
    for (const slot of meta.slots) {
      const { min, max } = slot.interior;
      const [x, y, z] = slot.door.pos;
      const inside = (step: number) => {
        const px = x - Math.sin(slot.door.yaw) * step;
        const pz = z - Math.cos(slot.door.yaw) * step;
        return px >= min[0] && px <= max[0] && pz >= min[2] && pz <= max[2];
      };
      expect(y, slot.id).toBe(min[1]);
      expect(inside(1), slot.id).toBe(true);
      expect(inside(-1), slot.id).toBe(false);
    }
  });

  it('builds a closed collision mesh of triangles', () => {
    expect(geo.collision.length % 9).toBe(0);
    expect(geo.collision.length / 9).toBeLessThan(5000); // budget: ≤ 5k collision tris
  });
});
