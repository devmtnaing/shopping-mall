import { encodeInput } from '@plaza/shared/protocol';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanName } from '../src/names';
import { startServer } from '../src/server';
import { TestClient, until } from './helpers';

let server: Awaited<ReturnType<typeof startServer>>;
const clients: TestClient[] = [];
const client = (room?: string) => {
  const c = new TestClient(server.port, room);
  clients.push(c);
  return c;
};

beforeEach(async () => {
  server = await startServer({ port: 0, tickHz: 30, joinTimeoutMs: 300 });
});
afterEach(async () => {
  for (const c of clients.splice(0)) c.close();
  await server.close();
});

describe('server', () => {
  it('reports health with the number of people online', async () => {
    await client().join('Aye');
    const res = await fetch(`http://127.0.0.1:${server.port}/health`);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(await res.json()).toMatchObject({ ok: true, online: 1, rooms: [{ name: 'main', players: 1 }] });
  });

  it('welcomes a player with the people already there, and tells them who joined', async () => {
    const a = client();
    const wa = await a.join('Aye');
    const b = client();
    const wb = await b.join('Bo');
    expect(wa.players).toEqual([]);
    expect(wb.players.map((p) => p.name)).toEqual(['Aye']);
    const presence = await a.waitFor((m) => m.t === 'presence');
    expect(presence).toMatchObject({ joined: [{ id: wb.id, name: 'Bo' }], left: [] });
  });

  it('streams one player’s movement to the others as snapshots', async () => {
    const a = client();
    await a.join('Aye');
    const b = client();
    const wb = await b.join('Bo');
    b.ws.send(encodeInput(1, { x: 3.21, y: 0, z: -12.5, yaw: 1, anim: 0x12, flags: 1 }));
    await until(() => a.snapshots.some((s) => s.has(wb.id)));
    const pose = a.snapshots.findLast((s) => s.has(wb.id))?.get(wb.id);
    expect(pose?.x).toBeCloseTo(3.21, 2);
    expect(pose?.z).toBeCloseTo(-12.5, 2);
    expect(b.snapshots.every((s) => !s.has(wb.id))).toBe(true); // you never receive yourself
  });

  it('tells the room when someone leaves', async () => {
    const a = client();
    await a.join('Aye');
    const b = client();
    const wb = await b.join('Bo');
    b.close();
    const presence = await a.waitFor((m) => m.t === 'presence' && m.left.length > 0);
    expect(presence).toMatchObject({ left: [wb.id] });
  });

  it('relays chat and emotes', async () => {
    const a = client();
    await a.join('Aye');
    const b = client();
    await b.join('Bo');
    b.send({ t: 'chat', text: '  hello  ' });
    b.send({ t: 'emote', e: '👋' });
    expect(await a.waitFor((m) => m.t === 'chat')).toMatchObject({ name: 'Bo', text: 'hello' });
    expect(await a.waitFor((m) => m.t === 'emote')).toMatchObject({ e: '👋' });
  });

  it('rejects bad names and closes sockets that never join', async () => {
    const a = client();
    await a.open();
    a.send({ t: 'join', name: ' x ', look: { color: '#000000' } });
    expect(await a.waitFor((m) => m.t === 'error')).toMatchObject({ code: 'bad-name' });
    await until(() => a.closed !== null, 1000);
    expect(a.closed?.code).toBe(4000);
  });

  it('keeps rooms separate', async () => {
    const a = client('main');
    await a.join('Aye');
    const b = client('friends');
    const wb = await b.join('Bo');
    expect(wb.room).toBe('friends');
    expect(wb.players).toEqual([]);
  });
});

describe('cleanName', () => {
  it('tidies and validates names', () => {
    expect(cleanName('  Mya   Mya ')).toBe('Mya Mya');
    expect(cleanName('a')).toBeNull();
    expect(cleanName('x'.repeat(21))).toBeNull();
    expect(cleanName('Bad‮name')).toBe('Badname'); // RTL override stripped
    expect(cleanName('မြတ်')).toBe('မြတ်');
  });
});
