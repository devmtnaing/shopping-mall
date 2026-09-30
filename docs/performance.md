# Performance budget

Speed is a feature here, with hard limits: CI fails when anything goes over budget.

## Reference devices

| Tier | Device | Target |
|---|---|---|
| Low | Samsung Galaxy A15 / iPhone 11 | 30 fps steady, Low quality |
| Mid (**primary**) | Pixel 7a / Galaxy A55 / iPhone 13 | 60 fps, Medium quality |
| High | M-series Mac / RTX laptop | 60+ fps, High quality |

## Budgets

### Download
| Item | Budget (over the wire) |
|---|---|
| JS (initial, gz) | **≤ 220 KB** (three core ~130 KB + app ~60 KB + Preact ~5 KB) |
| CSS | ≤ 15 KB |
| Fonts | ≤ 60 KB (1 variable woff2, subset). Complex-script fonts load lazily per locale |
| First-playable world chunk (atrium + concourse) | **≤ 1.5 MB** |
| Animation pack | ≤ 200 KB |
| Each avatar outfit | **≤ 400 KB** |
| **Total to first playable frame** | **≤ 2.5 MB** |
| Whole mall incl. all interiors | ≤ 8 MB |

### Runtime (per frame, primary device, Medium)
| Metric | Budget |
|---|---|
| Frame time p90 | ≤ 16.7 ms |
| Draw calls | ≤ 120 (desktop High ≤ 200) |
| Triangles rendered | ≤ 350k |
| Texture memory | ≤ 200 MB |
| JS heap | ≤ 120 MB |
| GC pauses in the loop | 0 allocations per frame in steady state |
| Skinned meshes animating at full rate | ≤ 16 |

### Network
| Metric | Budget |
|---|---|
| Downstream per client (40 visible players) | ≤ 8 KB/s |
| Upstream per client | ≤ 0.3 KB/s |
| Server CPU per 100 players | ≤ 10 % of one core |

## How we stay within budget

### Loading
- Content-hashed, immutable assets. `index.html` is the only uncached file.
- `<link rel="modulepreload">` for the entry chunk, and `<link rel="preload">` for the first world chunk and the default avatar. These **start while you're on the landing screen**, so the download happens while you type your name.
- The Meshopt and KTX2 transcoders load from `/decoders/` (self-hosted, cached).
- Lazy chunks: the chat UI, directory search, overview camera and Shopify adapter are split out with `import()`.
- The host's model loads only when the server says the host is online.

### Rendering
- Baked lightmaps, and **one** `MeshStandardMaterial` variant per kind of surface. The only dynamic light is a hemisphere light for the avatars.
- Merge static meshes per zone by material at export time (`gltf-transform join`). Instance repeated props (benches, planters, rails, lights) with `InstancedMesh`.
- Frustum culling (built in), plus **zone visibility**: each zone has a baked list of the zones you can see from it, and everything else is hidden.
- Sign textures: one atlas per shop, mipmapped, anisotropy 4.
- Avatars: LOD plus animation throttling (see [architecture](architecture.md#avatars)). Name tags are one instanced draw.
- The pixel ratio is capped by quality tier. When frame time is over budget for 30 frames, the resolution scales down, as far as 0.75.
- Rendering pauses when the tab is hidden, and drops to 30 fps after 10 s with nobody moving.

### Code
- No allocations in the loop: scratch `Vector3` and `Quaternion` objects, and snapshot buffers allocated up front.
- The UI updates through signals only when a value changes. Nothing re-renders every frame.
- Collision is a capsule sweep against the BVH, and only runs while the player moves.

## Measured (2026-09-29, Apple M5 Pro, production build, 144 Hz)

| What | Result |
|---|---|
| GC while walking with shoppers (8 s) | 1 minor GC (0.8 ms), 0 major |
| Idle frame rate | 29 fps (144 when active) |
| `pnpm perf --gpu` | playable 1.4 s after 521 KB, 64 draw calls, 51k tris, 21 MB heap, frame p90 8.3 ms |

## Measuring

- `?debug` shows an overlay: fps, a frame-time graph, draw calls, triangles, textures, geometries, heap, network KB/s and the quality tier. It reads `renderer.info` and needs nothing extra.
- `pnpm perf` is a Playwright script (`tools/perf.ts`; run it after `pnpm build`, and add `--gpu` to enforce frame time). It:
  1. Throttles to Fast 4G with the CPU slowed 4×.
  2. Times the landing screen to the first playable frame (a `performance.mark('playable')` in the code).
  3. Walks a set path through the atrium for 20 s, recording frame times, draw calls and heap.
  4. Fails if anything is over budget, and writes a Markdown table to the CI job summary.
- `pnpm a11y` runs axe-core on every main screen, and goes from the directory to a shop using only the keyboard (`tools/a11y.ts`).
- `pnpm size` checks every file in `dist/` against `budgets.json`.
- In CI, `gltf-transform inspect` runs on every `.glb`, and fails when triangles, textures or size go over that asset's limit.

## Regression policy

A PR that goes over a budget has to fix the regression, or change `budgets.json` with a written reason that a maintainer approves. Budgets only get looser for a reason.
