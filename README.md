# Shopping Mall

**An open-source, multiplayer 3D shopping mall that runs in the browser.**
Walk around with friends, go into shops, browse their products and chat. It loads quickly and holds 60 fps on a mid-range phone. You run it from an admin page for shops and products, or from one config file if you only want a static build.

> Status: **v1.1.1.** A furnished two-floor mall with shops you can walk into, 15 characters, multiplayer (chat, emotes, dancing, hugs, throwing apples), baked lighting, English and Burmese, and live content: you edit shops, products, uploads and even the building at `/admin/`, and everyone sees the change within seconds.
> **Live demo:** <https://web-production-cc219.up.railway.app> (Railway, Singapore). **Docs:** <https://devmtnaing.github.io/shopping-mall/>. Self-host with `docker compose up`, or [deploy on Railway](https://railway.com/deploy/shopping-mall). See the [changelog](CHANGELOG.md) and the [roadmap](docs/roadmap.md).

[![Gameplay: picking a character, walking the mall with other visitors, dancing, visiting a shop, the overview map, throwing apples and sitting on a bench](docs/media/gameplay.webp)](https://web-production-cc219.up.railway.app)

<sub>▶ [Watch it as a video (MP4, 720p)](docs/media/gameplay.mp4)</sub>

---

## What it is

A walkable mall in a browser tab turns out to be a fun way to shop with friends. This project makes one that anybody can run for their own shops:

- **Multiplayer** over WebSocket: 15 binary snapshots a second, interpolated so other people move smoothly.
- **A small first download:** at most 2.5 MB before you can walk around, with Meshopt-compressed models.
- **Characters** share one skeleton and one set of animations, so a new outfit costs very little.
- **Baked lighting**, with reflections and quality tiers, so it looks good on cheap phones too.
- **Content lives in data.** Shops and products come from the admin page or `mall.config.ts`, and a shop can pull its products from a JSON feed.
- **Links** to every shop (`?s=coffee`) and to any spot in the mall, plus a plain HTML directory that search engines can read.
- **On phones**, a joystick, and tap anywhere to walk there.
- **Self-hosting** is a static site plus one small Node server in Docker. Without the server it still works, single-player.

## Documents

| Doc | What's in it |
|---|---|
| [Product spec](docs/spec.md) | Features, user flows, controls, non-goals |
| [Architecture](docs/architecture.md) | Stack, module layout, data flow, networking protocol |
| [Performance budget](docs/performance.md) | The hard limits, and how CI enforces them |
| [Art direction and asset pipeline](docs/art-direction.md) | Look and feel, and the Higgsfield → Blender → glTF pipeline |
| [Roadmap](docs/roadmap.md) | The phases, each with exit criteria |
| [Engineering tasks](docs/tasks.md) | Ticket-sized backlog with acceptance criteria |
| [ADRs](docs/adr/) | The big decisions and why we made them |

## Guiding principles

1. **Fast first.** Every feature has a budget, and a feature that breaks it doesn't ship. See [performance.md](docs/performance.md).
2. **Simple code.** Plain Three.js and TypeScript, with no game engine and no ECS framework. Any file should make sense on a first read.
3. **Config, not code.** Changing shops, products, colours or languages never means editing engine code.
4. **Works alone.** `pnpm dev` runs a single-player mall with no server. Multiplayer is something you switch on.
5. **Looks good on cheap hardware.** Lighting is baked into textures instead of computed every frame.

## Quick start

```bash
pnpm install
pnpm dev            # the mall at http://localhost:5173 (add ?debug for stats, gizmos and the nav grid)
pnpm check          # typecheck, lint, tests, build, size budget: what CI runs
pnpm greybox        # regenerate the greybox mall, its meta and the nav grid
```

**Controls:** WASD or the arrow keys to walk, Shift to run, Space to jump, drag to look, scroll to zoom. Click the floor to walk there, or a shop to walk to its door. E visits a shop or sits you down, F picks and throws an apple, 1 to 8 are emotes, M is the overview, N mutes, and ? shows help.
On a phone: a joystick under your left thumb, drag on the right to look, pinch to zoom, tap to walk, and Run and Jump buttons.

For multiplayer while developing, run `pnpm dev:server` in a second terminal; the client finds it on port 8787. Open a second browser window to watch yourself walk around. For live content, start Postgres first with `pnpm db:up` (Docker, port 5433), then start the server with `DATABASE_URL=postgres://mall:mall@localhost:5433/mall`.

## Self-hosting

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/shopping-mall)

One click deploys the whole mall on Railway: web, server, Postgres, an uploads bucket and nightly backups. You choose the admin password when you deploy.

```bash
cp .env.example .env        # optional: HOST_SECRET, REPORT_WEBHOOK, WEB_PORT…
docker compose up --build   # → http://localhost:8080
```

That starts nginx serving the built site (and passing `/ws`, `/api` and `/files` to the server), the server itself, Postgres, and S3-compatible storage (SeaweedFS). Sign in at `/admin/` with `HOST_SECRET` to edit the mall. [docs/deploy.md](docs/deploy.md) covers Railway, settings and backups. For a static, single-player site with content from `mall.config.ts`, run `pnpm build` and upload `client/dist/` anywhere.

## License

MIT for code. Assets are CC BY 4.0 unless a file's `LICENSE` says otherwise. The characters are [Kenney's Mini Characters](https://kenney.nl/assets/mini-characters) (CC0). Thank you, Kenney.
