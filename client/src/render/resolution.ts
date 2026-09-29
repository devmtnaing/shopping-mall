// Dynamic resolution (T-502): when frames run over budget, render fewer pixels for a while instead
// of dropping frames. Scale goes 1.0 → 0.75 in small steps and creeps back once there's headroom.
// Pure logic (no three.js) so it can be tested; the renderer multiplies its pixel ratio by `scale`.
import { signal } from '@preact/signals';

const MIN = 0.75;
const STEP = 0.05;
/** Frames over budget in a row before scaling down, and frames with headroom before scaling up. */
const DOWN_AFTER = 30;
const UP_AFTER = 180;

export const resolutionScale = signal(1);

export class DynamicResolution {
  private over = 0;
  private under = 0;

  /** @param budgetMs the frame time to hold (16.7 for 60 fps) */
  constructor(private budgetMs = 1000 / 60) {}

  setBudget(ms: number) {
    this.budgetMs = ms;
  }

  /** Feed each frame's duration (ms). Changes `resolutionScale` when it should. */
  frame(ms: number) {
    if (ms > this.budgetMs * 1.1) {
      this.over++;
      this.under = 0;
    } else if (ms < this.budgetMs * 0.7) {
      this.under++;
      this.over = 0;
    } else {
      this.over = this.under = 0;
    }
    const s = resolutionScale.value;
    if (this.over >= DOWN_AFTER && s > MIN) {
      resolutionScale.value = Math.max(MIN, +(s - STEP).toFixed(2));
      this.over = 0;
    } else if (this.under >= UP_AFTER && s < 1) {
      resolutionScale.value = Math.min(1, +(s + STEP).toFixed(2));
      this.under = 0;
    }
  }
}
