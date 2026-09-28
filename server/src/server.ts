// HTTP (health) + WebSocket server. One process, rooms in memory (docs/adr/0003).
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { NET_HZ } from '@plaza/shared/constants';
import { parseClientMessage } from '@plaza/shared/messages';
import { type ClientMessage, decodeInput, type Pose, type ServerMessage } from '@plaza/shared/protocol';
import { type RawData, type WebSocket, WebSocketServer } from 'ws';
import { plausibleMove } from './movement.ts';
import { cleanChat, cleanName } from './names.ts';
import { Player } from './player.ts';
import { Room } from './room.ts';

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
  } = opts;
  const rooms = new Map<string, Room>();
  const sessions = new Map<string, Session>();
  let nextId = 1;
  const newId = () => {
    const id = nextId;
    nextId = nextId >= 65535 ? 1 : nextId + 1;
    return id;
  };

  const http = createServer((req, res) => {
    if (req.url === '/health') {
      const list = [...rooms.values()].map((r) => ({ name: r.name, players: r.players.size }));
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ ok: true, online: list.reduce((n, r) => n + r.players, 0), rooms: list }));
      return;
    }
    res.writeHead(404).end();
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
  http.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (url.pathname !== '/ws') return socket.destroy();
    const wanted = url.searchParams.get('room') ?? 'main';
    const roomName = ROOM_NAME.test(wanted) ? wanted : 'main';
    wss.handleUpgrade(req, socket, head, (ws) => connect(ws, roomName));
  });

  /** The room called `base`, or its first overflow room with space (base-2, base-3, …). */
  function roomFor(base: string) {
    for (let n = 1; ; n++) {
      const name = n === 1 ? base : `${base}-${n}`;
      let room = rooms.get(name);
      if (!room) {
        room = new Room(name, capacity, interest);
        rooms.set(name, room);
      }
      if (!room.full) return room;
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
      if (!name) {
        sendError('bad-name', 'Names need 2 to 20 letters.');
        return;
      }
      clearTimeout(joinTimer);
      const room = roomFor(roomName);
      const player = new Player(newId(), name, msg.look, ws);
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
      const text = cleanChat(msg.text);
      if (!text) return;
      if (!player.chatLimit.take()) {
        player.send({ t: 'error', code: 'rate', message: 'Slow down a little.' } satisfies ServerMessage);
        return;
      }
      room.broadcast({
        t: 'chat',
        id: player.id,
        name: player.name,
        text,
        at: Date.now(),
        host: player.host || undefined,
      });
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
