-- Temperature rounds can be recorded independently of the once-daily lock check.
-- Existing combined inspections remain valid; no saved records are rewritten.
create or replace function public.submit_factory_daily_check(p_check_date date, p_status text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  actor text;
  today date := (now() at time zone 'Africa/Johannesburg')::date;
  check_id uuid := gen_random_uuid();
  saved public.factory_daily_checks;
  point jsonb;
  answer jsonb;
  snapshot jsonb := coalesce(p_payload, '{}'::jsonb);
  reading jsonb;
  all_readings jsonb;
  additions jsonb := '[]'::jsonb;
  events jsonb := '[]'::jsonb;
  val numeric;
  ok boolean;
  reading_id text;
  expected text;
  lock_key text;
  check_scope text := coalesce(nullif(p_payload->>'scope',''), 'all');
begin
  select username into actor from public.profiles
  where id = auth.uid() and role in ('owner', 'admin') and status = 'approved';
  if actor is null then raise exception using errcode='42501', message='Only approved owners and admins can sign off factory checks.'; end if;
  if p_check_date is null or p_check_date < date '2026-10-22' or p_check_date > today then
    raise exception 'Choose a date from checklist rollout through today.';
  end if;
  if p_status = 'not_completed' then
    if coalesce(snapshot->>'missedReason', '') not in ('Weekend closure','Public holiday','Factory closed','Checklist not completed','Other') then
      raise exception 'A reason is required for a missed checklist.';
    end if;
    if snapshot->>'missedReason' in ('Checklist not completed','Other') and nullif(trim(snapshot->>'notes'), '') is null then
      raise exception 'Explain why the checklist was not completed.';
    end if;
    -- An omission is not a backdated inspection or temperature observation.
    snapshot := jsonb_build_object('missedReason',snapshot->>'missedReason','notes',snapshot->>'notes');
  elsif p_status = 'completed' then
    if p_check_date <> today then raise exception 'Inspections can only be signed for today; explain missed days instead of backdating checks.'; end if;
    if check_scope not in ('all','locks','temperatures') then raise exception 'Invalid checklist section.'; end if;
    snapshot := snapshot || jsonb_build_object('scope',check_scope);
    if check_scope <> 'temperatures' then
    foreach lock_key in array array['front_door','front_shutters','rear_shutters','containers','boiler_room','factory_lights','upstairs_lights','kettle_room_lights','kitchen_lights','corridor_lights'] loop
      expected := case when lock_key in ('front_door','front_shutters','rear_shutters','containers') then 'locked' else 'off' end;
      if coalesce(snapshot->'locks'->>lock_key, '') not in (expected, 'night_shift') then raise exception 'A status is required for %.', lock_key; end if;
    end loop;
    if snapshot->'locks'->>'corridor_lights' = 'night_shift' then
      if jsonb_typeof(snapshot->'corridorReasons') is distinct from 'array' then raise exception 'Select a corridor lights reason.'; end if;
      if jsonb_array_length(snapshot->'corridorReasons') = 0 or exists (
        select 1 from jsonb_array_elements_text(snapshot->'corridorReasons') r(reason)
        where reason not in ('Naans','Paneer','Frying','Milk transfer/receiving')
      ) then raise exception 'Select valid corridor lights reasons.'; end if;
    end if;

    end if; -- Lock checks are once daily and independent of temperature rounds.
    if check_scope <> 'locks' then
    -- Lock the two append-only collections in a fixed order before reading them.
    -- Concurrent Cold Chain submissions cannot be lost to a stale snapshot.
    insert into public.app_state(key,value) values ('vejoy_coldChainStorageEvents','[]'),('vejoy_temperatureReadings','[]') on conflict(key) do nothing;
    perform 1 from public.app_state where key in ('vejoy_coldChainStorageEvents','vejoy_temperatureReadings') order by key for update;
    select value into all_readings from public.app_state where key='vejoy_temperatureReadings';
    if jsonb_typeof(all_readings) is distinct from 'array' then raise exception 'Temperature collection is malformed; no records changed.'; end if;
    for point in select value from jsonb_array_elements('[
      {"id":"chiller","location":"Chiller","section":"cold","min":0,"max":5},
      {"id":"dairy_container","location":"Dairy Container (Intermediate Freezer)","section":"cold","min":-25,"max":-10},
      {"id":"coldroom","location":"Coldroom","section":"cold","min":-25,"max":-10},
      {"id":"silo","location":"Silo","section":"milk","min":2,"max":6},
      {"id":"bmc1","location":"BMC1","section":"milk","min":2,"max":6},
      {"id":"bmc2","location":"BMC2","section":"milk","min":2,"max":6},
      {"id":"bmc3","location":"BMC3","section":"milk","min":2,"max":6},
      {"id":"truck","location":"Truck","section":"milk","min":2,"max":6},
      {"id":"milk_coldroom","location":"Milk Coldroom","section":"milk","min":2,"max":6},
      {"id":"silo_cooling_tank","location":"Silo Cooling Tank","section":"cooling","max":5},
      {"id":"paneer_cooling_tank","location":"Paneer Cooling Tank","section":"cooling","max":6}
    ]'::jsonb) loop
      answer := snapshot->'temperatures'->(point->>'id');
      if coalesce(answer->>'status','') not in ('active','empty') or (point->>'section'='cold' and answer->>'status'<>'active') then
        raise exception 'Confirm whether % is in use.', point->>'location';
      end if;
      if point->>'section' in ('milk','cooling') then
        events := events || jsonb_build_array(jsonb_build_object('id',gen_random_uuid()::text,'location',point->>'location',
          'status',case when answer->>'status'='empty' then 'empty' when point->>'section'='milk' then 'milk_present' else 'in_use' end,
          'milkLotCode',answer->>'milkLotCode','recordedAt',now(),'recordedBy',actor,'factoryChecklistId',check_id));
      end if;
      if answer->>'status'='empty' then
        snapshot := jsonb_set(snapshot,array['temperatures',point->>'id'],jsonb_build_object('status','empty'));
        continue;
      end if;
      reading := null;
      reading_id := nullif(answer->>'existingReadingId','');
      if reading_id is not null then
        select value into reading from jsonb_array_elements(all_readings)
        where value->>'id'=reading_id and value->>'location'=point->>'location'
          and ((value->>'recordedAt')::timestamptz at time zone 'Africa/Johannesburg')::date=today limit 1;
        if reading is null then raise exception 'The selected Cold Chain reading for % must exist and be from today.', point->>'location'; end if;
        val := (case when point->>'section'='milk' then reading->>'milkTemperature' else reading->>'temperature' end)::numeric;
      else
        if jsonb_typeof(answer->'temperature') is distinct from 'number' then raise exception 'Enter a temperature for %.',point->>'location'; end if;
        val := (answer->>'temperature')::numeric;
      end if;
      if val is null or val::text in ('NaN','Infinity','-Infinity') then raise exception 'Enter a finite temperature for %.',point->>'location'; end if;
      ok := case when not (point ? 'min') and not (point ? 'max') then null
        else (not (point ? 'min') or val >= (point->>'min')::numeric) and (not (point ? 'max') or val <= (point->>'max')::numeric) end;
      if reading_id is null then
        reading_id := 'factory-' || gen_random_uuid()::text;
        reading := jsonb_build_object('id',reading_id,'location',point->>'location','temperature',val,
          'targetMin',coalesce((point->>'min')::numeric,0),'targetMax',coalesce((point->>'max')::numeric,0),
          'inRange',coalesce(ok,true),'recordedAt',now(),'recordedBy',actor,'factoryChecklistId',check_id);
        if point->>'section'='milk' then reading := reading || jsonb_build_object('coldChainStorageReading',true,'milkTemperature',val,'milkTemperatureInRange',ok,'milkLotCode',answer->>'milkLotCode'); end if;
        if not (point ? 'min') then
          reading := reading || case when point ? 'max' then '{"upperLimitOnly":true}'::jsonb else '{"rangeNotConfigured":true}'::jsonb end;
        end if;
        additions := additions || jsonb_build_array(reading);
      end if;
      snapshot := jsonb_set(snapshot,array['temperatures',point->>'id'],jsonb_strip_nulls(jsonb_build_object(
        'status','active','temperature',val,'readingId',reading_id,'observedAt',reading->>'recordedAt','recordedBy',reading->>'recordedBy',
        'inRange',ok,'targetLabel',case when point ? 'min' then (point->>'min') || '–' || (point->>'max') || '°C'
          when point ? 'max' then 'At or below ' || (point->>'max') || '°C' else 'Limits not configured' end,
        'milkLotCode',case when point->>'section'='milk' then answer->>'milkLotCode' else null end)));
    end loop;
    if jsonb_array_length(additions)>0 then update public.app_state set value=value || additions where key='vejoy_temperatureReadings'; end if;
    if jsonb_array_length(events)>0 then
      if exists(select 1 from public.app_state where key='vejoy_coldChainStorageEvents' and jsonb_typeof(value) is distinct from 'array') then raise exception 'Milk storage history is malformed.'; end if;
      update public.app_state set value=value || events where key='vejoy_coldChainStorageEvents';
    end if;
    end if; -- Temperature-only checks do not ask for locks again.
    if check_scope='locks' then snapshot:=snapshot - 'temperatures';
    elsif check_scope='temperatures' then snapshot:=snapshot - 'locks' - 'corridorReasons'; end if;
  else raise exception 'Invalid checklist status.';
  end if;
  insert into public.factory_daily_checks(id,check_date,status,payload,recorded_by,recorded_by_name)
  values(check_id,p_check_date,p_status,snapshot,auth.uid(),actor) returning * into saved;
  return to_jsonb(saved);
end;
$$;
revoke all on function public.submit_factory_daily_check(date,text,jsonb) from public;
grant execute on function public.submit_factory_daily_check(date,text,jsonb) to authenticated;

