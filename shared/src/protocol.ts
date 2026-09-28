// Wire protocol between client and server (docs/architecture.md § Networking).
//
// Binary frames carry movement, which happens 15× a second:
//   INPUT    client → server  12 bytes            [type][seq][body 9][pad]
//   SNAPSHOT server → client  4 + 11 bytes/player [type][tick u16][count] then [id u16][body 9]
// where body = x, y, z (i16, centimetres) · yaw (u8, 1/256 turn) · anim (u8) · flags (u8).
// Text frames carry everything rare (join, chat, emotes, presence) as JSON.
// Little-endian throughout.

export const MSG_INPUT = 1;
export const MSG_SNAPSHOT = 2;
export const INPUT_BYTES = 12;
export const BODY_BYTES = 9;
export const PLAYER_BYTES = 2 + BODY_BYTES;
export const SNAPSHOT_HEADER = 4;

/** Movement state of one player, as sent over the wire. */
export type Pose = { x: number; y: number; z: number; yaw: number; anim: number; flags: number };

/** Animation states packed into the high nibble of `anim`; the low nibble is speed in 0.5 m/s steps. */
export const ANIM = { idle: 0, walk: 1, run: 2, jump: 3, fall: 4, sit: 5 } as const;
export const FLAG_GROUNDED = 1;

const TAU = Math.PI * 2;
const cm = (m: number) => Math.max(-32768, Math.min(32767, Math.round(m * 100)));
const yawByte = (yaw: number) => ((Math.round((yaw / TAU) * 256) % 256) + 256) % 256;

export function packAnim(state: number, speed: number) {
  return ((state & 15) << 4) | Math.max(0, Math.min(15, Math.round(speed * 2)));
}
export function unpackAnim(anim: number) {
  return { state: anim >> 4, speed: (anim & 15) / 2 };
}

function writeBody(v: DataView, o: number, p: Pose) {
  v.setInt16(o, cm(p.x), true);
  v.setInt16(o + 2, cm(p.y), true);
  v.setInt16(o + 4, cm(p.z), true);
  v.setUint8(o + 6, yawByte(p.yaw));
  v.setUint8(o + 7, p.anim & 255);
  v.setUint8(o + 8, p.flags & 255);
}

function readBody(v: DataView, o: number, out: Pose): Pose {
  out.x = v.getInt16(o, true) / 100;
  out.y = v.getInt16(o + 2, true) / 100;
  out.z = v.getInt16(o + 4, true) / 100;
  out.yaw = (v.getUint8(o + 6) / 256) * TAU;
  out.anim = v.getUint8(o + 7);
  out.flags = v.getUint8(o + 8);
  return out;
}

/** Encode an INPUT into `buf` (reuse one buffer; nothing is allocated). */
export function encodeInput(seq: number, p: Pose, buf = new ArrayBuffer(INPUT_BYTES)): ArrayBuffer {
  const v = new DataView(buf);
  v.setUint8(0, MSG_INPUT);
  v.setUint8(1, seq & 255);
  writeBody(v, 2, p);
  v.setUint8(11, 0);
  return buf;
}

/** Decode an INPUT, or null if it's malformed. */
export function decodeInput(
  data: ArrayBufferView | ArrayBuffer,
  out: Pose,
): { seq: number; pose: Pose } | null {
  const v = toView(data);
  if (v.byteLength !== INPUT_BYTES || v.getUint8(0) !== MSG_INPUT) return null;
  return { seq: v.getUint8(1), pose: readBody(v, 2, out) };
}

/** Bytes needed for a snapshot of `count` players. */
export const snapshotBytes = (count: number) => SNAPSHOT_HEADER + count * PLAYER_BYTES;

/** Write a SNAPSHOT of `players` into `buf` (at least snapshotBytes(n) long). Returns the used length. */
export function encodeSnapshot(
  tick: number,
  players: readonly { id: number; pose: Pose }[],
  buf: ArrayBuffer,
): number {
  const v = new DataView(buf);
  const n = Math.min(players.length, 255);
  v.setUint8(0, MSG_SNAPSHOT);
  v.setUint16(1, tick & 0xffff, true);
  v.setUint8(3, n);
  for (let i = 0; i < n; i++) {
    const o = SNAPSHOT_HEADER + i * PLAYER_BYTES;
    const p = players[i] as { id: number; pose: Pose };
    v.setUint16(o, p.id, true);
    writeBody(v, o + 2, p.pose);
  }
  return snapshotBytes(n);
}

/** Read a SNAPSHOT, calling `each` per player. `scratch` is reused for every player (copy what you keep). */
export function decodeSnapshot(
  data: ArrayBufferView | ArrayBuffer,
  scratch: Pose,
  each: (id: number, pose: Pose) => void,
): number | null {
  const v = toView(data);
  if (v.byteLength < SNAPSHOT_HEADER || v.getUint8(0) !== MSG_SNAPSHOT) return null;
  const n = v.getUint8(3);
  if (v.byteLength < snapshotBytes(n)) return null;
  for (let i = 0; i < n; i++) {
    const o = SNAPSHOT_HEADER + i * PLAYER_BYTES;
    each(v.getUint16(o, true), readBody(v, o + 2, scratch));
  }
  return v.getUint16(1, true);
}

function toView(data: ArrayBufferView | ArrayBuffer): DataView {
  return data instanceof ArrayBuffer
    ? new DataView(data)
    : new DataView(data.buffer, data.byteOffset, data.byteLength);
}

// ---- JSON messages ---------------------------------------------------------------------------

/** How a visitor looks. Grows with outfits in Phase 2. */
export type Look = { color: string };
export type PlayerInfo = { id: number; name: string; look: Look; host?: boolean };

export type ClientMessage =
  | { t: 'join'; name: string; look: Look; resume?: string; hostToken?: string }
  | { t: 'chat'; text: string }
  | { t: 'emote'; e: string }
  | { t: 'teleport' }
  | { t: 'report'; id: number; reason?: string };

export type ServerMessage =
  | { t: 'welcome'; id: number; room: string; resume: string; players: PlayerInfo[] }
  | { t: 'presence'; joined: PlayerInfo[]; left: number[] }
  | { t: 'chat'; id: number; name: string; text: string; at: number; host?: boolean }
  | { t: 'emote'; id: number; e: string }
  | { t: 'announce'; text: string }
  /** Shops or mall details changed: refetch /api/content if your version is older. */
  | { t: 'content'; version: number }
  | { t: 'error'; code: 'bad-name' | 'rate' | 'full' | 'bad-token' | 'bad-message'; message: string };

/** Emotes anyone can send (keeps the wire and the UI in agreement). */
export const EMOTES = ['👋', '😂', '❤️', '🔥', '👍', '😮'] as const;
export const CHAT_MAX = 200;
export const NAME_MIN = 2;
export const NAME_MAX = 20;
