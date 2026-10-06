# Configuration

## `mall.config.ts`

This is the only file a static mall needs, and it seeds a new database. The build checks it, and a mistake stops the build with the exact place it went wrong, for example `shops.3.colors.bg: must be a hex colour like #e2b857`.

```ts
import type { MallConfigInput } from '@shopping-mall/shared/config';

export default {
  mall: {
    name: 'Shopping Mall',          // up to 40 characters
    tagline: 'Walk the mall together.',
    accent: '#e2b857',              // highlight colour
    currency: 'USD',                // ISO 4217, used to format prices
    locales: ['en', 'my'],          // UI languages, the first is the default
  },
  shops: [
    {
      id: 'lumen-coffee',           // lowercase, digits, dashes
      slot: 'w0',                   // the unit (see the greybox map)
      name: 'Lumen Coffee',
      tagline: 'Small-batch roasts, pulled slow',
      category: 'Food & drink',
      colors: { bg: '#2b1d14', accent: '#f0b35a' },
      logo: '/logos/lumen.png',     // https://… or a path under client/public
      description: 'A neighbourhood coffee bar…',
      features: ['Single-origin espresso'],
      links: [{ label: 'Visit the website', url: 'https://example.com' }],
      products: { adapter: 'static', items: [{ id: 'house', name: 'House blend', price: 14 }] },
      // or: products: { adapter: 'json-url', url: 'https://example.com/products.json' }
    },
  ],
} satisfies MallConfigInput;
```

The full schema is `shared/src/config.ts`.

## Server settings

Set these as environment variables, in a `.env` file if you use docker compose. All of them are optional.

| Variable | What it does |
|---|---|
| `HOST_SECRET` | The host password, for signing in as the host and for `/admin/`. Leave it unset and there's no host and no admin page. |
| `DATABASE_URL` | Postgres for live content. Without it, shops come from `mall.config.ts`. |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION` | Storage for uploads. Any S3-compatible service. |
| `S3_URL_STYLE` | `virtual` for Railway and AWS; leave unset for SeaweedFS and MinIO. |
| `MAX_PLAYERS` | The most people in the mall at once (default 20). Anyone else is told it's full, can look around on their own, and is let in when a place frees up. |
| `MAX_PER_IP` | The most connections at once from one IP address (default 5), so one person or script can't take all the places. `0` turns it off. Behind a proxy or CDN, see [deploying](../deploy#behind-a-proxy-or-cdn). |
| `CHAT_KEEP_DAYS` | How many days of chat history the database keeps (default 30). |
| `CHAT_SHOW_MIN` | How far back newcomers see the chat, in minutes (default 60). Older messages stay in the database but aren't shown. |
| `AWAY_AFTER_S` | Seconds without a word from someone's game before they show as away, with a dimmed name tag (default 15). A visible tab talks to the server 15 times a second, so silence means their tab is in the background. |
| `DROP_SILENT_S` | Seconds of silence before they leave the mall and free their place (default 120). Their game rejoins as soon as they're back on the tab. |
| `IDLE_KICK_MIN` | Minutes without moving, chatting or emoting before someone leaves the mall, with a warning a minute before (default 15). Moving brings them straight back. `0` turns it off. |
| `ROOM_CAPACITY` | How many people fit in a room before newcomers go to `main-2`, `main-3` and so on (default 100). |
| `REPORT_WEBHOOK` | A URL that also gets each player report as a POST, for example a chat webhook. |
| `RENTAL_WEBHOOK` | A URL that gets each rental application as a POST, for example a Slack or Discord incoming webhook ([renting out units](./shops#renting-out-empty-units)). |
| `MAIL_PROVIDER`, `RESEND_API_KEY`, `MAIL_FROM`, `MAIL_REPLY_TO`, `PUBLIC_URL` | Email approved applicants, and set-password links to new shop owners ([email](#email)). |
| `BLOCKLIST_FILE` | Words to mask in chat and refuse in names. |
| `EVENTS` | Set to `off` to stop logging the anonymous usage events ([privacy](../privacy)). |
| `PORT` | Server port (default 8787). |

The web container also takes `PORT` (default 80), `API_UPSTREAM` (default `server:8787`) and `CLIENT_IP_FROM` ([behind a proxy or CDN](../deploy#behind-a-proxy-or-cdn)). [Self-hosting and deploying](../deploy) has the rest.

## Languages

The UI's text is in `client/src/i18n/en.ts` and `my.ts` (Burmese). To add a language, copy `en.ts`, translate the values, register it in `client/src/i18n/index.ts` and list it in `mall.locales`. A test checks that every language has every string. Only English loads up front; other languages download when someone picks them.

## Links into the mall

- `?s=lumen-coffee` opens the mall at that shop, with its panel open after the fly-in.
- `?at=x,z,yaw,floor` starts at an exact spot (yaw in radians, floor 0 or 1). Visitors can share where they are with the **share** button.
- `?room=name` joins a specific room.

## Email

The mall emails two things: a note to someone whose rental application you approve, saying what happens next, and a new shop owner's set-password link when you invite them ([shop owners](./shops#shop-owners)). Each greets the person by the name they applied with and says which mall it's from and why they're getting it. Without email set up, nothing is sent: `/admin` shows the set-password link and you send it yourself.

| Variable | What it does |
|---|---|
| `MAIL_PROVIDER` | `resend`, `log` (prints emails to the server log, for development) or `none`. Defaults to `resend` when `RESEND_API_KEY` is set. |
| `RESEND_API_KEY` | An API key from [Resend](https://resend.com) with permission to send. |
| `MAIL_FROM` | Who the email is from, for example `Mall <mall@example.com>`. Its domain must be verified in Resend. |
| `MAIL_REPLY_TO` | Optional. An inbox you read, for example `you@example.com`: replies go there, and the emails invite them ("just reply to this email"). Without it they don't, since replies to `MAIL_FROM` may reach no one. |
| `PUBLIC_URL` | The mall's address, for example `https://mall.example.com`, so links point there. Defaults to the address `/admin` is open on. |

A missing setting or unknown provider stops the server at start, so a typo doesn't go unnoticed. If an email fails to send, `/admin` says so and shows the link to send by hand.

A new sending domain often lands in spam at first, until mail providers have seen people open its emails. Ask early recipients to mark it "not spam", and check the headers say SPF, DKIM and DMARC pass (in Gmail, **Show original**).

To use another service, add it to `PROVIDERS` in `server/src/mail.ts`: a function that reads its settings from the environment and returns something with a `send({ to, subject, text, html })` method.
