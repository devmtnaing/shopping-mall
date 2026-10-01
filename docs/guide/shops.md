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
| Category | Groups shops in the directory, and picks the furniture inside: a café gets tables and a coffee bar, a bookshop gets bookcases, and so on. "For rent" leaves the unit empty. The editor shows a plan of the unit with that furniture. |
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

## Renting out empty units

Every empty unit's sign says **Coming soon · Unit available · Come and rent it**. A visitor who walks up to one and presses **E** (or taps **Rent this unit**) gets a short form: shop name, type of shop (café, books, fashion, home, games or something else), their name, email, an optional phone number and what they'd sell. Choosing a type shows a plan of how that unit would be furnished, drawn from the same layouts the mall uses. Nothing needs uploading; logos and products come later, when you create the shop.

Applications arrive in **Rentals**, which shows a count of waiting ones (in the page title too, so you notice from another tab). It checks for new ones every 30 seconds. Several people can apply for the same unit:

- **Approve** one and the others waiting for that unit are turned down. Then contact them by email (the mall doesn't email applicants), and **Create the shop** opens the editor with their unit, name, description and a category for their type of shop filled in, so the unit gets that type's furniture.
- **Turn down** declines one application. **Delete** removes a decided one for good.

To hear about applications straight away, set `RENTAL_WEBHOOK` on the server ([configuration](./config)). Each application is POSTed there with a one-line summary in `text` and `content`, so a Slack or Discord incoming webhook shows it as a message. A visitor can send 3 applications, then one every 20 minutes.

## Shop owners

A tenant can look after their own shop. Once you've created the shop for an approved rental application, its card in **Rentals** has a **Shop owner** box with their email filled in; press **Invite owner**. (It's also at the bottom of **Shops → Edit**.) With [email set up](./config#email) the mall emails them a set-password link; otherwise `/admin` shows the link for you to send by email or WhatsApp. It works once, for 7 days.

The link opens a page where they choose a password (8 characters or more). After that they sign in at `/admin/` with **I look after a shop**, their email and that password. Like your own sign-in, it lasts while the tab is open.

They see only their shop, in the same editor you use, and can change its name, tagline, category, colours, description, features, links, logo and products. They can't move to another unit, change the shop's id, set up a product feed, or touch other shops, the mall or the building. Their changes go live straight away.

To keep hosting costs down, owners are kept small:

| | Limit |
|---|---|
| Products | 5 |
| Photos (logo and product photos) kept at once | 8. Photos they stop using are deleted when they save. |
| Each photo | 300 KB. The page shrinks photos before uploading (a logo to 512 px, a product photo to 900 px, as WebP), so a phone photo of several MB ends up around 100 KB. |
| Sign-in attempts | 5, then one a minute, from each address |

Their uploads show in **Files** as "from *shop*'s owner". One email can look after one shop.

**Forgot their password**, or want to give the shop to someone else? Press **Make a new link** (for a new email, change it first). Their old password stops working and they're signed out. **Remove access** signs them out and takes the shop back. Deleting the shop removes its owner too.

## Files

**Files** lists everything you've uploaded. Each file is stored once by its content, so uploading the same image twice keeps one copy, and browsers cache files for good. You can't delete a file the building uses until you change the building.

## The mall

**Mall** sets the mall's name, tagline, accent colour, currency and languages. **Building** replaces the 3D building with your own (see the [art guide](../art-direction#replacing-the-building-mall-package)).

## Without a database

With no `DATABASE_URL`, the mall shows the shops in [`mall.config.ts`](./config) and there's no admin page. With a database, that file only seeds an empty mall the first time.
