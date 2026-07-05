-- CapCraft migration 005 — tighten profiles read access
-- Run this in the Supabase SQL Editor AFTER 001–004.
-- Safe to re-run: it drops and recreates the policy and function each time.
--
-- WHAT THIS FIXES
-- The profiles SELECT policy was `using (true)`, which let ANY signed-in user
-- read EVERY profile in the database. This restricts reads to:
--   * your own profile, and
--   * profiles of people who share at least one league with you.
--
-- This does NOT touch INSERT/UPDATE (kept from migration 003) and does NOT
-- change how emails are stored — emails live in auth.users and were never in
-- this table.

-- Helper: does the current user share an active league with the target user?
-- security definer so it can read franchise_owners/franchises without being
-- blocked by their own RLS, and without recursing into the profiles policy.
create or replace function public.shares_league_with(p_target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from franchise_owners me
    join franchises fme   on fme.id = me.franchise_id
    join franchises fthem on fthem.league_id = fme.league_id
    join franchise_owners them on them.franchise_id = fthem.id
    where me.user_id = auth.uid()
      and me.active = true
      and them.user_id = p_target
      and them.active = true
  );
$$;

-- Replace the permissive read policy.
drop policy if exists "profiles read own and league peers" on public.profiles;
drop policy if exists "profiles read self or league peers" on public.profiles;

create policy "profiles read self or league peers" on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or public.shares_league_with(id)
);
