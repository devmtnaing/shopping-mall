# Changelog

## Unreleased

- The flagship store is furnished when a shop takes it: a bay of its category's furniture down each side and a showcase on the stage.
- The fountain has moving water, and the skylight shows a sky with drifting clouds (T-213).
- On High, the stone floor mirrors the mall (T-212).
- Phones: long shop names no longer run under the Run button or into the minimap, and the dock's emoji button shows again.

## 1.1.0 (2026-09-30)

The mall gets furnished, dressed and a bit more social: shops you can see into, a character set that looks like Myanmar, dancing and hugging, apples to throw, real textures and sound, and a smaller first load.

**Live demo:** <https://web-production-cc219.up.railway.app> · **Docs:** <https://devmtnaing.github.io/shopping-mall/>

### The mall
- **Shop interiors.** Every shop is furnished to match its category (café, books, fashion, home, games, or a general store): a coffee bar and tables, bookcases, sneaker walls, plant stands, a row of arcade cabinets. The furniture is solid, and it follows the shops live when the host changes them. "For rent" units stay empty.
- **More of the mall:** an information kiosk, a welcome sign and palms at the entrance; Myanmar festival lanterns hanging in the atrium; recycling stations; a round seating island with a tree.
- **Real surfaces:** generated limestone floor tiles, plaster walls and oak shop floors in the Blender bake, which also gained door frames, glass balustrades, skirting and cornices.
- 19 new pieces generated with Higgsfield (prompts in `assets-src/`).

### Visitors
- **Three new characters,** generated and put on the same rig as the Kenney ones: a woman in a htamein with thanaka on her cheeks, a man in a longyi, and a student in the school uniform. 15 in all.
- **Dance (💃, key 7)** and **hug (🤗, key 8).** A hug turns you and the person you hug to face each other.
- **Apples:** pick them at the fruit stands (F) and throw them (F). Everyone nearby sees the same arc.
- **Sound:** a real door chime and UI tap, and seamless ambience and fountain loops.

### Under the hood
- Props ship in **packs by area**, loaded nearest first after the mall, so new furniture doesn't add to the wait. Every prop kind is one draw call.
- **First load is 1.38 MB** (was 1.66 MB): the bake's textures ship as WebP, and the mall model is 1.01 MB.
- `pnpm rig` puts a generated character on the Kenney rig in Blender. `pnpm assets` builds the audio with ffmpeg.

### Known gaps
- Real-device checks on iOS Safari and Android Chrome ([T-505](docs/tasks.md)).

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
- `docker compose up` anywhere, or one click on Railway: <https://railway.com/deploy/shopping-mall>.
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
