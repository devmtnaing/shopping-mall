# ADR 0001: Three.js instead of a custom WebGL engine

**Status:** Accepted · 2026-09-28

## Context
The reference (NC Mall) uses a ~350-line hand-written WebGL2 renderer plus a ~210-line glTF loader. That's lean, but it has one shader, basic skinning and no texture compression. Every new feature (lightmaps, KTX2, LOD, reflections) would have to be written from scratch. Plaza is open source, so contributors need to be able to work on it without learning a private engine.

## Decision
Use **Three.js** (`WebGLRenderer`, with `WebGPURenderer` behind a flag), importing only the modules we use. Don't use React Three Fiber.

## Consequences
- ✅ glTF, Meshopt, KTX2, skinning, `AnimationMixer`, `InstancedMesh`, PMREM and lightmaps all come built in and well tested.
- ✅ Most web-3D developers already know it. There's a huge body of examples.
- ✅ `three-mesh-bvh` gives fast collision and raycasts.
- ⚠️ About 130 KB gz of JS versus ~8 KB for the custom engine. That fits within the 220 KB budget.
- ⚠️ We must stick to disciplined patterns (no allocations in the loop, dispose on unload). Those are enforced by review and the perf gate.

## Alternatives
- **Custom engine:** smallest, but costs the most to maintain and puts off contributors.
- **Babylon.js:** more batteries included, but ~2× the bundle size.
- **PlayCanvas engine:** good, but a smaller open-source contributor pool.
- **React Three Fiber:** nice to write, but it adds React and reconciler overhead and makes it tempting to put game state in React.
