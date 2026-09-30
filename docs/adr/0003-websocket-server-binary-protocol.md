# ADR 0003: A small WebSocket server with a binary snapshot protocol

**Status:** Accepted · 2026-09-28

## Context
The simplest way to share positions is HTTP polling: every client asks the server for everyone's position about once a second. That's easy to host, but other players then move about once a second and look laggy, every update pays for a whole HTTP request, and a slow request that times out drops the session, so the client joins again and the chat fills with join and leave messages.

## Decision
- One **Node 22 / Bun** process using `ws`, with rooms held in memory. No database: presence doesn't need to survive a restart.
- A **15 Hz** tick. Client → server INPUT is 12 bytes. Server → client SNAPSHOT is 11 bytes per player, for the 40 nearest in your zone and the zones next to it.
- Rare messages (join, chat, emotes, events) are JSON.
- Each client decides its own position, and the server checks speed and bounds.
- **Resume tokens** give a 30 s grace period. Join and leave notices are batched every 2 s.
- The mall **still works single-player** when it can't reach the server.

## Consequences
- 15 updates a second, interpolated, so other people move smoothly. With 40 players in view that's about 6.6 KB/s down.
- It self-hosts with `docker run`, with no PHP and no database.
- The protocol lives in `shared/`, so client and server can't drift apart, and round-trip tests cover it.
- One process tops out at a few hundred people at once. That's enough for v1. To grow, run more rooms on more processes with a tiny lobby service routing between them (after v1).
- Because clients decide their own position, a modified client could walk through walls. The speed and bounds checks limit that, and there's nothing to win by cheating.

## Alternatives
- **HTTP polling:** the simplest to host, but it feels bad (see Context).
- **Colyseus:** a full framework with schema sync, heavier than we need.
- **Cloudflare Durable Objects / PartyKit:** great managed scaling, but it ties self-hosters to one vendor. The protocol doesn't care about the transport, so we could add one of these later as an option.
- **WebRTC data channels:** lower latency, but signalling and NAT traversal add a lot of complexity. At walking speed it isn't worth it.
