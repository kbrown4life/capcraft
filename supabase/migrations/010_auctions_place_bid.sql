-- CapCraft migration 010 — auctions + place_bid  [Phase C, step 2]
-- Run in the Supabase SQL Editor AFTER 001–009. Safe to re-run.
--
-- Adds the per-player auction clock and the bidding RPC. Resolution (timer
-- expiry, awarding the player, the incumbent match window) is the NEXT step —
-- this step only opens auctions and accepts bids, with correct locking.
--
-- LOCKING (option 1, confirmed): place_bid locks the bidding franchise's row so
-- a franchise cannot race its own concurrent bids past the cap check, and locks
-- the player's row so two franchises can't both create the same auction. Locks
-- are always taken franchise-then-player to avoid deadlock.

-- ---------------------------------------------------------------------------
-- auctions — one open auction per player per league. The 24h clock lives here.
-- ---------------------------------------------------------------------------
create table if not exists public.auctions (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete restrict,
  phase text not null check (phase in ('startup_draft', 'free_agency')),
  status text not null default 'open'
    check (status in ('open', 'resolving', 'awaiting_match', 'closed')),
  started_at timestamptz not null default now(),   -- first bid time
  ends_at timestamptz not null,                     -- started_at + 24h
  incumbent_franchise_id uuid references public.franchises(id) on delete set null,
  winner_franchise_id uuid references public.franchises(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- At most one non-closed auction per player per league.
create unique index if not exists auctions_one_open_per_player
  on public.auctions (league_id, player_id)
  where status <> 'closed';

create index if not exists auctions_open_ends_idx
  on public.auctions (status, ends_at);

alter table public.auctions enable row level security;

-- Auctions themselves are visible to league members (the fact that a player is
-- up for bid is public; the BIDS remain blind via contract_offers RLS).
drop policy if exists "auctions read members" on public.auctions;
create policy "auctions read members" on public.auctions
for select
using (public.is_league_member(league_id) or public.is_league_commissioner(league_id));

-- ---------------------------------------------------------------------------
-- place_bid — the only way a bid enters the system. Locks, checks cap, writes.
-- Raise = UPDATE the existing pending offer (confirmed).
-- ---------------------------------------------------------------------------
create or replace function public.place_bid(
  p_franchise_id uuid,
  p_player_id uuid,
  p_offer_salary numeric,
  p_offer_length integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_league uuid;
  v_league_status text;
  v_phase text;
  v_auction auctions%rowtype;
  v_incumbent uuid;
  v_eval jsonb;
  v_offer_id uuid;
begin
  if v_user is null then
    raise exception 'You must be signed in.';
  end if;

  select f.league_id into v_league from franchises f where f.id = p_franchise_id;
  if v_league is null then
    raise exception 'Franchise not found.';
  end if;

  -- Ownership: you can only bid for a franchise you actively own.
  if not exists (
    select 1 from franchise_owners fo
    where fo.franchise_id = p_franchise_id and fo.user_id = v_user and fo.active = true
  ) then
    raise exception 'Not your franchise.';
  end if;

  -- Player must not already be under an active contract in this league.
  if exists (
    select 1 from contracts
    where league_id = v_league and player_id = p_player_id and status = 'active'
  ) then
    raise exception 'That player is already under contract in this league.';
  end if;

  -- Locks: franchise first (cap-race), then player (auction-creation race).
  perform 1 from franchises where id = p_franchise_id for update;
  perform 1 from players where id = p_player_id for update;

  -- Find or open the auction for this player.
  select * into v_auction
  from auctions
  where league_id = v_league and player_id = p_player_id and status <> 'closed';

  if not found then
    select status into v_league_status from leagues where id = v_league;
    v_phase := case when v_league_status = 'startup_draft' then 'startup_draft' else 'free_agency' end;

    -- Incumbent (for free-agency matching): the franchise whose most recent
    -- expired/bought-out contract on this player sits in this league.
    if v_phase = 'free_agency' then
      select franchise_id into v_incumbent
      from contracts
      where league_id = v_league and player_id = p_player_id
        and status in ('expired', 'bought_out')
      order by updated_at desc
      limit 1;
    end if;

    insert into auctions (league_id, player_id, phase, status, started_at, ends_at, incumbent_franchise_id)
    values (v_league, p_player_id, v_phase, 'open', now(), now() + interval '24 hours', v_incumbent)
    returning * into v_auction;
  elsif v_auction.status <> 'open' then
    raise exception 'This auction is no longer accepting bids.';
  end if;

  -- Cap check via the referee (excludes any existing pending on this player so a
  -- raise replaces rather than double-counts).
  v_eval := public._cap_eval(p_franchise_id, p_offer_salary, p_offer_length, p_player_id);
  if not (v_eval->>'allowed')::boolean then
    raise exception 'Bid rejected: %', v_eval->>'reason';
  end if;

  -- Upsert the bid: raise updates the existing pending row, else insert.
  select id into v_offer_id
  from contract_offers
  where league_id = v_league and player_id = p_player_id
    and franchise_id = p_franchise_id and status = 'pending';

  if v_offer_id is not null then
    update contract_offers
      set offer_salary_m = p_offer_salary,
          offer_length_years = p_offer_length,
          updated_at = now()
    where id = v_offer_id;
  else
    insert into contract_offers (league_id, player_id, franchise_id, offer_salary_m, offer_length_years)
    values (v_league, p_player_id, p_franchise_id, p_offer_salary, p_offer_length)
    returning id into v_offer_id;
  end if;

  return jsonb_build_object(
    'offer_id', v_offer_id,
    'auction_id', v_auction.id,
    'auction_ends_at', v_auction.ends_at,
    'cap', v_eval
  );
end;
$$;
