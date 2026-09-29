# Shops and products

With a database (the normal setup), shops are edited in the **admin page** and every change shows up for everyone in the mall within about two seconds. No redeploy, no reload.

## Sign in

Go to `/admin/` on your mall (for example <http://localhost:8080/admin/>) and enter the host password (`HOST_SECRET` on the server). The session lives only in that tab: reload it and you sign in again. That's deliberate, so a forgotten tab can't stay signed in.

## Add a shop

**Shops → Add shop.** A live preview of the storefront sign updates as you type.

| Field | Notes |
|---|---|
| Name, tagline | On the sign and at the top of the shop's panel. Name up to 40 characters. |
| ID | Used in links (`?s=lumen-coffee`). Lowercase letters, digits and dashes. |
| Unit | Which storefront the shop takes. Taken units are marked. `w0`–`w5` are on the left as you walk in, `e0`–`e5` on the right, `u-` is upstairs, and `flagship` is the big store at the far end ([map](../greybox)). |
| Category | Groups shops in the directory. |
| Sign colour, accent | The sign background and the highlight colour used in the panel. |
| Logo | Upload a PNG, JPEG or WebP (up to 2 MB), or paste a URL. |
| Description, features | The panel text, and up to 8 feature lines. |
| Links | Up to 4 buttons, for example "Visit the website" or "Order on Grab". |
| Products | None, **list them here**, or **from a JSON feed** (below). |

**Reorder** shops with the arrows (that's the directory order). **Delete** asks you to confirm first.

## Products

**Listed in the admin page:** name, price, an optional "was" price (shown struck through), an optional image upload and a link. Prices are formatted in the mall's currency (**Mall** tab).

**From a JSON feed:** point the shop at a URL that returns either an array or `{ "products": [...] }`:

```json
[
  { "id": "espresso-250", "name": "House espresso, 250 g", "price": 14, "compareAt": 16,
    "image": "https://example.com/espresso.jpg", "url": "https://example.com/p/espresso" }
]
```

The browser fetches it when someone opens the shop, so the feed must allow cross-origin requests (`Access-Control-Allow-Origin: *`). A shop system or a small script can keep it up to date.

## Files

**Files** lists everything uploaded. Uploads are stored once by content, so uploading the same image twice keeps one copy, and each file is served forever-cached. A file the building uses can't be deleted until the building changes.

## The mall

**Mall** sets the mall's name, tagline, accent colour, currency and languages. **Building** replaces the 3D building with your own (see the [art guide](../art-direction#replacing-the-building-mall-package)).

## Without a database

With no `DATABASE_URL`, the mall shows the shops in [`mall.config.ts`](./config) and there's no admin page. With a database, that file only seeds an empty mall the first time.
