// pnpm bots [--count 100] [--url ws://localhost:8787/ws?room=main] [--chat 0.02] [--seconds 0]
// Headless visitors for load testing: they walk between random reachable spots on the mall's
// navgrid, chat and emote now and then, and report how much data each one receives.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { AVATARS } from '@shopping-mall/shared/avatars';
import { NET_HZ, PLAYER } from '@shopping-mall/shared/constants';
import { decodeNavGrid, type NavGrid } from '@shopping-mall/shared/navgrid';
import { EMOTES, encodeInput, packAnim } from '@shopping-mall/shared/protocol';

const { values } = parseArgs({
  options: {
    count: { type: 'string', default: '100' },
    url: { type: 'string', default: 'ws://localhost:8787/ws?room=main' },
    chat: { type: 'string', default: '0.02' }, // chance per bot per second
    seconds: { type: 'string', default: '0' }, // 0 = run until Ctrl+C
  },
});
const COUNT = Number(values.count);
const CHAT_RATE = Number(values.chat);
const LINES = [
  'hi!',
  'where is the coffee place?',
  'love this mall',
  'anyone here?',
  'see you at the fountain',
];
const COLORS = ['#e2b857', '#e76f51', '#2a9d8f', '#6d8bff', '#c77dff', '#f4f1ea'];

const buf = readFileSync(resolve(import.meta.dirname, '../client/public/assets/mall/navgrid.bin'));
const nav = decodeNavGrid(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const floor0 = [...(nav.cells[0] ?? [])].flatMap((v, i) => (v > 0 && v < 20 ? [i] : [])); // ground level cells

/** Can we walk straight from a to b on the ground floor? (sample every half cell) */
function clear(n: NavGrid, ax: number, az: number, bx: number, bz: number) {
  const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / (n.cell / 2));
  for (let s = 1; s <= steps; s++) {
    const i = n.index(ax + ((bx - ax) * s) / steps, az + ((bz - az) * s) / steps);
    if (!n.walkable(0, i) || n.height(0, i) > 0.3) return false;
  }
  return true;
}

function pickTarget(x: number, z: number): [number, number] {
  for (let tries = 0; tries < 30; tries++) {
    const [tx, tz] = nav.center(floor0[Math.floor(Math.random() * floor0.length)] as number);
    if (Math.hypot(tx - x, tz - z) > 3 && clear(nav, x, z, tx, tz)) return [tx, tz];
  }
  return [x, z];
}

let received = 0;
let joined = 0;
const start = performance.now();

function bot(n: number) {
  const ws = new WebSocket(values.url as string);
  ws.binaryType = 'arraybuffer';
  const [sx, sz] = nav.center(floor0[Math.floor(Math.random() * floor0.length)] as number);
  let x = sx;
  let z = sz;
  let [tx, tz] = pickTarget(x, z);
  let yaw = 0;
  let seq = 0;
  ws.onmessage = (e) => {
    received += typeof e.data === 'string' ? e.data.length : (e.data as ArrayBuffer).byteLength;
    if (typeof e.data === 'string' && e.data.includes('"welcome"')) joined++;
  };
  ws.onopen = () => {
    ws.send(
      JSON.stringify({
        t: 'join',
        name: `Bot ${n}`,
        look: { color: COLORS[n % COLORS.length], avatar: AVATARS[n % AVATARS.length] },
      }),
    );
    const speed = PLAYER.walkSpeed * (0.7 + Math.random() * 0.4);
    setInterval(() => {
      const dt = 1 / NET_HZ;
      const dx = tx - x;
      const dz = tz - z;
      const d = Math.hypot(dx, dz);
      if (d < 0.3) [tx, tz] = pickTarget(x, z);
      else {
        const k = Math.min(1, (speed * dt) / d);
        x += dx * k;
        z += dz * k;
        yaw = Math.atan2(-dx, -dz);
      }
      ws.send(encodeInput(seq++, { x, y: 0, z, yaw, anim: packAnim(d < 0.3 ? 0 : 1, speed), flags: 1 }));
      if (Math.random() < CHAT_RATE * dt) {
        if (Math.random() < 0.5)
          ws.send(JSON.stringify({ t: 'chat', text: LINES[Math.floor(Math.random() * LINES.length)] }));
        else ws.send(JSON.stringify({ t: 'emote', e: EMOTES[Math.floor(Math.random() * EMOTES.length)] }));
      }
    }, 1000 / NET_HZ);
  };
}

// stagger joins so the server sees arrivals, not a thundering herd
for (let i = 0; i < COUNT; i++) setTimeout(() => bot(i + 1), i * 20);

let lastReceived = 0;
setInterval(() => {
  const perClient = (received - lastReceived) / 1024 / 5 / Math.max(1, joined);
  lastReceived = received;
  console.log(`bots joined ${joined}/${COUNT} · down per client ${perClient.toFixed(1)} KB/s`);
}, 5000);
if (Number(values.seconds) > 0) setTimeout(() => process.exit(0), Number(values.seconds) * 1000);
void start;
