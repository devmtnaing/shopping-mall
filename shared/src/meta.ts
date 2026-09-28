// mall.meta.json — gameplay data exported alongside the mall model (greybox generator today, Blender later).
// Coordinates: metres, Y up. The mall runs along −Z from the entrance at z = 0.
// Yaw: radians around +Y; yaw 0 faces −Z (into the mall), yaw π/2 faces −X (the west / left side).
import { z } from 'zod';

const vec3 = z.tuple([z.number(), z.number(), z.number()]);
const pose = z.object({ pos: vec3, yaw: z.number() });
const aabb = z.object({ min: vec3, max: vec3 });

export const metaSchema = z.object({
  version: z.literal(1),
  floors: z.array(z.object({ id: z.string(), y: z.number() })).min(1),
  spawns: z.array(pose.extend({ id: z.string() })).min(1),
  slots: z.array(
    z.object({
      id: z.string(),
      floor: z.string(),
      /** Centre of the doorway at floor level; yaw faces into the shop. */
      door: pose,
      /** Sign rectangle on the storefront: centre, [width, height], yaw facing out to the concourse. */
      sign: z.object({ pos: vec3, size: z.tuple([z.number(), z.number()]), yaw: z.number() }),
      interior: aabb,
    }),
  ),
  seats: z.array(pose.extend({ id: z.string(), kind: z.enum(['bench', 'chair']) })),
  /** Named areas for the "You are in …" label. The highest priority containing the player wins. */
  zones: z.array(
    aabb.extend({ id: z.string(), name: z.string(), priority: z.number(), slot: z.string().optional() }),
  ),
  /** Moving walkways: carry the player from `from` to `to` (bottom → top) at `speed` m/s. */
  escalators: z.array(
    z.object({ id: z.string(), from: vec3, to: vec3, width: z.number(), speed: z.number() }),
  ),
});

export type MallMeta = z.infer<typeof metaSchema>;
export type Slot = MallMeta['slots'][number];
export type Zone = MallMeta['zones'][number];
export type Escalator = MallMeta['escalators'][number];
export type Vec3 = z.infer<typeof vec3>;
