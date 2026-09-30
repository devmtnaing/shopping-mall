# ADR 0006: Live content in the database, and assets swappable by file

**Status:** Accepted · 2026-09-29

## Context
The mall's owner wants to add, edit and move shops without a redeploy, upload images and models, and later replace the CC0 art with Higgsfield-generated assets by swapping files.

## Decision
- **Content lives in Postgres:** `mall` (name, tagline, colours, locales), `shops` (fields from today's config plus `slot`), `products`, and `assets`.
- **An asset is a record** `{ id, kind, key, contentType, bytes, hash }` pointing at an object in the bucket. Kinds: `logo`, `product-image`, `mall-model`, `mall-collision`, `mall-meta`, `navgrid`, `avatar`, `animation-pack`, `prop`.
- **Everything visual refers to assets by id, never by path.** To swap art, upload a new file into the same asset, or point a slot at a new asset. The client notices the new content hash, and no code changes.
- **`mall.config.ts` becomes the seed:** the server imports it on first start with an empty database. Static builds with no server still read it directly, so the mall still works on its own.
- **Editing is host-only** through `/admin`, unlocked by the existing host sign-in. Writes go through a small JSON API on the server. Uploads use presigned PUT URLs, so files go straight to the bucket.
- **Changes are live:** after a write the server broadcasts `{ t: 'content', version }`. Clients refetch the content and repaint only what changed (signs, panels, directory).

## Consequences
- Shops and art change without a deploy, and Higgsfield assets go in as file swaps.
- The admin page, the mall, the HTML directory and the seed file all share one content model.
- A new mall model needs its matching collision mesh, meta and navgrid. The admin page treats the four as one "mall package" and checks them together: it validates the meta and bakes the navgrid on upload.
- The HTML directory is generated from the database when it's requested, not at build time.
