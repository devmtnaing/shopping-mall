// The schema for mall.config.ts — the one file operators edit.
// Validated at build time (client/vite.config.ts) so mistakes fail loudly with a readable path.
import { z } from 'zod';
import { MEASURES, SIZE_LIMITS } from './fit.ts';

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must be a hex colour like #e2b857');
const id = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'lowercase letters, digits and dashes only');
/** Absolute https URL or a root-relative path. */
const url = z
  .string()
  .refine((s) => s.startsWith('/') || /^https?:\/\//.test(s), 'must be https://… or /path');

const link = z.object({ label: z.string().min(1), url });

const cm = z
  .number()
  .min(SIZE_LIMITS.min, `at least ${SIZE_LIMITS.min} cm`)
  .max(SIZE_LIMITS.max, `at most ${SIZE_LIMITS.max} cm`);
/** A clothing size chart: the garment's own measurements in each size (shared/src/fit.ts). */
export const sizesSchema = z
  .array(
    z.object({
      size: z.string().trim().min(1, 'name the size').max(SIZE_LIMITS.label),
      cm: z.partialRecord(z.enum(MEASURES), cm),
    }),
  )
  .max(SIZE_LIMITS.sizes, `at most ${SIZE_LIMITS.sizes} sizes`)
  .refine((rows) => new Set(rows.map((r) => r.size.toLowerCase())).size === rows.length, 'each size once');

const products = z.discriminatedUnion('adapter', [
  z.object({
    adapter: z.literal('static'),
    items: z.array(
      z.object({
        id: z.string(),
        name: z.string().min(1),
        price: z.number().nonnegative(),
        compareAt: z.number().nonnegative().optional(),
        image: url.optional(),
        url: url.optional(),
        sizes: sizesSchema.optional(),
      }),
    ),
  }),
  z.object({ adapter: z.literal('json-url'), url }),
]);

export const shopSchema = z.object({
  id,
  /** Storefront slot from the mall's meta file, e.g. "w0" (west side, nearest the entrance). */
  slot: z.string().min(1),
  name: z.string().min(1).max(40),
  tagline: z.string().max(80).optional(),
  category: z.string().optional(),
  colors: z.object({ bg: color, accent: color }),
  logo: url.optional(),
  description: z.string().max(600).optional(),
  features: z.array(z.string()).max(8).default([]),
  links: z.array(link).max(4).default([]),
  products: products.optional(),
});

export const outfitSchema = z.object({
  id,
  name: z.string().min(1),
  body: z.enum(['a', 'b']),
  file: z.string().min(1),
});

export const mallSchema = z.object({
  name: z.string().min(1).max(40),
  tagline: z.string().max(140).default(''),
  accent: color.default('#e2b857'),
  currency: z.string().length(3).default('USD'),
  locales: z.array(z.string()).min(1).default(['en']),
});

export const configSchema = z
  .object({
    mall: mallSchema,
    shops: z.array(shopSchema).min(1),
    outfits: z.array(outfitSchema).default([]),
  })
  .superRefine((cfg, ctx) => {
    const seen = new Map<string, string>();
    cfg.shops.forEach((shop, i) => {
      const clash = seen.get(shop.slot);
      if (clash) {
        ctx.addIssue({
          code: 'custom',
          path: ['shops', i, 'slot'],
          message: `slot "${shop.slot}" is already used by shop "${clash}"`,
        });
      }
      seen.set(shop.slot, shop.id);
    });
    const ids = new Set<string>();
    cfg.shops.forEach((shop, i) => {
      if (ids.has(shop.id))
        ctx.addIssue({ code: 'custom', path: ['shops', i, 'id'], message: `duplicate id "${shop.id}"` });
      ids.add(shop.id);
    });
  });

export type MallConfigInput = z.input<typeof configSchema>;
export type MallConfig = z.output<typeof configSchema>;
export type Shop = MallConfig['shops'][number];

/** Identity helper that gives mall.config.ts autocompletion. */
export const defineConfig = (config: MallConfigInput) => config;

/** Parse a config, throwing an Error whose message lists every problem with its path. */
export function parseConfig(input: unknown): MallConfig {
  const result = configSchema.safeParse(input);
  if (!result.success) throw new Error(`Invalid mall.config.ts\n${z.prettifyError(result.error)}`);
  return result.data;
}
