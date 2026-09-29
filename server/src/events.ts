// POST /api/events (T-603): anonymous usage events from the client, written to the log as one JSON
// line each ({"t":"event",...}), which is the sink: read them with Railway's log explorer, or ship
// the logs anywhere. Nothing is stored and nothing identifies anyone: no IPs, no cookies, no ids.
// Operators can switch it off with EVENTS=off.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { EVENT_NAMES, MAX_EVENTS_PER_BATCH } from '@shopping-mall/shared/events';
import { z } from 'zod';
import { CORS, readJson } from './http/util.ts';

const short = z.string().max(64);
const event = z.object({
  e: z.enum(EVENT_NAMES),
  locale: short.optional(),
  tier: short.optional(),
  touch: z.boolean().optional(),
  ms: z.number().min(0).max(600_000).optional(),
  shop: short.optional(),
  label: short.optional(),
  s: z.number().min(0).max(86_400).optional(),
});
const batch = z.array(event).max(MAX_EVENTS_PER_BATCH);

export function eventsHandler(enabled: boolean, log: (line: string) => void = console.log) {
  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    if (req.url !== '/api/events' || req.method !== 'POST') return false;
    if (enabled) {
      try {
        const parsed = batch.safeParse(await readJson(req, 8 * 1024));
        if (parsed.success) {
          const at = new Date().toISOString();
          for (const ev of parsed.data) log(JSON.stringify({ t: 'event', at, ...ev }));
        }
      } catch {
        /* unreadable: ignore, like any beacon */
      }
    }
    res.writeHead(204, CORS).end(); // always 204: beacons don't read answers, and junk gets no hints
    return true;
  };
}
