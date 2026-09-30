# Plan: realistic human characters and props

Status: proposed, not started. Backlog item in the [roadmap](../roadmap.md).

The mall's characters and props are stylized and low-poly (Kenney's Mini Characters, generated props in the same style). This plan swaps them for realistic people and props, keeping everything that works today: walking, running, jumping, sitting on benches, emotes, dancing, hugs, apple throws, up to 40 other players plus the background shoppers, the character picker, and the Burmese characters.

**What stays:** the engine, networking, server, admin, UI shell, the building and its lighting bake, shops and interiors. Most of the work is in the character pipeline, because the current one is built around Kenney's 7-bone rig.

**Scale is already right.** The mall is built at real-world size (a 1.75 m player capsule, 4.2 m doorways, 0.45 m benches), and the build already scales every character to 1.55 m tall (`HEIGHT` in `tools/assets/avatars.ts`). Realistic adults at about 1.72 m are a small change.

## Phase 0: decide (½ day)

1. **Where the characters come from.** Every character must share **one skeleton**, so one set of animations works for all of them.
   - Recommended: Quaternius's CC0 humanoid characters and animation library. CC0 is safe to include in this repo.
   - Alternative: generate people with Higgsfield or Tripo and auto-rig them onto the same skeleton.
   - Avoid Mixamo: its terms don't allow redistributing the raw files, and a public repo does exactly that.
2. **Budgets.**
   - About 400 KB and 10k triangles per character, plus a 2k-triangle low-detail version for distant players.
   - About 600 KB for the shared animations.
   - Characters keep loading after the world, so time to first view doesn't change.

## Phase 1: prototype one character (1–2 days), then go / no-go

- Load one realistic character behind a `?avatars=realistic` flag, in the real mall.
- Test with 40 simulated players (`tools/bots.ts`) and measure download size, draw calls and frame time (`pnpm perf`).
- Decide from real numbers before converting everything.

## Phase 2: the character build (`tools/assets/avatars.ts`)

- **Split the files.** Today one `avatars.glb` holds every character. Instead: one `animations.glb` (the shared skeleton and clips) plus one file per character, downloaded only when someone is wearing it.
- **Keep the clip names** the code uses (`idle`, `walk`, `sprint`, `jump`, `fall`, `sit`, `emote-yes`, `emote-no`, `interact-right`, `dance`, `hug`, listed in `shared/src/avatars.ts`), and map the source pack's clip names onto them with a table.
- **Walk and run play in place.** Strip the forward movement baked into the clips; the controller already moves the body.
- **Real sit, dance and hug animations** replace the hand-keyed ones in `tools/assets/social-clips.ts`.
- **Height:** `HEIGHT` to about 1.72 m.
- **Picker portraits:** render 64 px portraits with a small Blender script, since realistic packs don't come with previews.
- **Retire Kenney's rig transfer** (`tools/blender/rig.py`, `rig.ts`). Generated characters are auto-rigged onto the new skeleton, or left out until they are.

## Phase 3: the client

- **`client/src/avatars/kit.ts`**
  - Load the animations once, and each character on first use (cached).
  - Sitting: replace the Kenney-only numbers (`HIPS = 0.176` and the lift onto the seat) with each character's measured hip height, or a sit clip made at bench height.
  - Resize the fixed bounding sphere (`BOUNDS`), which is sized for Kenney's characters.
- **`client/src/render/crowd.ts`:** use the low-detail version beyond each quality tier's animation distance (`TIERS.animateWithin`, 12–30 m). Consider flat sprites beyond about 30 m.
- **`client/src/world/shoppers.ts`:** the same character loading. Fewer background shoppers on Low and Medium if frame time needs it.
- **Retune for adult proportions:**
  - The apple throw starts at 1.25 m (`client/src/main.ts`).
  - Hug range is 1.8 m (`client/src/net/multiplayer.ts`), and the hug animation should match it.
  - The seat spot's step back towards the backrest (`BACK` in `client/src/player/seats.ts`).
  - The name-tag height and the camera's shoulder offset (`CAMERA` in `shared/src/constants.ts`).
- **Character IDs** (`AVATARS` in `shared/src/avatars.ts`): map the old IDs to new characters, so a visitor's saved choice still loads. The server already checks IDs against this list.

## Phase 4: props

- **Swap the sources** in `tools/greybox/props.ts` for realistic models: Quaternius or Poly Haven (both CC0; Poly Haven models need simplifying), or Higgsfield prompts ending in "realistic, PBR" instead of "stylized low-poly, flat colors".
- **Footprints and sizes stay**, so collision, the layout and the shop interiors don't change.
- **Textures:** the props build assumes flat colours and collapses materials into palettes. For textured props, pack each kind's textures into one image to keep one draw call per kind.
- **Budgets:** props packs go from 200 KB to about 400–600 KB, with the reason written into the budget (`tools/test/budgets.test.ts`), as the [performance budget](../performance.md) requires.
- **Apples** are simple spheres in `client/src/world/apples.ts`; replace them with a model.

## Phase 5: building and UI (optional polish)

- The building already suits realism: baked light and photo textures. A higher-resolution lightmap and compressed textures would sharpen it.
- The character picker gets larger portraits.
- Outfits, hats and glasses (as in the reference mall) are a separate feature: swappable clothing pieces on the shared skeleton.

## Tests and CI

- Update the avatar budgets (`tools/test/budgets.test.ts`) and the avatar and clip tests.
- The seat tests change once the new sit heights are measured.
- Run `pnpm perf` with the new characters, and re-record the demo video (`pnpm demo:video`).

## Risks

- **Performance:** each of up to 40 players is a full animated character. Low-detail versions and slower animation for far players keep this in check.
- **Licences:** stick to CC0 or generated art.
- **Style mismatch:** realistic people next to the remaining cartoon pieces look odd, so characters and props should change in the same release.

**Rough effort:** 1½–2½ weeks, mostly phases 2–4. Phase 1 decides whether it's worth it.
