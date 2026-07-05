-- CapCraft migration 009 — cap engine: offers (cap-core), cap view, referee
-- Run in the Supabase SQL Editor AFTER 001–008. Safe to re-run.
--
-- SCOPE: the cap-relevant core only. Auction FLOW columns (timers, nomination,
-- match-decision state, resolution) come in the next migration. This step makes
-- the available-to-bid math correct and testable in isolation.
--
-- KEY RULE (confirmed): the spot a franchise is bidding on releases its own
-- $2.5m hold the moment the bid is placed. So "resting room" (all empty spots
-- held) and "max bid" (target spot released) are DIFFERENT numbers on purpose.
-- The hold value = the league's minimum_salary_m (not a hardcoded 2.5), since an
-- empty spot must eventually be filled by at least a minimum contract.

-- ---------------------------------------------------------------------------
-- 1) contract_offers — a bid. Only status='pending' reserves cap.
-- ---------------------------------------------------------------------------
create table if not exists public.contract_offers (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete restrict,
  franchise_id uuid not null references public.franchises(id) on delete cascade,
  offer_salary_m numeric(8,2) not null check (offer_salary_m > 0),
  offer_length_years integer not null check (offer_length_years between 1 and 4),
  status text not null default 'pending'
    check (status in ('pending', 'won', 'lost', 'withdrawn', 'matched', 'expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One live bid per franchise per player (raising replaces, not stacks).
create unique index if not exists offers_one_pending_per_franchise_player
  on public.contract_offers (league_id, player_id, franchise_id)
  where status = 'pending';

create index if not exists offers_pending_by_franchise
  on public.contract_offers (league_id, franchise_id)
  where status = 'pending';
create index if not exists offers_pending_by_player
  on public.contract_offers (league_id, player_id)
  where status = 'pending';

alter table public.contract_offers enable row level security;

-- BLIND: a franchise sees only its OWN offers; commissioner sees all. No client
-- writes — bids go through the bid RPC (next migration) with locking.
drop policy if exists "offers read own" on public.contract_offers;
create policy "offers read own" on public.contract_offers
for select
using (
  public.is_league_commissioner(league_id)
  or exists (
    select 1 from franchise_owners fo
    where fo.franchise_id = contract_offers.franchise_id
      and fo.user_id = auth.uid()
      and fo.active = true
  )
);

-- ---------------------------------------------------------------------------
-- 2) franchise_cap — PUBLIC resting picture (signed money only, no pending).
--    This is the "9" number: all empty spots still held. Everyone in the league
--    can see everyone's resting cap; pending bids are NOT here (they're blind).
-- ---------------------------------------------------------------------------
drop view if exists public.franchise_cap;
create view public.franchise_cap with (security_invoker = true) as
select
  f.league_id,
  f.id   as franchise_id,
  f.name as franchise_name,
  s.salary_cap_m                              as cap,
  coalesce(c.payroll, 0)                      as payroll,
  coalesce(c.signed_count, 0)                 as signed_count,
  s.roster_size,
  greatest(s.roster_size - coalesce(c.signed_count, 0), 0) as empty_spots,
  s.minimum_salary_m * greatest(s.roster_size - coalesce(c.signed_count, 0), 0) as holds,
  s.salary_cap_m
    - coalesce(c.payroll, 0)
    - s.minimum_salary_m * greatest(s.roster_size - coalesce(c.signed_count, 0), 0) as resting_room
from public.franchises f
join public.league_settings s on s.league_id = f.league_id
left join (
  select league_id, franchise_id, sum(salary_m) as payroll, count(*) as signed_count
  from public.contracts
  where status = 'active'
  group by league_id, franchise_id
) c on c.franchise_id = f.id;

-- ---------------------------------------------------------------------------
-- 3) _cap_eval — the pure referee. NO auth check, so it is testable directly in
--    the SQL Editor. Evaluates adding ONE new bid of (salary, length) for a
--    franchise, with the target spot's hold released. Returns a full breakdown
--    (no hidden calculations). p_player_id excludes an existing pending on that
--    same player so a raise replaces rather than double-counts.
-- ---------------------------------------------------------------------------
create or replace function public._cap_eval(
  p_franchise_id uuid,
  p_offer_salary numeric,
  p_offer_length integer,
  p_player_id uuid default null
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_league uuid;
  v_cap numeric; v_min numeric; v_roster int;
  v_payroll numeric; v_signed int;
  v_pending_sum numeric; v_pending_cnt int;
  v_total_pending int; v_spots_used int; v_remaining int;
  v_holds numeric; v_reserved numeric; v_avail numeric; v_maxbid numeric;
  v_allowed boolean := true; v_reason text := 'ok';
begin
  select f.league_id into v_league from franchises f where f.id = p_franchise_id;
  if v_league is null then
    return jsonb_build_object('allowed', false, 'reason', 'franchise not found');
  end if;

  select salary_cap_m, minimum_salary_m, roster_size
    into v_cap, v_min, v_roster
  from league_settings where league_id = v_league;

  select coalesce(sum(salary_m), 0), count(*)
    into v_payroll, v_signed
  from contracts
  where league_id = v_league and franchise_id = p_franchise_id and status = 'active';

  select coalesce(sum(offer_salary_m), 0), count(*)
    into v_pending_sum, v_pending_cnt
  from contract_offers
  where league_id = v_league and franchise_id = p_franchise_id and status = 'pending'
    and (p_player_id is null or player_id <> p_player_id);

  v_total_pending := v_pending_cnt + 1;                       -- include this new bid
  v_spots_used    := v_signed + v_total_pending;
  v_remaining     := greatest(v_roster - v_spots_used, 0);    -- empty spots still held
  v_holds         := v_min * v_remaining;
  v_reserved      := v_payroll + v_pending_sum + p_offer_salary;
  v_avail         := v_cap - v_reserved - v_holds;
  v_maxbid        := v_cap - v_payroll - v_pending_sum
                     - v_min * greatest(v_roster - v_signed - v_pending_cnt - 1, 0);

  if p_offer_salary < v_min then v_allowed := false; v_reason := 'below minimum salary'; end if;
  if p_offer_length < 1 or p_offer_length > 4 then v_allowed := false; v_reason := 'length must be 1-4'; end if;
  if v_spots_used > v_roster then v_allowed := false; v_reason := 'exceeds roster size'; end if;
  if v_avail < 0 then v_allowed := false; v_reason := 'exceeds available cap'; end if;

  return jsonb_build_object(
    'allowed', v_allowed, 'reason', v_reason,
    'cap', v_cap, 'payroll', v_payroll, 'signed_count', v_signed,
    'pending_count', v_pending_cnt, 'pending_sum', v_pending_sum,
    'spots_used', v_spots_used, 'remaining_empty', v_remaining,
    'holds', v_holds, 'reserved', v_reserved,
    'available_after', v_avail, 'max_bid', greatest(v_maxbid, 0),
    'roster_size', v_roster, 'minimum_salary', v_min
  );
end; $$;

-- ---------------------------------------------------------------------------
-- 4) can_afford — client-facing wrapper. Ownership-checked so a manager cannot
--    probe a rival's available cap (which would leak their blind pending bids).
--    Internally calls the same referee the bid RPC will use.
-- ---------------------------------------------------------------------------
create or replace function public.can_afford(
  p_franchise_id uuid,
  p_offer_salary numeric,
  p_offer_length integer,
  p_player_id uuid default null
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (
    select 1 from franchise_owners fo
    where fo.franchise_id = p_franchise_id
      and fo.user_id = auth.uid()
      and fo.active = true
  ) then
    raise exception 'Not your franchise.';
  end if;
  return public._cap_eval(p_franchise_id, p_offer_salary, p_offer_length, p_player_id);
end; $$;
