# Shopping Mall

**A multiplayer 3D shopping mall that runs in your browser.** Walk around with friends, go into shops, browse their products and chat.

### ▶ Play it: <https://mall.devmtnaing.com>

No sign-up and nothing to install. It works on a phone too.

[![Gameplay: Poe runs down the mall to meet Bo, they wave and dance together, she finds a café in the directory, throws an apple at Bo, sits on a bench, pops into a cubicle in the women's restroom, and they hug before the overview map](docs/media/gameplay.webp)](https://mall.devmtnaing.com)

<sub>▶ [Watch it as a video (MP4, 720p)](docs/media/gameplay.mp4)</sub>

---

## What you can do

- **Walk a two-floor mall** with escalators, an atrium, a fountain and furnished shops you can step inside.
- **Shop together.** Open a shop to see its products, or jump straight to one from the directory.
- **Hang out.** Chat, wave, dance, hug, sit on the benches and sofas, and pick up apples to throw at your friends.
- **Be someone.** Choose from 15 characters and a colour.
- **Play your way.** Use the keyboard and mouse, or a joystick and taps on a phone. It's in English and Burmese.

**Controls:** WASD or the arrow keys to walk, Shift to run, Space to jump, drag to look, scroll to zoom. Click the floor to walk there, or a shop to walk to its door. E visits a shop or sits you down, F picks and throws an apple, 1 to 8 are emotes, M is the overview, N mutes, and ? shows help.
On a phone: a joystick under your left thumb, drag on the right to look, pinch to zoom, tap to walk, and Run and Jump buttons.

## Run your own mall

It's open source (MIT), and anybody can run one for their own shops. You manage shops, products, uploads and even the building from an admin page at `/admin/`, and everyone in the mall sees each change within seconds. If you only want a static site, one config file (`mall.config.ts`) is enough.

**One click on Railway** deploys everything: web, server, Postgres, an uploads bucket and nightly backups. You choose the admin password when you deploy.

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/shopping-mall)

**Or with Docker:**

```bash
cp .env.example .env        # optional: HOST_SECRET, REPORT_WEBHOOK, WEB_PORT…
docker compose up --build   # → http://localhost:8080
```

That starts nginx serving the built site (and passing `/ws`, `/api` and `/files` to the server), the server itself, Postgres, and S3-compatible storage (SeaweedFS). Sign in at `/admin/` with `HOST_SECRET` to edit the mall.

**Or as a static site:** run `pnpm build` and upload `client/dist/` anywhere. You get a single-player mall with content from `mall.config.ts`.

[docs/deploy.md](docs/deploy.md) covers Railway, settings and backups.

## Develop

```bash
pnpm install
pnpm dev            # the mall at http://localhost:5173 (add ?debug for stats, gizmos and the nav grid)
pnpm check          # typecheck, lint, tests, build, size budget: what CI runs
pnpm greybox        # regenerate the greybox mall, its meta and the nav grid
```

For multiplayer, run `pnpm dev:server` in a second terminal; the client finds it on port 8787. Open a second browser window to watch yourself walk around. For live content, start Postgres first with `pnpm db:up` (Docker, port 5433), then start the server with `DATABASE_URL=postgres://mall:mall@localhost:5433/mall`.

There are no versioned releases for now: the live mall always runs the latest `main`. See the [changelog](CHANGELOG.md) and the [roadmap](docs/roadmap.md).

### How it's built

- **Multiplayer** over WebSocket: 15 binary snapshots a second, interpolated so other people move smoothly.
- **A small first download:** at most 2.5 MB before you can walk around, with Meshopt-compressed models. It holds 60 fps on a mid-range phone.
- **Characters** share one skeleton and one set of animations, so a new outfit costs very little.
- **Baked lighting**, with reflections and quality tiers, so it looks good on cheap phones too.
- **Content lives in data.** Shops and products come from the admin page or `mall.config.ts`, and a shop can pull its products from a JSON feed.
- **Links** to every shop (`?s=coffee`) and to any spot in the mall, plus a plain HTML directory that search engines can read.
- **Self-hosting** is a static site plus one small Node server in Docker. Without the server it still works, single-player.

### Guiding principles

1. **Fast first.** Every feature has a budget, and a feature that breaks it doesn't ship. See [performance.md](docs/performance.md).
2. **Simple code.** Plain Three.js and TypeScript, with no game engine and no ECS framework. Any file should make sense on a first read.
3. **Config, not code.** Changing shops, products, colours or languages never means editing engine code.
4. **Works alone.** `pnpm dev` runs a single-player mall with no server. Multiplayer is something you switch on.
5. **Looks good on cheap hardware.** Lighting is baked into textures instead of computed every frame.

## Documentation

The docs site is at <https://devmtnaing.github.io/shopping-mall/>. In the repo:

| Doc | What's in it |
|---|---|
| [Product spec](docs/spec.md) | Features, user flows, controls, non-goals |
| [Architecture](docs/architecture.md) | Stack, module layout, data flow, networking protocol |
| [Performance budget](docs/performance.md) | The hard limits, and how CI enforces them |
| [Art direction and asset pipeline](docs/art-direction.md) | Look and feel, and the Higgsfield → Blender → glTF pipeline |
| [Deploying](docs/deploy.md) | Railway, Docker, settings and backups |
| [Roadmap](docs/roadmap.md) | The phases, each with exit criteria |
| [Engineering tasks](docs/tasks.md) | Ticket-sized backlog with acceptance criteria |
| [ADRs](docs/adr/) | The big decisions and why we made them |

## License

MIT for code. Assets are CC BY 4.0 unless a file's `LICENSE` says otherwise. The characters are [Kenney's Mini Characters](https://kenney.nl/assets/mini-characters) (CC0). Thank you, Kenney.
