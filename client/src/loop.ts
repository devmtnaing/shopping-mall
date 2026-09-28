// The only requestAnimationFrame in the app. Simulation runs at a fixed step so movement is
// identical at 30, 60 or 144 fps; rendering gets `alpha` (0–1) to interpolate between steps.
import { STEP } from '@plaza/shared/constants';

/** Longest frame we simulate; anything longer (tab stalls, breakpoints) is dropped, not replayed. */
const MAX_FRAME = 0.25;

export type LoopHooks = {
  /** Advance the simulation by exactly `dt` seconds (always STEP). */
  step: (dt: number) => void;
  /** Draw a frame. `alpha` is how far we are between the last step and the next. `dt` is real frame time. */
  render: (alpha: number, dt: number) => void;
};

/** Fixed-step accumulator, separate from rAF so tests can drive it with fake time. */
export class FixedStep {
  private acc = 0;
  private last = -1;

  constructor(private readonly hooks: LoopHooks) {}

  /** Feed a timestamp in ms. Returns the number of simulation steps taken. */
  tick(nowMs: number): number {
    const dt = this.last < 0 ? 0 : Math.min((nowMs - this.last) / 1000, MAX_FRAME);
    this.last = nowMs;
    this.acc += dt;
    let steps = 0;
    while (this.acc >= STEP) {
      this.hooks.step(STEP);
      this.acc -= STEP;
      steps++;
    }
    this.hooks.render(this.acc / STEP, dt);
    return steps;
  }

  /** Forget the last timestamp, e.g. after the tab was hidden, so the next frame doesn't jump. */
  reset() {
    this.last = -1;
  }
}

/** Start the loop on requestAnimationFrame. It pauses while the tab is hidden. */
export function startLoop(hooks: LoopHooks) {
  const fixed = new FixedStep(hooks);
  let id = 0;
  const frame = (now: number) => {
    fixed.tick(now);
    id = requestAnimationFrame(frame);
  };
  const onVisibility = () => {
    cancelAnimationFrame(id);
    if (document.hidden) return;
    fixed.reset();
    id = requestAnimationFrame(frame);
  };
  document.addEventListener('visibilitychange', onVisibility);
  id = requestAnimationFrame(frame);
  return () => {
    cancelAnimationFrame(id);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}
