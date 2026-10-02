// Will it fit? In a clothing shop with size charts: offer the fit check once, take the shopper's
// measurements (kept on this device, fit/mine.ts), and say on each product which size fits.
import { signal, useSignal } from '@preact/signals';
import {
  type Fit,
  type Measure,
  type Measurements,
  SIZE_LIMITS,
  type SizeRow,
} from '@shopping-mall/shared/fit';
import {
  fitForMe,
  forgetMyFit,
  fromUnit,
  hasMeasurements,
  type MyFit,
  myFit,
  setMyFit,
  toUnit,
} from '../fit/mine';
import { type FitKey, measureName, statusName, tf } from '../i18n/fit';

/** Body measurements the form asks for, in this order. */
const BODY: Measure[] = ['shoulder', 'chest', 'waist', 'hips', 'sleeve', 'inseam'];

/** The measurements form is open (in whichever shop panel asked for it). */
const editing = signal(false);

/** Top of a clothing shop's products: the one-time offer, the form, or a link back to it. */
export function FitIntro() {
  const m = myFit.value;
  if (editing.value) return <FitForm />;
  if (!m.asked && !hasMeasurements(m))
    return (
      <section class="fit-intro" aria-label={tf('fit.introTitle')}>
        <FitIcon />
        <div>
          <strong>{tf('fit.introTitle')}</strong>
          <p class="note">{tf('fit.intro')}</p>
          <div class="fit-actions">
            <button
              type="button"
              class="cta cta-primary"
              onClick={() => {
                setMyFit({ asked: true });
                editing.value = true;
              }}
            >
              {tf('fit.add')}
            </button>
            <button type="button" class="cta cta-ghost" onClick={() => setMyFit({ asked: true })}>
              {tf('fit.notNow')}
            </button>
          </div>
        </div>
      </section>
    );
  return (
    <button type="button" class="fit-link" onClick={() => (editing.value = true)}>
      <FitIcon />
      {tf(hasMeasurements(m) ? 'fit.edit' : 'fit.check')}
    </button>
  );
}

/** Lengths as typed in a form: strings in the shopper's unit. */
type Typed = Partial<Record<Measure, string>>;
const typed = (cm: Measurements, unit: MyFit['unit']): Typed =>
  Object.fromEntries(Object.entries(cm).map(([k, v]) => [k, String(toUnit(v as number, unit))]));
function measured(t: Typed, unit: MyFit['unit']): Measurements {
  const out: Measurements = {};
  for (const [k, v] of Object.entries(t)) {
    const n = Number(v?.replace(',', '.'));
    const cm = Math.round(fromUnit(n, unit) * 2) / 2;
    if (v?.trim() && Number.isFinite(n) && cm >= SIZE_LIMITS.min && cm <= SIZE_LIMITS.max)
      out[k as Measure] = cm;
  }
  return out;
}

function FitForm() {
  const m = myFit.value;
  const unit = useSignal(m.unit);
  const body = useSignal<Typed>(typed(m.body, m.unit));
  const focus = useSignal<Measure | null>(null);
  const changeUnit = (u: MyFit['unit']) => {
    // keep what's typed, in the new unit
    body.value = typed(measured(body.value, unit.value), u);
    unit.value = u;
  };
  const save = (e: Event) => {
    e.preventDefault();
    setMyFit({ unit: unit.value, body: measured(body.value, unit.value), asked: true });
    editing.value = false;
  };
  return (
    <form class="fit-form" onSubmit={save} aria-label={tf('fit.formTitle')}>
      <div class="fit-form-head">
        <strong>{tf('fit.formTitle')}</strong>
        <div class="fit-units" role="radiogroup" aria-label={tf('fit.unit')}>
          {(['cm', 'in'] as const).map((u) => (
            <label key={u} class={unit.value === u ? 'on' : ''}>
              <input type="radio" name="fit-unit" checked={unit.value === u} onChange={() => changeUnit(u)} />
              {u}
            </label>
          ))}
        </div>
      </div>
      <p class="note">{tf('fit.formHint')}</p>
      <div class="fit-form-body">
        <BodyFigure focus={focus.value} />
        <div class="fit-fields">
          {BODY.map((k) => (
            <label key={k} class="fit-field">
              <span class="field-label">
                {measureName(k)} <small>({unit.value})</small>
              </span>
              <input
                class="search"
                inputMode="decimal"
                value={body.value[k] ?? ''}
                aria-describedby={`fit-how-${k}`}
                onFocus={() => (focus.value = k)}
                onInput={(e) => (body.value = { ...body.value, [k]: (e.target as HTMLInputElement).value })}
              />
              <small id={`fit-how-${k}`} class="fit-how">
                {tf(`fit.how.${k}` as FitKey)}
              </small>
            </label>
          ))}
        </div>
      </div>
      <p class="note fit-private">{tf('fit.private')}</p>
      <div class="fit-actions">
        <button type="submit" class="cta cta-primary">
          {tf('fit.save')}
        </button>
        <button type="button" class="cta cta-ghost" onClick={() => (editing.value = false)}>
          {tf('fit.cancel')}
        </button>
        {hasMeasurements(m) && (
          <button
            type="button"
            class="cta cta-ghost"
            onClick={() => {
              forgetMyFit();
              editing.value = false;
            }}
          >
            {tf('fit.forget')}
          </button>
        )}
      </div>
    </form>
  );
}

