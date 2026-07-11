-- 015_bid_withdraw_and_counts.sql
-- Two blind-safe additions to the auction market:
--   * withdraw_bid       — a bidder pulls their pending offer before the auction closes,
--                          releasing the reserved cap. Owner-only; only while the auction
--                          is still 'open'. Soft-mark to 'withdrawn' (status already allows it).
--   * auction_bid_counts — per-player COUNT of pending bids on open auctions. Counts only —
--                          no amounts, no identities — so it stays blind. RLS restricts
--                          contract_offers to "read own", so this must be SECURITY DEFINER.

create or replace function public.withdraw_bid(p_franchise_id uuid, p_player_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_league uuid;
begin
  if v_user is null then
    raise exception 'You must be signed in.';
  end if;

  select league_id into v_league from franchises where id = p_franchise_id;
  if v_league is null then
    raise exception 'Franchise not found.';
  end if;

  if not exists (
    select 1 from franchise_owners fo
    where fo.franchise_id = p_franchise_id and fo.user_id = v_user and fo.active = true
  ) then
    raise exception 'Not your franchise.';
  end if;

  -- Only a pending offer on a still-open auction can be withdrawn. A winner in the
  -- match window (auction 'awaiting_match') is committed and cannot back out.
  update contract_offers o
    set status = 'withdrawn', updated_at = now()
  where o.franchise_id = p_franchise_id
    and o.player_id = p_player_id
    and o.status = 'pending'
    and exists (
      select 1 from auctions a
      where a.league_id = v_league and a.player_id = p_player_id and a.status = 'open'
    );
  -- No row updated => nothing pending / auction not open => intentional no-op.
end; $$;

-- Blind-safe contested-count for the War Room. Returns only (player_id, bid_count)
-- for players with an OPEN auction and at least one pending bid.
create or replace function public.auction_bid_counts(p_league_id uuid)
returns table(player_id uuid, bid_count integer)
language sql security definer set search_path = public stable as $$
  select o.player_id, count(*)::int
  from contract_offers o
  join auctions a
    on a.league_id = o.league_id and a.player_id = o.player_id and a.status = 'open'
  where o.league_id = p_league_id and o.status = 'pending'
  group by o.player_id;
$$;

grant execute on function public.withdraw_bid(uuid, uuid) to authenticated;
grant execute on function public.auction_bid_counts(uuid) to authenticated;
