# Contributing to Plaza

Thanks for helping. Plaza aims to stay **fast** and **easy to read**, so a few rules matter more than usual.

## Setup

```bash
pnpm install
pnpm dev          # http://localhost:5173  (add ?debug for the stats overlay)
pnpm check        # typecheck, lint, test, build, size budget: what CI runs
```

Requirements: Node 22+ and pnpm 10.

## Where things live

- `plaza.config.ts`: shops, products and outfits. Operators edit only this file.
- `client/src/`: the browser app. `shared/src/`: config schema, constants and protocol. `server/src/`: multiplayer.
- `docs/`: the plan. Read [architecture](docs/architecture.md) before any large change and [tasks](docs/tasks.md) to find work.

## Rules

1. **Budgets are hard limits.** `pnpm size` (and later `pnpm perf`) must pass. If you need more room, raise `budgets.json` in the same PR and explain why.
2. **Nothing allocates in the frame loop.** Reuse scratch vectors. Don't create closures, arrays or `new Vector3()` per frame.
3. **Keep the game and UI separate.** UI code never imports `three`. Game code never touches the DOM, except for the canvas.
4. **Small files.** If a file grows past ~300 lines, split it by responsibility.
5. **Tune in one place.** Movement and camera numbers live in `shared/src/constants.ts`.
6. **No user text via `innerHTML`.**

## Pull requests

- One task per PR, referencing its ID from `docs/tasks.md` (e.g. `T-104`).
- Describe how you tested it. For anything visual, attach a screenshot or clip, ideally on a phone too.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat(client): …`, `fix(server): …`).

## Translations

UI strings live in `client/src/i18n/`. `en.ts` is the source of truth; every other locale is typed against it, and a test fails if a translation is missing or drops a `{placeholder}`.

- **Improve a language:** edit its file, e.g. `my.ts`. The Burmese strings were drafted without a native speaker, so review is very welcome.
- **Add a language:** copy `my.ts`, translate it, register it in `i18n/index.ts` (`TABLES` and `NAMES`), and add its code to `mall.locales` in `plaza.config.ts`. If it needs a script font, add it to `client/src/fonts.ts`.

Shop names, taglines and descriptions come from `plaza.config.ts` and aren't translated by the UI.

## Good first issues

Look for the `good first issue` label, or the tasks tagged that way in `docs/tasks.md`.
