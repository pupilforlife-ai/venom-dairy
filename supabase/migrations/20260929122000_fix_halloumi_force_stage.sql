-- Keep the production RPC in sync with the Halloumi workflow.
-- The previous live definition only knew the generic Paneer stages, so
-- Halloumi statuses such as curd_setting were rejected as unknown.

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
  statuses text[] := array[
    'scheduled', 'in_production', 'coagulation', 'pressing', 'cooling',
    'resting', 'ready_cutting', 'cut', 'clingwrapped', 'frozen', 'packed',
    'handed_over'
  ];
  halloumi_statuses text[] := array[
    'scheduled', 'cacl2_added', 'heating_34c', 'rennet_added',
    'curd_setting', 'curd_cut', 'heating_42c', 'presses', 'whey_heating',
    'boiling', 'salted', 'chiller_storage', 'weighed', 'vacuum_packed',
    'sent_to_hcp', 'handed_over'
  ];
  status_index integer;
  updated_round jsonb := null;
begin
  if not public.is_approved_owner() and not exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
      and status = 'approved'
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

      if round_item->>'type' = 'Halloumi' then
        status_index := array_position(halloumi_statuses, current_status);
        if status_index is null or status_index >= cardinality(halloumi_statuses) then
          raise exception 'Round is already at its final stage or has an unknown status';
        end if;
        next_status := halloumi_statuses[status_index + 1];
      else
        status_index := array_position(statuses, current_status);
        if status_index is null or status_index >= cardinality(statuses) then
          raise exception 'Round is already at its final stage or has an unknown status';
        end if;
        next_status := statuses[status_index + 1];
      end if;

      round_item := jsonb_set(round_item, '{status}', to_jsonb(next_status), true);

      if next_status = 'pressing' then
        round_item := jsonb_set(round_item, '{pressingStartedAt}', to_jsonb(now()), true);
      elsif next_status = 'cooling' then
        round_item := jsonb_set(round_item, '{coolingStartedAt}', to_jsonb(now()), true);
      elsif next_status = 'resting' then
        round_item := jsonb_set(round_item, '{restingStartedAt}', to_jsonb(now()), true);
      elsif next_status = 'curd_setting' then
        round_item := jsonb_set(round_item, '{curdSettingStartedAt}', to_jsonb(now()), true);
      elsif next_status = 'heating_42c' then
        round_item := jsonb_set(round_item, '{curdCuttingStartedAt}', to_jsonb(now()), true);
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
