-- CapCraft Release 0.2 core schema
-- Paste this file into Supabase SQL Editor and run it once.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text not null check (char_length(display_name) between 1 and 50),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 3 and 80),
  slug text not null unique,
  password_hash text not null,
  commissioner_id uuid not null references public.profiles(id),
  status text not null default 'setup' check (status in ('setup', 'startup_draft', 'in_season', 'offseason', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.league_settings (
  league_id uuid primary key references public.leagues(id) on delete cascade,
  number_of_teams integer not null default 12 check (number_of_teams between 2 and 30),
  salary_cap_m numeric(8,2) not null default 200.00,
  minimum_salary_m numeric(8,2) not null default 2.50,
  roster_size integer not null default 15 check (roster_size between 8 and 25),
  signing_bonus_pool_m numeric(8,2) not null default 10.00,
  buyout_percent numeric(5,2) not null default 50.00,
  playoff_teams integer not null default 6,
  draft_order text not null default 'lottery' check (draft_order in ('lottery', 'reverse')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.league_categories (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  category_key text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (league_id, category_key)
);

create table if not exists public.franchises (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 60),
  abbreviation text,
  founded_season integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (league_id, name)
);

create table if not exists public.franchise_owners (
  id uuid primary key default gen_random_uuid(),
  franchise_id uuid not null references public.franchises(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'co_owner', 'commissioner')),
  active boolean not null default true,
  joined_at timestamptz not null default now(),
  ended_at timestamptz,
  unique (franchise_id, user_id)
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  league_id uuid references public.leagues(id) on delete cascade,
  actor_user_id uuid references public.profiles(id),
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  league_id uuid references public.leagues(id) on delete cascade,
  title text not null,
  body text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.leagues enable row level security;
alter table public.league_settings enable row level security;
alter table public.league_categories enable row level security;
alter table public.franchises enable row level security;
alter table public.franchise_owners enable row level security;
alter table public.audit_logs enable row level security;
alter table public.notifications enable row level security;

create or replace function public.is_league_member(p_league_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from franchise_owners fo
    join franchises f on f.id = fo.franchise_id
    where f.league_id = p_league_id
      and fo.user_id = auth.uid()
      and fo.active = true
  );
$$;

create or replace function public.is_league_commissioner(p_league_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from leagues l
    where l.id = p_league_id and l.commissioner_id = auth.uid()
  );
$$;

-- Drop policies before recreating to make reruns safe.
drop policy if exists "profiles read own and league peers" on public.profiles;
drop policy if exists "profiles insert own" on public.profiles;
drop policy if exists "profiles update own" on public.profiles;
drop policy if exists "leagues read members" on public.leagues;
drop policy if exists "league settings read members" on public.league_settings;
drop policy if exists "league categories read members" on public.league_categories;
drop policy if exists "franchises read members" on public.franchises;
drop policy if exists "franchise owners read members" on public.franchise_owners;
drop policy if exists "audit logs read commissioners" on public.audit_logs;
drop policy if exists "notifications read own" on public.notifications;
drop policy if exists "notifications update own" on public.notifications;

create policy "profiles read own and league peers" on public.profiles
for select using (true);

create policy "profiles insert own" on public.profiles
for insert with check (id = auth.uid());

create policy "profiles update own" on public.profiles
for update using (id = auth.uid()) with check (id = auth.uid());

create policy "leagues read members" on public.leagues
for select using (public.is_league_member(id) or commissioner_id = auth.uid());

create policy "league settings read members" on public.league_settings
for select using (public.is_league_member(league_id) or public.is_league_commissioner(league_id));

create policy "league categories read members" on public.league_categories
for select using (public.is_league_member(league_id) or public.is_league_commissioner(league_id));

create policy "franchises read members" on public.franchises
for select using (public.is_league_member(league_id) or public.is_league_commissioner(league_id));

create policy "franchise owners read members" on public.franchise_owners
for select using (
  exists (
    select 1 from franchises f
    where f.id = franchise_owners.franchise_id
      and (public.is_league_member(f.league_id) or public.is_league_commissioner(f.league_id))
  )
);

create policy "audit logs read commissioners" on public.audit_logs
for select using (public.is_league_commissioner(league_id));

create policy "notifications read own" on public.notifications
for select using (user_id = auth.uid());

create policy "notifications update own" on public.notifications
for update using (user_id = auth.uid()) with check (user_id = auth.uid());
