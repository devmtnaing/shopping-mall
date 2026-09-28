// HTTP (health) + WebSocket server. One process, rooms in memory (docs/adr/0003).
import { createServer } from 'node:http';
import { NET_HZ } from '@plaza/shared/constants';
import { parseClientMessage } from '@plaza/shared/messages';
import { type ClientMessage, decodeInput, type Pose, type ServerMessage } from '@plaza/shared/protocol';
import { type RawData, type WebSocket, WebSocketServer } from 'ws';
import { cleanName } from './names.ts';
import { Player } from './player.ts';
import { Room } from './room.ts';

export type ServerOptions = { port?: number; tickHz?: number; capacity?: number; joinTimeoutMs?: number };

const ROOM_NAME = /^[a-z0-9-]{1,32}$/;

export async function startServer(opts: ServerOptions = {}) {
  const { port = 0, tickHz = NET_HZ, capacity = 100, joinTimeoutMs = 5000 } = opts;
  const rooms = new Map<string, Room>();
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

  function roomFor(name: string) {
    let room = rooms.get(name);
    if (!room) {
      room = new Room(name, capacity);
      rooms.set(name, room);
    }
    return room;
  }

  function connect(ws: WebSocket, roomName: string) {
    ws.binaryType = 'arraybuffer';
    let player: Player | null = null;
    let room: Room | null = null;
    const scratch: Pose = { x: 0, y: 0, z: 0, yaw: 0, anim: 0, flags: 0 };
    const sendError = (code: Extract<ServerMessage, { t: 'error' }>['code'], message: string) =>
      ws.send(JSON.stringify({ t: 'error', code, message } satisfies ServerMessage));

    const joinTimer = setTimeout(() => ws.close(4000, 'join timeout'), joinTimeoutMs);

    ws.on('message', (data: RawData, isBinary: boolean) => {
      if (isBinary) {
        if (!player) return;
        const input = decodeInput(data as ArrayBuffer, scratch);
        if (!input) return;
        Object.assign(player.pose, input.pose);
        player.placed = true;
        player.lastMoveAt = Date.now();
        return;
      }
      const msg = parseClientMessage(data.toString());
      if (!msg) return sendError('bad-message', 'That message was not understood.');
      if (msg.t === 'join') return join(msg);
      if (!player || !room) return;
      handle(msg, player, room);
    });

    function join(msg: Extract<ClientMessage, { t: 'join' }>) {
      if (player) return;
      const name = cleanName(msg.name);
      if (!name) {
        sendError('bad-name', 'Names need 2 to 20 letters.');
        return;
      }
      clearTimeout(joinTimer);
      room = roomFor(roomName);
      player = new Player(newId(), name, msg.look, ws);
      const others = [...room.players.values()].map((p) => p.info);
      room.add(player);
      player.send({
        t: 'welcome',
        id: player.id,
        room: room.name,
        resume: '',
        players: others,
      } satisfies ServerMessage);
      room.broadcast({ t: 'presence', joined: [player.info], left: [] }, player.id);
    }

    ws.on('close', () => {
      clearTimeout(joinTimer);
      if (!player || !room) return;
      room.remove(player.id);
      room.broadcast({ t: 'presence', joined: [], left: [player.id] });
      if (room.players.size === 0) rooms.delete(room.name);
    });
  }

  function handle(msg: ClientMessage, player: Player, room: Room) {
    if (msg.t === 'chat') {
      const text = msg.text.trim();
      if (text) room.broadcast({ t: 'chat', id: player.id, name: player.name, text, at: Date.now() });
    } else if (msg.t === 'emote') {
      room.broadcast({ t: 'emote', id: player.id, e: msg.e });
    }
  }

  const ticker = setInterval(() => {
    for (const room of rooms.values()) room.step();
  }, 1000 / tickHz);

  await new Promise<void>((resolve) => http.listen(port, resolve));
  const address = http.address();
  return {
    port: typeof address === 'object' && address ? address.port : port,
    rooms,
    async close() {
      clearInterval(ticker);
      for (const ws of wss.clients) ws.terminate();
      wss.close();
      await new Promise<void>((resolve) => http.close(() => resolve()));
    },
  };
}
