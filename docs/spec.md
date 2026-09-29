# Product spec

## Vision

A browser tab that feels like walking into a nice mall with friends. It opens in under three seconds, you can find any shop in two clicks, and it runs smoothly on a €200 phone.

## Users

| Who | Wants |
|---|---|
| **Visitor** | To look around, find a shop, see products, hang out with friends. No install and no account |
| **Mall owner** (the person deploying Shopping Mall) | To add shops and products by editing config. To see what visitors do. To host events |
| **Shop owner / tenant** | A good-looking storefront, products that stay in sync, clicks through to their store |
| **Contributor** | A codebase they can understand in an afternoon |

## Features

Priority: **P0** = MVP, **P1** = v1.0, **P2** = later.

### Entry
- **P0** Landing screen: mall name, tagline, name input, body type, outfit, live 3D preview, online count, "Enter".
- **P0** Remember name and look locally. Returning visitors skip straight to "Enter".
- **P1** Accessories (hat, glasses) as attachable meshes on the shared skeleton.
- **P1** Deep links: `?s=<shopId>` opens the mall with you standing at that shop and its panel open. `?at=x,z,yaw,floor` spawns you at that position. (Query parameters, so they work on any static host.)
- **P2** Colour tints for outfits (a single material parameter, no extra downloads).

### Movement & camera
- **P0** Third-person camera with collision (it never clips into walls), smooth follow, scroll/pinch zoom.
- **P0** WASD/arrows, Shift to run, Space to jump. Mouse drag or pointer lock to look.
- **P0** Mobile: virtual joystick (left), drag to look (right), Run/Jump/Sit buttons.
- **P0** **Tap/click-to-walk:** tap the floor to walk there along a path. Tap a shop to walk to its door.
- **P0** Two floors and escalators. Standing on an escalator carries you along it.
- **P1** Overview camera (M): top-down view of the whole mall. Tap anywhere to travel there.
- **P1** Sit: snap to the nearest seat, otherwise sit on the floor.

### Finding things
- **P0** "You are in *Zone*" label.
- **P0** Directory dialog with search (fuzzy, multi-language) and categories. Picking a shop walks you there (or teleports you if the path is longer than 40 m, with a quick fade).
- **P0** Minimap: shops as coloured blocks, you as an arrow, friends as dots. Click to travel.
- **P1** Wayfinding ribbon: a soft glowing line on the floor that guides you to the selected shop.

### Shops
- **P0** Storefront: signage generated from config (name, colours, logo image), window display, door trigger zone.
- **P0** Shop panel: title, tagline, description, features, product grid, CTAs. Opens with E, a tap, or by walking inside.
- **P0** Products come from an adapter (`static-json` built in). Each has image, name, price (formatted per locale), compare-at price and a link.
- **P1** In-store product boards generated from the same product data.
- **P1** Adapters: Shopify Storefront, WooCommerce Store API, generic JSON URL.
- **P1** "For rent" template shop with a contact CTA.
- **P2** 3D product pedestals: a product may include a `.glb` that you can rotate in the panel.
- **P2** Shop-owned interior themes (a pack of 4 interior kits).

### Social (multiplayer)
- **P0** See other visitors move smoothly, with name tags that fade with distance.
- **P0** Global chat (rate-limited, length-capped). Join/leave collapsed into a single "3 people joined" line.
- **P0** Emoji reactions (6) shown above the avatar.
- **P1** Speech bubbles above the speaker for 5 s. Per-user mute. Report button.
- **P1** Social verbs: wave, dance, apple throw, hug (both people play an animation).
- **P1** Host role: a gold name tag, a "Host is here" notice on the landing page, host announcements.
- **P2** Private rooms: `/?room=abc` creates a separate instance for a group of friends.
- **P2** Proximity voice (WebRTC, opt-in).

### Settings & accessibility
- **P0** Quality: Auto / Low / Medium / High. Auto picks a tier from a GPU probe and frame-time sampling.
- **P0** Respect `prefers-reduced-motion`: no camera bob, no fly-in, instant travel.
- **P0** The directory, shop panels and chat are all reachable by keyboard and screen reader, without using the 3D view.
- **P1** Languages: English + one right-to-left or complex-script language in CI (Burmese as the reference test, since it exercises complex text shaping in canvas signage).
- **P1** Volume sliders (ambience, SFX). Ambient music loads lazily.

### Operator features
- **P0** `mall.config.ts`: mall name, brand, shops, layout slots, outfits, languages, adapters.
- **P1** Anonymous analytics events (see [architecture § Analytics](architecture.md#analytics)) posted to a pluggable sink.
- **P2** Scheduled events: a banner, a countdown and a special spawn point.

## Non-goals (for now)
- Checkout inside the mall. We link out to the shop's own checkout.
- User accounts. Visitors are anonymous; the host gets a token.
- A level editor inside the app. Blender is the editor.
- VR. The architecture shouldn't rule it out, but we won't build it now.

## Controls reference

| Action | Desktop | Mobile |
|---|---|---|
| Move | WASD / arrows | Joystick |
| Walk to point | Click floor | Tap floor |
| Look | Drag, or click to lock the mouse | Drag right half |
| Run | Shift | Run button |
| Jump | Space | Jump button |
| Sit / stand | C | Sit button |
| Visit shop | E | Tap shop / prompt |
| Chat | Enter | Chat button |
| Emoji (7 dances, 8 hugs) | 1–8 | Emoji bar |
| Overview | M | Dock |
| Directory | / or K | Dock |
| Close panel | Esc | ✕ / swipe down |

## Success metrics
- p75 time from landing to first playable frame: **< 3 s** on desktop broadband, **< 6 s** on a Fast 4G profile.
- p75 frame time on the reference mid-range phone: **≤ 16.7 ms**.
- ≥ 40 % of sessions open at least one shop panel.
- Crash-free sessions ≥ 99.5 %. WebSocket reconnect success ≥ 99 %.
