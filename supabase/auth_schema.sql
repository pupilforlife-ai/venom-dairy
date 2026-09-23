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
