// Will it fit? A product's size chart (the garment's own measurements per size) against a
// shopper's measurements, which never leave their device. No zod here, so the client can import
// it cheaply. Lengths are in centimetres; chest, waist and hips are all the way round.

/** What a size chart and a shopper's measurements can have, in the order forms show them. */
export const MEASURES = ['shoulder', 'chest', 'waist', 'hips', 'sleeve', 'inseam', 'length'] as const;
export type Measure = (typeof MEASURES)[number];
/** Measurements in cm; any may be missing. */
export type Measurements = Partial<Record<Measure, number>>;

/** One row of a size chart: the garment's measurements in that size. */
export type SizeRow = { size: string; cm: Measurements };

export const SIZE_LIMITS = { sizes: 8, label: 12, min: 10, max: 250 } as const;

/**
 * A size chart from somewhere we don't control (a shop's JSON feed): keeps the well-formed rows
 * and measurements, drops the rest. Undefined if nothing usable is left.
 */
export function cleanSizes(raw: unknown): SizeRow[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const rows: SizeRow[] = [];
  const seen = new Set<string>();
  for (const r of raw.slice(0, SIZE_LIMITS.sizes)) {
    const row = r as { size?: unknown; cm?: Record<string, unknown> };
    const size = typeof row?.size === 'string' ? row.size.trim().slice(0, SIZE_LIMITS.label) : '';
    if (!size || seen.has(size.toLowerCase()) || typeof row.cm !== 'object' || !row.cm) continue;
    const cm: Measurements = {};
    for (const m of MEASURES) {
      const v = Number(row.cm[m]);
      if (row.cm[m] !== undefined && Number.isFinite(v) && v >= SIZE_LIMITS.min && v <= SIZE_LIMITS.max)
        cm[m] = v;
    }
    if (Object.keys(cm).length === 0) continue;
    seen.add(size.toLowerCase());
    rows.push({ size, cm });
  }
  return rows.length ? rows : undefined;
}
