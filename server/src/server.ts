// HTTP (health) + WebSocket server. One process, rooms in memory (docs/adr/0003).
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import type { MallConfig } from '@shopping-mall/shared/config';
import { NET_HZ } from '@shopping-mall/shared/constants';
import { renderDirectory } from '@shopping-mall/shared/directory';
import { parseClientMessage } from '@shopping-mall/shared/messages';
import {
  APPLE,
  type ClientMessage,
  decodeInput,
  type Pose,
  type ServerMessage,
} from '@shopping-mall/shared/protocol';
import { type RawData, type WebSocket, WebSocketServer } from 'ws';
import { pruneChat, recentChat, saveChat } from './db/chat.ts';
import { contentVersion, loadContent } from './db/content.ts';
import type { Sql } from './db/db.ts';
import { requestedSlots } from './db/rentals.ts';
import { eventsHandler } from './events.ts';
import { issueHostToken, secretMatches, verifyHostToken } from './host.ts';
import { contentApi } from './http/content-api.ts';
import { filesHandler } from './http/files.ts';
import { CORS, json } from './http/util.ts';
import { PerIpLimit, RateLimit } from './limits.ts';
import type { Mailer } from './mail.ts';
import { type Blocklist, containsBlocked, fileReport, maskBlocked } from './moderation.ts';
import { plausibleMove } from './movement.ts';
import { cleanChat, cleanName, uniqueName } from './names.ts';
import { Player } from './player.ts';
import { notifyRental } from './rentals.ts';
import { Room } from './room.ts';
import type { Storage } from './storage.ts';

export type ServerOptions = {
  port?: number;
  tickHz?: number;
  /** Players per room before new arrivals go to <room>-2, <room>-3, … */
  capacity?: number;
  /** The most people in the whole mall at once; anyone else is told it's full (MAX_PLAYERS). */
  maxPlayers?: number;
  /** The most connections at once from one IP address (MAX_PER_IP); 0 for no limit. */
  maxPerIp?: number;
  /** Days of chat history to keep in the database (CHAT_KEEP_DAYS). */
  chatKeepDays?: number;
  /** Newcomers see messages from this far back at most (ms, CHAT_SHOW_MIN): not last week's. */
  chatShowMs?: number;
  /** No input for this long (ms) and a player shows as away: their tab's in the background. */
  awayAfterMs?: number;
  /** No input for this long (ms) and they leave the mall: a background tab, or a dead connection. */
  dropSilentMs?: number;
  /** Visible but not moving, chatting or emoting for this long (ms) and they leave; 0 never. */
  idleKickMs?: number;
  /** How often to check for away and idle players (ms). */
  sweepMs?: number;
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
  /** POST rental applications here as JSON (they're always in /admin too). */
  rentalWebhook?: string;
  /** Enables the host role: typing this on the landing screen signs you in as host. */
  hostSecret?: string;
  /** Emails set-password links to new shop owners (mail.ts); without it the host sends them. */
  mailer?: Mailer | null;
  /** The mall's public address (PUBLIC_URL), for links in emails. */
  publicUrl?: string;
  /** RESEND_WEBHOOK_SECRET: lets the mail provider report bounces and deliveries (mail-events.ts). */
  mailWebhookSecret?: string;
  /** Content database; without it there's no /api and clients use mall.config.ts. */
  db?: Sql;
  /** Public URL for an uploaded asset id (storage arrives in T-703). */
  assetUrl?: (id: string) => string;
  /** Object storage for uploads (S3-compatible). */
  storage?: Storage | null;
  /** Content to show when there's no database (the directory page uses it). */
  fallbackContent?: MallConfig;
  /** Log anonymous usage events from POST /api/events (default on; EVENTS=off in main.ts). */
  events?: boolean;
  /** Where event lines go (tests capture them). */
  eventLog?: (line: string) => void;
  /** HTTP requests per IP: a burst, then this many a second (default 120, then 20 a second). */
  requestLimit?: { burst: number; perSecond: number };
  /** New WebSocket connections per IP: a burst, then this many a second (default 10, then one every 2 s). */
  connectLimit?: { burst: number; perSecond: number };
};

