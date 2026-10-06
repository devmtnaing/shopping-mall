// Shop owners (migrations/006_shop_owners.sql): invites, passwords, and the photos they upload.
import { OWNER_LIMITS, type OwnerInfo } from '@shopping-mall/shared/owners';
import { deleteAsset } from '../assets.ts';
import { HttpError } from '../http/util.ts';
import { hashInvite, newInvite } from '../owners.ts';
import type { Storage } from '../storage.ts';
import type { Sql } from './db.ts';
import { type MailRow, toMail } from './mail.ts';

type Row = {
  shop_id: string;
  email: string;
  password_hash: string | null;
  invite_hash: string | null;
  invite_expires: Date | null;
  epoch: number;
};

/**
 * Give `email` access to `shop` with a new set-password link (returns its token). Replaces any
 * owner the shop had, and signs out anyone signed in to it.
 */
export async function inviteOwner(sql: Sql, shop: string, email: string): Promise<string> {
  const { token, hash } = newInvite();
  const expires = new Date(Date.now() + OWNER_LIMITS.inviteDays * 86_400_000);
  try {
    const rows = await sql`insert into shop_owners (shop_id, email, invite_hash, invite_expires)
      select ${shop}, ${email}, ${hash}, ${expires} where exists (select 1 from shops where id = ${shop})
      on conflict (shop_id) do update set email = excluded.email, password_hash = null,
        invite_hash = excluded.invite_hash, invite_expires = excluded.invite_expires,
        epoch = shop_owners.epoch + 1
      returning shop_id`;
    if (!rows.length) throw new HttpError(404, `No shop "${shop}".`);
  } catch (e) {
    if ((e as { code?: string }).code === '23505') {
      const [other] = await sql<{ shop_id: string }[]>`select shop_id from shop_owners
        where lower(email) = lower(${email})`;
      throw new HttpError(409, `${email} already looks after "${other?.shop_id}". One shop per email.`);
    }
    throw e;
  }
  return token;
}

/** Take away a shop's owner (they're signed out). Returns false if it had none. */
export async function removeOwner(sql: Sql, shop: string): Promise<boolean> {
  return (await sql`delete from shop_owners where shop_id = ${shop}`).count > 0;
}

export async function listOwners(sql: Sql): Promise<OwnerInfo[]> {
  // each with the latest set-password email to their shop, if one was sent
  const rows = await sql<
    (Row & MailRow)[]
  >`select o.*, m.status as mail_status, m.detail as mail_detail, m.updated_at as mail_at
    from shop_owners o
    left join lateral (
      select status, detail, updated_at from emails
      where shop_id = o.shop_id and kind = 'invite' order by sent_at desc limit 1
    ) m on true
    order by o.shop_id`;
  return rows.map((r) => {
    const mail = toMail(r);
    return {
      shop: r.shop_id,
      email: r.email,
      status: r.password_hash
        ? 'active'
        : r.invite_expires && r.invite_expires > new Date()
          ? 'invited'
          : 'expired',
      ...(mail ? { mail } : {}),
    };
  });
}

/** The shop and email a set-password link is for, if it's still good. */
export async function inviteFor(
  sql: Sql,
  token: string,
): Promise<{ shop: string; email: string; name: string; person?: string } | null> {
  // `person`: the owner's own name, from the approved application for the shop's unit, when the
  // invite went to the address they applied with
  const [row] = await sql<{ shop_id: string; email: string; name: string; person: string | null }[]>`
    select o.shop_id, o.email, s.name, r.name as person
    from shop_owners o join shops s on s.id = o.shop_id
    left join lateral (
      select name from rental_applications
      where slot = s.slot and status = 'approved' and lower(email) = lower(o.email)
      order by decided_at desc limit 1
    ) r on true
    where o.invite_hash = ${hashInvite(token)} and o.invite_expires > now()`;
  return row
    ? { shop: row.shop_id, email: row.email, name: row.name, person: row.person ?? undefined }
    : null;
}

/** Use a set-password link: store the password hash and retire the link. */
export async function setOwnerPassword(
  sql: Sql,
  token: string,
  passwordHash: string,
): Promise<{ shop: string; epoch: number } | null> {
  const [row] = await sql<{ shop_id: string; epoch: number }[]>`update shop_owners
    set password_hash = ${passwordHash}, invite_hash = null, invite_expires = null, epoch = epoch + 1
    where invite_hash = ${hashInvite(token)} and invite_expires > now()
    returning shop_id, epoch`;
  return row ? { shop: row.shop_id, epoch: row.epoch } : null;
}

/** An owner who has set their password, by email. */
export async function ownerByEmail(
  sql: Sql,
  email: string,
): Promise<{ shop: string; epoch: number; passwordHash: string } | null> {
  const [row] = await sql<Row[]>`select * from shop_owners
    where lower(email) = lower(${email}) and password_hash is not null`;
  return row?.password_hash ? { shop: row.shop_id, epoch: row.epoch, passwordHash: row.password_hash } : null;
}

/** Is a signed-in owner's session still good (same epoch, password set)? */
export async function ownerSessionValid(sql: Sql, shop: string, epoch: number): Promise<boolean> {
  const [row] = await sql`select 1 from shop_owners
    where shop_id = ${shop} and epoch = ${epoch} and password_hash is not null`;
  return !!row;
}

export async function ownerEmail(sql: Sql, shop: string): Promise<string | null> {
  const [row] = await sql<{ email: string }[]>`select email from shop_owners where shop_id = ${shop}`;
  return row?.email ?? null;
}

/** How many photos a shop's owner has stored. */
export async function photoCount(sql: Sql, shop: string): Promise<number> {
  const [row] = await sql<{ n: string }[]>`select count(*) as n from assets where shop_id = ${shop}`;
  return Number(row?.n ?? 0);
}

/**
 * Delete the photos a shop's owner uploaded that no shop uses, older than `minutes` (newer ones
 * may be in a form they haven't saved yet). Returns how many went.
 */
export async function clearUnusedPhotos(sql: Sql, storage: Storage, shop: string, minutes: number) {
  const unused = await sql<{ id: string }[]>`select a.id from assets a
    where a.shop_id = ${shop} and a.created_at < now() - make_interval(mins => ${minutes})
      and not exists (select 1 from shops s where s.logo_url = '/files/' || a.key)
      and not exists (select 1 from products p where p.image_url = '/files/' || a.key)`;
  for (const { id } of unused) await deleteAsset(sql, storage, id);
  return unused.length;
}
