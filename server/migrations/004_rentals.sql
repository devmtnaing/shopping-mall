-- Rental applications for vacant units (shared/src/rentals.ts). Kept until the host deletes them.
create table rental_applications (
  id bigserial primary key,
  slot text not null,
  name text not null,
  email text not null,
  phone text,
  business text not null,
  about text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index rental_applications_slot on rental_applications (slot, status);
