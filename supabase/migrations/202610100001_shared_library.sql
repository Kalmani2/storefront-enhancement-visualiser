-- Run once in the Supabase dashboard SQL Editor.
-- One shared take-home workspace; access is through authorized server endpoints.
-- JSONB preserves the current project and planter types, including revision
-- history, source dimensions, target selections, alpha data and contact points.

begin;

create table if not exists public.projects (
  id text primary key,
  title text not null,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.planters (
  id uuid primary key,
  name text not null,
  status text not null check (status in ('uploaded', 'processing', 'review', 'approved', 'error')),
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.renders (
  id uuid primary key,
  project_id text not null references public.projects(id) on delete cascade,
  status text not null check (status in ('processing', 'review', 'accepted', 'rejected', 'error')),
  image_path text,
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists renders_project_id_idx on public.renders(project_id);

alter table public.projects enable row level security;
alter table public.planters enable row level security;
alter table public.renders enable row level security;

-- No public read/write policies. Secret-key server clients use service_role.
revoke all on table public.projects, public.planters, public.renders from anon, authenticated;
grant all on table public.projects, public.planters, public.renders to service_role;

insert into storage.buckets (id, name, public)
values ('storefront-assets', 'storefront-assets', false)
on conflict (id) do update set public = false;

commit;
