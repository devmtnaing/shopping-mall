# Quick start

Shopping Mall is a 3D mall that runs in any modern browser. Visitors pick a name and a character, walk around, open shops to browse products and follow links to buy them, and chat with everyone else who's there. You run it, with your own shops and products on your own server.

## Try it

- **Live demo:** <https://web-production-cc219.up.railway.app>
- **Controls on a computer:**
  - WASD or the arrow keys to walk, Shift to run, Space to jump. Drag to look around and scroll to zoom.
  - Click the floor to walk there.
  - E visits the shop you're at, or sits you down on a bench or sofa.
  - F picks an apple at a fruit stand, and F again throws it.
  - 1 to 8 are emotes (7 dances, 8 hugs), / searches the shops, M shows the overview, N mutes the sound and ? opens help.
  - Change your character any time with the Character button in the dock.
- **On a phone:** a joystick under your left thumb, drag to look, pinch to zoom and tap to walk.

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

Open <http://localhost:8080/admin/>, sign in with your `HOST_SECRET` and start adding shops. [Shops and products](./shops) explains how.

## Put it online

- **Railway**, which the demo runs on: one click with the template, and all you choose is the admin password.

  [![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/shopping-mall)

  Or set it up by hand: [Self-hosting and deploying](../deploy#railway).
- **Any server with Docker:** the same `docker compose up`, behind your own domain and HTTPS proxy.
- **Static only**, without multiplayer or the admin page: run `pnpm build` and upload `client/dist/` to any static host. The shops then come from [`mall.config.ts`](./config).

## What's in the box

| | |
|---|---|
| **The mall** | Two floors, 25 shop units, escalators, a fountain court, benches, plants and baked lighting. You can replace the building from the admin page with your own Blender export ([art guide](../art-direction#replacing-the-building-mall-package)). |
| **Shops** | A sign over the storefront, furniture inside that suits the shop, and a panel with a description, features, links and products. You list the products in the admin page or fetch them from your own JSON feed. |
| **People** | 15 animated characters, name tags, chat and emotes, including a dance and a hug that turns you both to face each other. You can sit on benches and sofas, and throw apples. Up to 100 people share a room, and a busy mall opens more rooms. |
| **Hosts** | Sign in as the host to get a gold name and make announcements. Anyone can mute or report other visitors. |
| **Languages** | English and Burmese. Add more in `client/src/i18n`. |
| **Quality** | Low, Medium and High settings, picked automatically; a 30 fps mode while nothing moves; and support for screen readers and keyboards. |
