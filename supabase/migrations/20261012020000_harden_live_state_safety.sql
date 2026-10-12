-- Online safety hardening for the live JSON state bridge.
--
-- This migration takes only short row locks. It does not rewrite any current
-- operational collection and is safe to apply while production is active.

create or replace function public.is_app_state_manager()
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
      and role in ('owner', 'admin')
  );
$$;

revoke all on function public.is_app_state_manager() from public;
grant execute on function public.is_app_state_manager() to authenticated;

-- No staff account may delete an app_state collection. Even managers use a
-- reviewed SQL maintenance operation for record deletion so production data
-- cannot disappear through the browser.
drop policy if exists "Approved users can delete state" on public.app_state;
drop policy if exists "Approved managers can delete state" on public.app_state;
create policy "Approved managers can delete state"
  on public.app_state for delete
  using (public.is_app_state_manager());

create or replace function public.protect_app_state_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  protected_keys constant text[] := array[
    'vejoy_milkLots',
    'vejoy_creamLots',
    'vejoy_productionShifts',
    'vejoy_productionRounds',
    'vejoy_intermediateLots',
    'vejoy_finishedStock',
    'vejoy_temperatureReadings',
    'vejoy_wasteEvents',
    'vejoy_utilityLogs',
    'vejoy_cipRecords',
    'vejoy_crumbingBatches',
    'vejoy_distributionHandovers'
  ];
  removed_ids text;
begin
  if tg_op = 'DELETE' then
    if old.key = any(protected_keys) and auth.uid() is not null then
      raise exception using
        errcode = '23514',
        message = format('%s deletion is protected. Use a reviewed database maintenance operation.', old.key);
    end if;
    return old;
  end if;

  -- Do not create a version, history row, or realtime event for an unchanged
  -- save. This prevents open devices from echoing snapshots indefinitely.
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

  if new.key = any(protected_keys) then
    if jsonb_typeof(new.value) <> 'array' then
      raise exception using errcode = '23514', message = format('%s must be stored as an array.', new.key);
    end if;

    if exists (
      select 1
      from jsonb_array_elements(new.value) item
      where nullif(item->>'id', '') is null
    ) then
      raise exception using errcode = '23514', message = format('Every %s record must have a stable ID.', new.key);
    end if;

    if exists (
      select 1
      from jsonb_array_elements(new.value) item
      group by item->>'id'
      having count(*) > 1
    ) then
      raise exception using errcode = '23514', message = format('%s contains duplicate record IDs.', new.key);
    end if;

    -- Authenticated app writes may add and edit records, but may never remove
    -- an existing record by replacing the array with a stale/shorter snapshot.
    -- A direct reviewed SQL session has auth.uid() = null and remains available
    -- for exceptional maintenance.
    if tg_op = 'UPDATE'
       and auth.uid() is not null
       and old.key = new.key
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
          message = format('%s record deletion blocked for IDs: %s', new.key, removed_ids);
      end if;
    end if;
  end if;

  if new.key = 'vejoy_milkLots' and exists (
    select 1
    from jsonb_array_elements(new.value) item
    where nullif(item->>'lotCode', '') is not null
    group by item->>'lotCode'
    having count(*) > 1
  ) then
    raise exception using errcode = '23514', message = 'A milk lot with this lot code already exists.';
  end if;

  return new;
end;
$$;

-- Reinstall the current round-creation function with the positive input gate.
-- The app already applies this rule; enforcing it here prevents bypass through
-- a stale client or direct RPC call.
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
  shift_item jsonb;
  planned_input numeric;
begin
  if not public.is_approved_user() then
    raise exception 'Approved access required';
  end if;

  shift_id := round_input->>'shiftId';
  if shift_id is null or shift_id = '' then
    raise exception 'Shift is required';
  end if;

  planned_input := coalesce(nullif(round_input->>'plannedInput', '')::numeric, 0);
  if planned_input <= 0 then
    raise exception 'Planned milk input must be greater than zero';
  end if;

  select item into shift_item
  from public.app_state state
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(state.value) = 'array' then state.value else '[]'::jsonb end
  ) as rows(item)
  where state.key = 'vejoy_productionShifts'
    and item->>'id' = shift_id
  limit 1;

  if shift_item is null then
    raise exception 'Shift not found';
  end if;

  if coalesce(shift_item->>'status', '') <> 'active' then
    raise exception 'Cannot create a round on a closed or scheduled shift';
  end if;

  if exists (
    select 1
    from public.app_state state
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(state.value) = 'array' then state.value else '[]'::jsonb end
    ) as rows(item)
    where state.key = 'vejoy_cipRecords'
      and item->>'frequency' = 'daily'
      and item->>'status' = 'handed_over'
      and item->>'milkLotId' = shift_item->>'milkLotId'
      and (
        item->>'handoverToShiftId' = shift_id
        or item->>'handoverToShiftNumber' = shift_item->>'shiftNumber'
      )
  ) then
    raise exception 'Complete the handed-over CIP before creating rounds on this shift';
  end if;

  insert into public.app_state (key, value)
  values ('vejoy_productionRounds', '[]'::jsonb)
  on conflict (key) do nothing;

  select value into current_rounds
  from public.app_state
  where key = 'vejoy_productionRounds'
  for update;

  if current_rounds is null or jsonb_typeof(current_rounds) <> 'array' then
    raise exception 'Production rounds state is unavailable';
  end if;

  select coalesce(max((item->>'roundNumber')::integer), 0) + 1 into next_number
  from jsonb_array_elements(current_rounds) item
  where item->>'shiftId' = shift_id;

  new_round := round_input || jsonb_build_object(
    'id', 'pr-' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
    'roundNumber', next_number
  );

  update public.app_state
  set value = current_rounds || jsonb_build_array(new_round)
  where key = 'vejoy_productionRounds';

  return new_round;
end;
$$;

revoke all on function public.create_production_round(jsonb) from public;
grant execute on function public.create_production_round(jsonb) to authenticated;

create index if not exists app_state_history_key_changed_at_idx
  on public.app_state_history (key, changed_at desc);
