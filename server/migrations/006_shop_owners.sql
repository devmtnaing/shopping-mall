-- Shop owners: a tenant who looks after one shop from /admin with their email and a password
-- (server/src/owners.ts). The host invites them with a one-time link to set the password.
create table shop_owners (
  shop_id text primary key references shops (id) on delete cascade,
  email text not null,
  password_hash text,               -- scrypt; null until they set it from the invite
  invite_hash text,                 -- sha-256 of the set-password link's token; null once used
  invite_expires timestamptz,
  epoch integer not null default 0, -- bumped to sign them out everywhere (new invite, removed)
  created_at timestamptz not null default now()
);
create unique index shop_owners_email on shop_owners (lower(email));

-- Files a shop owner uploaded, so their uploads can be capped and the unused ones cleared.
alter table assets add column shop_id text references shops (id) on delete set null;
create index assets_by_shop on assets (shop_id) where shop_id is not null;
