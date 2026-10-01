import { encodeInput, type Pose } from '@shopping-mall/shared/protocol';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RateLimit } from '../src/limits';
import { cleanChat, cleanName, uniqueName } from '../src/names';
import { startServer } from '../src/server';
import { sleep, TestClient, until } from './helpers';

let server: Awaited<ReturnType<typeof startServer>>;
const clients: TestClient[] = [];
const client = (room?: string, ip?: string) => {
  const c = new TestClient(server.port, room, ip);
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

  it('gives a second person with the same name a number, and tells them', async () => {
    const a = client();
    const wa = await a.join('Mingu');
    const b = client();
    const wb = await b.join('mingu');
    const c = client();
    const wc = await c.join('Mingu');
    expect([wa.name, wb.name, wc.name]).toEqual(['Mingu', 'mingu-2', 'Mingu-3']);
    expect(wc.players.map((p) => p.name)).toEqual(['Mingu', 'mingu-2']);
    // in another room the name is free
    const d = client('other');
    expect((await d.join('Mingu')).name).toBe('Mingu');
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
    server = await startServer({ port: 0, capacity: 2, maxPerIp: 100, presenceMs: 100 });
    await client().join('Aye');
    await client().join('Bo');
    const third = await client().join('Cee');
    expect(third.room).toBe('main-2');
  });

  it('sends newcomers to the busiest room with space, not an emptier one', async () => {
    await server.close();
    server = await startServer({ port: 0, capacity: 3, maxPerIp: 100, presenceMs: 100 });
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
    server = await startServer({ port: 0, tickHz: 30, interest: 2, maxPerIp: 100, presenceMs: 100 });
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

describe('apples', () => {
  it('relay a throw from where you stand, and drop one from elsewhere or too hard', async () => {
    const near = client();
    await near.join('Near');
    const me = client();
    await me.join('Me');
    near.ws.send(encodeInput(0, at(1, 0)));
    me.ws.send(encodeInput(0, at(0, 0)));
    await sleep(100);
    me.send({ t: 'throw', o: [0, 1.3, -0.4], v: [0, 4.5, -8.5] });
    expect(await near.waitFor((m) => m.t === 'throw')).toMatchObject({
      o: [0, 1.3, -0.4],
      v: [0, 4.5, -8.5],
    });
    me.send({ t: 'throw', o: [20, 1.3, 0], v: [0, 4.5, -8.5] }); // not where I am
    me.send({ t: 'throw', o: [0, 1.3, 0], v: [0, 0, -40] }); // far too hard
    await sleep(150);
    expect(near.messages.filter((m) => m.t === 'throw')).toHaveLength(1);
  });
});

describe('changing character', () => {
  it('tells the room your new look, remembers it for newcomers, and drops one that is not allowed', async () => {
    const a = client();
    await a.join('Aye');
    const b = client();
    const wb = await b.join('Bo');
    b.send({ t: 'look', look: { color: '#3a7bd5', avatar: 'student' } });
    expect(await a.waitFor((m) => m.t === 'look')).toMatchObject({
      id: wb.id,
      look: { color: '#3a7bd5', avatar: 'student' },
    });
    const c = client();
    const wc = await c.join('Cee');
    expect(wc.players.find((p: { id: number }) => p.id === wb.id)?.look.avatar).toBe('student');
    b.send({ t: 'look', look: { color: '#3a7bd5', avatar: 'dragon' } }); // not a character
    b.send({ t: 'look', look: { color: 'red' } }); // not a colour
    await sleep(150);
    expect(a.messages.filter((m) => m.t === 'look')).toHaveLength(1);
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

describe('uniqueName', () => {
  it('numbers a name someone already has, ignoring case, and keeps it within 20 characters', () => {
    expect(uniqueName('Mingu', [])).toBe('Mingu');
    expect(uniqueName('Mingu', ['Bo'])).toBe('Mingu');
    expect(uniqueName('Mingu', ['Mingu'])).toBe('Mingu-2');
    expect(uniqueName('mingu', ['Mingu', 'MINGU-2'])).toBe('mingu-3');
    expect(uniqueName('Mingu', ['Mingu', 'Mingu-3'])).toBe('Mingu-2'); // the first free number
    const long = 'Aung Kyaw Moe Thanta'; // 20, the most a name can have
    expect(uniqueName(long, [long])).toBe('Aung Kyaw Moe Than-2');
    expect(uniqueName('Aung Kyaw Moe Tha Z', ['Aung Kyaw Moe Tha Z'])).toBe('Aung Kyaw Moe Tha-2'); // no space before the number
    expect(uniqueName('မြတ်', ['မြတ်'])).toBe('မြတ်-2');
  });
});

describe('limits', () => {
  it('turns people away once the mall is full, and lets them in when someone leaves', async () => {
    await server.close();
    server = await startServer({ port: 0, maxPlayers: 3, maxPerIp: 100, presenceMs: 100 });
    const first = client();
    await first.join('Aa');
    await client().join('Bb');
    await client().join('Cc');
    const late = client();
    await late.open();
    late.send({ t: 'join', name: 'Dd', look: { color: '#e2b857' } });
    expect(await late.waitFor((m) => m.t === 'error')).toMatchObject({ code: 'full' });
    await until(() => late.closed !== null);
    expect(late.closed?.code).toBe(4002);
    const health = await (await fetch(`http://127.0.0.1:${server.port}/health`)).json();
    expect(health).toMatchObject({ online: 3, max: 3 });
    first.close(); // a deliberate goodbye frees the place straight away
    await sleep(50);
    expect((await client().join('Dd')).room).toBe('main');
  });

  it("limits connections from one address at once, by the visitor's address", async () => {
    await server.close();
    server = await startServer({ port: 0, maxPerIp: 2, presenceMs: 100 });
    await client('main', '1.1.1.1').join('Aa');
    await client('main', '1.1.1.1').join('Bb');
    const third = client('main', '1.1.1.1');
    expect(await third.waitFor((m) => m.t === 'error')).toMatchObject({ code: 'busy' });
    await until(() => third.closed !== null);
    expect(third.closed?.code).toBe(4001);
    await client('main', '2.2.2.2').join('Cc'); // someone else is fine
  });

  it("has no per-address limit with maxPerIp 0 (for proxies that hide visitors' addresses)", async () => {
    await server.close();
    server = await startServer({ port: 0, maxPerIp: 0, presenceMs: 100 });
    for (const name of ['Aa', 'Bb', 'Cc', 'Dd', 'Ee', 'Ff', 'Gg']) await client('main', '1.1.1.1').join(name);
    expect(server.rooms.get('main')?.players.size).toBe(7);
  });

  it('shows a newcomer what was said lately', async () => {
    const a = client();
    await a.join('Aye');
    a.send({ t: 'chat', text: 'hello mall' });
    await a.waitFor((m) => m.t === 'chat');
    const wb = await client().join('Bo');
    expect(wb.chat?.map((c) => [c.name, c.text])).toEqual([['Aye', 'hello mall']]);
  });
});

describe('away and idle', () => {
  const quick = { port: 0, presenceMs: 50, sweepMs: 25, awayAfterMs: 150, dropSilentMs: 600 };
  /** Keep sending input from `c` at `pose` every 40 ms (like a visible tab) until stopped. */
  const keepSending = (c: TestClient, pose: () => Pose) => {
    let seq = 0;
    const t = setInterval(() => c.ws.readyState === 1 && c.ws.send(encodeInput(seq++, pose())), 40);
    return () => clearInterval(t);
  };

  it('shows someone whose tab went quiet as away, and back again when it wakes', async () => {
    await server.close();
    server = await startServer({ ...quick, idleKickMs: 0 });
    const watcher = client();
    await watcher.join('Watch');
    const stopWatcher = keepSending(watcher, () => at(0, 0));
    const sleeper = client();
    const ws = await sleeper.join('Sleepy');
    sleeper.ws.send(encodeInput(0, at(2, 0))); // one input, then the tab goes to the background
    expect(await watcher.waitFor((m) => m.t === 'away' && m.id === ws.id)).toMatchObject({ away: true });
    sleeper.ws.send(encodeInput(1, at(2, 0))); // back
    expect(await watcher.waitFor((m) => m.t === 'away' && m.id === ws.id && !m.away)).toMatchObject({
      away: false,
    });
    stopWatcher();
  });

  it('takes someone silent for too long out of the mall, so their place frees up', async () => {
    await server.close();
    server = await startServer({ ...quick, idleKickMs: 0, maxPlayers: 1 });
    const gone = client();
    await gone.join('Gone');
    gone.ws.send(encodeInput(0, at(1, 0)));
    expect(await gone.waitFor((m) => m.t === 'error', 2000)).toMatchObject({ code: 'away' });
    await until(() => gone.closed !== null);
    expect(gone.closed?.code).toBe(4003);
    expect((await client().join('Next')).room).toBe('main'); // the place is free again
  });

  it('warns someone idle, then takes them out; moving keeps you in', async () => {
    await server.close();
    server = await startServer({ ...quick, dropSilentMs: 60_000, idleKickMs: 61_000 }); // warned at once
    const still = client();
    await still.join('Still');
    const stopStill = keepSending(still, () => at(1, 0)); // visible, but never moves
    const mover = client();
    await mover.join('Mover');
    let x = 0;
    const stopMover = keepSending(mover, () => {
      x += 0.05; // walking
      return at(x, 3);
    });
    expect(await still.waitFor((m) => m.t === 'idle')).toMatchObject({ t: 'idle' });
    await sleep(300);
    expect(mover.messages.some((m) => m.t === 'idle')).toBe(false);
    stopStill();
    stopMover();
  });

  it('takes out someone idle once their time is up', async () => {
    await server.close();
    server = await startServer({ ...quick, dropSilentMs: 60_000, idleKickMs: 400 });
    const still = client();
    await still.join('Still');
    const stop = keepSending(still, () => at(1, 0));
    expect(await still.waitFor((m) => m.t === 'error', 3000)).toMatchObject({ code: 'idle' });
    await until(() => still.closed !== null);
    expect(still.closed?.code).toBe(4004);
    stop();
  });
});
