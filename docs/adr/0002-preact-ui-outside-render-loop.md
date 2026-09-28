# ADR 0002: Preact + signals for UI, kept outside the render loop

**Status:** Accepted · 2026-09-28

## Context
The overlay has real UI: a landing form, panels, a directory with search, chat, settings and dialogs. In the reference, all of that is hand-rolled DOM code inside one 833-line `app.js`, mixed with game logic.

## Decision
- The DOM UI is built with **Preact** components. Shared state lives in **@preact/signals** (`client/src/state.ts`).
- The game loop **writes** a small set of signals only when a value changes (zone, nearby shop, online count, chat).
- The UI sends **commands** (`travelTo`, `openPanel`, `sendChat`) through a typed command bus.
- UI code never imports Three.js. Game code never touches the DOM, except for the canvas.

## Consequences
- ✅ About 5 KB gz. Components are easy to test. The separation stays clear.
- ✅ No per-frame re-renders. The UI costs about zero while walking.
- ⚠️ Name tags and speech bubbles are rendered in WebGL (instanced), not as DOM elements, to avoid layout cost with many players.

## Alternatives
Vanilla DOM (hard to maintain at this size), React (4× larger), Svelte (fine, but adds a compiler step and fewer people know it), Lit (web components add boilerplate for this use).
