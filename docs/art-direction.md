# Art direction & asset pipeline

## Look

**"Evening at a boutique mall."** Warm, calm and premium, not arcade-like.

- **Architecture:** pale travertine floor, warm-white walls, thin brass trims, glass storefronts with slim black mullions, a double-height atrium with a skylight. The reference has the right palette. We add material richness (subtle normal maps, roughness variation) and real light.
- **Light:** baked global illumination. Warm 3000 K downlights in shops, cooler daylight from the skylight, soft contact shadows under benches and planters. Signs have emissive strips and a subtle bloom on High.
- **Reflections:** a polished floor using a prefiltered environment map baked from inside the atrium. Planar reflection on High only.
- **Colour:** each shop brings its own `bg` + `accent`. The mall shell stays neutral so the shops stand out.
- **Characters:** stylised-realistic (like the Higgsfield outputs in the reference) to match the architecture. Every body shares one skeleton.
- **Motion:** eased camera, footstep dust on Medium and above, fountain water with a scrolling normal map, drifting skylight clouds, and 4–6 ambient NPC shoppers (an LOD2 crowd) so an empty mall doesn't feel dead.

## UI

The overlay sits on a busy 3D scene, so it has to be legible and stay out of the way.

| Token | Value |
|---|---|
| `--ink` | `#F6F1E7` |
| `--muted` | `#B9B2A5` |
| `--accent` | `#E2B857` (operators can override it) |
| `--glass` | `rgba(18,17,15,.62)` + `backdrop-filter: blur(14px)` (solid fallback on Low) |
| `--radius` | 999px pills, 20px sheets |
| Font | **Outfit** (variable) + a script-specific Noto font, loaded per locale |

