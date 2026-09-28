# ADR 0005: Host on Railway, with Postgres and S3-compatible storage

**Status:** Accepted · 2026-09-29

## Context
Shops must be editable while the mall runs, and assets (logos, product images, later 3D models) must be uploadable. That needs a database and object storage next to the long-lived multiplayer server. Candidates were Fly.io, Railway and Cloudflare, judged on long-term cost and simplicity.

| | Server (WebSockets) | Postgres | Object storage | Notes |
|---|---|---|---|---|
| **Railway** | Our Docker image as-is | Postgres service in the same project | S3-compatible buckets, $0.015/GB-month, free egress and API calls | $5/month hobby plan includes $5 of usage |
| Fly.io | Machines from ~$2/month | Managed Postgres from $38/month | External | Memory prices +20 % from 1 Oct 2026 |
| Cloudflare | Durable Objects (server rewrite) | Hyperdrive + external Postgres | R2, $0 egress | Cheapest bandwidth, most lock-in and rewrite |

## Decision
- **Railway** runs the server container (site + multiplayer + content API), a **Postgres** service and a **storage bucket**, deployed from `main`.
- The server talks to storage through the **S3 API only** (endpoint, bucket and keys from env), so moving uploads to Cloudflare R2 or any S3-compatible store is a configuration change.
- Self-hosting stays possible: `docker compose` gains Postgres and SeaweedFS (an open-source S3-compatible store; MinIO no longer publishes free images) services.

## Consequences
- ✅ One dashboard and one bill; roughly $5–10/month at small scale.
- ✅ Free egress on bucket downloads suits a 3D site where model downloads dominate bandwidth.
- ⚠️ Railway's Postgres is a single instance on a volume, not HA. Backups are a scheduled `pg_dump` to the bucket.
- ⚠️ If traffic grows large, put the site and bucket behind Cloudflare (free CDN proxy) or move the bucket to R2.
