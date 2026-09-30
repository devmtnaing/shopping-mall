# Contributing to Shopping Mall

Thanks for helping. Shopping Mall tries hard to stay **fast** and **easy to read**, so a few rules matter more here than usual. The [contributor guide](https://devmtnaing.github.io/shopping-mall/guide/contributing) on the docs site covers the setup in more detail, including the database and storage.

## Setup

```bash
pnpm install
pnpm dev          # http://localhost:5173  (add ?debug for the stats overlay)
pnpm check        # typecheck, lint, test, build, size budget: what CI runs
```

You need Node 24 and pnpm 10.

## Where things live

- `client/src/` is the browser app, and `server/src/` the multiplayer server and content API. `shared/src/` holds what both use: the protocol, the config and meta schemas, and the constants.
- `mall.config.ts` has the shops and products for a static mall, and seeds the database for a live one (where you edit shops at `/admin/`).
- `docs/` is the plan. Read the [architecture](docs/architecture.md) before a large change, and look in the [tasks](docs/tasks.md) for something to work on.

## Rules

1. **Budgets are hard limits.** `pnpm size` and `pnpm perf` have to pass. If you really need more room, raise `budgets.json` in the same PR and explain why.
2. **Nothing allocates in the frame loop.** Reuse scratch vectors. Don't create closures, arrays or `new Vector3()` every frame.
3. **Keep the game and the UI apart.** UI code never imports `three`, and game code never touches the DOM apart from the canvas.
4. **Keep files small.** When a file grows past about 300 lines, split it by what each part does.
5. **Tune in one place.** Movement and camera numbers live in `shared/src/constants.ts`.
6. **Never put user text in `innerHTML`.**

## Pull requests

- One task per PR, with its ID from `docs/tasks.md` (for example `T-104`).
- Say how you tested it. For anything visual, attach a screenshot or a clip, ideally from a phone as well.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat(client): …`, `fix(server): …`).

## Translations

The UI's strings are in `client/src/i18n/`. `en.ts` is the source; every other language is typed against it, and a test fails if a translation is missing or drops a `{placeholder}`.

- **To improve a language,** edit its file, such as `my.ts`. The Burmese strings were drafted without a native speaker, so a review would be very welcome.
- **To add a language,** copy `my.ts`, translate it, register it in `i18n/index.ts` (`LOADERS` and `NAMES`), and add its code to `mall.locales` in `mall.config.ts`. If it needs a font for its script, add that to `client/src/fonts.ts`.

Shop names, taglines and descriptions come from the shops themselves, so the UI doesn't translate them.

## Good first issues

Look for the `good first issue` label, or for tasks marked that way in `docs/tasks.md`.