const ROOM_NAME = /^[a-z0-9-]{1,32}$/;
/** Messages of history a newcomer sees. */
const HISTORY = 20;

/**
 * The visitor's IP address. Behind the web container, nginx passes it as X-Client-IP (from
 * Cloudflare's or Railway's header, see client/nginx.conf.template); run bare, it's the socket's.
 */
function clientIp(req: import('node:http').IncomingMessage): string {
  const h = req.headers['x-client-ip'];
  return (typeof h === 'string' && h.trim()) || req.socket.remoteAddress || '?';
}
const TELEPORT_WINDOW = 3000;
const TELEPORT_COOLDOWN = 2000;
/** Emotes reach people within this many metres. */
const EMOTE_RADIUS = 40;

type Session = { player: Player; room: Room; timer: NodeJS.Timeout | null; dropped?: boolean };
/** How long before an idle player leaves they're warned (ms). */
const IDLE_WARNING = 60_000;

export async function startServer(opts: ServerOptions = {}) {
  const {
    port = 0,
    tickHz = NET_HZ,
    capacity = 100,
    maxPlayers = 20,
    maxPerIp = 5,
    chatKeepDays = 30,
    chatShowMs = 60 * 60_000,
    awayAfterMs = 15_000,
    dropSilentMs = 120_000,
    idleKickMs = 15 * 60_000,
    sweepMs = 5000,
    interest = 40,
    joinTimeoutMs = 5000,
    graceMs = 30_000,
    presenceMs = 2000,
    blocklist = { words: [] },
    reportWebhook,
    rentalWebhook,
    hostSecret,
    db,
    assetUrl = (id: string) => `/assets/${id}`,
    storage = null,
    fallbackContent,
    events = true,
    eventLog,
    requestLimit = { burst: 120, perSecond: 20 },
    connectLimit = { burst: 10, perSecond: 0.5 },
  } = opts;
  // Rate limits, per IP (clientIp) and, for the writes, from everyone together too. They're the
  // server's own floor under abuse; nginx (client/nginx.conf.template) and Cloudflare shed most of
  // a flood before it gets here (docs/deploy.md, "Abuse and floods").
  /** Every HTTP request but /health: a generous backstop that only a script hits. */
  const requests = new PerIpLimit(requestLimit.burst, requestLimit.perSecond);
  /** New WebSocket connections: reconnecting backs off, so 10 at once, then one every 2 s is plenty. */
  const connects = new PerIpLimit(connectLimit.burst, connectLimit.perSecond);
  /** Usage events: a tab sends a batch every 30 s at most, so 10, then one every 10 s. */
  const beacons = new PerIpLimit(10, 1 / 10);
  /** Host sign-in attempts per IP: 5, then one a minute; and 30 a minute from everyone together. */
  const hostSignIns = new PerIpLimit(5, 1 / 60, new RateLimit(30, 30 / 60));
  /**
   * Public writes to the API. Rental applications: 3, then one every 20 minutes (60 an hour in
   * all). Shop owners signing in or using an invite link: 5, then one a minute (60 a minute in all).
   */
  const apiLimits = {
    rental: new PerIpLimit(3, 1 / 1200, new RateLimit(60, 60 / 3600)),
    'sign-in': new PerIpLimit(5, 1 / 60, new RateLimit(60, 1)),
  };
  const allow = (req: import('node:http').IncomingMessage, what: keyof typeof apiLimits) =>
    apiLimits[what].take(clientIp(req));
  const files = filesHandler(storage);
  const usage = eventsHandler(events, eventLog, (req) => beacons.take(clientIp(req)));
  /** Open connections per IP address. */
  const perIp = new Map<string, number>();
  /**
   * Someone was turned away for too many connections from one address. Usually that's one person
   * or a script, but if it keeps happening the server may be seeing a proxy's address for everyone:
   * say so in the log, at most every 10 minutes (without the address).
   */
  let warnedAt = 0;
  const warnBusy = () => {
    const now = Date.now();
    if (now - warnedAt < 600_000) return;
    warnedAt = now;
    console.warn(
      `limits: turned a connection away, ${maxPerIp} already open from one address. If ordinary visitors ` +
        "are being turned away, the server is probably seeing your proxy or CDN's address: set " +
        'CLIENT_IP_FROM on the web service (docs/deploy.md, "Behind a proxy or CDN"), or MAX_PER_IP=0.',
    );
  };
  /** Everyone in the mall, including people who dropped and may come back (they keep their place). */
  const peopleIn = () => [...rooms.values()].reduce((n, r) => n + r.players.size, 0);
  // chat history: prune what's past its time now and every day
  const prune = () => {
    if (db) pruneChat(db, chatKeepDays).catch((e) => console.warn('chat: prune failed:', e));
  };
  prune();
  const pruneTimer = setInterval(prune, 24 * 3600 * 1000);
  pruneTimer.unref();
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
        secret: hostSecret,
        allow,
        onRental: (a) => void notifyRental(a, rentalWebhook),
        // repaint the vacant units' signs for everyone in the mall
        onRequested: (slots) => {
          for (const room of rooms.values()) room.broadcast({ t: 'requested', slots });
        },
        mailer: opts.mailer,
        publicUrl: opts.publicUrl,
        mailWebhookSecret: opts.mailWebhookSecret,
        // tell every connected visitor that content changed (they refetch it)
        onChange: (version) => {
          for (const room of rooms.values()) room.broadcast({ t: 'content', version });
        },
      })
    : null;

  /** The directory page, kept until the content version changes (like /api/content). */
  let directory: { version: number; html: Promise<string> } | null = null;
  const directoryHtml = async (sql: Sql) => {
    const version = await contentVersion(sql);
    if (directory?.version !== version) {
      const html = loadContent(sql, assetUrl).then((c) => renderDirectory(c.config));
      directory = { version, html };
      html.catch(() => {
        if (directory?.html === html) directory = null;
      });
    }
    return directory.html;
  };

  const http = createServer(async (req, res) => {
    if (req.url !== '/health' && !requests.take(clientIp(req))) {
      json(res, 429, { error: 'Too many requests. Slow down.' }, { 'Retry-After': '5' });
      req.resume();
      return;
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS).end();
      return;
    }
    if (await usage(req, res)) return;
    if (api && (await api(req, res))) return;
    if (await files(req, res)) return;
    // the plain-HTML shop directory, always current (live from the database when there is one)
    if ((req.url === '/directory/' || req.url === '/directory') && (db || fallbackContent)) {
      const html = db ? await directoryHtml(db) : renderDirectory(fallbackContent as MallConfig);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
      res.end(html);
      return;
    }
    if (req.url === '/health') {
      const list = [...rooms.values()].map((r) => ({ name: r.name, players: r.players.size }));
      const host = [...rooms.values()].some((r) => [...r.players.values()].some((p) => p.host && p.socket));
      json(res, 200, {
        ok: true,
        online: list.reduce((n, r) => n + r.players, 0),
        max: maxPlayers,
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
    if (!hostSignIns.take(clientIp(req))) return json(res, 429, { error: 'Too many tries. Wait a minute.' });
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
    const ip = clientIp(req);
    // reconnecting in a loop, or a script opening sockets: refuse before the handshake
    if (!connects.take(ip)) {
      socket.end('HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const open = perIp.get(ip) ?? 0;
      if (maxPerIp > 0 && open >= maxPerIp) {
        warnBusy();
        const msg: ServerMessage = {
          t: 'error',
          code: 'busy',
          message: 'Too many connections from here at once.',
        };
        ws.send(JSON.stringify(msg));
        ws.close(4001, 'busy');
        return;
      }
      perIp.set(ip, open + 1);
      ws.on('close', () => {
        const n = (perIp.get(ip) ?? 1) - 1;
        if (n > 0) perIp.set(ip, n);
        else perIp.delete(ip);
      });
      connect(ws, roomName);
    });
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
    if (s.dropped) return; // already gone (a sweep took them out, then their socket closed)
    s.dropped = true;
    if (s.timer) clearTimeout(s.timer);
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
      const first = !player.placed;
      Object.assign(player.pose, input.pose);
      player.placed = true;
      player.lastMoveAt = now;
      player.lastInputAt = now;
      if (player.away) setAway(player, false);
      // moving or turning counts as being here; standing (or sitting) still doesn't
      const a = player.activeAt;
      if (
        first ||
        Math.hypot(a.x - player.pose.x, a.z - player.pose.z) > 0.15 ||
        Math.abs(a.yaw - player.pose.yaw) > 0.3
      )
        player.active(now);
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
        void welcome(resumed, msg.resume as string);
        return;
      }
      const name = cleanName(msg.name);
      if (!name || containsBlocked(blocklist, name)) {
        sendError('bad-name', 'Names need 2 to 20 letters.');
        return;
      }
      clearTimeout(joinTimer);
      if (peopleIn() >= maxPlayers) {
        sendError('full', `The mall is full right now (${maxPlayers} people). Try again in a little while.`);
        ws.close(4002, 'full');
        return;
      }
      if (msg.hostToken && !(hostSecret && verifyHostToken(hostSecret, msg.hostToken))) {
        sendError('bad-token', 'Your host sign-in has expired. Sign in again.');
        return;
      }
      const room = roomFor(roomName);
      // two Mingus in one room become Mingu and Mingu-2, so chat and name tags tell them apart
      const unique = uniqueName(
        name,
        [...room.players.values()].map((p) => p.name),
      );
      const player = new Player(newId(), unique, msg.look, ws);
      player.host = !!msg.hostToken;
      room.add(player);
      const token = randomBytes(18).toString('base64url');
      session = { player, room, timer: null };
      sessions.set(token, session);
      void welcome(session, token);
    }

    async function welcome(s: Session, token: string) {
      const others = [...s.room.players.values()].filter((p) => p !== s.player).map((p) => p.info);
      // what's been said lately (the past hour, say), from the database when there is one (it
      // outlives restarts); older messages stay in the database but a newcomer doesn't see them
      const since = Date.now() - chatShowMs;
      let chat = s.room.recentChat.filter((c) => c.at > since).slice(-HISTORY);
      if (db) chat = await recentChat(db, s.room.name, HISTORY, new Date(since)).catch(() => chat);
      s.player.send({
        t: 'welcome',
        id: s.player.id,
        name: s.player.name,
        room: s.room.name,
        resume: token,
        players: others,
        chat,
        doors: s.room.doors.size ? [...s.room.doors].map(([door, by]) => ({ door, by })) : undefined,
      } satisfies ServerMessage);
      // which vacant units are applied for, so their signs are right from the start
      if (db) {
        const slots = await requestedSlots(db).catch(() => null);
        if (slots?.length) s.player.send({ t: 'requested', slots } satisfies ServerMessage);
      }
    }

    ws.on('close', (code: number) => {
      clearTimeout(joinTimer);
      const s = session;
      if (!s || s.player.socket !== ws) return; // replaced by a resumed connection
      s.player.socket = null;
      // a deliberate goodbye leaves now: 1000, 1001 (the tab closed or went elsewhere), or 1005
      // (close() called without a code). A dropped network shows up as 1006, so that waits for the
      // player to resume.
      if (code === 1000 || code === 1001 || code === 1005) dropPlayer(s);
      else s.timer = setTimeout(() => dropPlayer(s), graceMs);
    });
  }

  function setAway(player: Player, away: boolean) {
    player.away = away;
    const room = [...rooms.values()].find((r) => r.players.get(player.id) === player);
    room?.broadcast({ t: 'away', id: player.id, away }, player.id);
  }

  /** Take someone out of the mall, telling them why (`away` or `idle`); their client rejoins later. */
  function park(s: Session, code: 'away' | 'idle', message: string, closeCode: number) {
    const ws = s.player.socket;
    dropPlayer(s);
    if (!ws) return;
    ws.send(JSON.stringify({ t: 'error', code, message } satisfies ServerMessage));
    ws.close(closeCode, code);
  }

  /** Every few seconds: who's gone quiet (away, or gone), and who's been idle too long. */
  function sweep() {
    const now = Date.now();
    for (const s of new Set(sessions.values())) {
      const p = s.player;
      if (!p.socket || s.dropped) continue; // dropped connections have their own 30 s grace
      const silent = now - p.lastInputAt;
      if (silent >= dropSilentMs) {
        park(s, 'away', 'You were away for a while, so you left the mall.', 4003);
        continue;
      }
      if (silent >= awayAfterMs && !p.away) setAway(p, true);
      if (idleKickMs <= 0) continue;
      const idle = now - p.lastActiveAt;
      if (idle >= idleKickMs)
        park(s, 'idle', "You hadn't moved for a long time, so you left the mall.", 4004);
      else if (idle >= idleKickMs - IDLE_WARNING && !p.idleWarned) {
        p.idleWarned = true;
        p.send({ t: 'idle', seconds: Math.ceil((idleKickMs - idle) / 1000) } satisfies ServerMessage);
      }
    }
  }

  function handle(msg: ClientMessage, player: Player, room: Room) {
    // saying or doing anything counts as being here
    if (msg.t === 'chat' || msg.t === 'emote' || msg.t === 'throw' || msg.t === 'look' || msg.t === 'door')
      player.active();
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
      const host = player.host || undefined;
      room.rememberChat({ name: player.name, text, at, host });
      if (db)
        saveChat(db, room.name, { name: player.name, text, at, host }).catch((e) =>
          console.warn('chat: save failed:', e),
        );
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
    } else if (msg.t === 'look') {
      // everyone in the room keeps your look (for the tag colour and the avatar), so tell them all
      if (player.lookLimit.take()) {
        player.look = msg.look;
        room.broadcast({ t: 'look', id: player.id, look: msg.look }, player.id);
      }
    } else if (msg.t === 'throw') {
      // from where you stand, no harder than a throw: anything else is dropped
      const [ox, oy, oz] = msg.o;
      const p = player.pose;
      const near = Math.hypot(ox - p.x, oy - p.y, oz - p.z) <= APPLE.reach;
      if (player.placed && near && Math.hypot(...msg.v) <= APPLE.maxSpeed && player.throwLimit.take())
        room.nearby(player, EMOTE_RADIUS, { t: 'throw', id: player.id, o: msg.o, v: msg.v });
    } else if (msg.t === 'door') {
      // someone else's door (or too many in a row): tell them how it really is
      if (!player.placed || !player.doorLimit.take() || !room.setDoor(msg.id, msg.open, player.id)) {
        const by = room.doors.get(msg.id);
        player.send({ t: 'door', door: msg.id, open: by === undefined, by } satisfies ServerMessage);
      }
    }
  }

  const ticker = setInterval(() => {
    for (const room of rooms.values()) room.step();
  }, 1000 / tickHz);
  const presence = setInterval(() => {
    for (const room of rooms.values()) room.flushPresence();
  }, presenceMs);
  const sweeper = setInterval(sweep, sweepMs);

  // slow-request floods (slowloris): headers must arrive within 15 s and a whole request within
  // 2 minutes (a host's 25 MB model upload on a slow line fits); Node's defaults are 60 s and 5 min
  http.headersTimeout = 15_000;
  http.requestTimeout = 120_000;
  await new Promise<void>((resolve) => http.listen(port, resolve));
  const address = http.address();
  return {
    port: typeof address === 'object' && address ? address.port : port,
    rooms,
    async close() {
      clearInterval(sweeper);
      clearInterval(pruneTimer);
      clearInterval(ticker);
      clearInterval(presence);
      for (const s of sessions.values()) if (s.timer) clearTimeout(s.timer);
      for (const ws of wss.clients) ws.terminate();
      wss.close();
      await new Promise<void>((resolve) => http.close(() => resolve()));
    },
  };
}
