// Quality tiers (docs/architecture.md § Quality tiers). No three.js here: the UI reads and sets these.
// "Auto" starts at Medium, watches 3 s of frame times after you enter, and steps down when the
// slowest frames are over 20 ms or up when they're all under 10 ms. The result is remembered.
import { computed, signal } from '@preact/signals';
import { load, save } from './storage';

export type Tier = 'low' | 'medium' | 'high';
export type QualitySetting = 'auto' | Tier;
const ORDER: Tier[] = ['low', 'medium', 'high'];

export const TIERS: Record<Tier, { dpr: number; animateWithin: number; shoppers: number }> = {
  low: { dpr: 1, animateWithin: 12, shoppers: 3 },
  medium: { dpr: 1.5, animateWithin: 20, shoppers: 6 },
  high: { dpr: 2, animateWithin: 30, shoppers: 8 },
};

const isTier = (v: unknown): v is Tier => ORDER.includes(v as Tier);
const savedSetting = load<string>('quality', 'auto');
export const qualitySetting = signal<QualitySetting>(isTier(savedSetting) ? savedSetting : 'auto');
const savedAuto = load<string>('quality-auto', 'medium');
const autoTier = signal<Tier>(isTier(savedAuto) ? savedAuto : 'medium');

/** The tier in effect. */
export const tier = computed<Tier>(() =>
  qualitySetting.value === 'auto' ? autoTier.value : qualitySetting.value,
);

export function setQuality(q: QualitySetting) {
  qualitySetting.value = q;
  save('quality', q);
}

/** Collects frame times while Auto is on and nudges the tier at most one step per 3 s sample. */
export class AutoQuality {
  private samples: number[] = [];
  private elapsed = 0;
  private rounds = 0;

  /** Call every rendered frame with its duration (ms). */
  frame(ms: number) {
    if (qualitySetting.value !== 'auto' || this.rounds >= 2) return;
    this.samples.push(ms);
    this.elapsed += ms;
    if (this.elapsed < 3000) return;
    const sorted = this.samples.sort((a, b) => a - b);
    const p90 = sorted[Math.floor(sorted.length * 0.9)] ?? 0;
    this.samples = [];
    this.elapsed = 0;
    const i = ORDER.indexOf(autoTier.value);
    const next = p90 > 20 ? ORDER[i - 1] : p90 < 10 ? ORDER[i + 1] : undefined;
    // a second round only if the first one moved (to check the new tier holds up)
    this.rounds = next ? this.rounds + 1 : 2;
    if (next) {
      autoTier.value = next;
      save('quality-auto', next);
    }
  }
}
