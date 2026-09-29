# Engineering tasks

Ticket-sized work items grouped by [roadmap](roadmap.md) phase. Each one is meant to become a GitHub issue.

**Size:** S ≤ ½ day · M ≤ 2 days · L ≤ 4 days. Anything bigger gets split.
**Labels:** `client` `server` `shared` `art` `tooling` `ui` `perf` `a11y` `good first issue`

Every task also has an implicit acceptance criterion: *typecheck, lint, tests and budgets pass, and no file is over ~300 lines.*

**Progress:** Phase 0 ✅ (T-001 to T-007) · Phase 1 ✅ (T-101 to T-110) · Phase 3 ✅ (T-301 to T-312) · Phase 4 ✅ (T-401 to T-412) · Phase 3b ✅ (T-700 to T-707, live on Railway) · Phase 2 ✅ · Phase 5 ✅ except real-device checks · Phase 6 ✅ (v1.0.0, Railway template published; v1.1.0 and v1.1.1 on 2026-09-30). Changes from the plan are noted in the rows.
Phase 4 load test (laptop, 100 bots in one room): 6.5 KB/s down per client, server 3.7 % of a core, 1.9 ms per tick.
T-101 deviated from the plan: with no Blender on hand, the greybox is generated from [`tools/greybox/layout.ts`](../tools/greybox/layout.ts) and writes the same files a Blender export will ([greybox.md](greybox.md)).
T-104 uses a "floating capsule" (body capsule from step height up, with ground rays below) instead of a full capsule, because rounded capsules can't climb steps without hacks.

---

## Phase 0: Foundation

| ID | Task | Size | Labels | Acceptance criteria |
|---|---|---|---|---|
| T-001 | pnpm workspace (`client`, `server`, `shared`), TS strict, Biome, path aliases | S | tooling | `pnpm i && pnpm -r typecheck` passes. `shared` is importable from both client and server |
| T-002 | Vite client boots Three.js: renderer, resize, one rAF loop, spinning cube | S | client | Canvas fills the viewport. DPR is capped. No console errors |
| T-003 | `?debug` overlay: fps, frame-time graph, `renderer.info`, heap | S | client perf `good first issue` | Overlay toggles with the query param. Costs < 0.2 ms/frame |
| T-004 | `shared/config.ts` zod schema + example `mall.config.ts` with 6 shops | M | shared | An invalid config fails at build time with a readable error path |
| T-005 | GitHub Actions: typecheck, lint, vitest, build | S | tooling | Runs on PRs in < 3 min with a pnpm cache |
| T-006 | `pnpm size` against `budgets.json` | S | tooling perf | Fails when the initial JS is over 220 KB gz. Prints a table |
| T-007 | Community files: CONTRIBUTING, CoC, issue/PR templates, LICENSE | S | tooling `good first issue` | GitHub's community profile shows 100 % |

## Phase 1: Walkable greybox

| ID | Task | Size | Labels | Acceptance criteria |
|---|---|---|---|---|
| T-101 | Greybox `mall.blend`: 2 floors, atrium, 12 slots, 2 escalators, empties per the naming spec. Export script for `mall.meta.json` | M | art tooling | Meta JSON validates against the schema. Slots, seats and spawns load in the client as debug gizmos |
| T-102 | `loop.ts`: fixed 60 Hz step + render interpolation. Pause when the tab is hidden | S | client | Movement speed is identical at 30, 60 and 144 fps (unit test with fake time) |
| T-103 | `input.ts`: keyboard, pointer lock, drag-look, wheel/pinch zoom, focus-safe (typing in chat never moves the player) | M | client | Unit tests for key state. Ctrl+W is never swallowed |
| T-104 | Capsule controller vs. `three-mesh-bvh`: slide on walls, step up ≤ 0.35 m, slopes ≤ 40°, gravity, jump | L | client | Automated test walks a scripted path through the greybox with no tunnelling. Recovers if spawned inside geometry |
| T-105 | Escalators: a moving surface along `esc.*` paths, carries the player, works in both directions | M | client | Riding up and down lands on the correct floor. No jitter at the ends |
| T-106 | Third-person camera: spring follow, collision (spherecast), zoom 2–9 m, shoulder offset, auto-recenter while moving | M | client | Never clips through walls in the greybox (test sweeps 360° at 20 spots) |
| T-107 | Touch controls: joystick (left half, dynamic origin), drag-look (right half), action buttons | M | client ui | Works with two fingers at once. 44 px minimum targets |
| T-108 | `tools/bake-navgrid.ts`: collision mesh → 0.25 m walkable grid per floor + escalator links → `navgrid.bin` | M | tooling | Grid ≤ 60 KB. The debug view shows the grid overlay |
| T-109 | A* + path smoothing (string-pulling) + tap/click-to-walk. Tapping a shop targets its door | M | client | Path to any reachable cell in < 2 ms. Cancelled by any movement input |
| T-110 | Zones: AABB lookup → `zone` signal, with hysteresis | S | client `good first issue` | The label updates once when you cross a boundary, not repeatedly |

