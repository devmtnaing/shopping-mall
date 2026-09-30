# ADR 0002: Preact + signals for UI, kept outside the render loop

**Status:** Accepted · 2026-09-28

## Context
The overlay is a real UI: a landing form, panels, a searchable directory, chat, settings and dialogs. Written as hand-rolled DOM code in one big file next to the game logic, that becomes hard to change quickly.

## Decision
- The DOM UI is built with **Preact** components. Shared state lives in **@preact/signals** (`client/src/state.ts`).
- The game loop **writes** a small set of signals, and only when a value changes (zone, nearby shop, online count, chat).
- The UI sends **commands** (`travelTo`, `openPanel`, `sendChat`) through a typed command bus.
- UI code never imports Three.js, and game code never touches the DOM apart from the canvas.

## Consequences
- It costs about 5 KB gzipped, components are easy to test, and the line between UI and game stays clear.
- Nothing re-renders every frame, so the UI costs next to nothing while you walk.
- Name tags and speech bubbles are drawn in WebGL (instanced) rather than as DOM elements, so a crowd doesn't cost layout time.

## Alternatives
Plain DOM code (hard to maintain at this size), React (four times larger), Svelte (fine, but it adds a compiler step and fewer people know it), Lit (web components add boilerplate for this use).
