/**
 * Token bucket: allows short bursts, then a steady rate. `take()` returns false when the
 * caller should be told to slow down.
 */
export class RateLimit {
  private tokens: number;
  private last: number;
  private readonly burst: number;
  private readonly perSecond: number;

  constructor(burst: number, perSecond: number, now = Date.now()) {
    this.burst = burst;
    this.perSecond = perSecond;
    this.tokens = burst;
    this.last = now;
  }

  take(now = Date.now()): boolean {
    this.tokens = Math.min(this.burst, this.tokens + ((now - this.last) / 1000) * this.perSecond);
    this.last = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}
