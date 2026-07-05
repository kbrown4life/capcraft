-- CapCraft Release 0.2 functions
-- Run this after 001_core_schema.sql.

create or replace function public.slugify(value text)
returns text language sql immutable as $$
  select trim(both '-' from regexp_replace(lower(value), '[^a-z0-9]+', '-', 'g'));
$$;

create or replace function public.create_league_with_commissioner(
  p_league_name text,
  p_league_password_hash text,
  p_team_name text,
  p_settings jsonb,
  p_categories text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_slug_base text;
  v_slug text;
  v_suffix integer := 0;
  v_league_id uuid;
  v_franchise_id uuid;
begin
  if v_user is null then
    raise exception 'You must be signed in.';
  end if;

  if not exists (select 1 from profiles where id = v_user) then
    raise exception 'Profile missing. Create your username first.';
  end if;

  if char_length(coalesce(p_league_password_hash, '')) < 20 then
    raise exception 'League password hash missing.';
  end if;

  v_slug_base := public.slugify(p_league_name);
  v_slug := v_slug_base;

  while exists (select 1 from leagues where slug = v_slug) loop
    v_suffix := v_suffix + 1;
    v_slug := v_slug_base || '-' || v_suffix::text;
  end loop;

  insert into leagues (name, slug, password_hash, commissioner_id)
  values (p_league_name, v_slug, p_league_password_hash, v_user)
  returning id into v_league_id;

  insert into league_settings (
    league_id,
    number_of_teams,
    salary_cap_m,
    minimum_salary_m,
    roster_size,
    signing_bonus_pool_m,
    buyout_percent,
    playoff_teams,
    draft_order
  ) values (
    v_league_id,
    coalesce((p_settings->>'teams')::integer, 12),
    coalesce((p_settings->>'salaryCap')::numeric, 200.00),
    coalesce((p_settings->>'minSalary')::numeric, 2.50),
    15,
    coalesce((p_settings->>'signingBonusPool')::numeric, 10.00),
    coalesce((p_settings->>'buyoutPercent')::numeric, 50.00),
    coalesce((p_settings->>'playoffTeams')::integer, 6),
    coalesce(p_settings->>'draftOrder', 'lottery')
  );

  insert into league_categories (league_id, category_key, sort_order)
  select v_league_id, category, ordinality
  from unnest(p_categories) with ordinality as c(category, ordinality);

  insert into franchises (league_id, name)
  values (v_league_id, p_team_name)
  returning id into v_franchise_id;

  insert into franchise_owners (franchise_id, user_id, role)
  values (v_franchise_id, v_user, 'commissioner');

  insert into audit_logs (league_id, actor_user_id, action, details)
  values (v_league_id, v_user, 'league.created', jsonb_build_object('league_name', p_league_name, 'franchise_name', p_team_name));

  insert into notifications (user_id, league_id, title, body)
  values (v_user, v_league_id, 'League created', 'You are the commissioner of ' || p_league_name || '.');

  return jsonb_build_object('league_id', v_league_id, 'league_name', p_league_name, 'slug', v_slug, 'franchise_id', v_franchise_id);
end;
$$;

create or replace function public.join_league_by_name(
  p_league_name text,
  p_league_password_hash text,
  p_team_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_league leagues%rowtype;
  v_franchise_id uuid;
  v_current_teams integer;
  v_max_teams integer;
begin
  if v_user is null then
    raise exception 'You must be signed in.';
  end if;

  select * into v_league from leagues where lower(name) = lower(p_league_name) limit 1;
  if v_league.id is null then
    raise exception 'League not found.';
  end if;

  if v_league.password_hash <> p_league_password_hash then
    raise exception 'Incorrect league password.';
  end if;

  select count(*) into v_current_teams from franchises where league_id = v_league.id;
  select number_of_teams into v_max_teams from league_settings where league_id = v_league.id;

  if v_current_teams >= v_max_teams then
    raise exception 'This league is full.';
  end if;

  if exists (
    select 1 from franchise_owners fo
    join franchises f on f.id = fo.franchise_id
    where f.league_id = v_league.id and fo.user_id = v_user and fo.active = true
  ) then
    raise exception 'You are already in this league.';
  end if;

  insert into franchises (league_id, name)
  values (v_league.id, p_team_name)
  returning id into v_franchise_id;

  insert into franchise_owners (franchise_id, user_id, role)
  values (v_franchise_id, v_user, 'owner');

  insert into audit_logs (league_id, actor_user_id, action, details)
  values (v_league.id, v_user, 'league.joined', jsonb_build_object('franchise_name', p_team_name));

  insert into notifications (user_id, league_id, title, body)
  values (v_league.commissioner_id, v_league.id, 'New franchise joined', p_team_name || ' joined ' || v_league.name || '.');

  return jsonb_build_object('league_id', v_league.id, 'league_name', v_league.name, 'franchise_id', v_franchise_id);
end;
$$;
