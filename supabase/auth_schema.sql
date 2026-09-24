-- Internal username-based access with owner approval.
-- Run after schema.sql in Supabase SQL Editor.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  role text not null default 'staff' check (role in ('staff', 'admin', 'owner')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references auth.users(id)
);

alter table public.profiles enable row level security;

-- SECURITY DEFINER avoids recursive RLS evaluation when policies on profiles
-- need to check whether the current user is an approved owner.
create or replace function public.is_approved_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and status = 'approved'
  );
$$;

create or replace function public.is_approved_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'owner'
      and status = 'approved'
  );
$$;

revoke all on function public.is_approved_user() from public;
grant execute on function public.is_approved_user() to anon;
grant execute on function public.is_approved_user() to authenticated;
revoke all on function public.is_approved_owner() from public;
grant execute on function public.is_approved_owner() to authenticated;

create or replace function public.force_production_round_next_stage(round_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_rounds jsonb;
  next_rounds jsonb := '[]'::jsonb;
  round_item jsonb;
  current_status text;
  next_status text;
  statuses text[] := array['scheduled', 'in_production', 'coagulation', 'pressing', 'cooling', 'resting', 'ready_cutting', 'cut', 'clingwrapped', 'frozen', 'packed', 'handed_over'];
  status_index integer;
  updated_round jsonb := null;
begin
  if not public.is_approved_owner() and not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and status = 'approved'
  ) then
    raise exception 'Only approved admins and owners can force a round to the next stage';
  end if;

  select value into current_rounds
  from public.app_state
  where key = 'vejoy_productionRounds'
  for update;

  if current_rounds is null or jsonb_typeof(current_rounds) <> 'array' then
    raise exception 'Production rounds state is unavailable';
  end if;

  for round_item in select value from jsonb_array_elements(current_rounds)
  loop
    if round_item->>'id' = round_id then
      current_status := round_item->>'status';
      status_index := array_position(statuses, current_status);
      if status_index is null or status_index >= cardinality(statuses) then
        raise exception 'Round is already at its final stage or has an unknown status';
      end if;
      next_status := statuses[status_index + 1];
      round_item := jsonb_set(round_item, '{status}', to_jsonb(next_status), true);
      if next_status = 'pressing' then
        round_item := jsonb_set(round_item, '{pressingStartedAt}', to_jsonb(now()), true);
      elsif next_status = 'cooling' then
        round_item := jsonb_set(round_item, '{coolingStartedAt}', to_jsonb(now()), true);
      elsif next_status = 'resting' then
        round_item := jsonb_set(round_item, '{restingStartedAt}', to_jsonb(now()), true);
      end if;
      if next_status = 'handed_over' then
        round_item := jsonb_set(round_item, '{locked}', 'true'::jsonb, true);
      end if;
      updated_round := round_item;
    end if;
    next_rounds := next_rounds || jsonb_build_array(round_item);
  end loop;

  if updated_round is null then
    raise exception 'Production round not found';
  end if;

  update public.app_state
  set value = next_rounds
  where key = 'vejoy_productionRounds';

  return updated_round;
end;
$$;

revoke all on function public.force_production_round_next_stage(text) from public;
grant execute on function public.force_production_round_next_stage(text) to authenticated;

create or replace function public.create_production_round(round_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_rounds jsonb;
  new_round jsonb;
  next_number integer;
  shift_id text;
begin
  if not public.is_approved_user() then
    raise exception 'Approved access required';
  end if;
  shift_id := round_input->>'shiftId';
  if shift_id is null or shift_id = '' then raise exception 'Shift is required'; end if;
  select value into current_rounds from public.app_state where key = 'vejoy_productionRounds' for update;
  if current_rounds is null or jsonb_typeof(current_rounds) <> 'array' then raise exception 'Production rounds state is unavailable'; end if;
  select coalesce(max((item->>'roundNumber')::integer), 0) + 1 into next_number
  from jsonb_array_elements(current_rounds) item
  where item->>'shiftId' = shift_id;
  new_round := round_input || jsonb_build_object('id', 'pr-' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint, 'roundNumber', next_number);
  update public.app_state set value = current_rounds || jsonb_build_array(new_round) where key = 'vejoy_productionRounds';
  return new_round;
end;
$$;

revoke all on function public.create_production_round(jsonb) from public;
grant execute on function public.create_production_round(jsonb) to authenticated;

-- Shared operational state is inaccessible until the user is approved.
drop policy if exists "Allow public state reads" on public.app_state;
drop policy if exists "Allow public state writes" on public.app_state;
drop policy if exists "Allow public state updates" on public.app_state;
drop policy if exists "Allow public state deletes" on public.app_state;
drop policy if exists "Approved users can read state" on public.app_state;
drop policy if exists "Approved users can insert state" on public.app_state;
drop policy if exists "Approved users can update state" on public.app_state;
drop policy if exists "Approved users can delete state" on public.app_state;

create policy "Approved users can read state"
  on public.app_state for select
  using (public.is_approved_user());

create policy "Approved users can insert state"
  on public.app_state for insert
  with check (public.is_approved_user());

create policy "Approved users can update state"
  on public.app_state for update
  using (public.is_approved_user())
  with check (public.is_approved_user());

create policy "Approved users can delete state"
  on public.app_state for delete
  using (public.is_approved_user());

drop policy if exists "Users can read own profile" on public.profiles;
drop policy if exists "Users can create own pending profile" on public.profiles;
drop policy if exists "Owners can read profiles" on public.profiles;
drop policy if exists "Owners can approve profiles" on public.profiles;

create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can create own pending profile"
  on public.profiles for insert
  with check (auth.uid() = id and role = 'staff' and status = 'pending');

create policy "Owners can read profiles"
  on public.profiles for select
  using (public.is_approved_owner());

create policy "Owners can approve profiles"
  on public.profiles for update
  using (public.is_approved_owner())
  with check (role in ('staff', 'admin', 'owner') and status in ('pending', 'approved', 'rejected'));

create or replace function public.handle_new_user()
returns trigger
security definer set search_path = public
language plpgsql
as $$
begin
  insert into public.profiles (id, username)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1)));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Bootstrap the first owner manually after creating that account:
-- update public.profiles set role = 'owner', status = 'approved', approved_at = now() where username = 'owner';
