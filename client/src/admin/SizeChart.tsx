// A product's size chart: one row per size, one column per measurement of the garment, in cm.
// Shoppers' fit checks compare their own measurements with it (shared/src/fit.ts).
import { useSignal } from '@preact/signals';
import { MEASURES, type Measure, SIZE_LIMITS } from '@shopping-mall/shared/fit';
import type { FieldError } from './api';
import { columnsOf, type DraftSize, MEASURE_LABEL, PRESETS, parsePasted, ROUND, scale } from './sizes';

const blankRow = (): DraftSize => ({ size: '', cm: {} });

export function SizeChart(props: {
  rows: DraftSize[];
  onChange: (rows: DraftSize[]) => void;
  /** Server errors for this product's sizes (paths start with `prefix`). */
  errors: FieldError[];
  prefix: string;
  name: string;
}) {
  const cols = useSignal<Measure[]>(columnsOf(props.rows, PRESETS.top));
  const pasting = useSignal(false);
  const rows = props.rows.length ? props.rows : [blankRow()];
  const set = (i: number, patch: Partial<DraftSize>) =>
    props.onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const errors = props.errors.filter((e) => e.path.startsWith(props.prefix));
  const toggle = (m: Measure) => {
    if (!cols.value.includes(m)) {
      cols.value = MEASURES.filter((c) => c === m || cols.value.includes(c));
      return;
    }
    // a hidden column isn't saved either
    cols.value = cols.value.filter((c) => c !== m);
    props.onChange(rows.map((r) => ({ ...r, cm: { ...r.cm, [m]: undefined } })));
  };

  return (
    <div class="size-chart">
      <p class="hint">
        The garment’s own measurements in each size, in cm. Chest, waist and hips go all the way round.
        Shoppers who enter their measurements see which size fits them.
      </p>
      <fieldset class="size-cols">
        <legend class="sr-only">Measurements in {props.name}’s chart</legend>
        {MEASURES.map((m) => (
          <label key={m} class="chip">
            <input type="checkbox" checked={cols.value.includes(m)} onChange={() => toggle(m)} />
            {MEASURE_LABEL[m]}
          </label>
        ))}
      </fieldset>
      <table class="size-table">
        <thead>
          <tr>
            <th scope="col">Size</th>
            {cols.value.map((m) => (
              <th key={m} scope="col">
                {MEASURE_LABEL[m]}
              </th>
            ))}
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>
                <input
                  aria-label={`Size ${i + 1}`}
                  value={r.size}
                  maxLength={SIZE_LIMITS.label}
                  placeholder={['S', 'M', 'L', 'XL'][i] ?? ''}
                  onInput={(e) => set(i, { size: (e.target as HTMLInputElement).value })}
                />
              </td>
              {cols.value.map((m) => (
                <td key={m}>
                  <input
                    inputMode="decimal"
                    aria-label={`${MEASURE_LABEL[m]}, size ${r.size || i + 1}, cm`}
                    value={r.cm[m] ?? ''}
                    onInput={(e) => set(i, { cm: { ...r.cm, [m]: (e.target as HTMLInputElement).value } })}
                  />
                </td>
              ))}
              <td>
                <button
                  type="button"
                  class="btn small ghost"
                  aria-label={`Remove size ${r.size || i + 1}`}
                  onClick={() => props.onChange(rows.filter((_, j) => j !== i))}
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {errors.length > 0 && (
        <ul class="error" role="alert">
          {errors.map((e) => (
            <li key={e.path}>
              {e.path.slice(props.prefix.length).replace(/^\./, '').replace('cm.', '') || 'Sizes'}:{' '}
              {e.message}
            </li>
          ))}
        </ul>
      )}
      <div class="actions">
        {rows.length < SIZE_LIMITS.sizes && (
          <button type="button" class="btn small" onClick={() => props.onChange([...rows, blankRow()])}>
            Add size
          </button>
        )}
        <button type="button" class="btn small ghost" onClick={() => (pasting.value = !pasting.value)}>
          Paste a chart
        </button>
        <button
          type="button"
          class="btn small ghost"
          title="Every value × 2.54"
          onClick={() => props.onChange(scale(rows, 2.54))}
        >
          Inches → cm
        </button>
        <button
          type="button"
          class="btn small ghost"
          title="Chest, waist and hips × 2"
          onClick={() => props.onChange(scale(rows, 2, ROUND))}
        >
          Measured flat? Double them
        </button>
      </div>
      {pasting.value && (
        <label class="field">
          <span>
            Paste rows from a spreadsheet or a supplier’s chart: the size first, then the measurements. A
            header row (Size, Chest, Waist…) picks the columns.
          </span>
          <textarea
            rows={4}
            placeholder={'Size\tChest\tLength\nS\t96\t68\nM\t104\t70'}
            onInput={(e) => {
              const parsed = parsePasted((e.target as HTMLTextAreaElement).value, cols.value);
              if (!parsed.rows.length) return;
              cols.value = parsed.columns.length ? parsed.columns : cols.value;
              props.onChange(parsed.rows.slice(0, SIZE_LIMITS.sizes));
            }}
          />
        </label>
      )}
    </div>
  );
}
