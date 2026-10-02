// The shopper's own measurements for the fit check: kept in this browser only (storage.ts), never
// sent anywhere. Asked for once, in the first clothing shop with size charts, then remembered.
import { signal } from '@preact/signals';
import {
  type Basis,
  type Fit,
  fitFor,
  garmentOf,
  type Measure,
  type Measurements,
  type SizeRow,
} from '@shopping-mall/shared/fit';
import { load, save } from '../storage';

export type MyFit = {
  /** Body measurements, in cm. */
  body: Measurements;
  /** A top and a pair of trousers (or a skirt) the shopper owns that fit well, in cm. */
  top: Measurements;
  bottom: Measurements;
  /** How they like to see and type lengths. */
  unit: 'cm' | 'in';
  /** They've been offered the fit check (and said yes or "not now"), so it isn't offered again. */
  asked: boolean;
  /** Body measurements estimated from height rather than measured. */
  estimated: Measure[];
};

const EMPTY: MyFit = { body: {}, top: {}, bottom: {}, unit: 'cm', asked: false, estimated: [] };
const KEY = 'fit';

export const myFit = signal<MyFit>({ ...EMPTY, ...load<Partial<MyFit>>(KEY, {}) });

export function setMyFit(patch: Partial<MyFit>) {
  myFit.value = { ...myFit.value, ...patch };
  save(KEY, myFit.value);
}

/** Forget every measurement (they're still not asked again). */
export function forgetMyFit() {
  setMyFit({ ...EMPTY, unit: myFit.value.unit, asked: true });
}

export const hasMeasurements = (m: MyFit = myFit.value) =>
  [m.body, m.top, m.bottom].some((x) => Object.keys(x).length > 0);

/**
 * How a product's sizes fit this shopper: against a piece they own of the same kind when that
 * gives an answer (it's usually closer), otherwise against their body.
 */
export function fitForMe(sizes: readonly SizeRow[], m: MyFit = myFit.value): Fit | null {
  const piece = garmentOf(sizes) === 'top' ? m.top : m.bottom;
  const tries: [Measurements, Basis][] = [
    [piece, 'piece'],
    [m.body, 'body'],
  ];
  for (const [you, basis] of tries) {
    const fit = Object.keys(you).length ? fitFor(sizes, you, basis) : null;
    if (fit) return fit;
  }
  return null;
}

/**
 * Body lengths as shares of height, for shoppers without a tape measure: shoulder breadth and arm
 * length (shoulder to wrist) from Drillis & Contini's segment proportions (1966, as tabled in
 * Winter, "Biomechanics and Motor Control of Human Movement"); inside leg from the tailors' rule
 * of thumb of about 0.45. Chest, waist and hips vary too much with build to guess from height.
 */
export const FROM_HEIGHT: Partial<Record<Measure, number>> = { shoulder: 0.259, sleeve: 0.332, inseam: 0.45 };

/** Lengths estimated from a height in cm, rounded to half a cm. */
export function estimateFromHeight(height: number): Measurements {
  if (!(height >= 120 && height <= 230)) return {};
  return Object.fromEntries(
    Object.entries(FROM_HEIGHT).map(([m, share]) => [m, Math.round(height * (share as number) * 2) / 2]),
  );
}

/** cm ⇄ the shopper's unit, for showing and typing (rounded to half a cm or a tenth of an inch). */
export const toUnit = (cm: number, unit: MyFit['unit']) =>
  unit === 'in' ? Math.round((cm / 2.54) * 10) / 10 : Math.round(cm * 2) / 2;
export const fromUnit = (v: number, unit: MyFit['unit']) => (unit === 'in' ? v * 2.54 : v);