- Dock at the bottom centre (icons with labels on desktop, icons only on phones). Sheets slide in from the right on desktop and up from the bottom on phones.
- Safe-area insets respected. **Nothing overlaps the centre 40 % of the screen** (the reference's emoji rail and prompt overlap on phones).
- Every interactive element is at least 44×44 px on touch.
- Dark only in v1. The 3D scene sets the mood.

## Asset pipeline

```mermaid
flowchart LR
  H[Higgsfield: character concept → 3D model] --> B1[Blender: retopo/decimate, rig to shared skeleton, bake 1K atlas]
  M[Blender: mall.blend] --> B2["Bake lightmaps (Cycles) → uv1"]
  B1 --> E[glTF export]
  B2 --> E
  E --> T[tools/optimize-assets.ts: gltf-transform]
  T -->|meshopt, KTX2 ETC1S/UASTC, dedup, join, prune| O[client/public/assets/*.glb]
  O --> CI[CI: inspect + budget check]
```

### Sources
v1 uses **free CC0 kits** (Kenney, Quaternius, Poly Pizza), recorded per asset in `assets-src/**/LICENSE`. Higgsfield-generated assets follow later as drop-in replacements through the asset library (ADR 0006); the licence has been checked and generated models may be committed.

### Characters
v1 ships the 12 characters of Kenney's **Mini Characters** (CC0), in `assets-src/avatars/kenney-mini-characters/`. `pnpm assets` builds `client/public/assets/avatars/`:

- **`avatars.glb`** (about 180 KB): every character as one skinned mesh (body and head joined, so one draw call each), sharing one 8 KB texture, plus **one** copy of the animation clips. All characters share Kenney's 7-bone rig, so the clips play on any of them. Scaled to 1.55 m. Meshopt-compressed.
- **`<id>.png`**: the 64 px preview used by the character picker.

Clips kept: `idle walk sprint jump fall sit emote-yes emote-no interact-right` (the list is `CLIPS` in `shared/src/avatars.ts`). The source also has wheelchair clips and wheelchairs, walking aids and glasses, which are a natural next addition.

To add or replace characters (for example Higgsfield ones later):
1. Put the `.glb` next to the others. It must use the same 7 joint names (`root torso head arm-left arm-right leg-left leg-right`) so the shared clips fit, or bring its own rig and clips.
2. Add its id to `AVATARS` in `shared/src/avatars.ts` (the server only accepts listed ids) and a 64 px preview.
3. Run `pnpm assets` and commit the output. `tools/test/avatars.test.ts` checks it.

Keep prompts for generated characters in `assets-src/avatars/<pack>/prompt.md`, and record each pack's licence in its folder.

### World
- Units are metres. The concourse is 12 m wide and floors are 7.6 m apart (matching the reference's scale, which feels right).
- Modular kit: storefront (3 widths), column, railing, bench, planter, light fixture, escalator. Repeated kit pieces export as instances.
- Lightmap UV on `uv1`, texel density 32 px/m (concourse) and 16 px/m (upper floor).
- Empties named `slot.<id>`, `seat.<id>`, `spawn.<id>`, `zone.<name>` (with scale = AABB), `esc.<id>.start|end`. `tools/export-meta.py` writes `mall.meta.json`.

### Replacing the building (mall package)
The building is swappable without a deploy: **admin → Building** takes three files and the server does the rest.

| File | What it is |
|---|---|
| Visual model `.glb` | What visitors see. Plain glTF 2.0 for now (meshopt and KTX2 arrive with `optimize-assets.ts`). Max 25 MB. |
| Collision model `.glb` | Simple, uncompressed triangles that people stand on and bump into. Every mesh in the scene counts, with its node transforms. Max 5 MB. |
| `mall.meta.json` | Floors, spawns, shop units, seats, zones and escalators, in the format of `shared/src/meta.ts`. |

On upload the server checks, in order, and refuses the package with the reason if any step fails:
1. The meta matches the schema (errors name the field, e.g. `meta.slots.3.door.yaw`).
2. Every current shop's unit exists in the new meta (move or delete shops first otherwise).
3. The visual model is a valid `.glb`.
4. The navgrid bakes: the collision model isn't absurdly large, every spawn is on walkable floor, and every escalator starts and ends on walkable floor.

The baked navgrid becomes the fourth file of the package. Visitors get the new building on their next visit. Files in use can't be deleted, and **Use the built-in building** switches back. The greybox in `client/public/assets/mall/` is itself a valid package: `pnpm greybox` rebuilds it and `pnpm navgrid` bakes it with the same code the server runs (`shared/src/bake.ts`).

### The built-in mall (Blender, issue #2)
`pnpm mall` rebuilds `client/public/assets/mall/mall.glb` in about 2.5 minutes. It needs Blender 4.2+ (set `BLENDER` if it isn't in `/Applications`). `tools/blender/build.py`, run headless:
1. **Imports the greybox**, so the dimensions, collision (`greybox.collision.glb`), meta and navgrid all stay the greybox's. Change the layout in `tools/greybox/` and run `pnpm greybox`, then `pnpm mall`.
2. **Culls faces nobody can see**: the exterior skin, and faces pressed against other geometry.
3. **Upgrades materials.** Tiling detail textures are generated in the script (60 cm stone floor tiles, plaster with panel seams, a ceiling tile grid, wooden shop floors), placed on UV0 by world-space box projection.
4. **Adds detail and lights**: dark bronze door frames, stone skirting, a cornice under each floor's ceiling, glass balustrades with brass handrails, ceiling light panels (glowing, plus area lights), a warm light in every shop, the flagship and lobby, and cool daylight through the skylight. Everything bakes as non-metallic, since metals have no diffuse light and would bake black; baked surfaces render unlit anyway.
5. **Bakes** direct and indirect diffuse lighting (no colour) into one 4096² lightmap on UV1: Cycles on the GPU, 512 samples, OpenImageDenoise. It then exports the model. `--exposure` is the one brightness knob (default 0.14).

`tools/assets/mall.ts` then embeds the lightmap (WebP). Intermediates live in `.cache/mall/` and aren't committed.

**Lightmap convention** (also for uploaded buildings): a material that carries a lightmap has it as its `occlusionTexture` on `TEXCOORD_1`, plus `extras: { lightmap: <scale> }`. The texture stores `sRGB(L / scale)`. The client renders those surfaces unlit, as base colour × L (`MeshBasicMaterial` with `lightMap`), so they look like the Cycles bake at the cheapest possible shader cost. Other glTF viewers just see ambient occlusion. Emissive and see-through materials (`lightpanel`, `skylight`, `glass`, `railglass`) aren't lightmapped. `extras.reflect` (on the floor) adds a faint environment reflection on Medium and High.

### Props
Furniture and decoration come in **props packs** by area, `client/public/assets/props/<pack>.glb`, built by `pnpm assets` from `assets-src/props/`:

| Kind | Source |
|---|---|
| `bench`, `fountain`, `tree`, `kiosk`, `welcome`, `palm`, `lanterns`, `recycling`, `island`, `coffee-bar` | Generated with Higgsfield (prompts in `assets-src/props/higgsfield/prompts.md`) |
| `plant`, `lamp`, `sofa`, `table`, `chair` | Kenney Furniture Kit (CC0) |
| `shelf`, `shelf-bags`, `register`, `cart`, `fruit` | Kenney Mini Market (CC0), for shop interiors |

| Pack | Kinds | Size |
|---|---|---|
| `entrance` | `kiosk`, `welcome`, `palm` | 133 KB |
| `concourse` | `bench`, `recycling`, `tree`, `plant`, `lamp`, `sofa` | 175 KB |
| `atrium` | `lanterns`, `island` | 75 KB |
| `court` | `fountain`, `table`, `chair` | 60 KB |
| `shops` | `coffee-bar`, `shelf`, `shelf-bags`, `register`, `cart`, `fruit` | 100 KB |

`props/index.json` says which pack holds which kinds. The client loads the packs with a placement within 35 m of the spawn right after the mall, then the rest one at a time when the browser is idle (nearest first, and walking up to one moves it to the front). So new props add to what loads in the background, not to what visitors wait for, and a pack nothing places is never downloaded. New props go in the pack for the area they furnish, or a new pack (add it to `PACKS`).

`tools/greybox/props.ts` lists each kind's pack, source, real size, facing fix and collision box. The pipeline scales each model to size, stands it on the floor, turns it to face −Z and shrinks textures to 384 px WebP. The mall's meta says where props go (`props: [{ kind, pos, yaw }]`), and the client draws each part of each kind as one `InstancedMesh`. Collision lives in the mall's collision mesh as plain boxes, so props are purely visual and a missing kind is simply skipped.

**Shop interiors.** Each shop's unit is furnished by its category (`client/src/world/interiors.ts`): the category text is matched by keyword to a layout (café, books, fashion, home, games, or a general store for anything else), and "For rent" units stay empty. Layouts are written in the unit's own frame (across, in from the door) and keep a clear aisle from the door to the back. They're rebuilt whenever the host changes the shops. Interior furniture comes from the same packs, and `index.json` carries each kind's collision box, so the client makes it solid with obstacle boxes on the player controller (the mall's collision mesh doesn't change with the shops). Units wider or deeper than 12 m, like the flagship, aren't furnished.

To restyle the mall's furniture, replace a source file and run `pnpm assets`. The placements and collision don't change. An uploaded building (admin → Building) uses the same packs, placed by its own meta's `props`.

### `optimize-assets.ts` steps
```
dedup → prune → join (per material, static only) → weld → simplify (LOD only)
→ meshopt (encode) → ktx2: ETC1S for albedo/lightmaps, UASTC for normals
→ resize (max 2048 world, 1024 avatars) → write
```

### Asset budgets (enforced in CI)
`tools/test/budgets.test.ts` checks every file under `client/public/assets` against this table and fails with a table of offenders. A file with no matching budget fails too.

| Asset | Tris | Size | Now |
|---|---|---|---|
| Mall visual (one world chunk) | 80k | 1.5 MB | 2.4k tris, 172 KB |
| Collision mesh | 50k | 1.5 MB | 2.2k tris, 91 KB |
| Navgrid | — | 60 KB | 9 KB |
| Avatar pack (all characters and clips) | 15k | 250 KB | 11k tris, 179 KB |
| Props pack (each area) | 20k | 200 KB | 175 KB (largest, `concourse`); loaded nearest first |
| Avatar preview | — | 8 KB | 2 KB |
| Audio loop (each / all) | — | 170 KB / 250 KB | 156 + 47 KB |

## Audio
- Ambient loop (soft crowd + fountain, 96 kbps Opus, ~40 s loop, lazy-loaded after the first interaction).
- UI clicks, a door chime when entering a shop, a pop for emoji. Every file is under 20 KB.
- Positional audio for the fountain only. Everything else plays in 2D.
