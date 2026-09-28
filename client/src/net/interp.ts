// Smooth remote movement: snapshots arrive ~15×/s with jitter and occasional loss, so each remote
// player is drawn INTERP_DELAY in the past, interpolated between the two snapshots around that
// moment. If packets are late we extrapolate for up to MAX_EXTRAPOLATE, then hold still.
import { NET_HZ } from '@plaza/shared/constants';
import type { Pose } from '@plaza/shared/protocol';

export const INTERP_DELAY = 100; // ms
const MAX_EXTRAPOLATE = 250; // ms
const TICK_MS = 1000 / NET_HZ;
/** Moves longer than this between two snapshots are teleports: snap, don't slide across the mall. */
const TELEPORT = 5;
const SIZE = 16;

type Sample = { t: number; x: number; y: number; z: number; yaw: number; anim: number; flags: number };

/**
 * Maps the server's 16-bit tick counter onto the client clock. The offset follows the fastest
 * arrivals (lowest latency) and relaxes slowly, so jitter doesn't shake the timeline.
 */
export class ServerClock {
  private lastTick = -1;
  private ticks = 0;
  private offset = Number.NaN;

  /** Record a snapshot's tick arriving at local time `now`; returns its time on the server timeline (ms). */
  onTick(tick: number, now: number): number {
    if (this.lastTick >= 0) this.ticks += (tick - this.lastTick + 0x10000) & 0xffff; // unwrap u16
    this.lastTick = tick;
    const serverTime = this.ticks * TICK_MS;
    const sample = now - serverTime;
    if (Number.isNaN(this.offset) || sample < this.offset) this.offset = sample;
    else this.offset += (sample - this.offset) * 0.02;
    return serverTime;
  }

  /** The server time to draw remote players at, right now. */
  renderTime(now: number): number {
    return now - this.offset - INTERP_DELAY;
  }
}

/** Recent snapshots for one remote player. */
export class PoseBuffer {
  private readonly samples: Sample[] = [];

  push(t: number, p: Pose) {
    const last = this.samples[this.samples.length - 1];
    if (last && t <= last.t) return; // out of order or duplicate
    const s = this.samples.length >= SIZE ? (this.samples.shift() as Sample) : ({} as Sample);
    s.t = t;
    s.x = p.x;
    s.y = p.y;
    s.z = p.z;
    s.yaw = p.yaw;
    s.anim = p.anim;
    s.flags = p.flags;
    this.samples.push(s);
  }

  get newest(): number {
    return this.samples[this.samples.length - 1]?.t ?? Number.NEGATIVE_INFINITY;
  }

  /** Write the pose at server time `t` into `out`. Returns false if there's nothing to show yet. */
  sample(t: number, out: Pose): boolean {
    const s = this.samples;
    const n = s.length;
    if (n === 0) return false;
    const first = s[0] as Sample;
    const last = s[n - 1] as Sample;
    if (t <= first.t) return copy(first, out);
    if (t >= last.t) {
      const prev = s[n - 2];
      if (!prev || dist(prev, last) > TELEPORT) return copy(last, out);
      // extrapolate along the last known velocity, briefly
      const ahead = Math.min(t - last.t, MAX_EXTRAPOLATE);
      const k = ahead / (last.t - prev.t);
      copy(last, out);
      out.x += (last.x - prev.x) * k; // no allocation: this runs every frame per player
      out.z += (last.z - prev.z) * k;
      return true;
    }
    let i = n - 1;
    while (i > 0 && (s[i - 1] as Sample).t > t) i--;
    const a = s[i - 1] as Sample;
    const b = s[i] as Sample;
    if (dist(a, b) > TELEPORT) return copy(t - a.t < b.t - t ? a : b, out);
    return lerp(a, b, (t - a.t) / (b.t - a.t), out);
  }
}

const dist = (a: Sample, b: Sample) => Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);

function copy(s: Sample, out: Pose) {
  out.x = s.x;
  out.y = s.y;
  out.z = s.z;
  out.yaw = s.yaw;
  out.anim = s.anim;
  out.flags = s.flags;
  return true;
}

function lerp(a: Sample, b: Sample, k: number, out: Pose) {
  out.x = a.x + (b.x - a.x) * k;
  out.y = a.y + (b.y - a.y) * k;
  out.z = a.z + (b.z - a.z) * k;
  const d = Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw)); // shortest way round
  out.yaw = a.yaw + d * Math.min(1, k);
  out.anim = k < 0.5 ? a.anim : b.anim;
  out.flags = k < 0.5 ? a.flags : b.flags;
  return true;
}
