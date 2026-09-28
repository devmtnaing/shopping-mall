# ADR 0003: A small WebSocket server with a binary snapshot protocol

**Status:** Accepted · 2026-09-28

## Context
The reference polls `api.php?a=sync` over HTTP roughly every 790 ms. As a result:
- remote players update ~1.25 times per second and look laggy,
- every update pays for a full HTTP request (~93 ms median),
- timeouts abort requests, the session expires (`410`) and the client re-joins, which spams the chat with join/leave lines.

## Decision
- One **Node 22 / Bun** process using `ws`, with rooms held in memory. No database: presence is ephemeral.
- **15 Hz** tick. Client → server INPUT is 12 bytes. Server → client SNAPSHOT is 11 bytes per player, filtered to the 40 nearest in the player's own and neighbouring zones.
- Rare messages (join, chat, emotes, events) are JSON.
- The client is authoritative for its own position. The server validates speed and bounds.
- **Resume tokens** with a 30 s grace period. Join/leave notices are batched every 2 s.
- The mall **still works single-player** when the server is unreachable.

## Consequences
- ✅ ~12× more frequent updates with smooth interpolation. ~6.6 KB/s down with 40 visible players.
- ✅ Self-hosts with `docker run`. No PHP, no database.
- ✅ The protocol lives in `shared/`, so client and server can't drift apart. It's covered by round-trip tests.
- ⚠️ A single process caps out at a few hundred concurrent users per instance. That's enough for v1. Horizontal scale means running more rooms on more processes, with a tiny lobby service to route between them (post-v1).
- ⚠️ Client authority allows a modified client to walk through walls. Speed and bounds checks limit the damage, and there's nothing to win by cheating.

## Alternatives
- **Keep HTTP polling:** simplest to host, but the experience is poor (see Context).
- **Colyseus:** a full framework with schema sync. Heavier than we need.
- **Cloudflare Durable Objects / PartyKit:** great managed scaling, but ties self-hosters to one vendor. We could add it later as an alternative transport, since the protocol is transport-agnostic.
- **WebRTC data channels:** lower latency, but signalling and NAT traversal make it much more complex. Not worth it at walking speed.
