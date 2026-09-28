import type { Pose, ServerMessage } from '@shopping-mall/shared/protocol';
import { decodeSnapshot } from '@shopping-mall/shared/protocol';
import WebSocket from 'ws';

/** A scripted test client that records everything it receives. */
export class TestClient {
  readonly ws: WebSocket;
  readonly messages: ServerMessage[] = [];
  readonly snapshots: Map<number, Pose>[] = [];
  closed: { code: number } | null = null;

  constructor(port: number, room = 'main') {
    this.ws = new WebSocket(`ws://127.0.0.1:${port}/ws?room=${room}`);
    this.ws.binaryType = 'arraybuffer';
    this.ws.on('message', (data, isBinary) => {
      if (isBinary) {
        const players = new Map<number, Pose>();
        decodeSnapshot(data as ArrayBuffer, {} as Pose, (id, p) => players.set(id, { ...p }));
        this.snapshots.push(players);
      } else this.messages.push(JSON.parse(data.toString()));
    });
    this.ws.on('close', (code) => {
      this.closed = { code };
    });
  }

  open() {
    return new Promise<void>((resolve, reject) => {
      this.ws.once('open', () => resolve());
      this.ws.once('error', reject);
    });
  }

  send(msg: object) {
    this.ws.send(JSON.stringify(msg));
  }

  /** Wait until a message matching `pred` has arrived. */
  async waitFor<T extends ServerMessage>(pred: (m: ServerMessage) => m is T, ms?: number): Promise<T>;
  async waitFor(pred: (m: ServerMessage) => boolean, ms?: number): Promise<ServerMessage>;
  async waitFor(pred: (m: ServerMessage) => boolean, ms = 2000) {
    const t0 = Date.now();
    for (;;) {
      const m = this.messages.find(pred);
      if (m) return m;
      if (Date.now() - t0 > ms) throw new Error('timed out waiting for message');
      await sleep(10);
    }
  }

  async join(name: string, extra: object = {}) {
    await this.open();
    this.send({ t: 'join', name, look: { color: '#e2b857' }, ...extra });
    return this.waitFor((m): m is Extract<ServerMessage, { t: 'welcome' }> => m.t === 'welcome');
  }

  close() {
    this.ws.close();
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function until(cond: () => boolean, ms = 2000) {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('timed out');
    await sleep(10);
  }
}
