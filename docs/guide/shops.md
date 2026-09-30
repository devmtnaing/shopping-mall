# Shops and products

With a database, which is the normal setup, you edit shops in the **admin page**, and everyone in the mall sees each change within about two seconds. Nobody has to redeploy or reload.

## Sign in

Go to `/admin/` on your mall (for example <http://localhost:8080/admin/>) and enter the host password (`HOST_SECRET` on the server). You stay signed in only in that tab, and reloading it signs you out, so a tab you forget about can't stay signed in.

## Add a shop

**Shops → Add shop.** A preview of the storefront sign changes as you type.

| Field | Notes |
|---|---|
| Name, tagline | On the sign and at the top of the shop's panel. Name up to 40 characters. |
| ID | Used in links (`?s=lumen-coffee`). Lowercase letters, digits and dashes. |
| Unit | Which storefront the shop takes. Taken units are marked. `w0` to `w5` are on the left as you walk in and `e0` to `e5` on the right, `u-` means upstairs, and `flagship` is the big store at the far end ([map](../greybox)). |
| Category | Groups shops in the directory, and picks the furniture inside: a café gets tables and a coffee bar, a bookshop gets bookcases, and so on. "For rent" leaves the unit empty. |
| Sign colour, accent | The sign background and the highlight colour used in the panel. |
| Logo | Upload a PNG, JPEG or WebP (up to 2 MB), or paste a URL. |
| Description, features | The panel text, and up to 8 feature lines. |
| Links | Up to 4 buttons, for example "Visit the website" or "Order on Grab". |
| Products | None, a **list** you type in here, or a **JSON feed** (see below). |

The arrows **reorder** shops, which sets their order in the directory. **Delete** asks before it deletes.

## Products

**Listed in the admin page:** each product has a name, a price, and optionally a "was" price (shown struck through), an uploaded image and a link. Prices appear in the mall's currency, which you set on the **Mall** tab.

**From a JSON feed:** point the shop at a URL that returns either an array or `{ "products": [...] }`:

```json
[
  { "id": "espresso-250", "name": "House espresso, 250 g", "price": 14, "compareAt": 16,
    "image": "https://example.com/espresso.jpg", "url": "https://example.com/p/espresso" }
]
```

The visitor's browser fetches it when they open the shop, so the feed has to allow cross-origin requests (`Access-Control-Allow-Origin: *`). Your shop system, or a small script, can keep it up to date.

## Files

**Files** lists everything you've uploaded. Each file is stored once by its content, so uploading the same image twice keeps one copy, and browsers cache files for good. You can't delete a file the building uses until you change the building.

## The mall

**Mall** sets the mall's name, tagline, accent colour, currency and languages. **Building** replaces the 3D building with your own (see the [art guide](../art-direction#replacing-the-building-mall-package)).

## Without a database

With no `DATABASE_URL`, the mall shows the shops in [`mall.config.ts`](./config) and there's no admin page. With a database, that file only seeds an empty mall the first time.
