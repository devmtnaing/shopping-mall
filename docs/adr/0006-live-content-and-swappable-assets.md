# ADR 0006: Live content in the database, and assets swappable by file

**Status:** Accepted · 2026-09-29

## Context
The mall owner wants to add, edit and move shops without redeploying, upload images and models, and later replace CC0 art with Higgsfield-generated assets just by swapping files.

## Decision
- **Content lives in Postgres:** `mall` (name, tagline, colours, locales), `shops` (fields from today's config plus `slot`), `products`, and `assets`.
- **An asset is a record** `{ id, kind, key, contentType, bytes, hash }` pointing at an object in the bucket. Kinds: `logo`, `product-image`, `mall-model`, `mall-collision`, `mall-meta`, `navgrid`, `avatar`, `animation-pack`, `prop`.
- **Everything visual references assets by id, never by path.** Swapping art means uploading a new file into the same asset (or pointing a slot at a new asset). The client picks it up by content hash, and nothing in code changes.
- **`mall.config.ts` becomes the seed:** on first start with an empty database it's imported. Static builds with no server keep reading it directly, so the "works alone" principle holds.
- **Editing is host-only** through `/admin`, unlocked by the existing host sign-in. Writes go through a small JSON API on the server. Uploads use presigned PUT URLs so files go straight to the bucket.
- **Changes are live:** after a write the server broadcasts `{ t: 'content', version }`. Clients refetch the content and repaint only what changed (signs, panels, directory).

## Consequences
- ✅ Shops and art change without a deploy. Higgsfield assets drop in as file swaps.
- ✅ One content model for the admin page, the mall, the HTML directory and the seed file.
- ⚠️ Swapping the mall model also requires the matching collision mesh, meta and navgrid. The admin page treats these four as one "mall package" and validates them together (meta schema check, navgrid bake on upload).
- ⚠️ The static HTML directory is generated at request time from the database instead of at build time.
