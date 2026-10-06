// The emails the mall sent, and what their provider later said became of each (mail-events.ts).
import type { MailStatus } from '@shopping-mall/shared/rentals';
import type { Sql } from './db.ts';

export type SentEmail = {
  id: string;
  kind: 'approval' | 'invite';
  recipient: string;
  rentalId?: number;
  shopId?: string;
};

/** Remember an email we sent, by its provider's id. */
export async function recordEmail(sql: Sql, e: SentEmail): Promise<void> {
  await sql`insert into emails (id, kind, recipient, rental_id, shop_id)
    values (${e.id}, ${e.kind}, ${e.recipient}, ${e.rentalId ?? null}, ${e.shopId ?? null})
    on conflict (id) do nothing`;
}

/** The ends of the road: news after one of these (a late "delayed", say) doesn't replace it. */
const FINAL = ['bounced', 'suppressed', 'complained', 'failed'];

/**
 * Record the provider's news about an email. Returns the email, or null if it isn't one of ours
 * (sent before we kept a record, or by something else on the same account).
 */
export async function updateEmail(
  sql: Sql,
  id: string,
  status: MailStatus['status'],
  detail: string | undefined,
): Promise<(SentEmail & { status: MailStatus['status'] }) | null> {
  const [row] = await sql<
    {
      id: string;
      kind: SentEmail['kind'];
      recipient: string;
      rental_id: string | null;
      shop_id: string | null;
      status: MailStatus['status'];
    }[]
  >`update emails set
      status = case when status = any(${FINAL}) and not (${status} = any(${FINAL})) then status else ${status} end,
      detail = case when status = any(${FINAL}) and not (${status} = any(${FINAL})) then detail else ${detail ?? null} end,
      updated_at = now()
    where id = ${id}
    returning id, kind, recipient, rental_id, shop_id, status`;
  if (!row) return null;
  return {
    id: row.id,
    kind: row.kind,
    recipient: row.recipient,
    ...(row.rental_id ? { rentalId: Number(row.rental_id) } : {}),
    ...(row.shop_id ? { shopId: row.shop_id } : {}),
    status: row.status,
  };
}

export type MailRow = {
  mail_status: MailStatus['status'] | null;
  mail_detail: string | null;
  mail_at: Date | null;
};

/** The MailStatus for a row joined with its latest email (see the `latest email` joins). */
export const toMail = (r: MailRow): MailStatus | undefined =>
  r.mail_status && r.mail_at
    ? {
        status: r.mail_status,
        ...(r.mail_detail ? { detail: r.mail_detail } : {}),
        at: r.mail_at.toISOString(),
      }
    : undefined;
