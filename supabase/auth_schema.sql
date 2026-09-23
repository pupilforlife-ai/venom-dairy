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
  using (exists (select 1 from public.profiles owner_profile where owner_profile.id = auth.uid() and owner_profile.role = 'owner' and owner_profile.status = 'approved'));

create policy "Owners can approve profiles"
  on public.profiles for update
  using (exists (select 1 from public.profiles owner_profile where owner_profile.id = auth.uid() and owner_profile.role = 'owner' and owner_profile.status = 'approved'))
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
