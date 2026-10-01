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

/**
 * A RateLimit for each IP address, and optionally one shared by everyone together (so a crowd of
 * addresses can't add up to a flood either). Forgets everyone past 10,000 addresses, so it can't
 * grow without bound.
 */
export class PerIpLimit {
  private readonly perIp = new Map<string, RateLimit>();
  private readonly burst: number;
  private readonly perSecond: number;
  private readonly all: RateLimit | null;

  constructor(burst: number, perSecond: number, all: RateLimit | null = null) {
    this.burst = burst;
    this.perSecond = perSecond;
    this.all = all;
  }

  take(ip: string, now = Date.now()): boolean {
    let limit = this.perIp.get(ip);
    if (!limit) {
      if (this.perIp.size >= 10_000) this.perIp.clear();
      limit = new RateLimit(this.burst, this.perSecond, now);
      this.perIp.set(ip, limit);
    }
    return limit.take(now) && (this.all?.take(now) ?? true);
  }
}
