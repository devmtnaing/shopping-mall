import type { Look, PlayerInfo, Pose } from '@plaza/shared/protocol';
import type { WebSocket } from 'ws';

export class Player {
  readonly id: number;
  readonly name: string;
  readonly look: Look;
  host = false;
  socket: WebSocket | null;
  readonly pose: Pose = { x: 0, y: 0, z: 0, yaw: 0, anim: 0, flags: 0 };
  /** Has this player sent any movement yet? Players without a pose aren't in snapshots. */
  placed = false;
  /** Last time (ms) a movement input was accepted, for speed checks. */
  lastMoveAt = 0;

  constructor(id: number, name: string, look: Look, socket: WebSocket) {
    this.id = id;
    this.name = name;
    this.look = look;
    this.socket = socket;
  }

  get info(): PlayerInfo {
    return this.host
      ? { id: this.id, name: this.name, look: this.look, host: true }
      : { id: this.id, name: this.name, look: this.look };
  }

  send(msg: object) {
    if (this.socket?.readyState === 1) this.socket.send(JSON.stringify(msg));
  }
}
