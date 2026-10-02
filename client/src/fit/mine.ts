// The shopper's own measurements for the fit check: kept in this browser only (storage.ts), never
// sent anywhere. Asked for once, in the first clothing shop with size charts, then remembered.
import { signal } from '@preact/signals';
import {
  type Basis,
  type Fit,
  fitFor,
  garmentOf,
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
};

const EMPTY: MyFit = { body: {}, top: {}, bottom: {}, unit: 'cm', asked: false };
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

/** cm ⇄ the shopper's unit, for showing and typing (rounded to half a cm or a tenth of an inch). */
export const toUnit = (cm: number, unit: MyFit['unit']) =>
  unit === 'in' ? Math.round((cm / 2.54) * 10) / 10 : Math.round(cm * 2) / 2;
export const fromUnit = (v: number, unit: MyFit['unit']) => (unit === 'in' ? v * 2.54 : v);