const issues = (fit: Fit, size: string) =>
  fit.sizes
    .find((s) => s.size === size)
    ?.checks.filter((c) => c.status !== 'fits')
    .map((c) => tf('fit.issue', { status: statusName(c.status), at: tf(`fit.at.${c.measure}` as FitKey) }))
    .join(', ') ?? '';

/** Under a product with a size chart: which size fits, and a size-by-size breakdown. */
export function FitLine({ sizes }: { sizes: SizeRow[] }) {
  const m = myFit.value;
  if (!hasMeasurements(m)) return null;
  const fit = fitForMe(sizes, m);
  if (!fit) {
    // nothing in common: say what would let us check (the chart's first body measurement)
    const want = BODY.find((k) => sizes.some((r) => r.cm[k] !== undefined));
    return want ? <p class="fit-line">{tf('fit.none', { what: measureName(want).toLowerCase() })}</p> : null;
  }
  const off = fit.fits ? '' : issues(fit, fit.best);
  return (
    <details class="fit-line">
      <summary class={fit.fits ? 'fit-yes' : 'fit-near'}>
        {fit.fits ? `✓ ${tf('fit.fits', { size: fit.best })}` : tf('fit.closest', { size: fit.best })}
        {off && <span class="fit-off"> · {off}</span>}
      </summary>
      <ul class="fit-sizes" aria-label={tf('fit.sizes')}>
        {fit.sizes.map((s) => (
          <li key={s.size} class={s.fits ? 'fit-yes' : ''}>
            <b>{s.size}</b> {s.fits ? statusName('fits') : issues(fit, s.size)}
          </li>
        ))}
      </ul>
      <p class="fit-note">
        {tf('fit.based', { list: fit.based.map((k) => measureName(k).toLowerCase()).join(', ') })}{' '}
        {tf('fit.guide')}
      </p>
    </details>
  );
}

function FitIcon() {
  // a tape measure
  return (
    <svg class="fit-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <circle cx="10" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="1.8" />
      <circle cx="10" cy="12" r="2" fill="currentColor" />
      <path d="M17 12h5v4h-5" fill="none" stroke="currentColor" stroke-width="1.8" />
      <path d="M19 12v2M21 12v2" stroke="currentColor" stroke-width="1.2" />
    </svg>
  );
}

/** Where each measurement is taken, drawn on a simple figure; the field in focus lights up. */
const LINES: Record<Measure, string> = {
  shoulder: 'M34 30H66',
  chest: 'M33 42H67',
  waist: 'M36 60H64',
  hips: 'M34 72H66',
  sleeve: 'M67 30L76 66',
  inseam: 'M51 80V122',
  length: '',
};
function BodyFigure({ focus }: { focus: Measure | null }) {
  return (
    <svg class="fit-figure" viewBox="0 0 100 130" aria-hidden="true">
      <g fill="none" stroke="currentColor" stroke-width="1.6" opacity="0.45" stroke-linejoin="round">
        <circle cx="50" cy="15" r="9" />
        <path d="M36 28h28l4 3 10 36-6 2-9-30v34l3 48h-9l-4-42-4 42h-9l3-48V39l-9 30-6-2 10-36z" />
      </g>
      {BODY.map((k) => (
        <path
          key={k}
          d={LINES[k]}
          class={focus === k ? 'fit-mark on' : 'fit-mark'}
          stroke-width={focus === k ? 3 : 1.6}
          stroke-dasharray={focus === k ? undefined : '3 3'}
        />
      ))}
    </svg>
  );
}
