# Quick start

Shopping Mall is a 3D mall that runs in any modern browser. Visitors pick a name and a character, walk the concourse, open shops to browse products and follow links to buy, and see and chat with everyone else who's there. You run it: your shops, your products, your server.

## Try it

- **Live demo:** <https://web-production-cc219.up.railway.app>
- **Controls:** WASD or the arrow keys to walk, Shift to run, Space to jump, drag to look, scroll to zoom, click the floor to walk there, E to visit a shop or sit on a bench, / to search shops, M for the overview, ? for help. On a phone: a left-thumb joystick, drag to look, pinch to zoom, tap to walk.

## Run it on your machine

You need [Docker](https://www.docker.com/).

```bash
git clone https://github.com/devmtnaing/shopping-mall.git
cd shopping-mall
cp .env.example .env          # set HOST_SECRET to a password of your choice
docker compose up --build     # → http://localhost:8080
```

That starts the whole mall:
- the website
- the multiplayer server
- Postgres, for shops and products
- S3-compatible storage, for uploaded images and models

Open <http://localhost:8080/admin/>, sign in with your `HOST_SECRET`, and start adding shops: see [Shops and products](./shops).

## Put it online

- **Railway** (what the demo uses): one click with the template, where you only choose the admin password:

  [![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/shopping-mall)

  Or set it up by hand: [Self-hosting and deploying](../deploy#railway).
- **Any server with Docker**: the same `docker compose up`, behind your own domain and HTTPS proxy.
- **Static only** (no multiplayer, no admin): `pnpm build` and upload `client/dist/` to any static host. Shops then come from [`mall.config.ts`](./config).

## What's in the box

| | |
|---|---|
| **The mall** | A two-floor mall with 25 shop units, escalators, a fountain court, benches, plants and baked lighting. Replace the building from the admin page with your own Blender export ([art guide](../art-direction#replacing-the-building-mall-package)). |
| **Shops** | A sign on the storefront, a panel with a description, features, links and products (listed in the admin page, or fetched from your own JSON feed). |
| **People** | 15 animated characters, name tags, chat, emotes (including a dance and a hug that turns you both to face each other), sitting on benches. Up to 100 people per room, and busy malls overflow into more rooms. |
| **Hosts** | Sign in as the host for a gold name and announcements, and moderate with mute and report. |
| **Languages** | English and Burmese, with more addable in `client/src/i18n`. |
| **Quality** | Automatic Low, Medium and High tiers, a 30 fps idle mode, and screen-reader and keyboard support. |