## Phase 2: Real world & avatars

| ID | Task | Size | Labels | Acceptance criteria |
|---|---|---|---|---|
| T-201 | Modular kit: storefront ×3 widths, column, rail, bench, planter, light, escalator | L | art | Every piece within the asset budgets. Pivot and naming conventions followed. ✅ *(Changed from the plan: no hand-modelled kit. The building comes from the greybox layout, dressed in Blender by `pnpm mall` (door frames, glass balustrades, skirting, cornices, handrails). Furniture is the props packs by area (`tools/greybox/props.ts`): Kenney CC0 plus 18 Higgsfield pieces, one draw call per kind. Closed with #2.)* |
| T-202 | Final `mall.blend` + Cycles lightmap bake to `uv1` per zone chunk | L | art | No seams or light leaks visible at Medium. Bake script is reproducible. ✅ *(Changed from the plan: `pnpm mall` bakes one denoised 4096² Cycles lightmap on `uv1` for the whole mall (no per-zone chunks, no `mall.blend`), with generated stone, plaster and oak textures. Reproducible from one command, and 1.01 MB. Meta and collision come from the greybox layout. Closed with #2.)* |
| T-203 | `tools/optimize-assets.ts` (gltf-transform: dedup, prune, join, meshopt, KTX2, resize) | M | tooling | One command processes every file in `assets-src/`. Deterministic output. ✅ *(`pnpm assets` builds the avatar and props packs: joins, dedup, prune, weld, meshopt, 512 px WebP. The same inputs give the same bytes. The greybox mall isn't meshopt-compressed yet, because the decoder would add to the first-load JS for about 100 KB saved after gzip.)* |
| T-204 | Asset budget CI: `gltf-transform inspect` on changed `.glb` files | S | tooling perf | Fails the PR with a table when over budget. ✅ *(A vitest over every shipped asset: size and triangles against the budget table in `docs/art-direction.md`.)* |
| T-205 | Zone chunk streaming: load within 25 m or on panel open, LRU unload, dispose GPU resources | M | client perf | Memory stays flat after walking the mall 5 times (heap + `renderer.info`) |
| T-206 | Baked zone-to-zone visibility → hide non-visible chunks | S | client perf | Draw calls drop ≥ 30 % in the concourse versus no culling |
| T-207 | Shared skeleton + `anims.glb` (13 clips, retargeted, root motion removed) | M | art | ≤ 200 KB. Every clip plays on both body types without foot sliding at nominal speed. ✅ *(With Kenney Mini Characters, CC0: 12 characters share one 7-bone rig and 9 clips in one 179 KB `avatars.glb`.)* |
| T-208 | Higgsfield → Blender: 2 bodies × 3 outfits with LOD0/1/2 on one atlas each, plus 6 hats and 2 glasses | L | art | Each outfit ≤ 400 KB. Prompts and licenses committed |
| T-209 | Avatar factory: body + outfit + accessories → one `Object3D`. Shares clips and materials | M | client | Creating a 2nd avatar with the same outfit downloads nothing and allocates no new textures. ✅ *(`AvatarKit.create` clones the skeleton only; geometry, material and texture are shared. Character picker on the landing screen; `look.avatar` on the wire, validated by the server.)* |
| T-210 | Animation state machine: idle / walk / run / jump / fall / land / sit, speed-matched blend, crossfades | M | client | No pops between states. Walk cycle speed matches movement speed. ✅ *(0.18 s crossfades; walk and sprint time-scaled to ground speed; emotes play a one-shot gesture when standing. There's no `land` clip in the pack. Remote avatars beyond 20 m animate at a third of the rate.)* |
| T-211 | Quality tiers + auto-detect (GPU probe + 3 s frame-time sample), saved | M | client perf | Low, Medium and High apply the settings table in the architecture doc. Changes live without reloading. ✅ *(Tiers set the pixel ratio, how far avatars animate at full rate, and how many shoppers there are, all live. Auto samples 3 s and steps once, then once more if it moved. Picker in Help. Post-processing and reflections join the table with T-212; MSAA stays on everywhere because it can't change without a new context.)* |
| T-212 | Floor reflections per tier (env-map / blurred / planar half-res) | M | client perf | High costs ≤ 3 ms on an M1. Low has zero extra passes. ✅ *(Medium and High get environment reflections: the furnished mall is captured once into a 128 px cube map, PMREM-filtered, and becomes `scene.environment`, so there's no per-frame cost. **High** adds a planar reflection of the concourse floor (`client/src/render/mirror.ts`: a half-resolution `Reflector` laid faintly over the baked stone, stronger at grazing angles). Measured at +0.8 ms a frame at 1280×720 on an Apple M5 Pro (0.95 ms against Medium's 0.16 ms, synchronous renders). Low turns both off.)* |
| T-213 | Ambient life: fountain shader, skylight clouds, 4–6 NPC shoppers wandering the navgrid at LOD2 | M | client art | Total cost ≤ 1 ms/frame on Medium. ✅ *(6 shoppers: local to each visitor, walking A* paths between shop windows and free benches, where they sit. Animated only within 30 m. The **fountain** has moving water: a rippling pool in each basin and a curtain falling from each rim (`client/src/world/fountain.ts`, levels measured off the model). The **skylight** shows a sky with drifting clouds (value-noise fbm on world position, `world/sky.ts`). Together 6 draw calls, no downloads.)* |

## Phase 3: Shops & UI

| ID | Task | Size | Labels | Acceptance criteria |
|---|---|---|---|---|
| T-301 | Preact overlay shell, `state.ts` signals, command bus, dock, toasts | M | ui | No component re-renders during steady walking (Preact devtools) |
| T-302 | Landing screen: name, body, outfit, accessories, live preview, online count. Preloads the world during the form | M | ui client | Enter → first playable ≤ 1 s on broadband when the preload is already done. Look is saved |
| T-303 | Signage generator: canvas painting, text fitting, complex-script shaping, per-script fonts loaded on demand | M | client | Burmese and Latin signs render correctly. ≤ 5 ms per sign. *(Changed from worker + IndexedDB: web fonts don't reach workers without extra loading code, and painting ~3 ms/sign is cheaper than a cache round-trip.)* |
| T-304 | Shop registry: config → slot storefronts (sign, window, door trigger), E / tap prompt | M | client | Moving a shop to another slot in config moves it in the world. No Blender change needed |
| T-305 | Shop panel (desktop sheet / mobile bottom sheet): details, features, products, CTAs, focus trap | M | ui a11y | Opens < 100 ms. Esc closes and returns focus. Works with no WebGL |
| T-306 | Product adapters: `static`, `json-url`. Cache (memory 5 min + last good copy in localStorage). Error state | M | client shared | Adapter failure shows an honest message, never fake products. Unit tests with mocked fetch. *(localStorage instead of IndexedDB: product lists are small, and it's far less code.)* |
| T-307 | Directory: categories, fuzzy search (multi-language), travel (walk < 40 m, else fade-teleport) | M | ui client | `/` opens it. Keyboard-only use works. Reduced motion → instant |
| T-308 | Minimap: SVG from meta (slots, you, friends), click to travel, floor switch | S | ui `good first issue` | Updates at ≤ 10 Hz. No layout thrash |
| T-309 | Overview camera (M): animated top-down view, tap to travel | S | client | Transition ≤ 800 ms, skipped with reduced motion |
| T-310 | Deep links `?s=<shop>` and `?at=x,z,yaw,floor`, plus Share buttons | S | client | Opening a link spawns you there with the panel open. Unknown id → toast + default spawn. *(Query parameters instead of `/s/:id` paths: they work on any static host with no rewrite rules.)* |
| T-311 | Static HTML directory (`/directory`) generated at build from config: shops, links, products | S | tooling a11y | Lighthouse SEO ≥ 95. Fully usable with JS disabled |
| T-312 | i18n: string tables, locale switcher, per-locale font loading, `Intl.NumberFormat` prices | M | ui | Switching locale re-renders UI and signs without a reload |

## Phase 4: Multiplayer

| ID | Task | Size | Labels | Acceptance criteria |
|---|---|---|---|---|
| T-401 | `shared/protocol.ts`: message ids, INPUT/SNAPSHOT binary codec, JSON event types | M | shared | Property test: encode→decode round-trips within quantisation error. 11 bytes/player |
| T-402 | Server core: HTTP health, ws upgrade, JOIN/WELCOME, 15 Hz tick, snapshot broadcast | M | server | 1 client sees another move. `GET /health` → 200 with room counts |
| T-403 | Sessions: resume tokens (30 s grace), rooms of 100, auto-shard `main-N`, interest by zone (≤ 40 nearest) | M | server | Reconnecting within 30 s produces no join/leave. The 101st player lands in `main-2` |
| T-404 | Client socket: backoff 0.5→8 s, resume, offline banner, falls back to single-player | S | client net | Network kill for 10 s → resumes silently. Server down → the mall still works alone |
| T-405 | Snapshot ring buffer + interpolation at −100 ms, extrapolation ≤ 250 ms | M | client net | Smooth motion at 10 % packet loss (simulated) |
| T-406 | Remote avatars: pool, LOD tiers, animation throttle, instanced name tags with distance fade | M | client perf | 100 remote players: ≤ 16 ms/frame on Medium with 40 visible. *(Done for placeholder capsules: one instanced draw for all bodies and one for all tags. LOD tiers and animation throttling move to T-209/T-210, once there are real skinned avatars to throttle.)* |
| T-407 | Chat: panel, global channel, rate limits, 200 chars, safe rendering, join/leave batched every 2 s | M | client server ui | No `innerHTML` with user text (lint rule). Batching verified by test |
| T-408 | Emotes + speech bubbles above avatars (5 s) | S | client | Visible only to the interest set |
| T-409 | Moderation: name/chat filter (pluggable word list), per-user mute (client), report → server log/webhook | M | server ui | Muted user's chat and bubbles hidden. The report includes the last 20 messages |
| T-410 | Host role: `HOST_SECRET` → `/host-token` JWT (12 h), gold tag, "Host is here" on the landing page, announcements | S | server client | The token is never stored in `localStorage`. An invalid token is rejected with a clear error |
| T-411 | Dockerfile (distroless) + `docker-compose.yml` with the static site | S | tooling | `docker compose up` → working multiplayer mall on :8080. *(Server image is ~160 MB: the Node 24 runtime in the distroless base is almost all of it, so the original < 80 MB target was unrealistic. The web image is ~50 MB.)* |
| T-412 | `tools/bots.ts`: N headless bots walking navgrid paths and chatting | S | tooling server | 100 bots run from one laptop. Server metrics are logged |

## Phase 3b: Live content

| ID | Task | Size | Labels | Acceptance criteria |
|---|---|---|---|---|
| T-700 | Rename Shopping Mall → Shopping Mall: packages, Docker images, docs, demo mall name | S | tooling | No "Shopping Mall" left except history. CI green |
| T-701 | Postgres schema + migrations (mall, shops, products, assets); seed from `mall.config.ts` on an empty database | M | server shared | `pnpm db:migrate` is idempotent. Seeding twice creates nothing new. Tests run against a real Postgres (CI service). ✅ |
| T-702 | Content API: `GET /api/content` (public, cached by version), host-only writes for mall, shops and products, with shared zod validation | M | server shared | Writes without a host token get 401. Invalid data gets 400 with field paths. Content version bumps on every write. ✅ |
| T-703 | Uploads to S3-compatible storage, asset records keyed by content hash, size and type limits | M | server | Duplicates dedupe by hash. Works with SeaweedFS locally and Railway buckets. *(Uploads go through the server rather than presigned PUTs: no dependence on bucket CORS, and the server checks magic bytes. Files are served same-origin from `/files/<kind>/<sha256>.<ext>`, cached immutably.)* ✅ |
| T-704 | `/admin` page (host only): list, add, edit, delete and reorder shops, products, slot assignment, and the asset library | L | ui | A new shop with a logo and 3 products takes under 2 minutes. Keyboard accessible. Confirms before deleting. ✅ (measured 1.55 s scripted; plain buttons and labelled fields throughout. Served as a second Vite page at `/admin/`, 5.4 KB gz, not counted in the mall's budget) |
| T-705 | Live updates: server broadcasts `content` version, clients refetch and repaint signs, panels, directory and zones | M | client server | A change in /admin shows on another visitor's screen within 2 s, without a reload. ✅ (measured ~1.5 s, API → sign) |
| T-706 | Swappable art: mall package (model + collision + meta + navgrid), avatars and props loaded via asset records. Upload validates the meta schema and bakes the navgrid | L | client server tooling | Replacing the mall model in /admin swaps the building on the next visit. A bad package is rejected with a clear error. ✅ *(The mall package is done: admin → Building, server-side validation and bake in 0.9 s, format in `docs/art-direction.md`. Avatars are still drawn in code and there are no props yet, so their asset slots arrive with the avatar factory, T-209, and the Phase 2 kit.)* |
| T-707 | Railway deploy: server + Postgres + bucket, env docs, daily `pg_dump` to the bucket. compose gains Postgres + MinIO | M | tooling | A deploy from `main` works end to end. Restoring a backup is documented and tested once. ✅ *(Live at web-production-cc219.up.railway.app in Singapore: web, server, Postgres 18, bucket `uploads`, and a `backup` cron at 03:00 UTC. `.railway/railway.ts` matches the live project (`railway config plan` is clean). compose uses SeaweedFS, since MinIO's images are gone. Restore tested locally, see `docs/deploy.md`.)* |

## Phase 5: Performance, accessibility, mobile

| ID | Task | Size | Labels | Acceptance criteria |
|---|---|---|---|---|
| T-501 | `pnpm perf` Playwright gate (Fast 4G, 4× CPU): time to playable, frame times, draw calls, heap → PR comment | M | tooling perf | Fails the PR when any budget in `performance.md` is exceeded. ✅ *(`pnpm perf` runs in the CI `browser` job and posts the table to the job summary. Pushes go straight to main, so there are no PR comments. Headless CI has no GPU, so frame time is enforced only with `pnpm perf --gpu`. Measured on an Apple M5 Pro with the GPU: playable in 1.4 s after 521 KB, 64 draw calls, 51k tris, 21 MB heap, p90 8.3 ms.)* |
| T-502 | Dynamic resolution (0.75–1.0) + idle 30 fps + hidden-tab pause | S | client perf | p90 frame time stays under budget on the Low device. ✅ *(Scale drops 0.05 after 30 frames over budget (33 ms on Low, 16.7 ms otherwise) and climbs back after 180 with headroom. Idle means 10 s with no input, no movement and nobody walking in view; it measured 29 fps against 144 when active.)* |
| T-503 | Zero-allocation audit: scratch pools, preallocated buffers | M | client perf | Chrome allocation timeline shows ~0 B/frame while walking. ✅ *(Measured on the production build, 8 s of walking at 144 fps: one minor GC of 0.8 ms and no major GC. Our per-frame garbage is gone: ray casts use `castRay`, a shapecast with shared scratch that matches `raycastFirst`, and anim unpacking and loops no longer allocate. What's left, about 38 KB/frame by the sampling profiler, is number boxing inside three.js uniform caches and three-mesh-bvh's triangle setup, which V8 scavenges almost for free.)* |
| T-504 | a11y audit: axe-core in e2e, focus order, labels, reduced motion, live-region chat | M | a11y | 0 serious or critical axe issues. The whole directory → shop → link flow works with a screen reader. ✅ *(`pnpm a11y` scans the landing, HUD, directory, shop panel, help and chat, and drives directory → shop → links from the keyboard alone, in CI. No issues found. Chat, toasts, zone changes and announcements are live regions. A manual VoiceOver pass is still worth doing.)* |
| T-505 | Phone layout pass: safe areas, centre kept clear, sheets, landscape | M | ui | Verified on iOS Safari + Android Chrome. Screenshots in the PR. 🟡 *(Layout pass done against emulated iPhone 13 (portrait and landscape, safe areas) and Pixel 7: the zone pill moved under the top bar, dialogs stop short of the dock, and there's a compact landscape landing. `pnpm screenshots` regenerates the shots. **Checked on a real iPhone** by the maintainer (2026-09-30): fine, except long shop names ran under the Run button and past the minimap, and the emoji button in the dock was blank. Fixed: prompts sit above the touch buttons and shorten long names with "…", the zone pill stops short of the minimap, and the dock's emoji shows. A real Android phone is still to try.)* |
| T-506 | Audio: ambient loop, UI SFX, door chime, positional fountain, volume settings | S | client | Nothing plays before the first interaction. Total ≤ 250 KB. ✅ *(The mall ambience and fountain loops were generated with Higgsfield Seed Audio and made into seamless loops with ffmpeg at build time (each file carries a repeat of its first 0.5 s, so the client overlaps passes on identical audio), with loudness normalized at runtime. The fountain is positional. The UI tap and door chime are generated clips too (11 KB, cut out of their silence at build time), with synthesized fallbacks. 211 KB in all. Volume sliders are in Help. Suspended in hidden tabs. Nothing is fetched before the first interaction (checked in the browser). The listening pass: #3.)* |
| T-507 | Social verbs: wave, dance, hug (two-player sync), apple pick/throw (arc, client-side) | M | client server | Hug aligns both avatars. Everything is rate-limited. ✅ *(Done: sit on benches together (E or tap; three spots per bench; stand by moving; others see it as ANIM.sit), the wave gesture for 👋, and **dance (💃, key 7) and hug (🤗, key 8)**, keyframed on the 7-bone rig in `tools/assets/social-clips.ts` so they play on every character. A dance lasts six bars and ends when you move. A hug turns you to the nearest person within 1.8 m, and them back to you, so both avatars line up (checked with two browsers against a local server). Emotes share the server's rate limit. **Apples:** two fruit stands under the bridge. F (or the 🍎 prompt) picks up to three, and F throws one where the camera looks. The throw (origin and velocity) goes to people nearby: the server checks that it starts where you stand and isn't too fast, and rate-limits it to 3, then 1 a second. Every client flies it the same way, bouncing off the collision mesh (`client/src/world/apples.ts`, one InstancedMesh).)* |

## Phase 6: Launch

| ID | Task | Size | Labels | Acceptance criteria |
|---|---|---|---|---|
| T-601 | VitePress docs site: operator guide (config, adding shops, adapters, self-hosting), contributor guide | M | tooling | A volunteer self-hosts from the docs without help. ✅ *(<https://devmtnaing.github.io/shopping-mall/>, built from `docs/` by `.github/workflows/docs.yml`. New pages: quick start, shops and products (admin page, JSON feeds), configuration, contributing. The existing docs and ADRs are included, with local search. Whether a volunteer can self-host from it is still to be seen.)* |
| T-602 | Demo deploy + one-click deploy template (static host + container host) | S | tooling | Demo URL in the README. Deploy button works. ✅ *(The Railway template <https://railway.com/deploy/shopping-mall> has web, server, Postgres, the uploads bucket and the backup cron, and asks only for `HOST_SECRET`. The button is in the README and docs. Static hosting is `pnpm build` plus any host, documented in the quick start.)* |
| T-603 | Analytics sink example (beacon → JSON logs) + privacy note | S | client | No cookies, no personal data. Events documented. ✅ *(Six anonymous events (visit, enter, shop, link, product, leave) are batched with `sendBeacon` to `POST /api/events` and logged as JSON lines. No identifiers of any kind. Off with Do Not Track, Global Privacy Control or `EVENTS=off`. See `docs/privacy.md`.)* |
| T-604 | Release: changelog, `v1.0.0` tag, 60 s demo video, launch post | S | tooling | Release published on GitHub. ✅ *(`CHANGELOG.md`, the `v1.0.0` release with the demo video attached (`pnpm demo:video` records the tour, about 40 s). The launch post is drafted for the maintainer to publish.)* |

---

## Dependency graph (critical path highlighted)

```mermaid
flowchart LR
  T001[T-001] --> T002[T-002] --> T102[T-102] --> T104[T-104 controller]
  T101[T-101 greybox] --> T104 --> T106[T-106 camera] --> T202[T-202 real mall]
  T104 --> T108[T-108 navgrid] --> T109[T-109 tap-to-walk]
  T004[T-004 config] --> T304[T-304 shop registry] --> T305[T-305 panel]
  T207[T-207 skeleton] --> T209[T-209 avatar factory] --> T406[T-406 remote avatars]
  T401[T-401 protocol] --> T402[T-402 server] --> T405[T-405 interp] --> T406
  T406 --> T501[T-501 perf gate] --> T604[T-604 release]
  classDef crit fill:#E2B857,stroke:#8a6a1f,color:#111
  class T104,T202,T304,T209,T406,T501,T604 crit
```
