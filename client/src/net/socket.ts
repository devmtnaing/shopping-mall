// Connection to the multiplayer server. The mall works without it: if there's no server
// configured, or it can't be reached, you explore on your own and it keeps retrying quietly.
import {
  decodeSnapshot,
  encodeInput,
  INPUT_BYTES,
  type Look,
  type Pose,
  type ServerMessage,
} from '@shopping-mall/shared/protocol';

export type NetStatus = 'off' | 'connecting' | 'online' | 'reconnecting' | 'offline';

/** Retry delay for the nth failed attempt: 0.5, 1, 2, 4, 8, 8… seconds, ±20 % jitter. */
export function backoff(attempt: number, random = Math.random): number {
  const base = Math.min(8000, 500 * 2 ** attempt);
  return base * (0.8 + random() * 0.4);
}

/** After this many failed attempts in a row we call it "offline" (and keep retrying slowly). */
const OFFLINE_AFTER = 5; // 0.5 + 1 + 2 + 4 s ≈ 7.5 s of trying before we say "offline"

export type NetEvents = {
  status: (s: NetStatus) => void;
  message: (m: ServerMessage) => void;
  /** A snapshot is starting (its server tick); then one `snapshot` call per player in it. */
  snapshotStart: (tick: number) => void;
  /** `pose` is reused between calls, so copy what you keep. */
  snapshot: (id: number, pose: Pose) => void;
};

export class NetClient {
  status: NetStatus = 'off';
  selfId = 0;
  room = '';
  private ws: WebSocket | null = null;
  private resume = '';
  private attempt = 0;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private join: { name: string; look: Look; hostToken?: string } | null = null;
  private seq = 0;
  private readonly inputBuf = new ArrayBuffer(INPUT_BYTES);
  private readonly scratch: Pose = { x: 0, y: 0, z: 0, yaw: 0, anim: 0, flags: 0 };
  private readonly url: string | null;
  private readonly on: NetEvents;

  constructor(url: string | null, on: NetEvents) {
    this.url = url;
    this.on = on;
  }

  get online() {
    return this.status === 'online';
  }

  /** Start (or keep) a connection as this visitor. No-op without a server URL. */
  connect(name: string, look: Look, hostToken?: string) {
    this.join = { name, look, hostToken };
    if (!this.url || this.ws) return;
    this.open();
  }

  /** Leave on purpose (tab closed / hidden): the server removes us straight away. */
  disconnect() {
    if (this.retry) clearTimeout(this.retry);
    this.retry = null;
    const ws = this.ws;
    this.ws = null;
    ws?.close(1000);
    this.setStatus('off');
  }

  sendInput(pose: Pose) {
    if (this.status !== 'online' || this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(encodeInput(this.seq++, pose, this.inputBuf));
  }

  send(msg: object) {
    if (this.status === 'online' && this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  private open() {
    if (!this.url || !this.join) return;
    this.setStatus(
      this.attempt === 0 ? 'connecting' : this.attempt >= OFFLINE_AFTER ? 'offline' : 'reconnecting',
    );
    const ws = new WebSocket(this.url);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    ws.onopen = () => {
      const j = this.join;
      if (j) ws.send(JSON.stringify({ t: 'join', ...j, resume: this.resume || undefined }));
    };
    ws.onmessage = (e: MessageEvent) => {
      if (typeof e.data === 'string') return this.onText(e.data);
      const data = e.data as ArrayBuffer;
      if (data.byteLength < 4) return;
      this.on.snapshotStart(new DataView(data).getUint16(1, true));
      decodeSnapshot(data, this.scratch, this.on.snapshot);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return; // we closed it on purpose
      this.ws = null;
      this.attempt++;
      this.setStatus(this.attempt >= OFFLINE_AFTER ? 'offline' : 'reconnecting');
      this.retry = setTimeout(() => this.open(), backoff(this.attempt - 1));
    };
  }

  private onText(text: string) {
    let msg: ServerMessage;
    try {
      msg = JSON.parse(text) as ServerMessage;
    } catch {
      return;
    }
    if (msg.t === 'welcome') {
      this.selfId = msg.id;
      this.room = msg.room;
      this.resume = msg.resume;
      this.attempt = 0;
      this.setStatus('online');
    }
    this.on.message(msg);
  }

  private setStatus(s: NetStatus) {
    if (s === this.status) return;
    this.status = s;
    this.on.status(s);
  }
}

/**
 * Where the server lives: VITE_MALL_WS at build time (an absolute wss:// URL, or a path like
 * "/ws" when the server sits behind the same host), or port 8787 on this host in development.
 */
export function serverUrl(room: string): string | null {
  const env = import.meta.env.VITE_MALL_WS as string | undefined;
  const base = env || (import.meta.env.DEV ? `ws://${location.hostname}:8787/ws` : null);
  if (!base) return null;
  const sameHost = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`;
  const url = new URL(base, sameHost);
  url.searchParams.set('room', room);
  return url.toString();
}

/** The server's HTTP address for `path` (which may include a ?query), or null without a server. */
export function httpUrl(path: string): string | null {
  const ws = serverUrl('main');
  if (!ws) return null;
  const url = new URL(ws);
  url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
  const [pathname = '/', query] = path.split('?');
  url.pathname = pathname;
  url.search = query ? `?${query}` : '';
  return url.toString();
}

export type Health = { online: number; host: boolean; hostLogin: boolean };

/** Who's in the mall right now (for the landing screen), or null if there's no server to ask. */
export async function health(): Promise<Health | null> {
  const url = httpUrl('/health');
  if (!url) return null;
  try {
    const body = (await (await fetch(url, { signal: AbortSignal.timeout(3000) })).json()) as Partial<Health>;
    return { online: body.online ?? 0, host: !!body.host, hostLogin: !!body.hostLogin };
  } catch {
    return null;
  }
}

/** Trade the host password for a signed token. Kept in memory only, never in storage. */
export async function signInAsHost(secret: string): Promise<{ token?: string; error?: string }> {
  const url = httpUrl('/host-token');
  if (!url) return { error: 'No server.' };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret }),
      signal: AbortSignal.timeout(5000),
    });
    return (await res.json()) as { token?: string; error?: string };
  } catch {
    return { error: 'Could not reach the server.' };
  }
}
