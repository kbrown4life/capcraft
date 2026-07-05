-- CapCraft migration 006 — franchise identity (Phase B)
-- Run in Supabase SQL Editor AFTER 001–005. Safe to re-run.
--
-- Adds curated colors + monogram to franchises. All columns NULLABLE, so every
-- existing franchise row stays valid with nulls — no backfill, nothing breaks.
-- Colors are stored as PALETTE KEYS (not hex) and constrained to the curated
-- set, enforcing "no arbitrary color picker" at the database level.
-- Keys MUST match src/lib/palette.js.

alter table public.franchises
  add column if not exists primary_color text,
  add column if not exists secondary_color text,
  add column if not exists monogram text;

alter table public.franchises drop constraint if exists franchises_primary_color_check;
alter table public.franchises drop constraint if exists franchises_secondary_color_check;
alter table public.franchises drop constraint if exists franchises_monogram_check;

alter table public.franchises
  add constraint franchises_primary_color_check
    check (primary_color is null or primary_color in (
      'forest','crimson','royal','gold','slate','purple','teal','orange','navy','maroon','emerald','charcoal'
    ));

alter table public.franchises
  add constraint franchises_secondary_color_check
    check (secondary_color is null or secondary_color in (
      'forest','crimson','royal','gold','slate','purple','teal','orange','navy','maroon','emerald','charcoal'
    ));

alter table public.franchises
  add constraint franchises_monogram_check
    check (monogram is null or monogram ~ '^[A-Z0-9]{1,3}$');

-- Write path: an active owner updates their own franchise's identity.
-- security definer + explicit ownership check keeps the "clients never write
-- tables directly" invariant (no direct-table UPDATE policy is granted).
-- Table check constraints still apply to this update, so invalid palette keys
-- or monograms are rejected here too.
create or replace function public.update_franchise_identity(
  p_franchise_id uuid,
  p_primary_color text,
  p_secondary_color text,
  p_monogram text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'You must be signed in.';
  end if;

  if not exists (
    select 1 from franchise_owners fo
    where fo.franchise_id = p_franchise_id
      and fo.user_id = v_user
      and fo.active = true
      and fo.role in ('owner', 'co_owner', 'commissioner')
  ) then
    raise exception 'You do not own this franchise.';
  end if;

  update franchises
     set primary_color = p_primary_color,
         secondary_color = p_secondary_color,
         monogram = upper(p_monogram),
         updated_at = now()
   where id = p_franchise_id;

  return jsonb_build_object(
    'franchise_id', p_franchise_id,
    'primary_color', p_primary_color,
    'secondary_color', p_secondary_color,
    'monogram', upper(p_monogram)
  );
end;
$$;
