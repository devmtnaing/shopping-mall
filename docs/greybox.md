# Greybox layout

The greybox is the mall made of plain boxes. It came first, to tune movement, the camera and navigation before any art existed (roadmap Phase 1), and it's still where the layout lives.
`pnpm greybox` generates it from [`tools/greybox/layout.ts`](../tools/greybox/layout.ts) and writes:

| File | What |
|---|---|
| `client/public/assets/mall/greybox.glb` | Visual model, one mesh per material (about 14 draw calls) |
| `client/public/assets/mall/greybox.collision.glb` | Collision triangles for the player and the camera (at most 5k) |
| `client/public/assets/mall/mall.meta.json` | Slots, seats, spawns, zones, escalators ([schema](../shared/src/meta.ts)) |

`pnpm mall` then dresses the visual model in Blender and bakes its lighting into `mall.glb`, which is what visitors see. The collision, meta and navgrid stay the greybox's.

## Conventions

- Metres, **Y up**. The entrance is at **z = 0** and the mall runs along **−Z**.
- **Yaw** is in radians around +Y. `yaw = 0` faces −Z (into the mall) and `yaw = π/2` faces −X.
  Forward is `(−sin yaw, 0, −cos yaw)`, the same as a Three.js object's default facing.
- **West** (−X) is on your left as you walk in. **East** (+X) is on your right.

## Plan (ground floor, seen from above)

```
 z=−80 ┌──────────────────────────────── north wall ────────────────────────────┐
       │           FLAGSHIP  (stage with 2 steps at the back, 16 m wide)        │
 z=−68 ├───────────┬────────────┬── doorway 14 m ──┬────────────┬───────────────┤
       │ (closed)  │            │    fountain      │            │   (closed)    │
 z=−66 ├───────────┤            │    café tables   │            ├───────────────┤
       │   w5      │            │  esc B ↓(from −41)│           │      e5       │
       │   w4      │  concourse │                  │            │      e4       │
       │   w3      │   20 m     │ (under the bridge│            │      e3       │
       │   w2      │   wide     │   −33 … −41)     │            │      e2       │
       │   w1      │            │  esc A ↑ (to −33)│            │      e1       │
       │   w0      │            │                  │            │      e0       │
 z=−6  ├───────────┤            │                  │            ├───────────────┤
       │ (closed)  │  planter   │   spawn ↑        │            │   (closed)    │
 z=0   └───────────┴────────────┴── glass doors ───┴────────────┴───────────────┘
      x=−22      x=−10        x=−6               x=6          x=10           x=22
```

| Thing | Where | Size |
|---|---|---|
| Shop units | `w0` to `w5` at x ∈ [−22, −10], `e0` to `e5` at x ∈ [10, 22]; unit *i* spans z ∈ [−6 − 10i − 10, −6 − 10i] | 11.7 × 10 m inside, doorway 7 × 4.2 m |
| Upper floor | y = 8. Same units, prefixed `u-` | walls 7 m high, roof at 15 m |
| Atrium opening | upper floor, x ∈ [−6, 6], z ∈ [−66, −10] | solid parapets 1.1 m high; 4 m galleries either side |
| Sky bridge | upper floor, x ∈ [−6, 6], z ∈ [−41, −33] | |
| Escalator A | x = −3, rises from z ≈ −19.1 (ground) to −33 (bridge), with 1.2 m flat landings either end | 1.4 m steps (1.9 m overall), 30°, 1.2 m/s |
| Escalator B | x = 3, runs **down** from −41 (bridge) to z ≈ −54.9 (ground), landings the same | 1.4 m steps (1.9 m overall), 30°, 1.2 m/s |
| Flagship | z ∈ [−80, −68], stage 0.6 m high (x ±8, from z −77) reached by 0.2 m steps | doorway 14 × 4.8 m |
| Benches and sofas | Benches on the ground floor at x = ±8.6, z −16, −26, −46 and −56, facing the concourse. Upstairs, with their backs to the parapet and facing the shops, benches at x = ±6.9, z −16 and −56, and sofas at z −26 and −46. All are seats. | Benches are 0.45 m high: too high to step onto, so you'd have to jump |
| Spawn | (0, 0, −6), facing into the mall | |
| Planters | (−4.5, −5) by the entrance, (±6.5, −21), (6.5, −50); a seating island at (−6.5, −50) | 2 × 2 × 0.6 m |

## Zones

`Entrance`, `Main hall`, `Fountain court`, `Upper gallery`, `Sky court`, `Sky bridge`, and one per shop unit (priority 10).
The client shows the name of the highest-priority zone you're in. A shop's zone takes the shop's name.

## Movement tests built into the layout

- **Step-up:** you can walk up the flagship's steps (0.2 m), but benches (0.45 m) stop you.
- **Slopes:** you can walk up and down the escalators (30°) on your own, not only ride them.
- **Ceilings:** you can walk under the sky bridge, and jump under the upper floor.
- **Tight spots:** 1.55 m between the planters at x ±6.5 and escalator A's balustrade.
- **Escalators:** the walking surface is an invisible 30° ramp level with the middle of the moving steps, which the client draws (`client/src/world/escalators.ts`). Invisible walls along the balustrades, 1.6 m high, keep you on it all the way to the top.
- **Parapets:** invisible walls above the atrium's parapets, also 1.6 m up, stop you jumping onto them.
