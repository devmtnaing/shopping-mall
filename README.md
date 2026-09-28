# Plaza

**An open-source, multiplayer 3D shopping mall that runs in the browser.**
Walk around with friends, visit shops, browse real products, and chat. It loads fast, stays at 60 fps on a mid-range phone, and you set it up by editing one config file.

> Status: **planning**. This repo holds the design and engineering plan. Code lands phase by phase, following the [roadmap](docs/roadmap.md).
> "Plaza" is a working name.

---

## Why this exists

[NC Mall](https://punchkonay.tech/mall/) showed that a walkable, social 3D mall in a browser tab is fun and useful. Plaza builds that idea as a reusable open-source project:

| | NC Mall (reference) | Plaza (target) |
|---|---|---|
| Multiplayer | HTTP polling, ~1.25 updates/s | WebSocket, 15 Hz binary snapshots, interpolated |
| First load | ~5 MB of uncompressed GLB before you enter | ≤ 2.5 MB to first playable frame (Meshopt + KTX2) |
| Avatars | 1 GLB of ~2.4 MB per outfit | Shared skeleton + shared animation pack, ≤ 400 KB per outfit |
| Lighting | Real-time, single light | Baked lightmaps, environment reflections, quality tiers |
| Content | Edit JS source | `plaza.config.ts` plus a product adapter (JSON, Shopify, …) |
| Links | One URL | Deep links to every shop (`/s/coffee`), plus an HTML directory that crawlers can read |
| Mobile | Joystick | Joystick **and** tap-to-walk with pathfinding |
| Self-hosting | PHP server | Static site + one small Node/Bun server (Docker), or static-only single-player |

## Documents

| Doc | What's in it |
|---|---|
| [Teardown of the reference](docs/teardown.md) | What NC Mall does, how it's built, what to keep and what to fix |
| [Product spec](docs/spec.md) | Features, user flows, controls, non-goals |
| [Architecture](docs/architecture.md) | Stack, module layout, data flow, networking protocol |
| [Performance budget](docs/performance.md) | Hard numbers and how we enforce them in CI |
| [Art direction & asset pipeline](docs/art-direction.md) | Look & feel, Higgsfield → Blender → glTF pipeline |
| [Roadmap](docs/roadmap.md) | Step-by-step phases with exit criteria |
| [Engineering tasks](docs/tasks.md) | Ticket-sized backlog with acceptance criteria |
| [ADRs](docs/adr/) | Key decisions and why we made them |

## Guiding principles

1. **Fast first.** Every feature has a budget. If a feature breaks the budget, it doesn't ship. See [performance.md](docs/performance.md).
2. **Simple code.** Vanilla Three.js with TypeScript. No game engine and no ECS framework. Any file should make sense on a first read.
3. **Config, not code.** Changing shops, products, colours or languages should never require editing engine code.
4. **Works alone.** `pnpm dev` runs a single-player mall with no server. Multiplayer is an add-on you switch on.
5. **Looks good on cheap hardware.** We bake lighting into textures instead of computing it in real time.

## Quick start *(once Phase 1 lands)*

```bash
pnpm install
pnpm dev            # single-player mall at http://localhost:5173
pnpm dev:server     # optional: multiplayer server on :8787
```

## License

MIT for code. Assets are CC BY 4.0 unless a file's `LICENSE` says otherwise.
# shopping-mall
