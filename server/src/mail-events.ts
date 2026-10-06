// What became of the emails we sent, as the mail provider reports it to POST /api/mail/events
// (Resend's webhooks: https://resend.com/docs/dashboard/webhooks/introduction). Each event updates
// the email's status for /admin. An email that can never arrive (a permanent bounce, or an address
// the provider won't send to) also gives up on the person it was for: their shop is taken out of the
// mall and their application turned down, so the unit is for rent again. Only someone who has never
// signed in, though: a real owner's shop never goes because one email bounced.
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import type { MailStatus } from '@shopping-mall/shared/rentals';
import { z } from 'zod';
import { removeShopIn } from './db/content.ts';
import type { Sql } from './db/db.ts';
import { type SentEmail, updateEmail } from './db/mail.ts';

/** How far a webhook's timestamp may be from now (s): older ones may be replays. */
const TOLERANCE_S = 5 * 60;

/**
 * Is this request really from the provider? Resend signs with Svix: an HMAC-SHA256, keyed with
 * the base64 part of the `whsec_…` secret, of `id.timestamp.body`, sent as `v1,<base64>` (several
 * may be listed, space-separated, while a secret is being rotated).
 */
export function verifyWebhook(
  secret: string,
  headers: IncomingHttpHeaders,
  body: string,
  now = Date.now(),
): boolean {
  const id = headers['svix-id'];
  const ts = headers['svix-timestamp'];
  const sig = headers['svix-signature'];
  if (typeof id !== 'string' || typeof ts !== 'string' || typeof sig !== 'string') return false;
  const t = Number(ts);
  if (!Number.isFinite(t) || Math.abs(now / 1000 - t) > TOLERANCE_S) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const want = createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest();
  return sig.split(' ').some((part) => {
    const [version, value] = part.split(',');
    if (version !== 'v1' || !value) return false;
    const got = Buffer.from(value, 'base64');
    return got.length === want.length && timingSafeEqual(got, want);
  });
}

const eventSchema = z.object({
  type: z.string(),
  data: z.looseObject({
    email_id: z.string().optional(),
    bounce: z.looseObject({ type: z.string().optional(), message: z.string().optional() }).optional(),
    suppressed: z.looseObject({ message: z.string().optional() }).optional(),
    failed: z.looseObject({ reason: z.string().optional() }).optional(),
  }),
});

const STATUS: Record<string, MailStatus['status']> = {
  'email.delivered': 'delivered',
  'email.delivery_delayed': 'delayed',
  'email.bounced': 'bounced',
  'email.suppressed': 'suppressed',
  'email.complained': 'complained',
  'email.failed': 'failed',
};

/** What an event changed: the content version if a shop was taken out, and whether a unit opened. */
export type Outcome = { version: number | null; freed: boolean };
const NOTHING: Outcome = { version: null, freed: false };

/** Apply one event from the provider. Unknown events and emails that aren't ours change nothing. */
export async function mailEvent(sql: Sql, body: unknown): Promise<Outcome> {
  const parsed = eventSchema.safeParse(body);
  if (!parsed.success) return NOTHING;
  const { type, data } = parsed.data;
  const status = STATUS[type];
  if (!status || !data.email_id) return NOTHING;
  const detail = data.bounce?.message ?? data.suppressed?.message ?? data.failed?.reason;
  const email = await updateEmail(sql, data.email_id, status, detail);
  if (!email) return NOTHING;
  // it can never arrive: a hard bounce, or an address the provider won't send to any more
  const dead = (status === 'bounced' && data.bounce?.type === 'Permanent') || status === 'suppressed';
  if (!dead) return NOTHING;
  const what = email.kind === 'approval' ? 'approval email' : 'set-password email';
  const why =
    status === 'bounced'
      ? `The ${what} to ${email.recipient} bounced${detail ? `: ${detail}` : '.'}`
      : `The ${what} to ${email.recipient} wasn’t sent: the address had bounced before${detail ? ` (${detail})` : '.'}`;
  return giveUp(sql, email, why);
}

type Application = { id: string; slot: string; status: string; email: string; business: string };

/**
 * The person this email was for can't be reached: take their shop out of the mall (if it's
 * theirs and they've never signed in) and turn down their approved application, with `reason`.
 */
async function giveUp(sql: Sql, email: SentEmail, reason: string): Promise<Outcome> {
  return sql.begin(async (tx) => {
    const to = email.recipient.toLowerCase();
    let application: Application | undefined;
    if (email.rentalId)
      [application] = await tx<Application[]>`select id, slot, status, email, business
        from rental_applications where id = ${email.rentalId} for update`;
    let shop = email.shopId;
    if (!shop && application)
      shop = (await tx<{ id: string }[]>`select id from shops where slot = ${application.slot}`)[0]?.id;
    if (!application && shop)
      [application] = await tx<Application[]>`select a.id, a.slot, a.status, a.email, a.business
        from rental_applications a join shops s on s.slot = a.slot
        where s.id = ${shop} and a.status = 'approved' and lower(a.email) = ${to}
        order by a.decided_at desc limit 1 for update of a`;

    let version: number | null = null;
    if (shop) {
      const [owner] = await tx<{ email: string; password_hash: string | null }[]>`select email, password_hash
        from shop_owners where shop_id = ${shop}`;
      const [named] = await tx<{ name: string }[]>`select name from shops where id = ${shop}`;
      // theirs: they were invited to it and never signed in, or (no owner yet) it's the shop made
      // from their application, under the business name they applied with
      const theirs = owner
        ? owner.password_hash === null && owner.email.toLowerCase() === to
        : !!application && named?.name.trim().toLowerCase() === application.business.trim().toLowerCase();
      // someone who has signed in, or a shop that's someone else's: leave everything as it is
      if (!theirs) return NOTHING;
      version = await removeShopIn(tx, shop, reason);
    }
    let freed = version !== null;
    if (application?.status === 'approved') {
      await tx`update rental_applications set status = 'rejected', reason = ${reason}, decided_at = now()
        where id = ${application.id}`;
      freed = true;
    }
    return { version, freed };
  });
}
