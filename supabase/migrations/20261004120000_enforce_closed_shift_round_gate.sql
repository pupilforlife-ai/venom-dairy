-- Prevent new production rounds from being created on a closed/scheduled shift
-- or on a shift that is still waiting for an inherited CIP to be completed.

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
begin
  if not public.is_approved_user() then
    raise exception 'Approved access required';
  end if;

  shift_id := round_input->>'shiftId';
  if shift_id is null or shift_id = '' then
    raise exception 'Shift is required';
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
