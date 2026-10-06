# Contributing

Thank you for helping. Issues labelled [`good first issue`](https://github.com/devmtnaing/shopping-mall/labels/good%20first%20issue) and [`help wanted`](https://github.com/devmtnaing/shopping-mall/labels/help%20wanted) are good places to start. For the art, see [#2](https://github.com/devmtnaing/shopping-mall/issues/2) and [#4](https://github.com/devmtnaing/shopping-mall/issues/4).

## Set up

Node 24 and pnpm 10 (`corepack enable`), plus Docker for the database and storage.

```bash
pnpm install
pnpm dev                 # the client, http://localhost:5173 (single-player)
pnpm db:up               # Postgres (port 5433) and S3 storage (8333) in Docker
DATABASE_URL=postgres://mall:mall@localhost:5433/mall \
S3_ENDPOINT=http://localhost:8333 S3_BUCKET=mall S3_ACCESS_KEY_ID=mall S3_SECRET_ACCESS_KEY=mall-secret \
HOST_SECRET=letmein pnpm dev:server   # multiplayer, /api and /admin, port 8787
```

Open a second browser window to watch yourself walk around. `?debug` adds an overlay with fps and draw calls, and shows the navgrid.

## Layout

| Folder | What's there |
|---|---|
| `client/` | The browser app: three.js world, Preact UI (`src/ui`), admin pages (`src/admin`; `admin/index.html` for the host, `shop-admin/index.html` for shop owners) |
| `server/` | Node WebSocket server, content API, uploads, Postgres migrations |
| `shared/` | Code both sides use: protocol, config schema, meta schema, navgrid, avatars list |
| `tools/` | Greybox generator, navgrid baker, asset pipeline, Blender build, bots, perf and a11y gates |
| `assets-src/` | Source art (CC0 kits, Higgsfield models, audio) with licences |
| `docs/` | This site, the ADRs and the task list |

Read [Architecture](../architecture) first. The decisions behind it are in the ADRs.

## Checks (all run in CI)

| Command | What it checks |
|---|---|
| `pnpm lint` | Biome: format and lint (`pnpm format` fixes most things) |
| `pnpm typecheck` | TypeScript, strict |
| `pnpm test` | Vitest: client, server, shared, tools. Database and storage tests need `TEST_DATABASE_URL` and `TEST_S3_ENDPOINT`, and skip without them. |
| `pnpm build && pnpm size` | Bundle size budget (initial JS ≤ 221 KB gzipped) |
| `pnpm perf` | Load and runtime budgets in Chromium on throttled 4G (`--gpu` to enforce frame time) |
| `pnpm a11y` | axe-core on every main screen, plus a keyboard-only flow |
| `pnpm screenshots` | Phone layouts (iPhone 13 portrait and landscape, Pixel 7) into `screenshots/` |

Asset commands: `pnpm greybox` (layout, collision, meta, navgrid), `pnpm assets` (avatar, props and audio packs), `pnpm mall` (the Blender build, which needs Blender). Every shipped asset has a size budget in `tools/test/budgets.test.ts`.

## Conventions

- **Performance is a feature.** No allocations in the render loop, one draw call per thing where possible, and lazy-load anything not needed for the first frame. The budgets are in [performance.md](../performance).
- **Keep the code simple.** Short files and plain functions, with comments that say *why*. Server and shared code run as TypeScript straight in Node, so they use erasable syntax only (no enums or namespaces) and `.ts` import extensions.
- **The UI never imports three.js,** and the game never touches the DOM except the canvas: they talk through signals (`client/src/state.ts`) and commands (`client/src/commands.ts`).
- **Accessible and bilingual.** Every control has a label, and every string goes through `t()` with both `en` and `my` entries.
- **Commits:** one task per commit, with an imperative subject (`feat: …`, `fix(ui): …`, `perf: …`) and the task ID or issue in the subject.
