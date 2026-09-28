// One shared space: its players, the snapshot broadcast (nearest players only), and batched presence.
import { encodeSnapshot, type PlayerInfo, type ServerMessage, snapshotBytes } from '@plaza/shared/protocol';
import type { Player } from './player.ts';

export class Room {
  readonly name: string;
  readonly capacity: number;
  /** Most players a client receives per snapshot: the nearest ones. */
  readonly interest: number;
  readonly players = new Map<number, Player>();
  tick = 0;
  private joined = new Map<number, PlayerInfo>();
  private left = new Set<number>();

  constructor(name: string, capacity: number, interest: number) {
    this.name = name;
    this.capacity = capacity;
    this.interest = interest;
  }

  get full() {
    return this.players.size >= this.capacity;
  }

  add(p: Player) {
    this.players.set(p.id, p);
    this.left.delete(p.id);
    this.joined.set(p.id, p.info);
  }

  remove(id: number) {
    this.players.delete(id);
    // joined and left within one batch: nobody needs to hear about it
    if (!this.joined.delete(id)) this.left.add(id);
  }

  broadcast(msg: ServerMessage, except?: number) {
    const text = JSON.stringify(msg);
    for (const p of this.players.values()) {
      if (p.id !== except && p.socket?.readyState === 1) p.socket.send(text);
    }
  }

  /** Send to everyone within `radius` metres of `from` (and `from` itself): emotes are local. */
  nearby(from: Player, radius: number, msg: ServerMessage) {
    const text = JSON.stringify(msg);
    const { x, y, z } = from.pose;
    for (const p of this.players.values()) {
      if (p.socket?.readyState !== 1) continue;
      const d = Math.hypot(p.pose.x - x, (p.pose.y - y) * 2, p.pose.z - z);
      if (p === from || d <= radius) p.socket.send(text);
    }
  }

  /** Send the batched joins and leaves (called every couple of seconds). */
  flushPresence() {
    if (this.joined.size === 0 && this.left.size === 0) return;
    const joined = [...this.joined.values()];
    const msg: ServerMessage = { t: 'presence', joined, left: [...this.left] };
    const text = JSON.stringify(msg);
    const newIds = new Set(this.joined.keys());
    for (const p of this.players.values()) {
      if (p.socket?.readyState !== 1) continue;
      // new arrivals already got everyone in their welcome; don't tell them about themselves
      if (newIds.has(p.id)) {
        if (joined.length > 1 || this.left.size > 0) {
          const own: ServerMessage = {
            t: 'presence',
            joined: joined.filter((j) => j.id !== p.id),
            left: [...this.left],
          };
          p.socket.send(JSON.stringify(own));
        }
      } else p.socket.send(text);
    }
    this.joined.clear();
    this.left.clear();
  }

  /** Advance one tick: send each connected player a snapshot of the nearest others. */
  step() {
    this.tick = (this.tick + 1) & 0xffff;
    const placed = [...this.players.values()].filter((p) => p.placed);
    for (const me of this.players.values()) {
      if (me.socket?.readyState !== 1) continue;
      const others = this.nearest(me, placed);
      if (others.length === 0) continue;
      // a fresh buffer per send: ws may hand it to the socket without copying
      const buf = new ArrayBuffer(snapshotBytes(others.length));
      encodeSnapshot(this.tick, others, buf);
      me.socket.send(buf);
    }
  }

  private nearest(me: Player, placed: Player[]): Player[] {
    const others = placed.filter((p) => p.id !== me.id);
    if (others.length <= this.interest) return others;
    const { x, y, z } = me.pose;
    // other floors count as further away (3× vertical weight)
    const d = (p: Player) => (p.pose.x - x) ** 2 + ((p.pose.y - y) * 3) ** 2 + (p.pose.z - z) ** 2;
    return others.sort((a, b) => d(a) - d(b)).slice(0, this.interest);
  }
}
