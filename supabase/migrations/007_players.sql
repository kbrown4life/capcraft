-- CapCraft migration 007 — players (global reference pool)  [Phase C1]
-- Run in Supabase SQL Editor AFTER 001–006. Safe to re-run.
--
-- One row per real NBA player, shared across ALL leagues. Per-league signing
-- lives in a future `contracts` table, not here.
--
-- PROVIDER-AGNOSTIC BY DESIGN: external_id + external_source are nullable, so no
-- stats provider is committed to now. When you pick one (e.g. balldontlie),
-- the ingestion step fills these in; nothing here changes.

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  first_name text,
  last_name text,
  positions text[] not null default '{}',   -- e.g. {'PG','SG'}
  nba_team text,                            -- current team abbrev; null = FA/unknown
  jersey_number int,
  status text not null default 'active',    -- active | inactive | retired
  external_id text,                         -- provider's player id (nullable)
  external_source text,                     -- which provider external_id belongs to
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint players_status_check check (status in ('active', 'inactive', 'retired'))
);

-- A given provider maps a player at most once. Partial unique so many rows can
-- have NULL external_id before any provider is attached.
create unique index if not exists players_external_uniq
  on public.players (external_source, external_id)
  where external_id is not null;

-- Name lookup for search and future ID reconciliation.
create index if not exists players_name_idx on public.players (lower(full_name));
create index if not exists players_team_idx on public.players (nba_team);

alter table public.players enable row level security;

-- Public NBA data: any signed-in user can read the pool (needed to draft/bid).
-- No INSERT/UPDATE/DELETE policy: clients cannot write. Seeding and provider
-- ingestion run with the service-role key, which bypasses RLS.
drop policy if exists "players read authenticated" on public.players;
create policy "players read authenticated" on public.players
for select
to authenticated
using (true);
