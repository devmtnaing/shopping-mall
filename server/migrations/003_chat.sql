-- Chat history: every message said in the mall, kept for CHAT_KEEP_DAYS (30 by default) and shown
-- to newcomers (the last few in their room). Text is stored as it was shown, blocklist applied.
create table chat (
  id bigserial primary key,
  room text not null,
  name text not null,
  text text not null,
  host boolean not null default false,
  at timestamptz not null default now()
);
create index chat_room_at on chat (room, at desc);
