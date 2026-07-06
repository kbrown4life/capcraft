-- CapCraft migration 011 — auction resolution (flat contracts)  [Phase C, step 3]
-- Run in the Supabase SQL Editor AFTER 001–010. Safe to re-run.
--
-- Builds the closing bell: resolve_due_auctions() awards expired auctions,
-- opens/expires the incumbent match window, creates contracts, and releases
-- losing cap reservations. Callable manually (commissioner "resolve now") and by
-- pg_cron. decide_match() is the incumbent's match-or-decline RPC.
--
-- FLAT MODEL. Contract Score = Total + AAV*2.5 + Years*4 + Bonus, where for flat
-- deals Total = salary*years and AAV = salary. Bonus is 0 until the signing-bonus
-- mechanic exists. Ties break by earliest bid (created_at); the spec's "decimal
-- method" is subsumed because a higher-decimal salary yields a higher score.

-- New columns to carry a pending match decision.
alter table public.auctions
  add column if not exists match_deadline timestamptz,
  add column if not exists winner_offer_id uuid references public.contract_offers(id) on delete set null,
  add column if not exists winner_salary_m numeric(8,2),
  add column if not exists winner_length_years integer;

-- ---------------------------------------------------------------------------
-- _award_auction — create the winning contract, settle offers, close, notify.
-- Awards to p_franchise at p_salary/p_years. The winning offer (if any) is set
-- 'won'; all other pending offers on the player are set 'lost' (releasing their
-- cap). Internal: no auth check.
-- ---------------------------------------------------------------------------
create or replace function public._award_auction(
  p_auction_id uuid,
  p_franchise_id uuid,
  p_salary numeric,
  p_years integer,
  p_winner_offer_id uuid,
  p_via text  -- 'auction' | 'match'
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v auctions%rowtype;
  v_player_name text;
  v_franchise_name text;
  v_owner uuid;
begin
  select * into v from auctions where id = p_auction_id;

  insert into contracts (league_id, player_id, franchise_id, salary_m, length_years, status, start_season)
  values (v.league_id, v.player_id, p_franchise_id, p_salary, p_years, 'active', 1);

  -- Settle offers: winner won, everyone else on this player lost.
  if p_winner_offer_id is not null then
    update contract_offers set status = 'won', updated_at = now() where id = p_winner_offer_id;
  end if;
  update contract_offers
    set status = 'lost', updated_at = now()
  where league_id = v.league_id and player_id = v.player_id and status = 'pending'
    and (p_winner_offer_id is null or id <> p_winner_offer_id);

  update auctions
    set status = 'closed', winner_franchise_id = p_franchise_id, updated_at = now()
  where id = p_auction_id;

  -- Public record: the signing (rosters are public). Losing bids are NOT logged.
  select full_name into v_player_name from players where id = v.player_id;
  select name into v_franchise_name from franchises where id = p_franchise_id;
  insert into audit_logs (league_id, actor_user_id, action, details)
  values (v.league_id, null, 'player.signed',
    jsonb_build_object('player', v_player_name, 'franchise', v_franchise_name,
                       'salary_m', p_salary, 'years', p_years, 'via', p_via));

  -- Notify the winning franchise's active owners.
  for v_owner in
    select user_id from franchise_owners where franchise_id = p_franchise_id and active = true
  loop
    insert into notifications (user_id, league_id, title, body)
    values (v_owner, v.league_id, 'Player signed',
      v_player_name || ' joins ' || v_franchise_name || ' at $' || p_salary || 'm x ' || p_years || 'yr.');
  end loop;
end; $$;

-- ---------------------------------------------------------------------------
-- resolve_due_auctions — the closing bell. Processes every auction whose time
-- has come. Locks each with FOR UPDATE SKIP LOCKED so concurrent runs (cron +
-- manual) never double-award. Returns a count of auctions processed.
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

  return v_processed;
end; $$;

-- ---------------------------------------------------------------------------
-- decide_match — the incumbent chooses to match (keep the player at the winning
-- terms) or decline (let the winner sign). Match requires passing the cap check.
-- ---------------------------------------------------------------------------
create or replace function public.decide_match(
  p_auction_id uuid,
  p_match boolean
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  a auctions%rowtype;
  v_eval jsonb;
begin
  if v_user is null then
    raise exception 'You must be signed in.';
  end if;

  select * into a from auctions where id = p_auction_id for update;
  if a.id is null then
    raise exception 'Auction not found.';
  end if;
  if a.status <> 'awaiting_match' then
    raise exception 'This auction is not awaiting a match decision.';
  end if;

  -- Only the incumbent's active owner may decide.
  if not exists (
    select 1 from franchise_owners fo
    where fo.franchise_id = a.incumbent_franchise_id and fo.user_id = v_user and fo.active = true
  ) then
    raise exception 'Only the incumbent franchise can match.';
  end if;

  if p_match then
    -- Incumbent must be able to afford the winning terms.
    v_eval := public._cap_eval(a.incumbent_franchise_id, a.winner_salary_m, a.winner_length_years, a.player_id);
    if not (v_eval->>'allowed')::boolean then
      raise exception 'Cannot match: %', v_eval->>'reason';
    end if;
    -- Winner's reservation releases; incumbent keeps the player at winning terms.
    update contract_offers set status = 'lost', updated_at = now() where id = a.winner_offer_id;
    perform public._award_auction(a.id, a.incumbent_franchise_id, a.winner_salary_m, a.winner_length_years, null, 'match');
    return jsonb_build_object('result', 'matched', 'franchise_id', a.incumbent_franchise_id);
  else
    -- Decline: the winner signs now.
    perform public._award_auction(a.id, a.winner_franchise_id, a.winner_salary_m, a.winner_length_years, a.winner_offer_id, 'auction');
    return jsonb_build_object('result', 'declined', 'franchise_id', a.winner_franchise_id);
  end if;
end; $$;
