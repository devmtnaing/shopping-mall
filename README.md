# Shopping Mall

**An open-source, multiplayer 3D shopping mall that runs in the browser.**
Walk around with friends, visit shops, browse real products, and chat. It loads fast, stays at 60 fps on a mid-range phone, and you run it with an admin page for shops and products (or one config file for a static build).

> Status: **Phases 0, 1, 3, 3b and 4 done.** A greybox mall with working shops, directory, minimap, overview, deep links, English and Burmese, multiplayer (see others move, chat, emote, host announcements), and live content: shops, products, uploads and even the building are edited from `/admin/` and show up for everyone within seconds.
> **Live demo:** <https://web-production-cc219.up.railway.app> (Railway, Singapore). **Docs:** <https://devmtnaing.github.io/shopping-mall/>. Self-host with `docker compose up`.
> Phase 2 (art) is mostly in: pick one of 12 animated characters, shoppers stroll and sit, and the mall has benches, trees, a fountain and more (Kenney CC0 plus a few Higgsfield models), with quality tiers and reflections. Still to come: the real building with baked lighting, then performance and phone polish. See the [roadmap](docs/roadmap.md).

---

## Why this exists

[NC Mall](https://punchkonay.tech/mall/) showed that a walkable, social 3D mall in a browser tab is fun and useful. Shopping Mall builds that idea as a reusable open-source project:

| | NC Mall (reference) | Shopping Mall (target) |
|---|---|---|
| Multiplayer | HTTP polling, ~1.25 updates/s | WebSocket, 15 Hz binary snapshots, interpolated |
| First load | ~5 MB of uncompressed GLB before you enter | ≤ 2.5 MB to first playable frame (Meshopt + KTX2) |
| Avatars | 1 GLB of ~2.4 MB per outfit | Shared skeleton + shared animation pack, ≤ 400 KB per outfit |
| Lighting | Real-time, single light | Baked lightmaps, environment reflections, quality tiers |
| Content | Edit JS source | `mall.config.ts` plus a product adapter (JSON, Shopify, …) |
| Links | One URL | Deep links to every shop (`?s=coffee`) and spot, plus an HTML directory that crawlers can read |
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

## Quick start

```bash
pnpm install
pnpm dev            # the mall at http://localhost:5173 (add ?debug for stats, gizmos and the nav grid)
pnpm check          # typecheck, lint, tests, build, size budget: what CI runs
pnpm greybox        # regenerate the greybox mall, its meta and the nav grid
```

**Controls:** WASD / arrows to walk, Shift to run, Space to jump, drag to look, scroll to zoom, click the floor to walk there, click a shop to go to its door.
On a phone: left thumb joystick, drag on the right to look, pinch to zoom, tap to walk, Run and Jump buttons.
For multiplayer while developing, run `pnpm dev:server` in a second terminal. For live content, first run `pnpm db:up` (Postgres in Docker on port 5433) and start the server with `DATABASE_URL=postgres://mall:mall@localhost:5433/mall`. The client finds it on port 8787, and open a second browser window to see yourself walk around.

## Self-hosting

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/shopping-mall)

One click deploys the whole mall on Railway: web, server, Postgres, an uploads bucket and nightly backups. You choose the admin password when you deploy.

```bash
cp .env.example .env        # optional: HOST_SECRET, REPORT_WEBHOOK, WEB_PORT…
docker compose up --build   # → http://localhost:8080
```

That runs nginx serving the built site (and proxying `/ws`, `/api` and `/files` to the server), the server, Postgres and S3-compatible storage (SeaweedFS). Sign in at `/admin/` with `HOST_SECRET` to edit the mall. Deploying to Railway, settings and backups: [docs/deploy.md](docs/deploy.md). For a static-only deployment (single-player, content from `mall.config.ts`), `pnpm build` and upload `client/dist/` anywhere.

## License

MIT for code. Assets are CC BY 4.0 unless a file's `LICENSE` says otherwise. The characters are [Kenney's Mini Characters](https://kenney.nl/assets/mini-characters) (CC0): thank you, Kenney.
