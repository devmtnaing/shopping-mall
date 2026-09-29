# Performance budget

Performance is a feature with hard limits. CI fails when a budget is exceeded.

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

The reference downloads ~5.1 MB of models on the landing page alone.

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

## Techniques (what we do to hit the budgets)

**Loading**
- Content-hashed, immutable assets. `index.html` is the only uncached file.
- `<link rel="modulepreload">` for the entry chunk. `<link rel="preload">` for the first world chunk and the default avatar, **started while the user is on the landing screen**, so the download overlaps with name typing.
- The Meshopt and KTX2 transcoders load from `/decoders/` (self-hosted, cached).
- Lazy chunks: the chat UI, directory search, overview camera and Shopify adapter are split out with `import()`.
- Load the host model only when the server reports that the host is online.

**Rendering**
- Baked lightmaps plus **one** `MeshStandardMaterial` variant per surface type. There are no dynamic lights except a hemisphere light for avatars.
- Merge static meshes per zone by material at export time (`gltf-transform join`). Instance repeated props (benches, planters, rails, lights) with `InstancedMesh`.
- Frustum culling (built in) plus **zone visibility**: each zone lists the zones visible from it (baked), and everything else gets `visible = false`.
- Sign textures: one atlas per shop, mipmapped, anisotropy 4.
- Avatars: LOD plus animation throttling (see [architecture](architecture.md#avatars)). Name tags are one instanced draw.
- Cap pixel ratio by tier. Render at dynamic resolution (scale 0.75–1.0) when frame time goes over budget for 30 frames.
- Pause rendering when the tab is hidden. Drop to 30 fps when idle for 10 s with no remote movement.

**Code**
- No allocations in the loop: scratch `Vector3`/`Quaternion` pool, preallocated snapshot buffers.
- The UI updates through signals only when a value changes. Nothing re-renders every frame.
- Collision: a capsule sweep against the BVH, only while the player is moving.

## Measured (2026-09-29, Apple M5 Pro, production build, 144 Hz)

| What | Result |
|---|---|
| GC while walking with shoppers (8 s) | 1 minor GC (0.8 ms), 0 major |
| Idle frame rate | 29 fps (144 when active) |
| `pnpm perf --gpu` | playable 1.4 s after 521 KB, 64 draw calls, 51k tris, 21 MB heap, frame p90 8.3 ms |

## Measuring

- `?debug`: an overlay with fps, frame-time graph, draw calls, triangles, textures, geometries, heap, net KB/s and quality tier. It uses `renderer.info` and no extra dependencies.
- `pnpm perf`: a Playwright script (`tools/perf.ts`, run after `pnpm build`; `--gpu` to enforce frame time):
  1. Throttles to Fast 4G + 4× CPU slowdown.
  2. Measures landing → first-playable time (a `performance.mark('playable')` in code).
  3. Walks a scripted path through the atrium for 20 s, records frame times, draw calls and heap.
  4. Fails if any budget above is exceeded. Writes a Markdown table to the CI job summary.
- `pnpm a11y`: axe-core on every main screen, plus a keyboard-only directory → shop run (`tools/a11y.ts`).
- `pnpm size`: checks the size of every file in `dist/` against `budgets.json`.
- Asset CI: `gltf-transform inspect` on every `.glb` and a fail when triangles, textures or size exceed the per-asset limits.

## Regression policy

A PR that exceeds a budget must either (a) fix the regression or (b) change `budgets.json` with a written reason, approved by a maintainer. Budgets only get looser with a reason.
