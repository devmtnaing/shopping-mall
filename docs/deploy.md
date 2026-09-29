# Deploying

Two ways to run the whole mall: **docker compose** on any machine, or **Railway** (what the demo uses, see [ADR 0005](adr/0005-railway-postgres-s3.md)). Both run the same images.

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
| `ROOM_CAPACITY`, `REPORT_WEBHOOK`, `BLOCKLIST_FILE`, `METRICS` | Optional, see `.env.example`. |

**web**

| Variable | What |
|---|---|
| `PORT` | Port nginx listens on (default 80). |
| `API_UPSTREAM` | `host:port` of the server (default `server:8787`). It's looked up per request, so the web can start before the server. |

**backup**: `DATABASE_URL`, the same `S3_*` as the server, `KEEP` (dumps to keep, default 30), and the build argument `PG_MAJOR`, which must be at least the database's major version.

## Railway

The production project `shopping-mall` (<https://web-production-cc219.up.railway.app>) runs in Singapore (`asia-southeast1`, bucket region `sin`). Every service builds from `main` on GitHub. Watch paths keep a docs-only push from rebuilding anything.

<div v-pre>

| Service | Dockerfile (`RAILWAY_DOCKERFILE_PATH`) | Notable settings |
|---|---|---|
| `web` | `client/Dockerfile` | Public domain on port 8080, `PORT=8080`, `API_UPSTREAM=${{server.RAILWAY_PRIVATE_DOMAIN}}:8787`, health check `/` |
| `server` | `server/Dockerfile` | `PORT=8787`, `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `S3_*=${{uploads.*}}`, `S3_URL_STYLE=virtual`, `HOST_SECRET`, health check `/health` |
| `backup` | `tools/backup/Dockerfile` | Cron `0 3 * * *` (UTC), restart never, `PG_MAJOR=18`, same database and bucket references |
| `Postgres` | Railway template | Volume `postgres-volume` |
| `uploads` | Railway bucket | Private. Files reach visitors through the server's `/files/` route. |

</div>

`.railway/railway.ts` describes the same project as code (Railway [IaC](https://docs.railway.com/infrastructure-as-code)). It keeps the one secret, `HOST_SECRET`, out of the repo with `preserve()`. To compare it with the live project, install the SDK next to it (`npm install railway`, left out of the repo's dependencies) and run `railway link`, then `railway config plan` (Railway CLI 5 or newer, or `npx @railway/cli@latest`). A whole-project apply deletes anything the file leaves out, so read the plan first.

To set up your own copy: create a project with the Postgres template and a bucket named `uploads`, add three empty services named as above, set the variables in the table, connect the repo, and give `web` a domain. Or edit `.railway/railway.ts` and run `railway config apply`.

## Backups and restoring

The `backup` service runs `pg_dump --format=custom` every night and uploads it to the bucket as `backups/mall-<UTC time>.dump`, keeping the newest 30. The server never serves these files (`/files/` only serves `<kind>/<sha256>.<ext>`). Uploaded files themselves are not in the dump; they're already in the bucket, named by their content hash.

To run a backup now on Railway, open the `backup` service and choose **Run now**, or redeploy it.

To restore, run the same image's `restore.sh` with the database and bucket settings. It downloads the dump and replaces every table in it, in one transaction.

```bash
docker build -f tools/backup/Dockerfile --build-arg PG_MAJOR=18 -t shopping-mall-backup .
# restore.env: DATABASE_URL (Railway: the Postgres service's DATABASE_PUBLIC_URL) and the S3_* values
docker run --rm --env-file restore.env shopping-mall-backup /usr/local/bin/restore.sh latest
# or a specific one: … restore.sh mall-2026-09-29T030000Z.dump
```

Then restart the `server` service, so visitors reconnect and pick up the restored content.

Tested on 2026-09-29. Locally against compose: back up, delete a shop, restore, and the shop and its products were back, and `KEEP` pruned older dumps. On Railway: the cron job wrote `backups/mall-2026-09-28T202057Z.dump` to the bucket.

## docker compose

```bash
cp .env.example .env        # set HOST_SECRET to use /admin/
docker compose up --build   # → http://localhost:8080 (WEB_PORT to change)
```

Postgres data and uploads live in the `pgdata` and `s3data` volumes. To back up the database: `docker compose exec postgres pg_dump -U mall -Fc mall > mall.dump`, and to restore it: `docker compose exec -T postgres pg_restore -U mall -d mall --clean --if-exists < mall.dump`.
