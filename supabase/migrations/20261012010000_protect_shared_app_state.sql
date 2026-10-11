-- Prevent shared operational records from being silently lost when two
-- devices save different snapshots of the JSON app_state collections.

alter table public.app_state
  add column if not exists version bigint not null default 1,
  add column if not exists updated_by uuid;

create table if not exists public.app_state_history (
  id bigint generated always as identity primary key,
  key text not null,
  operation text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  old_value jsonb,
  new_value jsonb,
  old_version bigint,
  new_version bigint,
  changed_at timestamptz not null default now(),
  changed_by uuid
);

alter table public.app_state_history enable row level security;

revoke all on table public.app_state_history from anon, authenticated;
grant select on table public.app_state_history to authenticated;

drop policy if exists "Approved managers can read app state history" on public.app_state_history;
create policy "Approved managers can read app state history"
  on public.app_state_history for select
  using (
    exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and status = 'approved'
        and role in ('owner', 'admin')
    )
  );

create or replace function public.protect_app_state_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  removed_ids text;
begin
  if tg_op = 'DELETE' then
    if old.key = 'vejoy_milkLots' and auth.uid() is not null then
      raise exception using
        errcode = '23514',
        message = 'Milk-lot deletion is protected. Use a reviewed database maintenance operation.';
    end if;
    return old;
  end if;

  -- Several screens derive summary fields from the same state. Do not turn
  -- an unchanged save into another version/realtime event, otherwise open
  -- devices can echo the same snapshot back and forth indefinitely.
  if tg_op = 'UPDATE' and new.value = old.value then
    return null;
  end if;

  new.updated_at := now();
  new.updated_by := auth.uid();
  if tg_op = 'INSERT' then
    new.version := coalesce(new.version, 1);
  else
    new.version := coalesce(old.version, 0) + 1;
  end if;

  if new.key = 'vejoy_milkLots' then
    if jsonb_typeof(new.value) <> 'array' then
      raise exception using errcode = '23514', message = 'Milk lots must be stored as an array.';
    end if;

    if exists (
      select 1
      from jsonb_array_elements(new.value) item
      where nullif(item->>'id', '') is null
    ) then
      raise exception using errcode = '23514', message = 'Every milk lot must have a stable ID.';
    end if;

    if exists (
      select 1
      from jsonb_array_elements(new.value) item
      where nullif(item->>'lotCode', '') is not null
      group by item->>'lotCode'
      having count(*) > 1
    ) then
      raise exception using errcode = '23514', message = 'A milk lot with this lot code already exists.';
    end if;

    -- Authenticated frontend writes may add or update milk lots, but cannot
    -- remove one by replacing the collection with a stale/shorter snapshot.
    -- SQL maintenance sessions have auth.uid() = null and remain available
    -- for explicitly reviewed recovery or cleanup work.
    if tg_op = 'UPDATE'
       and auth.uid() is not null
       and old.key = 'vejoy_milkLots'
       and jsonb_typeof(old.value) = 'array' then
      select string_agg(old_item->>'id', ', ' order by old_item->>'id')
      into removed_ids
      from jsonb_array_elements(old.value) old_item
      where not exists (
        select 1
        from jsonb_array_elements(new.value) new_item
        where new_item->>'id' = old_item->>'id'
      );

      if removed_ids is not null then
        raise exception using
          errcode = '23514',
          message = format('Milk-lot deletion blocked for IDs: %s', removed_ids);
      end if;
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.audit_app_state_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.app_state_history (
    key,
    operation,
    old_value,
    new_value,
    old_version,
    new_version,
    changed_by
  ) values (
    coalesce(new.key, old.key),
    tg_op,
    case when tg_op = 'INSERT' then null else old.value end,
    case when tg_op = 'DELETE' then null else new.value end,
    case when tg_op = 'INSERT' then null else old.version end,
    case when tg_op = 'DELETE' then null else new.version end,
    auth.uid()
  );
  return null;
end;
$$;

drop trigger if exists app_state_updated_at on public.app_state;
drop trigger if exists protect_app_state_update on public.app_state;
create trigger protect_app_state_update
before insert or update or delete on public.app_state
for each row execute function public.protect_app_state_update();

drop trigger if exists audit_app_state_change on public.app_state;
create trigger audit_app_state_change
after insert or update or delete on public.app_state
for each row execute function public.audit_app_state_change();

-- Realtime keeps every open device on the same server snapshot. The block is
-- idempotent because ALTER PUBLICATION has no IF NOT EXISTS form for tables.
do $$
begin
  alter publication supabase_realtime add table public.app_state;
exception
  when duplicate_object then null;
end;
$$;
