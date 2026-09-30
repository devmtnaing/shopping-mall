# ADR 0005: Host on Railway, with Postgres and S3-compatible storage

**Status:** Accepted · 2026-09-29

## Context
Shops have to be editable while the mall runs, and people need to upload assets (logos, product images, later 3D models). That means a database and object storage next to the long-running multiplayer server. We compared Fly.io, Railway and Cloudflare on long-term cost and simplicity.

| | Server (WebSockets) | Postgres | Object storage | Notes |
|---|---|---|---|---|
| **Railway** | Our Docker image as-is | Postgres service in the same project | S3-compatible buckets, $0.015/GB-month, free egress and API calls | $5/month hobby plan includes $5 of usage |
| Fly.io | Machines from about $2/month | Managed Postgres from $38/month | External | Memory prices up 20 % from 1 Oct 2026 |
| Cloudflare | Durable Objects (a server rewrite) | Hyperdrive + external Postgres | R2, $0 egress | Cheapest bandwidth, but the most lock-in and rewriting |

## Decision
- **Railway** runs the server container (site, multiplayer and content API), a **Postgres** service and a **storage bucket**, all deployed from `main`.
- The server talks to storage through the **S3 API only** (endpoint, bucket and keys from env), so moving uploads to Cloudflare R2 or any other S3-compatible store is only a configuration change.
- Self-hosting still works: `docker compose` gets Postgres and SeaweedFS services. SeaweedFS is an open-source S3-compatible store; MinIO no longer publishes free images.

## Consequences
- One dashboard and one bill, roughly $5 to $10 a month at small scale.
- Bucket downloads are free, which suits a 3D site where models are most of the traffic.
- Railway's Postgres is a single instance on a volume, with no failover. Backups are a nightly `pg_dump` into the bucket.
- If traffic grows a lot, put the site and bucket behind Cloudflare (its CDN proxy is free) or move the bucket to R2.
