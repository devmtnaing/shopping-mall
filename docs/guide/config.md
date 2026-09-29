# Configuration

## `mall.config.ts`

The one file for a static mall, and the seed for a new database. It's validated when you build, so a mistake fails with the exact path, for example `shops.3.colors.bg: must be a hex colour like #e2b857`.

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

Set these as environment variables (a `.env` file for docker compose). Everything is optional.

| Variable | What it does |
|---|---|
| `HOST_SECRET` | The host password: host sign-in and `/admin/`. Unset means no host and no admin. |
| `DATABASE_URL` | Postgres for live content. Without it, shops come from `mall.config.ts`. |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION` | Storage for uploads. Any S3-compatible service. |
| `S3_URL_STYLE` | `virtual` for Railway and AWS; leave unset for SeaweedFS and MinIO. |
| `ROOM_CAPACITY` | People per room before newcomers go to `main-2`, `main-3`, … (default 100). |
| `REPORT_WEBHOOK` | Also POST player reports here, for example a chat webhook. |
| `BLOCKLIST_FILE` | Words to mask in chat and refuse in names. |
| `EVENTS` | `off` stops logging the anonymous usage events ([privacy](../privacy)). |
| `PORT` | Server port (default 8787). |

The web container also takes `PORT` (default 80) and `API_UPSTREAM` (default `server:8787`). See [Self-hosting and deploying](../deploy) for the full picture.

## Languages

UI text lives in `client/src/i18n/en.ts` and `my.ts` (Burmese). To add a language, copy `en.ts`, translate the values and register it in `client/src/i18n/index.ts`. Then list it in `mall.locales`. A test checks that every language has every key.

## Links into the mall

- `?s=lumen-coffee` opens the mall at that shop, with its panel open after the fly-in.
- `?at=x,z,yaw,floor` starts at an exact spot (yaw in radians, floor 0 or 1). Visitors can share their spot from the **share** button.
- `?room=name` joins a specific room.
