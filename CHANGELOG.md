# Changelog

## 1.0.0 (2026-09-29)

The first release: a multiplayer 3D shopping mall that runs in the browser, which you host and run from an admin page.

**Live demo:** <https://web-production-cc219.up.railway.app> · **Docs:** <https://devmtnaing.github.io/shopping-mall/>

### The mall
- A two-floor mall with 25 shop units, escalators, a skybridge, a fountain court and a flagship store, **baked in Blender** (Cycles lightmap, generated stone, plaster and wood textures). `pnpm mall` rebuilds it.
- Furniture and decoration from a props pack: benches, a fountain and trees (Higgsfield), plus plants, bins, lamps, café tables, sofas and shop fixtures (Kenney, CC0). Drawn instanced.
- Ambient life: shoppers who window-shop and sit on benches. Sound: mall ambience, a positional fountain, a door chime and UI taps.

### Visitors
- A third-person controller with collision, stairs and escalators. Tap or click to walk, directory travel, a minimap, an overview camera, "You are in…" zones, and shareable links to a shop or a spot.
- **12 animated characters** (Kenney Mini Characters, CC0) with walk, run, jump, sit and wave. A character and colour picker.
- Shop panels with descriptions, features, links and products (listed in the admin page, or from a JSON feed). A searchable directory. A server-rendered shop list at `/directory/` for search engines and screen readers.
- English and Burmese.

### Together
- WebSocket multiplayer: 15 Hz binary snapshots, interpolation, the nearest 40 people, and rooms of 100 that overflow into more rooms. Reconnect with resume.
- Chat, emotes and speech bubbles, sitting on benches together, host announcements, mute and report, and a word blocklist.

### Running it
- **An admin page** for the host: shops, products, units, images, the mall's details, and **the building itself** (upload a model, collision and meta, and the server validates it and bakes the navgrid). Changes go live for everyone within about 2 s.
- Postgres for content, S3-compatible storage for uploads, and nightly backups with a tested restore.
- `docker compose up` anywhere, or Railway (`.railway/railway.ts` describes the demo project).
- Anonymous usage events to your own logs: no cookies, no identifiers. See [privacy](docs/privacy.md).

### Quality
- Performance budgets enforced in CI (`pnpm perf`): playable in about 2.4 s on Fast 4G after 1.66 MB, 63 draw calls, 8.3 ms frame time on an Apple M5 Pro. Initial JS ≤ 220 KB gzipped. Every asset has a size budget.
- Quality tiers with auto-detect, dynamic resolution, a 30 fps idle mode and allocation-free hot paths.
- Accessibility checked in CI with axe-core (no serious or critical issues), a keyboard-only flow, live regions and reduced motion. A phone layout pass for portrait and landscape.

### Known gaps
- Real-device checks on iOS Safari and Android Chrome ([T-505](docs/tasks.md)).
- Architectural detail on the building ([#2](https://github.com/devmtnaing/shopping-mall/issues/2)), and more art in small batches ([#4](https://github.com/devmtnaing/shopping-mall/issues/4)).
- A real door chime and UI tap, and a listening pass ([#3](https://github.com/devmtnaing/shopping-mall/issues/3)).
- Dance and hug (they need animation clips), and apples to throw.
- A one-click Railway template (the draft is ready and waiting on the maintainer).
