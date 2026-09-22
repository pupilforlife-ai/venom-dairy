 -- Initial persistence schema for the frontend state bridge.
-- Run this in Supabase SQL Editor before starting the app.
create table if not exists public.app_state (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_state enable row level security;

-- Temporary prototype policies. Replace these with authenticated user/team policies
-- before using this app for sensitive production data.
drop policy if exists "Allow public state reads" on public.app_state;
drop policy if exists "Allow public state writes" on public.app_state;
drop policy if exists "Allow public state updates" on public.app_state;
drop policy if exists "Allow public state deletes" on public.app_state;

create policy "Allow public state reads"
  on public.app_state for select
  using (true);

create policy "Allow public state writes"
  on public.app_state for insert
  with check (true);

create policy "Allow public state updates"
  on public.app_state for update
  using (true)
  with check (true);

create policy "Allow public state deletes"
  on public.app_state for delete
  using (true);

create or replace function public.set_app_state_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists app_state_updated_at on public.app_state;
create trigger app_state_updated_at
before update on public.app_state
for each row execute function public.set_app_state_updated_at();
