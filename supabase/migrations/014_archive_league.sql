-- 014_archive_league.sql
-- Soft-delete (archive) a league. Commissioner-only.
--
-- "Delete" in the UI = set status = 'archived'. No rows are destroyed; the league
-- simply drops out of every member's list (the client filters archived leagues) and
-- all activity stops (place_bid already rejects non-startup_draft/in_season phases,
-- and resolve/auto-advance only touch startup_draft). Reversible by flipping status
-- back via SQL. There is intentionally no hard-delete path.

create or replace function public.archive_league(p_league_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;
  if not public.is_league_commissioner(p_league_id) then
    raise exception 'Only the commissioner can delete this league.';
  end if;

  update leagues
    set status = 'archived', updated_at = now()
  where id = p_league_id and status <> 'archived';
  -- No row updated => already archived => intentional no-op.
end; $$;

grant execute on function public.archive_league(uuid) to authenticated;
