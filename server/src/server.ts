// HTTP (health) + WebSocket server. One process, rooms in memory (docs/adr/0003).
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import type { MallConfig } from '@shopping-mall/shared/config';
import { NET_HZ } from '@shopping-mall/shared/constants';
import { renderDirectory } from '@shopping-mall/shared/directory';
import { parseClientMessage } from '@shopping-mall/shared/messages';
import {
  type ClientMessage,
  decodeInput,
  type Pose,
  type ServerMessage,
} from '@shopping-mall/shared/protocol';
import { type RawData, type WebSocket, WebSocketServer } from 'ws';
import { loadContent } from './db/content.ts';
import type { Sql } from './db/db.ts';
import { issueHostToken, secretMatches, verifyHostToken } from './host.ts';
import { contentApi } from './http/content-api.ts';
import { filesHandler } from './http/files.ts';
import { CORS, json } from './http/util.ts';
import { RateLimit } from './limits.ts';
import { type Blocklist, containsBlocked, fileReport, maskBlocked } from './moderation.ts';
import { plausibleMove } from './movement.ts';
import { cleanChat, cleanName } from './names.ts';
import { Player } from './player.ts';
import { Room } from './room.ts';
import type { Storage } from './storage.ts';

export type ServerOptions = {
  port?: number;
  tickHz?: number;
  /** Players per room before new arrivals go to <room>-2, <room>-3, … */
  capacity?: number;
  /** Nearest players each client receives per snapshot. */
  interest?: number;
  joinTimeoutMs?: number;
  /** How long a dropped player keeps their place, waiting to resume. */
  graceMs?: number;
  /** How often join/leave notices are batched and sent. */
  presenceMs?: number;
  /** Words to mask in chat and refuse in names. */
  blocklist?: Blocklist;
  /** POST reports here as JSON (they're always logged too). */
  reportWebhook?: string;
  /** Enables the host role: typing this on the landing screen signs you in as host. */
  hostSecret?: string;
  /** Content database; without it there's no /api and clients use mall.config.ts. */
  db?: Sql;
  /** Public URL for an uploaded asset id (storage arrives in T-703). */
  assetUrl?: (id: string) => string;
  /** Object storage for uploads (S3-compatible). */
  storage?: Storage | null;
  /** Content to show when there's no database (the directory page uses it). */
  fallbackContent?: MallConfig;
};

const ROOM_NAME = /^[a-z0-9-]{1,32}$/;
const TELEPORT_WINDOW = 3000;
const TELEPORT_COOLDOWN = 2000;
/** Emotes reach people within this many metres. */
const EMOTE_RADIUS = 40;

type Session = { player: Player; room: Room; timer: NodeJS.Timeout | null };

