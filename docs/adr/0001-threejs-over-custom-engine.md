# ADR 0001: Three.js instead of a custom WebGL engine

**Status:** Accepted · 2026-09-28

## Context
A small hand-written WebGL2 renderer is tempting for a mall: a few hundred lines for the renderer and a glTF loader keep the download tiny. But such an engine usually has one shader, basic skinning and no texture compression, and every feature we need next (lightmaps, KTX2, LOD, reflections) would be written from scratch. Shopping Mall is open source, and contributors shouldn't have to learn a private engine before they can help.

## Decision
Use **Three.js** (`WebGLRenderer`, with `WebGPURenderer` behind a flag), importing only the modules we use. Don't use React Three Fiber.

## Consequences
- glTF, Meshopt, KTX2, skinning, `AnimationMixer`, `InstancedMesh`, PMREM and lightmaps all come built in and well tested.
- Most people who build 3D for the web already know it, and there are examples for almost everything.
- `three-mesh-bvh` gives us fast collision and raycasts.
- It costs about 130 KB gzipped, against roughly 8 KB for a hand-written engine. That still fits the 220 KB budget.
- We have to keep to some habits (no allocations inside the loop, dispose what we unload). Review and the performance checks in CI hold us to them.

## Alternatives
- **Custom engine:** the smallest download, but the most to maintain, and it puts off contributors.
- **Babylon.js:** more comes built in, but the bundle is about twice the size.
- **PlayCanvas engine:** good, with fewer open-source contributors around it.
- **React Three Fiber:** pleasant to write, but it brings React and the reconciler with it, and invites putting game state in React.
