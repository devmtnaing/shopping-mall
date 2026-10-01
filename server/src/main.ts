// Entry point: `pnpm dev:server` or `node server/src/main.ts`. Configure with environment variables.
import { parseConfig } from '@shopping-mall/shared/config';
import config from '../../mall.config.ts';
import { openDatabase } from './db/index.ts';
import { startMetrics } from './metrics.ts';
import { loadBlocklist } from './moderation.ts';
import { startServer } from './server.ts';
import { Storage } from './storage.ts';

const port = Number(process.env.PORT ?? 8787);
// optional: with DATABASE_URL the server owns live content (docs/adr/0006); without it, clients use mall.config.ts
const db = process.env.DATABASE_URL
  ? await openDatabase(process.env.DATABASE_URL, parseConfig(config))
  : null;
// optional: uploads go to S3-compatible storage (S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY)
const storage = Storage.fromEnv();
await storage?.ensureBucket();
const server = await startServer({
  port,
  capacity: Number(process.env.ROOM_CAPACITY ?? 100),
  maxPlayers: Number(process.env.MAX_PLAYERS ?? 20),
  maxPerIp: Number(process.env.MAX_PER_IP ?? 5),
  chatKeepDays: Number(process.env.CHAT_KEEP_DAYS ?? 30),
  chatShowMs: Number(process.env.CHAT_SHOW_MIN ?? 60) * 60_000,
  awayAfterMs: Number(process.env.AWAY_AFTER_S ?? 15) * 1000,
  dropSilentMs: Number(process.env.DROP_SILENT_S ?? 120) * 1000,
  idleKickMs: Number(process.env.IDLE_KICK_MIN ?? 15) * 60_000,
  blocklist: loadBlocklist(process.env.BLOCKLIST_FILE),
  reportWebhook: process.env.REPORT_WEBHOOK,
  hostSecret: process.env.HOST_SECRET || undefined,
  db: db ?? undefined,
  fallbackContent: parseConfig(config),
  storage,
  events: process.env.EVENTS !== 'off',
});
console.log(`shopping-mall server listening on :${server.port} (ws path /ws, health /health)`);
if (process.env.METRICS) {
  startMetrics(5000, () => ({
    rooms: server.rooms.size,
    players: [...server.rooms.values()].reduce((n, r) => n + r.players.size, 0),
  }));
}

const shutdown = async () => {
  await server.close();
  await db?.end();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
