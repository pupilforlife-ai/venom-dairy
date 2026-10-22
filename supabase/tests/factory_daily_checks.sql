-- Integration verification against an existing project with approved owner and staff accounts.
-- All test writes are rolled back. Run explicitly, never as a migration.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '15s';
do $$
declare
  manager_id uuid;
  staff_id uuid;
  draft jsonb;
  saved jsonb;
  second_saved jsonb;
  point text;
  reading_count integer;
  rejected boolean;
  today date := (now() at time zone 'Africa/Johannesburg')::date;
begin
  select id into manager_id from public.profiles where role='owner' and status='approved' limit 1;
  select id into staff_id from public.profiles where role='staff' and status='approved' limit 1;
  if manager_id is null or staff_id is null then raise exception 'Test needs approved owner and staff profiles'; end if;
  if has_table_privilege('authenticated','public.factory_daily_checks','INSERT') or has_table_privilege('authenticated','public.factory_daily_checks','UPDATE') or has_table_privilege('authenticated','public.factory_daily_checks','DELETE') then raise exception 'Direct application writes must be denied'; end if;
  perform set_config('request.jwt.claim.sub',staff_id::text,true);
  rejected:=false;
  begin perform public.submit_factory_daily_check(today,'not_completed','{"missedReason":"Factory closed"}'); exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'Staff signoff was not blocked'; end if;
  perform set_config('request.jwt.claim.sub',manager_id::text,true);
  rejected:=false;
  begin perform public.submit_factory_daily_check(today,'completed','{}'); exception when raise_exception then rejected:=true; end;
  if not rejected then raise exception 'Incomplete form accepted'; end if;
  rejected:=false;
  begin perform public.submit_factory_daily_check(today,'not_completed','{"missedReason":"Other"}'); exception when raise_exception then rejected:=true; end;
  if not rejected then raise exception 'Missing-day explanation not required'; end if;
  draft := '{"locks":{"front_door":"locked","front_shutters":"locked","rear_shutters":"night_shift","containers":"locked","boiler_room":"off","factory_lights":"off","upstairs_lights":"off","kettle_room_lights":"off","kitchen_lights":"off","corridor_lights":"night_shift"},"corridorReasons":["Naans"],"temperatures":{"chiller":{"status":"active","temperature":0},"dairy_container":{"status":"active","temperature":-18},"coldroom":{"status":"active","temperature":-19},"silo":{"status":"active","temperature":7},"bmc1":{"status":"empty"},"bmc2":{"status":"empty"},"bmc3":{"status":"empty"},"truck":{"status":"empty"},"milk_coldroom":{"status":"empty"},"silo_cooling_tank":{"status":"active","temperature":12},"paneer_cooling_tank":{"status":"active","temperature":20}},"recordedBy":"FORGED NAME","notes":"ROLLBACK-ONLY VERIFICATION"}'::jsonb;
  select jsonb_array_length(value) into reading_count from public.app_state where key='vejoy_temperatureReadings';
  saved := public.submit_factory_daily_check(today,'completed',draft);
  if saved->>'recorded_by'<>manager_id::text or saved->>'recorded_by_name'='FORGED NAME' then raise exception 'Actor not server-derived'; end if;
  if saved->'payload'->'temperatures'->'silo'->>'inRange'<>'false' then raise exception 'Milk excursion not flagged'; end if;
  if saved->'payload'->'temperatures'->'chiller'->>'temperature'<>'0' then raise exception 'Zero temperature lost'; end if;
  if saved->'payload'->'temperatures'->'silo_cooling_tank'->>'inRange'<>'false' or saved->'payload'->'temperatures'->'paneer_cooling_tank'->>'inRange'<>'false' then raise exception 'Cooling tank maximums not enforced'; end if;
  if (select jsonb_array_length(value) from public.app_state where key='vejoy_temperatureReadings')<>reading_count+6 then raise exception 'Expected six linked readings'; end if;
  if not exists(select 1 from public.app_state,jsonb_array_elements(value) r where key='vejoy_temperatureReadings' and r->>'factoryChecklistId'=saved->>'id' and r->>'upperLimitOnly'='true' and r->>'targetMax'='6') then raise exception 'Cooling tank reading not linked'; end if;
  foreach point in array array['chiller','dairy_container','coldroom','silo','silo_cooling_tank','paneer_cooling_tank'] loop
    draft:=jsonb_set(draft,array['temperatures',point],jsonb_build_object('status','active','existingReadingId',saved->'payload'->'temperatures'->point->>'readingId'));
  end loop;
  second_saved := public.submit_factory_daily_check(today,'completed',draft);
  if (select jsonb_array_length(value) from public.app_state where key='vejoy_temperatureReadings')<>reading_count+6 then raise exception 'Reused readings duplicated'; end if;
  draft:=jsonb_set(draft,array['temperatures','chiller','existingReadingId'],'"nonexistent"');
  rejected:=false;
  begin perform public.submit_factory_daily_check(today,'completed',draft); exception when raise_exception then rejected:=true; end;
  if not rejected then raise exception 'Invalid reading reference accepted'; end if;
  if not exists(select 1 from public.factory_daily_checks where id=(saved->>'id')::uuid) or not exists(select 1 from public.factory_daily_checks where id=(second_saved->>'id')::uuid) then raise exception 'Prior inspection overwritten'; end if;
end $$;
rollback;
select 'PASS: manager authentication, staff denial, required fields, zero reading, milk excursion, cooling limits, linked readings, no duplication, append-only signoffs; ALL TEST DATA ROLLED BACK' as verification;

