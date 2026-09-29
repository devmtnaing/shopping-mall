# Deploy and Host Shopping Mall with Railway

An open-source, multiplayer 3D shopping mall that runs in the browser. Visitors pick a character, walk the mall together, open shops to browse products, chat and wave. You run it from an admin page: shops, products, images and even the building change live.

## About Hosting Shopping Mall

This template deploys the whole mall:

- **web**: nginx serving the site, and proxying the multiplayer and API routes to the server
- **server**: WebSocket multiplayer, the content API, the admin page's backend and uploads
- **Postgres**: shops and products. An empty database is seeded with a demo mall on first start.
- **uploads**: a private bucket for images and models, served through the server
- **backup**: a nightly `pg_dump` into the bucket, keeping 30 days

When you deploy, choose a `HOST_SECRET`: it's the password for the admin page. After it deploys, open the **web** service's domain, go to `/admin/`, sign in with that password and start adding shops.

## Common Use Cases

- A virtual mall for a group of local shops, a market or a festival
- A walkable showroom for a brand's products
- A community hangout with shops around it

## Dependencies for Shopping Mall Hosting

- Postgres (included)
- An S3-compatible bucket (included)

### Deployment Dependencies

- Source and docs: https://github.com/devmtnaing/shopping-mall
- Operator guide: https://devmtnaing.github.io/shopping-mall/

## Why Deploy Shopping Mall on Railway?

Railway runs the whole stack (web, server, database, storage and nightly backups) from one template, over private networking, with the database and bucket credentials wired up for you.
