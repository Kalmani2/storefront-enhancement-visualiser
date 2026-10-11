-- Run in Supabase SQL Editor after 202610100001_shared_library.sql.
-- Shared take-home workspace. Only server-side service_role can access these tables.
begin;
create table if not exists public.frontage_runs (
  id uuid primary key,
  status text not null check (status in ('running', 'complete', 'cancelled', 'error')),
  data jsonb not null,
  lock_token uuid,
  lock_until timestamptz not null default '-infinity',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- One active run across all tabs AND server instances, not just an in-memory lock.
create unique index if not exists frontage_one_active_run on public.frontage_runs ((true)) where status = 'running';
create table if not exists public.frontage_assessments (
  id text primary key,
  place_id text not null,
  data jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists frontage_assessments_place on public.frontage_assessments(place_id);
create table if not exists public.approved_venues (
  place_id text primary key,
  status text not null check (status in ('approved', 'stale', 'removed')),
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.frontage_runs enable row level security;
alter table public.frontage_assessments enable row level security;
alter table public.approved_venues enable row level security;
revoke all on public.frontage_runs, public.frontage_assessments, public.approved_venues from anon, authenticated;
grant all on public.frontage_runs, public.frontage_assessments, public.approved_venues to service_role;
commit;
