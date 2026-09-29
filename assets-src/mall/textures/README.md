# Mall textures

Tileable surface photos for the Blender bake (`pnpm mall`, `tools/blender/build.py`). Each one is
optional: without it, the build generates that pattern itself.

The build uses only a photo's **luminance** as detail. It normalises the brightness and caps the
contrast (`PHOTO` in build.py), then multiplies by the material's colour (`LOOK`), so the mall keeps
its palette and the lightmap bake stays even. It also makes each photo tile: plaster gets a
half-offset blend towards the edges; tiles and planks get their joint drawn along the edge.

| File | Surface | Metres per repeat | What it should show |
|---|---|---|---|
| `floor.png` | concourse floor | 1.2 | 2 × 2 stone tiles meeting at the image's edges |
| `wall.png` | walls | 2.4 | even plaster, no features |
| `shopfloor.png` | shop floors | 2.0 | 10 rows of planks running across |
| `ceiling.png` (none yet) | ceilings | 2.4 | 4 × 4 ceiling tiles |

Generated with Higgsfield's GPT Image 2.5 (`gpt_image_2_5`, `--quality high --resolution 1k
--aspect_ratio 1:1`, 1.5 credits each) on 2026-09-29, for issue #4 batch 4. Prompts:

- **floor.png:** Seamless tileable texture, straight top-down orthographic view, flat even lighting with no shadows or highlights: polished light cream limestone floor, exactly four square tiles in a 2 by 2 grid filling the frame edge to edge, very thin light grey grout lines, soft subtle natural veining and speckles, each tile a slightly different warm tone, no perspective, no objects
- **wall.png:** Seamless tileable texture, straight-on orthographic view, flat even lighting with no shadows: smooth warm off-white interior plaster wall, very subtle soft trowel marks and fine mottling, low contrast, uniform all over with no seams, edges or features, no perspective, no objects
- **shopfloor.png:** Seamless tileable texture, straight top-down orthographic view, flat even lighting with no shadows: light natural oak wood plank floor, planks running horizontally, exactly ten rows of planks filling the frame from top to bottom, staggered plank ends, thin dark gaps between planks, soft visible wood grain, gentle tone variation between planks, no perspective, no objects

Like the generated props, they're distributed with the project under its asset licence (CC BY 4.0),
to the extent the owner holds rights in them (see `assets-src/props/higgsfield/LICENSE.md`).
