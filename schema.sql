-- Run this once in Supabase: SQL Editor > New query > Run.
-- The app keeps its existing archive format in one private JSON document.
create table if not exists public.oncehere_state (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.oncehere_state enable row level security;

-- No browser-facing policies are created. The table is accessed only by the
-- application's server with SUPABASE_SECRET_KEY.
