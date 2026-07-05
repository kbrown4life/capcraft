-- CapCraft Release 0.2.2 profile recovery patch
-- Run this if signup created an Auth user but profiles stayed empty.

alter table public.profiles enable row level security;

drop policy if exists "profiles insert own" on public.profiles;
drop policy if exists "profiles update own" on public.profiles;

create policy "profiles insert own" on public.profiles
for insert
to authenticated
with check (id = auth.uid());

create policy "profiles update own" on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());
