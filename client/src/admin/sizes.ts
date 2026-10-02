// Size charts in the product editor: the draft shape (text, as typed), and reading one pasted from
// a spreadsheet or a supplier's website. Saved as the garment's measurements in cm (shared/src/fit.ts).
import { MEASURES, type Measure, type SizeRow } from '@shopping-mall/shared/fit';

export type DraftSize = { size: string; cm: Partial<Record<Measure, string>> };

/** What each column is called in the editor. */
export const MEASURE_LABEL: Record<Measure, string> = {
  shoulder: 'Shoulder',
  chest: 'Chest',
  waist: 'Waist',
  hips: 'Hips',
  sleeve: 'Sleeve',
  inseam: 'Inseam',
  length: 'Length',
};
/** Columns a new chart starts with. */
export const PRESETS = {
  top: ['shoulder', 'chest', 'sleeve', 'length'],
  bottom: ['waist', 'hips', 'inseam'],
} as const satisfies Record<string, readonly Measure[]>;
/** Measured all the way round (doubled when a chart was measured flat across). */
export const ROUND: readonly Measure[] = ['chest', 'waist', 'hips'];

/** Words a pasted header might use for each measurement. */
const SYNONYMS: [Measure, RegExp][] = [
  ['shoulder', /shoulder/i],
  ['chest', /chest|bust|pit/i],
  ['waist', /waist/i],
  ['hips', /hip|seat/i],
  ['sleeve', /sleeve|arm/i],
  ['inseam', /inseam|inside leg|inner leg/i],
  ['length', /length|long/i],
];

export const toDraftSizes = (sizes: readonly SizeRow[] | undefined): DraftSize[] =>
  (sizes ?? []).map((r) => ({
    size: r.size,
    cm: Object.fromEntries(Object.entries(r.cm).map(([m, v]) => [m, String(v)])),
  }));

/** The chart to save: rows with a size name, and the measurements typed in (as numbers). */
export function fromDraftSizes(rows: readonly DraftSize[]): SizeRow[] | undefined {
  const out = rows
    .filter((r) => r.size.trim())
    .map((r) => ({
      size: r.size.trim(),
      cm: Object.fromEntries(
        MEASURES.filter((m) => r.cm[m]?.trim()).map((m) => [m, Number(r.cm[m]?.replace(',', '.'))]),
      ),
    }));
  return out.length ? out : undefined;
}

/** Columns a chart uses, in the usual order (or `fallback` for an empty chart). */
export function columnsOf(rows: readonly DraftSize[], fallback: readonly Measure[]): Measure[] {
  const used = MEASURES.filter((m) => rows.some((r) => r.cm[m]?.trim()));
  return used.length ? used : [...fallback];
}

/** Every value times `factor`, rounded to half a cm (inches to cm, or flat to all the way round). */
export function scale(rows: readonly DraftSize[], factor: number, only: readonly Measure[] = MEASURES) {
  return rows.map((r) => ({
    ...r,
    cm: Object.fromEntries(
      Object.entries(r.cm).map(([m, v]) => {
        const n = Number(v?.replace(',', '.'));
        return [
          m,
          v?.trim() && Number.isFinite(n) && only.includes(m as Measure)
            ? String(Math.round(n * factor * 2) / 2)
            : v,
        ];
      }),
    ),
  }));
}

const cells = (line: string) =>
  line.includes('\t')
    ? line.split('\t')
    : line.includes(',') && !/\d,\d/.test(line)
      ? line.split(',')
      : line.trim().split(/\s{2,}|\s+(?=\d)/);

/**
 * A chart pasted from a spreadsheet: one size per line, its name first. A header line naming the
 * measurements picks the columns; without one, the values fill `columns` in order. Ranges like
 * "96-100" take the middle.
 */
export function parsePasted(
  text: string,
  columns: readonly Measure[],
): { rows: DraftSize[]; columns: Measure[] } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => cells(l).map((c) => c.trim()))
    .filter((c) => c.some(Boolean));
  if (lines.length === 0) return { rows: [], columns: [...columns] };
  let cols: (Measure | null)[] = [...columns];
  const head = lines[0] as string[];
  // a header: words where the numbers would be
  if (head.slice(1).some((c) => c && !/\d/.test(c))) {
    cols = head.slice(1).map((c) => SYNONYMS.find(([, re]) => re.test(c))?.[0] ?? null);
    lines.shift();
  }
  const rows = lines.map((cellsOf) => {
    const [size = '', ...values] = cellsOf;
    const cm: DraftSize['cm'] = {};
    values.forEach((v, i) => {
      const m = cols[i];
      const nums = v.match(/\d+(?:[.,]\d+)?/g)?.map((n) => Number(n.replace(',', '.')));
      if (!m || !nums?.length) return;
      const mid = nums.length > 1 ? ((nums[0] as number) + (nums[1] as number)) / 2 : (nums[0] as number);
      cm[m] = String(mid);
    });
    return { size: size.slice(0, 12), cm };
  });
  return { rows, columns: MEASURES.filter((m) => cols.includes(m)) };
}
