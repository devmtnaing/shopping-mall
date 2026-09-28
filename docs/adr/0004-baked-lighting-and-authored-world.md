# ADR 0004: Authored world in Blender with baked lighting

**Status:** Accepted · 2026-09-28

## Context
The reference builds the mall from code (boxes and transforms in `world.js`) and lights it in real time. That makes downloads tiny, but changing the layout requires programming, and the materials and lighting look flat up close. We want Plaza to look noticeably better on cheap phones.

## Decision
- Model the mall in **Blender** as a modular kit. Export glTF zone chunks with **lightmaps baked in Cycles** to `uv1`.
- Gameplay metadata (slots, seats, spawns, zones, escalators) comes from named empties and is exported to `mall.meta.json`.
- **Shop identity stays data-driven.** Signs, colours, window posters and product boards are generated at runtime from `plaza.config.ts`, as in the reference. Operators never need to open Blender to add or move a shop.

## Consequences
- ✅ High-quality lighting costs almost nothing at runtime. The shell uses no dynamic lights.
- ✅ Artists can improve the mall without touching code.
- ⚠️ Bigger downloads than procedural geometry. Streaming by zone plus Meshopt/KTX2 keeps us within 2.5 MB to first play.
- ⚠️ Lightmaps are static: shop colours don't bounce onto the floor. We fake it with an accent-coloured emissive strip and a floor decal per shop.
- ⚠️ Re-baking takes minutes. The bake script is committed and documented so the result is reproducible.
