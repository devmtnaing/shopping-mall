import type { Look, PlayerInfo, Pose } from '@shopping-mall/shared/protocol';
import type { WebSocket } from 'ws';
import { RateLimit } from './limits.ts';

export class Player {
  readonly id: number;
  readonly name: string;
  /** Changes when they pick another character mid-visit. */
  look: Look;
  host = false;
  socket: WebSocket | null;
  readonly pose: Pose = { x: 0, y: 0, z: 0, yaw: 0, anim: 0, flags: 0 };
  /** Has this player sent any movement yet? Players without a pose aren't in snapshots. */
  placed = false;
  /** Last time (ms) a movement input was accepted, for speed checks. */
  lastMoveAt = 0;
  /** Last time (ms) any input arrived. A visible tab sends 15 a second, even standing still. */
  lastInputAt = Date.now();
  /** Last time (ms) they moved, chatted or emoted, and where they were then. */
  lastActiveAt = Date.now();
  readonly activeAt = { x: 0, z: 0, yaw: 0 };
  /** Their tab has been quiet a while (it's in the background): others see them dimmed. */
  away = false;
  /** They've been told they'll leave the mall soon for being idle. */
  idleWarned = false;
  /** Chat: a burst of 3, then one message every 1.5 s. Emotes: a burst of 4, then 2 a second. */
  readonly chatLimit = new RateLimit(3, 1 / 1.5);
  readonly emoteLimit = new RateLimit(4, 2);
  /** Apples: a burst of 3, then one a second. */
  readonly throwLimit = new RateLimit(3, 1);
  /** Opening and closing doors. */
  readonly doorLimit = new RateLimit(4, 1);
  /** Changing character: a burst of 3, then one every 2 s. */
  readonly lookLimit = new RateLimit(3, 1 / 2);
  /** One report every 30 s. */
  readonly reportLimit = new RateLimit(1, 1 / 30);

  constructor(id: number, name: string, look: Look, socket: WebSocket) {
    this.id = id;
    this.name = name;
    this.look = look;
    this.socket = socket;
  }

  get info(): PlayerInfo {
    const info: PlayerInfo = { id: this.id, name: this.name, look: this.look };
    if (this.host) info.host = true;
    if (this.away) info.away = true;
    return info;
  }

  /** They did something: moved, chatted, emoted. */
  active(now = Date.now()) {
    this.lastActiveAt = now;
    this.idleWarned = false;
    this.activeAt.x = this.pose.x;
    this.activeAt.z = this.pose.z;
    this.activeAt.yaw = this.pose.yaw;
  }

  send(msg: object) {
    if (this.socket?.readyState === 1) this.socket.send(JSON.stringify(msg));
  }
}
