-- Every email the mall sends (server/src/mail.ts), and what the provider later said became of it
-- (its webhook, server/src/mail-events.ts), so /admin can show "delivered" or "bounced: …".
create table emails (
  id text primary key,                  -- the provider's id for the email
  kind text not null check (kind in ('approval', 'invite')),
  recipient text not null,
  rental_id bigint references rental_applications (id) on delete set null,
  shop_id text,                         -- no foreign key: the shop may be removed, the record stays
  status text not null default 'sent'
    check (status in ('sent', 'delivered', 'delayed', 'bounced', 'suppressed', 'complained', 'failed')),
  detail text,                          -- the provider's words, for a bounce or a failure
  sent_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index emails_by_rental on emails (rental_id) where rental_id is not null;
create index emails_by_shop on emails (shop_id) where shop_id is not null;

-- Why an application was turned down: the host's words, or that the email to them bounced.
alter table rental_applications add column reason text;

-- Shops taken out of the mall, kept with why. The live tables only ever hold shops that are in the
-- mall, so nothing that lists shops or checks whether a unit is taken has to skip removed ones.
create table removed_shops (
  id bigserial primary key,
  shop_id text not null,
  slot text not null,
  name text not null,
  owner_email text,
  reason text not null,
  shop jsonb not null,                  -- the shop and its products as they were, to put back by hand
  removed_at timestamptz not null default now()
);
