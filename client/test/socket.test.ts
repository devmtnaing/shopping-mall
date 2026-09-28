import { afterEach, describe, expect, it } from 'vitest';
import { startServer } from '../../server/src/server';
import { backoff, NetClient, type NetStatus } from '../src/net/socket';

const until = async (cond: () => boolean, ms = 3000) => {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 10));
  }
};

describe('backoff', () => {
  it('doubles from 0.5 s up to 8 s', () => {
    const mid = () => 0.5; // no jitter
    expect([0, 1, 2, 3, 4, 5, 9].map((n) => backoff(n, mid))).toEqual([
      500, 1000, 2000, 4000, 8000, 8000, 8000,
    ]);
  });

  it('adds up to ±20 % jitter so clients don’t all retry at once', () => {
    expect(backoff(2, () => 0)).toBe(1600);
    expect(backoff(2, () => 1)).toBeCloseTo(2400);
  });
});

describe('NetClient against a real server', () => {
  let server: Awaited<ReturnType<typeof startServer>> | null = null;
  afterEach(async () => {
    await server?.close();
    server = null;
  });

  function client(port: number) {
    const statuses: NetStatus[] = [];
    const net = new NetClient(`ws://127.0.0.1:${port}/ws?room=main`, {
      status: (s) => statuses.push(s),
      message: () => {},
      snapshotStart: () => {},
      snapshot: () => {},
    });
    return { net, statuses };
  }

  it('connects, joins and goes online', async () => {
    server = await startServer({ port: 0 });
    const { net, statuses } = client(server.port);
    net.connect('Mya', { color: '#e2b857' });
    await until(() => net.online);
    expect(statuses).toEqual(['connecting', 'online']);
    expect(net.selfId).toBeGreaterThan(0);
    net.disconnect();
  });

  it('reconnects and resumes the same player after the connection drops', async () => {
    server = await startServer({ port: 0 });
    const { net } = client(server.port);
    net.connect('Mya', { color: '#e2b857' });
    await until(() => net.online);
    const id = net.selfId;
    // kill the socket from the server side, like a network blip
    for (const room of server.rooms.values()) for (const p of room.players.values()) p.socket?.terminate();
    await until(() => net.status === 'reconnecting');
    await until(() => net.online, 4000);
    expect(net.selfId).toBe(id);
    net.disconnect();
  });

  it('stays in single-player mode with no server URL', () => {
    const net = new NetClient(null, {
      status: () => {},
      message: () => {},
      snapshotStart: () => {},
      snapshot: () => {},
    });
    net.connect('Mya', { color: '#e2b857' });
    expect(net.status).toBe('off');
  });
});
