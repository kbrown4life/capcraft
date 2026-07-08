-- 012_draft_lifecycle.sql
-- Draft lifecycle: setup -> startup_draft -> in_season.
--
-- Adds:
--   * start_draft(league)     commissioner: setup -> startup_draft
--   * end_draft(league)       commissioner: startup_draft -> in_season (manual early end)
--   * _advance_full_drafts()  auto: startup_draft -> in_season once every roster is full
--   * place_bid guard         bidding allowed only in startup_draft / in_season
--   * resolve_due_auctions     calls _advance_full_drafts() after the closing bell
--
-- Design notes:
--   * end_draft and the auto-advance are SILENT NO-OPS when the league is not in
--     startup_draft, so a manual "End Draft" click that races the auto-advance
--     simply does nothing instead of raising.
--   * Auto-advance only gates NEW bids (via the place_bid guard). Auctions already
--     open or in a match window drain normally through resolve_due_auctions; we do
--     not cancel in-flight auctions when the draft ends, to avoid orphaned cap
--     reservations / stuck-pending offers.
--   * No in-season signing rules here (waivers / instant sign are a later phase).
--     in_season is allowed to bid so that path is not amputated, but its rules are
--     unchanged from today's behaviour.

-- ---------------------------------------------------------------------------
-- start_draft: commissioner flips setup -> startup_draft
-- ---------------------------------------------------------------------------
create or replace function public.start_draft(p_league_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;
  if not public.is_league_commissioner(p_league_id) then
    raise exception 'Only the commissioner can start the draft.';
  end if;

  select status into v_status from leagues where id = p_league_id for update;
  if v_status is null then
    raise exception 'League not found.';
  end if;
  if v_status <> 'setup' then
    raise exception 'Draft can only be started from setup (league is %).', v_status;
  end if;

  update leagues set status = 'startup_draft', updated_at = now() where id = p_league_id;
end; $$;

-- ---------------------------------------------------------------------------
-- end_draft: commissioner manually ends the draft early.
-- Silent no-op if the league is not currently in startup_draft (race-safe).
-- ---------------------------------------------------------------------------
create or replace function public.end_draft(p_league_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;
  if not public.is_league_commissioner(p_league_id) then
    raise exception 'Only the commissioner can end the draft.';
  end if;

  update leagues
    set status = 'in_season', updated_at = now()
  where id = p_league_id and status = 'startup_draft';
  -- No row updated => league was not in startup_draft => intentional no-op.
end; $$;

-- ---------------------------------------------------------------------------
-- _advance_full_drafts: any startup_draft league whose every franchise holds
-- roster_size active contracts flips to in_season. Silent, idempotent.
-- SECURITY DEFINER, no auth gate: called only from resolve_due_auctions (cron).
-- ---------------------------------------------------------------------------
create or replace function public._advance_full_drafts()
returns void
language plpgsql security definer set search_path = public as $$
begin
  update leagues l
    set status = 'in_season', updated_at = now()
  where l.status = 'startup_draft'
    and exists (select 1 from franchises f where f.league_id = l.id)
    and not exists (
      -- any franchise NOT yet at roster_size => draft not done
      select 1
      from franchises f
      join league_settings s on s.league_id = l.id
      where f.league_id = l.id
        and (
          select count(*) from contracts c
          where c.league_id = l.id
            and c.franchise_id = f.id
            and c.status = 'active'
        ) < s.roster_size
    );
end; $$;

-- ---------------------------------------------------------------------------
-- place_bid: reject bids unless the league is in a biddable phase.
-- Biddable: startup_draft, in_season. Rejected: setup, offseason, archived.
-- Guard inserted after the ownership check, before auction work. v_league_status
-- is now read once up-front (the later in-branch fetch is removed).
-- ---------------------------------------------------------------------------
create or replace function public.place_bid(
  p_franchise_id uuid,
  p_player_id uuid,
  p_offer_salary numeric,
  p_offer_length integer
)
returns jsonb
language plpgsql security definer set search_path = public as $$
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

  -- Phase guard: bidding is only open during the startup draft or in-season.
  select status into v_league_status from leagues where id = v_league;
  if v_league_status not in ('startup_draft', 'in_season') then
    raise exception 'Bidding is closed while the league is in %.', v_league_status;
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
      set offer_salary_m = p_offer_salary, offer_length_years = p_offer_length, updated_at = now()
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
end; $$;

-- ---------------------------------------------------------------------------
-- resolve_due_auctions: unchanged closing-bell logic, plus a call to
-- _advance_full_drafts() after the loop so a draft that fills up during this
-- tick flips to in_season in the same pass.
-- ---------------------------------------------------------------------------
create or replace function public.resolve_due_auctions()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  a auctions%rowtype;
  w record;
  v_processed int := 0;
begin
  for a in
    select * from auctions
    where (status = 'open' and ends_at < now())
       or (status = 'awaiting_match' and match_deadline < now())
    for update skip locked
  loop
    if a.status = 'open' then
      -- Highest score wins; earliest bid breaks a tie.
      select id, franchise_id, offer_salary_m, offer_length_years,
             (offer_salary_m * offer_length_years) + (offer_salary_m * 2.5) + (offer_length_years * 4) as score
        into w
      from contract_offers
      where league_id = a.league_id and player_id = a.player_id and status = 'pending'
      order by score desc, created_at asc
      limit 1;

      if not found then
        -- No live bids (all withdrawn): close with no award.
        update auctions set status = 'closed', updated_at = now() where id = a.id;
      elsif a.incumbent_franchise_id is not null and a.incumbent_franchise_id <> w.franchise_id then
        -- Free-agency: incumbent gets a 12h window to match the winning terms.
        -- Losing (non-winner) bids release now; the winner's bid stays reserved.
        update contract_offers set status = 'lost', updated_at = now()
        where league_id = a.league_id and player_id = a.player_id and status = 'pending'
          and id <> w.id;

        update auctions
          set status = 'awaiting_match',
              winner_offer_id = w.id, winner_franchise_id = w.franchise_id,
              winner_salary_m = w.offer_salary_m, winner_length_years = w.offer_length_years,
              match_deadline = now() + interval '12 hours',
              updated_at = now()
        where id = a.id;

        -- Notify incumbent's owners that their match clock is running.
        insert into notifications (user_id, league_id, title, body)
        select fo.user_id, a.league_id, 'Match window open',
               'You have 12 hours to match the winning offer on '
               || (select full_name from players where id = a.player_id) || '.'
        from franchise_owners fo
        where fo.franchise_id = a.incumbent_franchise_id and fo.active = true;
      else
        -- No incumbent (startup draft) or incumbent is the winner: award now.
        perform public._award_auction(a.id, w.franchise_id, w.offer_salary_m, w.offer_length_years, w.id, 'auction');
      end if;

    elsif a.status = 'awaiting_match' then
      -- Match window expired with no decision: incumbent forfeits, winner signs.
      perform public._award_auction(a.id, a.winner_franchise_id, a.winner_salary_m, a.winner_length_years, a.winner_offer_id, 'auction');
    end if;

    v_processed := v_processed + 1;
  end loop;

  -- Closing bell done: flip any startup_draft league whose rosters are now full.
  perform public._advance_full_drafts();

  return v_processed;
end; $$;

grant execute on function public.start_draft(uuid) to authenticated;
grant execute on function public.end_draft(uuid) to authenticated;
