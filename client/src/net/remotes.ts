// Everyone else in the room: who they are (welcome / presence) and where they are (snapshots),
// sampled 100 ms in the past for smooth motion. Pure data; render/crowd.ts draws it.
import type { PlayerInfo, Pose } from '@plaza/shared/protocol';
import { PoseBuffer, ServerClock } from './interp';

/** Hide someone we haven't had a snapshot for in this long (they left our nearest-40). */
const STALE_MS = 1200;
const DEFAULT_LOOK = { color: '#b9b2a5' };

export type Remote = {
  id: number;
  info: PlayerInfo;
  readonly buf: PoseBuffer;
  /** Where to draw them this frame (valid when `visible`). */
  readonly pose: Pose;
  visible: boolean;
  /** Last local time (ms) a snapshot included them. */
  seenAt: number;
};

export class Remotes {
  readonly players = new Map<number, Remote>();
  readonly clock = new ServerClock();
  /** Bumped whenever someone joins, leaves or changes name, so views know to redraw tags. */
  version = 0;
  private selfId = 0;
  private tickTime = 0;

  welcome(selfId: number, players: PlayerInfo[]) {
    this.selfId = selfId;
    this.players.clear();
    for (const p of players) this.upsert(p);
    this.version++;
  }

  presence(joined: PlayerInfo[], left: number[]) {
    for (const p of joined) if (p.id !== this.selfId) this.upsert(p);
    for (const id of left) this.players.delete(id);
    this.version++;
  }

  /** Call once per snapshot before its players, with the snapshot's tick and arrival time. */
  beginSnapshot(tick: number, now: number) {
    this.tickTime = this.clock.onTick(tick, now);
  }

  snapshot(id: number, pose: Pose, now: number) {
    if (id === this.selfId) return;
    let r = this.players.get(id);
    if (!r) {
      // moved before their presence arrived: show them now, name them when it does
      r = this.upsert({ id, name: '', look: DEFAULT_LOOK });
      this.version++;
    }
    r.buf.push(this.tickTime, pose);
    r.seenAt = now;
  }

  /** Sample every remote for this frame. */
  update(now: number) {
    const t = this.clock.renderTime(now);
    for (const r of this.players.values()) {
      r.visible = now - r.seenAt < STALE_MS && r.buf.sample(t, r.pose);
    }
  }

  private upsert(info: PlayerInfo): Remote {
    const existing = this.players.get(info.id);
    if (existing) {
      existing.info = info;
      return existing;
    }
    const r: Remote = {
      id: info.id,
      info,
      buf: new PoseBuffer(),
      pose: { x: 0, y: 0, z: 0, yaw: 0, anim: 0, flags: 0 },
      visible: false,
      seenAt: Number.NEGATIVE_INFINITY,
    };
    this.players.set(info.id, r);
    return r;
  }
}
