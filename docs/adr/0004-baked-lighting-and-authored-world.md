# ADR 0004: Authored world in Blender with baked lighting

**Status:** Accepted · 2026-09-28

## Context
You can build a mall entirely in code, out of boxes, and light it in real time. The download is tiny, but changing the layout means programming, and up close the materials and lighting look flat. We want Shopping Mall to look clearly better than that, on cheap phones too.

## Decision
- Model the mall in **Blender** as a modular kit, and export glTF zone chunks with **lightmaps baked in Cycles** into `uv1`.
- Gameplay data (slots, seats, spawns, zones, escalators) comes from named empties and goes out as `mall.meta.json`.
- **Shops stay data.** Signs, colours, window posters and product boards are generated at runtime from `mall.config.ts`, so nobody has to open Blender to add or move a shop.

## Consequences
- Good lighting costs almost nothing at runtime: the building uses no dynamic lights.
- Artists can improve the mall without touching code.
- Downloads are bigger than for a mall built from boxes. Streaming by zone and compressing with Meshopt and KTX2 keep the first load within 2.5 MB.
- Lightmaps don't change, so a shop's colour doesn't bounce onto the floor in front of it. An accent-coloured glowing strip and a floor decal per shop fake it.
- A rebake takes minutes. The bake script is in the repo and documented, so anyone gets the same result.
