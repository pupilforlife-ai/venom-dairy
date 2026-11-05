-- Definitions only. Keep atomic rollback, source isolation and all existing
-- guards. A source AFTER trigger may already have saved the correct pool;
-- protect_app_state_update deliberately skips an identical second UPDATE.
begin;
set local lock_timeout='3s';
do $patch$
declare fn text; body text;
  needle text:=$old$if n<>1 then raise exception 'Butter pool save was not confirmed'; end if;$old$;
  confirmation text:=$new$-- actual-butter-pool-confirmation-v1: confirm persisted values, not UPDATE row count.
    if not exists (
      select 1 from public.app_state s cross join lateral jsonb_array_elements(s.value) saved
      where s.key='vejoy_milkLots' and saved->>'id'=lot->>'id'
        and saved->'butterPool' is not distinct from lot->'butterPool'
        and saved->'gheePool' is not distinct from lot->'gheePool'
    ) then raise exception 'Butter pool save was not confirmed'; end if;
    select saved into lot from public.app_state s cross join lateral jsonb_array_elements(s.value) saved
      where s.key='vejoy_milkLots' and saved->>'id'=lot->>'id';$new$;
begin
  foreach fn in array array['create_ghee_round','record_butter_output'] loop
    body:=pg_get_functiondef(to_regprocedure('public.'||fn||'(jsonb)'));
    if body is null then raise exception 'Required RPC is missing: %',fn; end if;
    if strpos(body,'actual-butter-pool-confirmation-v1')>0 then continue; end if;
    if (length(body)-length(replace(body,needle,'')))/length(needle)<>1 then
      raise exception 'Unexpected RPC definition for %; no change applied',fn;
    end if;
    if fn='create_ghee_round' then
      execute replace(body,needle,confirmation||E'\n    result:=result||jsonb_build_object(''milkLot'',lot);');
    else
      execute replace(body,needle,confirmation);
    end if;
  end loop;
end;$patch$;
commit;
