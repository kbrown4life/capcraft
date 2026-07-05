-- CapCraft migration 008 — contracts (flat salary, per-league)  [Phase C]
-- Run in the Supabase SQL Editor AFTER 001–007. Safe to re-run.
--
-- FLAT MODEL: one salary_m applies to every year of the deal. length_years is
-- 1–4 (your league's max). start_season is a LEAGUE-RELATIVE integer (season 1 =
-- inaugural season), so a future per-year cap view can index seasons without a
-- calendar-year concept the schema doesn't have yet.
--
-- DESIGNED FOR MODEL 2: moving to per-year salaries later means adding a
-- `contract_years` child table and pointing the cap view at it. This row
-- survives that change untouched — no rewrite, no data loss.
--
-- No client writes: signing happens through a security-definer RPC (next
-- migration) where the cap check, minimum-salary floor, and row locking live.

create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete restrict,
  franchise_id uuid not null references public.franchises(id) on delete cascade,
  salary_m numeric(8,2) not null check (salary_m > 0),
  length_years integer not null check (length_years between 1 and 4),
  start_season integer not null default 1,
  status text not null default 'active' check (status in ('active', 'expired', 'bought_out')),
  signed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Hard guarantee: a player can hold at most ONE active contract per league.
-- Partial unique so expired/bought-out deals don't block a re-signing.
create unique index if not exists contracts_one_active_per_player
  on public.contracts (league_id, player_id)
  where status = 'active';

-- Cap queries read active contracts per franchise; index for that path.
create index if not exists contracts_franchise_active_idx
  on public.contracts (league_id, franchise_id)
  where status = 'active';

alter table public.contracts enable row level security;

-- Read for league members/commissioner, matching the existing pattern.
drop policy if exists "contracts read members" on public.contracts;
create policy "contracts read members" on public.contracts
for select
using (public.is_league_member(league_id) or public.is_league_commissioner(league_id));
