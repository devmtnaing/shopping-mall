# Deploying

You can run the whole mall two ways: with **docker compose** on any machine, or on **Railway**, which the demo uses ([ADR 0005](adr/0005-railway-postgres-s3.md) explains why). Both run the same images.

| Piece | Image | Compose | Railway |
|---|---|---|---|
| `web`: nginx serving the built site, proxying `/ws`, `/api`, `/files`, `/health`, `/host-token`, `/directory/` to the server | `client/Dockerfile` | `web` | service `web` (public domain) |
| `server`: multiplayer, content API, uploads | `server/Dockerfile` | `server` | service `server` (private only) |
| Postgres | stock | `postgres:17` | Railway Postgres template (18) |
| Object storage | S3-compatible | SeaweedFS | Railway bucket `uploads` |
| Daily backup | `tools/backup/Dockerfile` | run by hand | service `backup`, cron `0 3 * * *` |

## Settings

**server**

| Variable | What |
|---|---|
| `DATABASE_URL` | Postgres. Migrations run on start, and an empty database is seeded from `mall.config.ts`. |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION` | Uploads bucket. |
| `S3_URL_STYLE` | `virtual` for Railway and AWS (bucket in the hostname). Leave unset for SeaweedFS and MinIO. |
| `HOST_SECRET` | The host password: signs in on the landing screen and at `/admin/`. Unset means no host and no admin. |
| `PORT` | Default 8787. |
| `MAX_PLAYERS`, `MAX_PER_IP` | The most people in the mall at once (default 20), and connections per IP address (default 5). |
| `CHAT_KEEP_DAYS` | Days of chat history to keep (default 30). |
| `ROOM_CAPACITY`, `REPORT_WEBHOOK`, `BLOCKLIST_FILE`, `METRICS` | Optional, see `.env.example`. |

**web**

| Variable | What |
|---|---|
| `PORT` | Port nginx listens on (default 80). |
| `API_UPSTREAM` | `host:port` of the server (default `server:8787`). It's looked up per request, so the web can start before the server. |
| `CLIENT_IP_FROM` | Where each visitor's IP address comes from, for the per-visitor limits. See [Behind a proxy or CDN](#behind-a-proxy-or-cdn). |

**backup**: `DATABASE_URL`, the same `S3_*` as the server, `KEEP` (dumps to keep, default 30), and the build argument `PG_MAJOR`, which must be at least the database's major version.

## Railway

The production project `shopping-mall` runs in Singapore (`asia-southeast1`, bucket region `sin`) and is served at <https://mall.devmtnaing.com>, through Cloudflare's proxy. Railway's own address for it, <https://web-production-cc219.up.railway.app>, still works too. Every service builds from `main` on GitHub. Watch paths keep a docs-only push from rebuilding anything.

<div v-pre>

| Service | Dockerfile (`RAILWAY_DOCKERFILE_PATH`) | Notable settings |
|---|---|---|
| `web` | `client/Dockerfile` | Public domains on port 8080 (`mall.devmtnaing.com` and Railway's own), `PORT=8080`, `API_UPSTREAM=${{server.RAILWAY_PRIVATE_DOMAIN}}:8787`, `CLIENT_IP_FROM=cloudflare`, health check `/` |
| `server` | `server/Dockerfile` | `PORT=8787`, `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `S3_*=${{uploads.*}}`, `S3_URL_STYLE=virtual`, `HOST_SECRET`, health check `/health` |
| `backup` | `tools/backup/Dockerfile` | Cron `0 3 * * *` (UTC), restart never, `PG_MAJOR=18`, same database and bucket references |
| `Postgres` | Railway template | Volume `postgres-volume` |
| `uploads` | Railway bucket | Private. Files reach visitors through the server's `/files/` route. |

</div>

