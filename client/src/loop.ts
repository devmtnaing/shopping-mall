// The only requestAnimationFrame in the app. Simulation runs at a fixed step so movement is
// identical at 30, 60 or 144 fps; rendering gets `alpha` (0–1) to interpolate between steps.
import { STEP } from '@shopping-mall/shared/constants';

/** Longest frame we simulate; anything longer (tab stalls, breakpoints) is dropped, not replayed. */
const MAX_FRAME = 0.25;
/** Idle frame interval: 30 fps, with a little slack so a 60 Hz display renders every other frame. */
const IDLE_FRAME_MS = 1000 / 30 - 2;

export type LoopHooks = {
  /** Advance the simulation by exactly `dt` seconds (always STEP). */
  step: (dt: number) => void;
  /** Draw a frame. `alpha` is how far we are between the last step and the next. `dt` is real frame time. */
  render: (alpha: number, dt: number) => void;
  /** True when nothing's happening: the loop then renders at most 30 fps to save battery. */
  idle?: () => boolean;
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

/** Start the loop on requestAnimationFrame. It pauses while the tab is hidden and drops to 30 fps when idle. */
export function startLoop(hooks: LoopHooks) {
  const fixed = new FixedStep(hooks);
  let id = 0;
  let drawnAt = 0;
  const frame = (now: number) => {
    id = requestAnimationFrame(frame);
    // idle: at most ~30 frames a second, whatever the display's rate (skipped frames just make the
    // next dt longer; the fixed steps catch up)
    if (now - drawnAt < IDLE_FRAME_MS && hooks.idle?.()) return;
    drawnAt = now;
    fixed.tick(now);
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
