# Privacy and usage events

Shopping Mall is built to know as little about visitors as possible.

## What's stored

| What | Where | For how long |
|---|---|---|
| Your name, character and colour | Your own browser (`localStorage`), so you don't retype them | Until you clear site data |
| Language, quality, volume choices | Your own browser | Until you clear site data |
| Chat messages | Nowhere. They're relayed live to people nearby and not kept. | Not kept |
| Player reports | The server log (and the operator's webhook, if set): the reported name and message | As long as the operator keeps logs |
| Shops, products, uploads | The operator's database and bucket | Until the host deletes them |

No cookies, no accounts for visitors, no third-party scripts, fonts or trackers. The host password is exchanged for a token held in memory only.

## Usage events

To help an operator see whether the mall works (does it load fast, which shops do people open), the client sends a few **anonymous** events to the mall's own server, which writes them to its log as JSON lines:

| Event | Fields | When |
|---|---|---|
| `visit` | `locale`, `tier` (quality), `touch` (true/false) | The page opens |
| `enter` | `ms`: time from page load until playable | You enter the mall |
| `shop` | `shop`: the shop's id | A shop panel opens |
| `link` | `shop`, `label`: the button's text | A shop's link is clicked |
| `product` | `shop` | A product is clicked |
| `leave` | `s`: seconds on the page | The page closes |

Each line looks like `{"t":"event","at":"2026-09-29T08:00:00.000Z","e":"shop","shop":"lumen-coffee"}`. There's **no identifier of any kind**: no IP address, no user agent, no session or visitor id. Two events from the same person can't be linked. Nothing is sent to anyone else.

Events are **off** when the browser sends Do Not Track or Global Privacy Control, and when there's no server (a static build).

### For operators

- **Read them:** filter your server logs for `"t":"event"`. On Railway: server service → Logs → search `"t":"event"`. For counts, pipe the log lines through `jq`, or ship logs to any log store.
- **Switch them off:** set `EVENTS=off` on the server. The client keeps sending (tiny, batched) and the server answers 204 and logs nothing.
- **The code:** `client/src/analytics.ts` (client), `server/src/events.ts` (sink), `shared/src/events.ts` (the event list). Adding a field means adding it to the schema, so the list above stays complete.

If your mall serves visitors in a region with specific rules (for example the EU), a sentence in your own privacy notice pointing to this page is usually all these anonymous events need, but check with someone who knows your local law.