export async function startServer(opts: ServerOptions = {}) {
  const {
    port = 0,
    tickHz = NET_HZ,
    capacity = 100,
    interest = 40,
    joinTimeoutMs = 5000,
    graceMs = 30_000,
    presenceMs = 2000,
    blocklist = { words: [] },
    reportWebhook,
    hostSecret,
    db,
    assetUrl = (id: string) => `/assets/${id}`,
    storage = null,
    fallbackContent,
  } = opts;
  const files = filesHandler(storage);
  /** Host sign-in attempts per IP: 5, then one a minute. */
  const signInLimits = new Map<string, RateLimit>();
  const rooms = new Map<string, Room>();
  const sessions = new Map<string, Session>();
  let nextId = 1;
  const newId = () => {
    const id = nextId;
    nextId = nextId >= 65535 ? 1 : nextId + 1;
    return id;
  };

  // live content API, when there's a database (docs/adr/0006)
  const api = db
    ? contentApi({
        sql: db,
        assetUrl,
        storage,
        isHost: (token) => !!hostSecret && !!token && verifyHostToken(hostSecret, token),
        // tell every connected visitor that content changed (they refetch it)
        onChange: (version) => {
          for (const room of rooms.values()) room.broadcast({ t: 'content', version });
        },
      })
    : null;

  const http = createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS).end();
      return;
    }
    if (api && (await api(req, res))) return;
    if (await files(req, res)) return;
    // the plain-HTML shop directory, always current (live from the database when there is one)
    if ((req.url === '/directory/' || req.url === '/directory') && (db || fallbackContent)) {
      const cfg = db ? (await loadContent(db, assetUrl)).config : (fallbackContent as MallConfig);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
      res.end(renderDirectory(cfg));
      return;
    }
    if (req.url === '/health') {
      const list = [...rooms.values()].map((r) => ({ name: r.name, players: r.players.size }));
      const host = [...rooms.values()].some((r) => [...r.players.values()].some((p) => p.host && p.socket));
      json(res, 200, {
        ok: true,
        online: list.reduce((n, r) => n + r.players, 0),
        rooms: list,
        host,
        hostLogin: !!hostSecret,
      });
      return;
    }
    if (req.url === '/host-token' && req.method === 'POST') return hostSignIn(req, res);
    res.writeHead(404).end();
  });

  function hostSignIn(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) {
    if (!hostSecret) return json(res, 404, { error: 'Host sign-in is not set up on this server.' });
    const ip = req.socket.remoteAddress ?? '?';
    let limit = signInLimits.get(ip);
    if (!limit) {
      if (signInLimits.size > 10_000) signInLimits.clear(); // don't grow forever
      limit = new RateLimit(5, 1 / 60);
      signInLimits.set(ip, limit);
    }
    if (!limit.take()) return json(res, 429, { error: 'Too many tries. Wait a minute.' });
    let body = '';
    req.on('data', (c: Buffer) => {
      body += c;
      if (body.length > 1024) req.destroy();
    });
    req.on('end', () => {
      let secret = '';
      try {
        secret = String((JSON.parse(body) as { secret?: unknown }).secret ?? '');
      } catch {
        /* treated as a wrong secret */
      }
      if (!secretMatches(hostSecret, secret)) return json(res, 401, { error: 'That password is not right.' });
      json(res, 200, { token: issueHostToken(hostSecret) });
    });
  }

  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
  http.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (url.pathname !== '/ws') return socket.destroy();
    const wanted = url.searchParams.get('room') ?? 'main';
    const roomName = ROOM_NAME.test(wanted) ? wanted : 'main';
    wss.handleUpgrade(req, socket, head, (ws) => connect(ws, roomName));
  });

  /**
   * Where a newcomer to `base` goes: the busiest of base, base-2, base-3… that still has space,
   * so people end up together instead of spread over half-empty rooms. A new overflow room is
   * opened only when every existing one is full.
   */
  function roomFor(base: string) {
    const family = (name: string) =>
      name === base || (name.startsWith(`${base}-`) && /^\d+$/.test(name.slice(base.length + 1)));
    let best: Room | null = null;
    for (const room of rooms.values()) {
      if (family(room.name) && !room.full && (!best || room.players.size > best.players.size)) best = room;
    }
    if (best) return best;
    for (let n = 1; ; n++) {
      const name = n === 1 ? base : `${base}-${n}`;
      if (rooms.has(name)) continue;
      const room = new Room(name, capacity, interest);
      rooms.set(name, room);
      return room;
    }
  }

  function dropPlayer(s: Session) {
    s.room.remove(s.player.id);
    for (const [token, other] of sessions) if (other === s) sessions.delete(token);
    if (s.room.players.size === 0) {
      s.room.flushPresence();
      rooms.delete(s.room.name);
    }
  }

  function connect(ws: WebSocket, roomName: string) {
    ws.binaryType = 'arraybuffer';
    let session: Session | null = null;
    let teleportUntil = 0;
    let lastTeleport = 0;
    const scratch: Pose = { x: 0, y: 0, z: 0, yaw: 0, anim: 0, flags: 0 };
    const sendError = (code: Extract<ServerMessage, { t: 'error' }>['code'], message: string) =>
      ws.send(JSON.stringify({ t: 'error', code, message } satisfies ServerMessage));

    const joinTimer = setTimeout(() => ws.close(4000, 'join timeout'), joinTimeoutMs);

    ws.on('message', (data: RawData, isBinary: boolean) => {
      if (isBinary) {
        if (session) move(session.player, data as ArrayBuffer);
        return;
      }
      const msg = parseClientMessage(data.toString());
      if (!msg) return sendError('bad-message', 'That message was not understood.');
      if (msg.t === 'join') return join(msg);
      if (!session) return;
      if (msg.t === 'teleport') {
        const now = Date.now();
        if (now - lastTeleport >= TELEPORT_COOLDOWN) {
          lastTeleport = now;
          teleportUntil = now + TELEPORT_WINDOW;
        }
        return;
      }
      handle(msg, session.player, session.room);
    });

    function move(player: Player, data: ArrayBuffer) {
      const input = decodeInput(data, scratch);
      if (!input) return;
      const now = Date.now();
      const teleport = now < teleportUntil;
      // the first position after joining can be anywhere (spawn point, shared link)
      if (player.placed && !plausibleMove(player.pose, input.pose, now - player.lastMoveAt, teleport)) return;
      if (teleport && player.placed) teleportUntil = 0; // one jump per announcement
      Object.assign(player.pose, input.pose);
      player.placed = true;
      player.lastMoveAt = now;
    }

    function join(msg: Extract<ClientMessage, { t: 'join' }>) {
      if (session) return;
      // resuming after a dropped connection: same player, same place, no join/leave noise
      const resumed = msg.resume ? sessions.get(msg.resume) : undefined;
      if (resumed) {
        clearTimeout(joinTimer);
        if (resumed.timer) clearTimeout(resumed.timer);
        resumed.timer = null;
        resumed.player.socket?.terminate();
        resumed.player.socket = ws;
        session = resumed;
        welcome(resumed, msg.resume as string);
        return;
      }
      const name = cleanName(msg.name);
      if (!name || containsBlocked(blocklist, name)) {
        sendError('bad-name', 'Names need 2 to 20 letters.');
        return;
      }
      clearTimeout(joinTimer);
      if (msg.hostToken && !(hostSecret && verifyHostToken(hostSecret, msg.hostToken))) {
        sendError('bad-token', 'Your host sign-in has expired. Sign in again.');
        return;
      }
      const room = roomFor(roomName);
      const player = new Player(newId(), name, msg.look, ws);
      player.host = !!msg.hostToken;
      room.add(player);
      const token = randomBytes(18).toString('base64url');
      session = { player, room, timer: null };
      sessions.set(token, session);
      welcome(session, token);
    }

    function welcome(s: Session, token: string) {
      const others = [...s.room.players.values()].filter((p) => p !== s.player).map((p) => p.info);
      s.player.send({
        t: 'welcome',
        id: s.player.id,
        room: s.room.name,
        resume: token,
        players: others,
      } satisfies ServerMessage);
    }

    ws.on('close', (code: number) => {
      clearTimeout(joinTimer);
      const s = session;
      if (!s || s.player.socket !== ws) return; // replaced by a resumed connection
      s.player.socket = null;
      // a deliberate goodbye leaves now: 1000, or 1005 (close() called without a code).
      // A dropped network shows up as 1006, so that waits for the player to resume.
      if (code === 1000 || code === 1005) dropPlayer(s);
      else s.timer = setTimeout(() => dropPlayer(s), graceMs);
    });
  }

  function handle(msg: ClientMessage, player: Player, room: Room) {
    if (msg.t === 'chat') {
      const text = maskBlocked(blocklist, cleanChat(msg.text));
      if (!text) return;
      // hosts can announce to the whole room
      if (player.host && text.startsWith('/announce ')) {
        const announcement = text.slice('/announce '.length).trim();
        if (announcement) room.broadcast({ t: 'announce', text: announcement });
        return;
      }
      if (!player.chatLimit.take()) {
        player.send({ t: 'error', code: 'rate', message: 'Slow down a little.' } satisfies ServerMessage);
        return;
      }
      const at = Date.now();
      room.rememberChat(player.name, text, at);
      room.broadcast({
        t: 'chat',
        id: player.id,
        name: player.name,
        text,
        at,
        host: player.host || undefined,
      });
    } else if (msg.t === 'report') {
      const target = room.players.get(msg.id);
      if (!target || target === player || !player.reportLimit.take()) return;
      void fileReport(
        {
          at: new Date().toISOString(),
          room: room.name,
          reporter: { id: player.id, name: player.name },
          reported: { id: target.id, name: target.name },
          reason: cleanChat(msg.reason ?? ''),
          recentChat: room.recentChat.slice(-20),
        },
        reportWebhook,
      );
    } else if (msg.t === 'emote') {
      if (player.emoteLimit.take())
        room.nearby(player, EMOTE_RADIUS, { t: 'emote', id: player.id, e: msg.e });
    }
  }

  const ticker = setInterval(() => {
    for (const room of rooms.values()) room.step();
  }, 1000 / tickHz);
  const presence = setInterval(() => {
    for (const room of rooms.values()) room.flushPresence();
  }, presenceMs);

  await new Promise<void>((resolve) => http.listen(port, resolve));
  const address = http.address();
  return {
    port: typeof address === 'object' && address ? address.port : port,
    rooms,
    async close() {
      clearInterval(ticker);
      clearInterval(presence);
      for (const s of sessions.values()) if (s.timer) clearTimeout(s.timer);
      for (const ws of wss.clients) ws.terminate();
      wss.close();
      await new Promise<void>((resolve) => http.close(() => resolve()));
    },
  };
}
