import { encodeInput, type Pose } from '@shopping-mall/shared/protocol';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RateLimit } from '../src/limits';
import { cleanChat, cleanName } from '../src/names';
import { startServer } from '../src/server';
import { sleep, TestClient, until } from './helpers';

let server: Awaited<ReturnType<typeof startServer>>;
const clients: TestClient[] = [];
const client = (room?: string) => {
  const c = new TestClient(server.port, room);
  clients.push(c);
  return c;
};

beforeEach(async () => {
  server = await startServer({ port: 0, tickHz: 30, joinTimeoutMs: 300, graceMs: 300, presenceMs: 100 });
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
    await a.waitFor((m) => m.t === 'presence' && m.joined.length > 0); // Bo's arrival is announced first
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

const at = (x: number, z: number, y = 0): Pose => ({ x, y, z, yaw: 0, anim: 0, flags: 1 });

describe('sessions', () => {
  it('resumes a dropped player silently: same id, no leave or join for the others', async () => {
    const a = client();
    await a.join('Aye');
    const b = client();
    const wb = await b.join('Bo');
    await a.waitFor((m) => m.t === 'presence');
    const before = a.messages.length;
    b.ws.terminate(); // network drop, no clean goodbye
    await sleep(100);
    const b2 = client();
    const again = await b2.join('ignored', { resume: wb.resume });
    expect(again.id).toBe(wb.id);
    await sleep(500); // longer than the grace period
    expect(a.messages.slice(before).filter((m) => m.t === 'presence')).toEqual([]);
  });

  it('removes a dropped player once the grace period runs out', async () => {
    const a = client();
    await a.join('Aye');
    const b = client();
    const wb = await b.join('Bo');
    b.ws.terminate();
    const presence = await a.waitFor((m) => m.t === 'presence' && m.left.includes(wb.id), 1500);
    expect(presence.t).toBe('presence');
  });

  it('says nothing about someone who joins and leaves within one batch', async () => {
    await server.close();
    server = await startServer({ port: 0, presenceMs: 1000 }); // wide window: join and leave land in one batch
    const a = client();
    await a.join('Aye');
    await sleep(1100); // let Aye's own join flush
    const before = a.messages.length;
    const b = client();
    await b.join('Bo');
    b.close(); // a clean goodbye leaves immediately, inside the same batch
    await sleep(1200);
    expect(a.messages.slice(before).filter((m) => m.t === 'presence')).toEqual([]);
  });
});

describe('scaling', () => {
  it('overflows a full room into room-2', async () => {
    await server.close();
    server = await startServer({ port: 0, capacity: 2, presenceMs: 100 });
    await client().join('Aye');
    await client().join('Bo');
    const third = await client().join('Cee');
    expect(third.room).toBe('main-2');
  });

  it('sends newcomers to the busiest room with space, not an emptier one', async () => {
    await server.close();
    server = await startServer({ port: 0, capacity: 3, presenceMs: 100 });
    // fill main, overflow two people into main-2, then free a seat in main
    const a = client();
    await a.join('Aa');
    const b = client();
    await b.join('Bb');
    const c = client();
    await c.join('Cc');
    expect((await client().join('Dd')).room).toBe('main-2');
    expect((await client().join('Ee')).room).toBe('main-2');
    a.close();
    await sleep(50);
    // main now has 2, main-2 has 2: either is fine, but it must not open main-3
    expect(['main', 'main-2']).toContain((await client().join('Ff')).room);
    // main-2 is busier than a fresh room would be: G joins whichever has space, never a new one
    expect(['main', 'main-2']).toContain((await client().join('Gg')).room);
    expect(server.rooms.has('main-3')).toBe(false);
  });

  it('sends each player only the nearest others', async () => {
    await server.close();
    server = await startServer({ port: 0, tickHz: 30, interest: 2, presenceMs: 100 });
    const me = client();
    await me.join('Me');
    me.ws.send(encodeInput(0, at(0, 0)));
    const ids: number[] = [];
    for (const [i, x] of [1, 2, 50, 60].entries()) {
      const c = client();
      const w = await c.join(`P${i}`);
      ids.push(w.id);
      c.ws.send(encodeInput(0, at(x, 0)));
    }
    await until(() => me.snapshots.some((s) => s.size === 2));
    const last = me.snapshots.findLast((s) => s.size === 2);
    expect([...(last?.keys() ?? [])].sort()).toEqual([ids[0], ids[1]].sort());
  });
});

describe('movement checks', () => {
  it('ignores an impossible jump across the mall, but allows an announced teleport', async () => {
    const a = client();
    await a.join('Aye');
    const b = client();
    const wb = await b.join('Bo');
    const last = () => a.snapshots.findLast((s) => s.has(wb.id))?.get(wb.id);
    b.ws.send(encodeInput(0, at(0, -5)));
    await until(() => last()?.z === -5);
    b.ws.send(encodeInput(1, at(0, -60))); // 55 m in one tick
    await sleep(150);
    expect(last()?.z).toBe(-5);
    b.send({ t: 'teleport' });
    await sleep(30);
    b.ws.send(encodeInput(2, at(0, -60)));
    await until(() => last()?.z === -60);
  });

  it('ignores positions far below or above the world', async () => {
    const a = client();
    await a.join('Aye');
    const b = client();
    const wb = await b.join('Bo');
    b.ws.send(encodeInput(0, at(0, -5)));
    await until(() => a.snapshots.some((s) => s.has(wb.id)));
    b.send({ t: 'teleport' });
    await sleep(30);
    b.ws.send(encodeInput(1, at(0, -5, -200)));
    await sleep(150);
    expect(a.snapshots.findLast((s) => s.has(wb.id))?.get(wb.id)?.y).toBe(0);
  });
});

describe('emotes', () => {
  it('reach people nearby, not the whole room', async () => {
    const near = client();
    await near.join('Near');
    const far = client();
    await far.join('Far');
    const me = client();
    await me.join('Me');
    near.ws.send(encodeInput(0, at(1, 0)));
    far.ws.send(encodeInput(0, at(0, -100)));
    me.ws.send(encodeInput(0, at(0, 0)));
    await sleep(100);
    me.send({ t: 'emote', e: '👋' });
    expect(await near.waitFor((m) => m.t === 'emote')).toMatchObject({ e: '👋' });
    await sleep(150);
    expect(far.messages.some((m) => m.t === 'emote')).toBe(false);
  });
});

describe('chat limits', () => {
  it('lets a burst through, then asks the sender to slow down', async () => {
    const a = client();
    await a.join('Aye');
    const b = client();
    await b.join('Bo');
    for (let i = 0; i < 5; i++) b.send({ t: 'chat', text: `msg ${i}` });
    expect(await b.waitFor((m) => m.t === 'error')).toMatchObject({ code: 'rate' });
    await sleep(100);
    expect(a.messages.filter((m) => m.t === 'chat')).toHaveLength(3);
  });

  it('caps and tidies messages', () => {
    expect(cleanChat('  hi\u200B   there ')).toBe('hi there');
    expect([...cleanChat('x'.repeat(500))]).toHaveLength(200);
  });

  it('refills over time', () => {
    const r = new RateLimit(1, 1, 0);
    expect(r.take(0)).toBe(true);
    expect(r.take(100)).toBe(false);
    expect(r.take(1100)).toBe(true);
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
