// One shared space: its players, the 15 Hz snapshot broadcast, and presence messages.
import { encodeSnapshot, type ServerMessage, snapshotBytes } from '@plaza/shared/protocol';
import type { Player } from './player.ts';

export class Room {
  readonly name: string;
  readonly capacity: number;
  readonly players = new Map<number, Player>();
  tick = 0;

  constructor(name: string, capacity: number) {
    this.name = name;
    this.capacity = capacity;
  }

  get full() {
    return this.players.size >= this.capacity;
  }

  add(p: Player) {
    this.players.set(p.id, p);
  }

  remove(id: number) {
    this.players.delete(id);
  }

  broadcast(msg: ServerMessage, except?: number) {
    const text = JSON.stringify(msg);
    for (const p of this.players.values()) {
      if (p.id !== except && p.socket?.readyState === 1) p.socket.send(text);
    }
  }

  /** Advance one tick: send every connected player a snapshot of everyone else. */
  step() {
    this.tick = (this.tick + 1) & 0xffff;
    const placed = [...this.players.values()].filter((p) => p.placed);
    for (const me of this.players.values()) {
      if (me.socket?.readyState !== 1) continue;
      const others = placed.filter((p) => p.id !== me.id);
      if (others.length === 0) continue;
      // a fresh buffer per send: ws may hand it to the socket without copying
      const buf = new ArrayBuffer(snapshotBytes(others.length));
      encodeSnapshot(this.tick, others, buf);
      me.socket.send(buf);
    }
  }
}
