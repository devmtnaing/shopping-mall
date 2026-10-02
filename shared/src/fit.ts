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

// ---- the fit check

export type Garment = 'top' | 'bottom';
/** What to compare a size chart with: your body, or a piece of clothing you own that fits well. */
export type Basis = 'body' | 'piece';
export type Status = 'fits' | 'tight' | 'loose' | 'short' | 'long';
/** One measurement in one size: how it would fit, and by how many cm it misses the comfort range. */
export type Check = { measure: Measure; status: Status; by: number };
export type SizeFit = { size: string; checks: Check[]; fits: boolean };
export type Fit = {
  garment: Garment;
  basis: Basis;
  /** The measurements both sides have, which the result rests on. */
  based: Measure[];
  sizes: SizeFit[];
  /** The size to buy: the best-fitting one, or the closest if none fits everywhere. */
  best: string;
  /** Whether `best` fits in every measurement compared. */
  fits: boolean;
};

/**
 * Comfort ranges, garment minus you, in cm: within them a size fits; below is tight (or short),
 * above is loose (or long). Against your body a garment needs room to move (ease); against a piece
 * you own it should be about the same. A starting point, to tune with real shoppers.
 */
const RANGES: Record<Basis, Record<Garment, Partial<Record<Measure, readonly [number, number]>>>> = {
  body: {
    top: {
      shoulder: [-1.5, 3],
      chest: [4, 14],
      waist: [4, 20],
      hips: [2, 16],
      sleeve: [-3, 3],
      length: [-4, 4],
    },
    bottom: { waist: [-1, 4], hips: [2, 12], inseam: [-3, 2] },
  },
  piece: {
    top: {
      shoulder: [-1.5, 1.5],
      chest: [-3, 3],
      waist: [-4, 4],
      hips: [-4, 4],
      sleeve: [-2, 2],
      length: [-3, 3],
    },
    bottom: { waist: [-2, 2], hips: [-3, 3], inseam: [-2, 2], length: [-3, 3] },
  },
};
/** Too tight counts double: a loose garment can still be worn, a tight one often can't. */
const TIGHT_WEIGHT = 2;
/** Measurements that run along the body, so they're short or long rather than tight or loose. */
const ALONG = new Set<Measure>(['sleeve', 'inseam', 'length']);
/**
 * A sleeve or leg under this share of yours is short by design (a T-shirt, shorts), not too short:
 * against a body it isn't compared.
 */
const CUT_SHORT = 0.6;

/** Tops have a chest or shoulders; trousers and skirts don't. */
export function garmentOf(sizes: readonly SizeRow[]): Garment {
  const has = (m: Measure) => sizes.some((r) => r.cm[m] !== undefined);
  return has('chest') || has('shoulder') || has('sleeve') ? 'top' : 'bottom';
}

/**
 * How each size in `sizes` would fit someone with measurements `you` (their body, or a piece they
 * own: `basis`). Null when the chart and `you` share no measurement to compare.
 */
export function fitFor(sizes: readonly SizeRow[], you: Measurements, basis: Basis = 'body'): Fit | null {
  const garment = garmentOf(sizes);
  const ranges = RANGES[basis][garment];
  // a body has no "length" to compare a garment's length with
  const candidates = MEASURES.filter(
    (m) =>
      ranges[m] &&
      !(basis === 'body' && m === 'length') &&
      you[m] !== undefined &&
      sizes.some((r) => r.cm[m] !== undefined),
  );
  const cutShort = (m: Measure, g: number) =>
    basis === 'body' && (m === 'sleeve' || m === 'inseam') && g < CUT_SHORT * (you[m] as number);
  const based = candidates.filter((m) => sizes.some((r) => r.cm[m] !== undefined && !cutShort(m, r.cm[m])));
  if (based.length === 0 || sizes.length === 0) return null;

  let best: { size: string; fits: boolean; score: number } | null = null;
  const out: SizeFit[] = sizes.map((row) => {
    const checks: Check[] = [];
    let off = 0;
    let centre = 0;
    for (const m of based) {
      const g = row.cm[m];
      const [lo, hi] = ranges[m] as readonly [number, number];
      if (g === undefined || cutShort(m, g)) continue;
      const ease = g - (you[m] as number);
      const along = ALONG.has(m);
      const by = ease < lo ? lo - ease : ease > hi ? ease - hi : 0;
      const status: Status =
        ease < lo ? (along ? 'short' : 'tight') : ease > hi ? (along ? 'long' : 'loose') : 'fits';
      checks.push({ measure: m, status, by: Math.round(by * 10) / 10 });
      off += ((status === 'tight' ? TIGHT_WEIGHT : 1) * by) / (hi - lo);
      centre += Math.abs(ease - (lo + hi) / 2) / (hi - lo);
    }
    const fits = checks.length > 0 && checks.every((c) => c.status === 'fits');
    // among sizes that fit, the one nearest the middle of every range; else the one that misses least
    const score = fits ? centre : 1000 + off;
    if (checks.length > 0 && (!best || score < best.score)) best = { size: row.size, fits, score };
    return { size: row.size, checks, fits };
  });
  const chosen = best as { size: string; fits: boolean } | null;
  if (!chosen) return null;
  return { garment, basis, based, sizes: out, best: chosen.size, fits: chosen.fits };
}
