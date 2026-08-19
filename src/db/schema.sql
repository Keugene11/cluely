-- Cluely clone schema (Neon Postgres)

create extension if not exists pgcrypto;

create table if not exists users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  name          text not null default '',
  password_hash text not null,
  plan          text not null default 'starter',   -- starter | pro | team
  created_at    timestamptz not null default now()
);

-- A "meeting" = one live assist session
create table if not exists sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  title       text not null default 'Untitled session',
  kind        text not null default 'meeting',     -- meeting | interview | sales | study
  status      text not null default 'live',        -- live | ended
  notes       jsonb,                               -- generated summary/action items/follow-up
  started_at  timestamptz not null default now(),
  ended_at    timestamptz
);
create index if not exists sessions_user_idx on sessions(user_id, started_at desc);

-- Rolling transcript lines captured from the mic
create table if not exists transcript_lines (
  id         bigserial primary key,
  session_id uuid not null references sessions(id) on delete cascade,
  speaker    text not null default 'them',         -- me | them
  text       text not null,
  at_ms      integer not null default 0,           -- offset from session start
  created_at timestamptz not null default now()
);
create index if not exists transcript_session_idx on transcript_lines(session_id, id);

-- Ctrl/Cmd+Enter asks and the answers Claude streamed back
create table if not exists assists (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  question   text not null default '',
  answer     text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists assists_session_idx on assists(session_id, created_at desc);

-- Context uploads ("custom files") the assistant reads before a call
create table if not exists context_files (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  name       text not null,
  content    text not null,
  created_at timestamptz not null default now()
);
create index if not exists context_user_idx on context_files(user_id, created_at desc);