`.railway/railway.ts` describes the same project as code (Railway [IaC](https://docs.railway.com/infrastructure-as-code)). It keeps the one secret, `HOST_SECRET`, out of the repo with `preserve()`. To compare it with the live project, install the SDK next to it (`npm install railway`, left out of the repo's dependencies) and run `railway link`, then `railway config plan` (Railway CLI 5 or newer, or `npx @railway/cli@latest`). A whole-project apply deletes anything the file leaves out, so read the plan first.

**One click:** [![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/shopping-mall). The [template](https://railway.com/deploy/shopping-mall) creates all five pieces with the variables above, and only asks you for `HOST_SECRET`.

To set it up by hand, create a project with the Postgres template and a bucket named `uploads`, add three empty services with the names above, set the variables from the table, connect the repo and give `web` a domain. Or edit `.railway/railway.ts` and run `railway config apply`.

## Behind a proxy or CDN

The server limits how many connections one visitor can have (`MAX_PER_IP`, 5 by default), and how often they can try the host password. For that it needs each visitor's own IP address. When something sits in front of the mall (a CDN, a load balancer, another reverse proxy), the web container sees that thing's address instead, for every visitor, unless you tell it which header carries the real one. Set `CLIENT_IP_FROM` on the **web** container:

| What's in front of the mall | `CLIENT_IP_FROM` |
|---|---|
| Nothing: visitors connect straight to your server (a VPS or droplet running docker compose) | `direct` (the default) |
| Railway, without a CDN | `x-real-ip` (picked automatically on Railway) |
| Cloudflare's proxy (the orange cloud) | `cloudflare` |
| A load balancer or proxy that adds `X-Forwarded-For`: DigitalOcean's load balancer and App Platform, AWS, Caddy, Traefik, most CDNs | `x-forwarded-for` |

Only choose a header when a proxy really sets it, because otherwise visitors could send it themselves and pretend to be someone else. With `x-forwarded-for`, the last address in the header is used: the one added by the proxy directly in front of the mall. If there are two proxies in a row (a CDN and then a load balancer), use the CDN's own header if it has one, or switch the per-visitor limit off with `MAX_PER_IP=0` on the server.

The web container prints which one it's using when it starts (`client-ip: visitors' addresses come from: …`). If this is set up wrong, the server's log says `limits: turned a connection away…` and visitors start seeing "too many connections from here", even though the mall isn't full.

## Backups and restoring

The `backup` service runs `pg_dump --format=custom` every night and uploads it to the bucket as `backups/mall-<UTC time>.dump`, keeping the newest 30. The server never serves these files (`/files/` only serves `<kind>/<sha256>.<ext>`). The uploaded files aren't in the dump, since they're already in the bucket, named by their content hash.

To run a backup now on Railway, open the `backup` service and choose **Run now**, or redeploy it.

To restore, run the same image's `restore.sh` with the database and bucket settings. It downloads the dump and replaces every table in it, in one transaction.

```bash
docker build -f tools/backup/Dockerfile --build-arg PG_MAJOR=18 -t shopping-mall-backup .
# restore.env: DATABASE_URL (Railway: the Postgres service's DATABASE_PUBLIC_URL) and the S3_* values
docker run --rm --env-file restore.env shopping-mall-backup /usr/local/bin/restore.sh latest
# or a specific one: … restore.sh mall-2026-09-29T030000Z.dump
```

Then restart the `server` service, so visitors reconnect and pick up the restored content.

We tested this on 2026-09-29. Locally, with compose, we backed up, deleted a shop and restored: the shop and its products came back, and `KEEP` removed the older dumps. On Railway, the cron job wrote `backups/mall-2026-09-28T202057Z.dump` to the bucket.

## docker compose

```bash
cp .env.example .env        # set HOST_SECRET to use /admin/
docker compose up --build   # → http://localhost:8080 (WEB_PORT to change)
```

Postgres data and uploads live in the `pgdata` and `s3data` volumes. To back up the database, run `docker compose exec postgres pg_dump -U mall -Fc mall > mall.dump`, and to restore it, `docker compose exec -T postgres pg_restore -U mall -d mall --clean --if-exists < mall.dump`.
