// Validation for messages the server receives. Server-only: the client never imports this,
// so zod stays out of the browser bundle.
import { z } from 'zod';
import { AVATARS } from './avatars.ts';
import { CHAT_MAX, type ClientMessage, EMOTES, NAME_MAX } from './protocol.ts';

const finite = z.number().finite();
const look = z.object({ color: z.string().regex(/^#[0-9a-fA-F]{6}$/), avatar: z.enum(AVATARS).optional() });

const clientMessage = z.discriminatedUnion('t', [
  z.object({
    t: z.literal('join'),
    name: z.string().max(NAME_MAX * 4),
    look,
    resume: z.string().max(64).optional(),
    hostToken: z.string().max(2048).optional(),
  }),
  z.object({ t: z.literal('chat'), text: z.string().max(CHAT_MAX * 4) }),
  z.object({ t: z.literal('emote'), e: z.enum(EMOTES) }),
  z.object({ t: z.literal('teleport') }),
  z.object({ t: z.literal('look'), look }),
  z.object({
    t: z.literal('throw'),
    o: z.tuple([finite, finite, finite]),
    v: z.tuple([finite, finite, finite]),
  }),
  z.object({ t: z.literal('door'), id: z.string().regex(/^[a-z0-9-]{1,40}$/), open: z.boolean() }),
  z.object({
    t: z.literal('report'),
    id: z.number().int().nonnegative(),
    reason: z.string().max(200).optional(),
  }),
]);

/** Parse a text frame from a client, or null if it isn't a valid message. */
export function parseClientMessage(text: string): ClientMessage | null {
  try {
    const r = clientMessage.safeParse(JSON.parse(text));
    return r.success ? (r.data as ClientMessage) : null;
  } catch {
    return null;
  }
}
