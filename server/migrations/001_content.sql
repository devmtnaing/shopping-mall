-- Live content (docs/adr/0006): the mall, its shops, their products, and uploaded assets.
-- Assets are referenced by id so files can be swapped without touching anything else.

create table assets (
  id uuid primary key default gen_random_uuid(),
  kind text not null,                -- logo, product-image, mall-model, avatar, …
  key text not null unique,          -- object key in the bucket
  content_type text not null,
  bytes integer not null check (bytes >= 0),
  hash text not null,                -- sha-256 of the file, hex
  created_at timestamptz not null default now(),
  unique (kind, hash)                -- the same file uploaded twice is one asset
);

create table mall (
  id smallint primary key default 1 check (id = 1),  -- exactly one row
  name text not null,
  tagline text not null default '',
  accent text not null default '#e2b857',
  currency text not null default 'USD',
  locales text[] not null default '{en}',
  version bigint not null default 1,                   -- bumped on every content change
  updated_at timestamptz not null default now()
);

create table shops (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9-]*$'),
  slot text not null unique,
  name text not null,
  tagline text,
  category text,
  bg text not null,
  accent text not null,
  logo_asset uuid references assets (id) on delete set null,
  logo_url text,                      -- external logo, when not uploaded
  description text,
  features text[] not null default '{}',
  links jsonb not null default '[]',
  products_url text,                  -- json-url adapter: products fetched from here instead of the table
  sort integer not null default 0,
  updated_at timestamptz not null default now()
);

create table products (
  shop_id text not null references shops (id) on delete cascade,
  id text not null,
  name text not null,
  price numeric(12, 2) not null check (price >= 0),
  compare_at numeric(12, 2) check (compare_at >= 0),
  image_asset uuid references assets (id) on delete set null,
  image_url text,
  url text,
  sort integer not null default 0,
  primary key (shop_id, id)
);

create index products_by_shop on products (shop_id, sort);
