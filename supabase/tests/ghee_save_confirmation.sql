-- Full live app_state trigger chain, RPCs and history logger copied to TEMP
-- tables. No operational writes, including during injected failure tests.
begin;
set local lock_timeout='3s';
set local statement_timeout='20s';
create temporary table _ghee_probe(key text primary key,value jsonb,version bigint default 1,updated_at timestamptz default now(),updated_by uuid) on commit drop;
create temporary table _ghee_probe_history(key text,operation text,old_value jsonb,new_value jsonb,old_version bigint,new_version bigint,changed_by uuid) on commit drop;
-- Seed before attaching triggers; this also exercises the real selected lot.
insert into _ghee_probe select key,value,version,updated_at,updated_by from public.app_state
 where key in ('vejoy_milkLots','vejoy_productionRounds','vejoy_creamLots','vejoy_crumbingBatches');
do $copy$
declare fn text; body text; trigger_record record;
begin
  for fn in select distinct p.proname from pg_trigger t join pg_proc p on p.oid=t.tgfoid
    where t.tgrelid='public.app_state'::regclass and not t.tgisinternal
    union select unnest(array['create_ghee_round','record_butter_output']) loop
    select pg_get_functiondef(p.oid) into strict body from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=fn;
    body:=replace(body,'public.'||fn||'(','pg_temp.'||fn||'(');
    body:=replace(body,'public.app_state_history','pg_temp._ghee_probe_history');
    execute replace(body,'public.app_state','pg_temp._ghee_probe');
  end loop;
  for trigger_record in select pg_get_triggerdef(t.oid) as definition,p.proname from pg_trigger t join pg_proc p on p.oid=t.tgfoid
    where t.tgrelid='public.app_state'::regclass and not t.tgisinternal loop
    body:=replace(trigger_record.definition,'ON public.app_state','ON pg_temp._ghee_probe');
    body:=replace(body,'FUNCTION public.'||trigger_record.proname||'(','FUNCTION pg_temp.'||trigger_record.proname||'(');
    execute replace(body,'FUNCTION '||trigger_record.proname||'(','FUNCTION pg_temp.'||trigger_record.proname||'(');
  end loop;
  if exists(select 1 from pg_trigger t join pg_proc p on p.oid=t.tgfoid where t.tgrelid='pg_temp._ghee_probe'::regclass and p.pronamespace<>pg_my_temp_schema()) then
    raise exception 'Diagnostic trigger isolation failed';end if;
end;$copy$;
create function pg_temp.inject_pool_failure() returns trigger language plpgsql as $$
begin
 if new.key='vejoy_milkLots' and current_setting('test.ghee_pool_failure',true)='skip' then return null;end if;
 if new.key='vejoy_milkLots' and current_setting('test.ghee_pool_failure',true)='raise' then raise exception 'Synthetic pool failure';end if;
 return new;
end;$$;
create trigger z_inject_pool_failure before update on _ghee_probe for each row execute function pg_temp.inject_pool_failure();
create temporary table _ghee_results(result jsonb) on commit drop;
do $test$
declare actor uuid; req jsonb; result jsonb; replay jsonb; before_state jsonb; after_state jsonb; before_history bigint;
 initial_count integer; source_balance numeric; current_pool jsonb; x jsonb; before_rounds jsonb; live_input numeric;
begin
 select id into strict actor from public.profiles where username='sa' and role='owner' and status='approved';
 perform set_config('request.jwt.claim.sub',actor::text,true);
 select jsonb_array_length(value) into initial_count from _ghee_probe where key='vejoy_productionRounds';
 select value into before_rounds from _ghee_probe where key='vejoy_productionRounds';
 req:='{"operationId":"qa-real-trigger-chain-20261105","roundDate":"2026-11-05","butterSource":"milk:ml-1792993001303","butterInput":92.5,"team":"QA only"}';
 select (r#>>'{butterPool,availableBalance}')::numeric into source_balance from _ghee_probe s cross join lateral jsonb_array_elements(s.value) r
  where s.key='vejoy_milkLots' and r->>'id'='ml-1792993001303';
 result:=pg_temp.create_ghee_round(req);
 if result#>>'{round,id}'<>'ghee-qa-real-trigger-chain-20261105' or (result#>>'{milkLot,butterPool,availableBalance}')::numeric<>greatest(0,source_balance-92.5) then
  raise exception 'Real-lot round or balance not confirmed';end if;
 select r->'butterPool' into current_pool from _ghee_probe s cross join lateral jsonb_array_elements(s.value) r where s.key='vejoy_milkLots' and r->>'id'='ml-1792993001303';
 if current_pool is distinct from result#>'{milkLot,butterPool}' then raise exception 'Returned pool is not the persisted pool';end if;
 if (select jsonb_array_length(value) from _ghee_probe where key='vejoy_productionRounds')<>initial_count+1 then raise exception 'Wrong round count';end if;
 for x in select r from jsonb_array_elements(before_rounds) r where r->>'type'<>'Butter' or r->>'creamSource'='external' or r->>'milkLotId'<>'ml-1792993001303' or nullif(r->>'blendedPoolId','') is not null loop
  if x is distinct from (select r from _ghee_probe s cross join lateral jsonb_array_elements(s.value) r where s.key='vejoy_productionRounds' and r->>'id'=x->>'id') then raise exception 'Unrelated live-copy record changed';end if;
 end loop;
 select jsonb_object_agg(key,to_jsonb(s)) into before_state from _ghee_probe s;
 select count(*) into before_history from _ghee_probe_history;
 replay:=pg_temp.create_ghee_round(req);
 select jsonb_object_agg(key,to_jsonb(s)) into after_state from _ghee_probe s;
 if not (replay->>'replayed')::boolean or after_state<>before_state or (select count(*) from _ghee_probe_history)<>before_history then raise exception 'Retry duplicated a round, deduction or audit';end if;
 -- Multiple new internal rounds and physical input above recorded availability
 -- must remain recordable. These are still TEMP-only production records.
 req:=req||'{"operationId":"qa-overdraw-chain-20261105","butterInput":1000}'::jsonb;
 result:=pg_temp.create_ghee_round(req);
 if (result#>>'{round,butterInput}')::numeric<>1000 or (result#>>'{round,butterOverdrawKg}')::numeric<=0
  or (result#>>'{milkLot,butterPool,availableBalance}')::numeric<>0 then raise exception 'Truthful overdraw recording blocked';end if;
 -- Real write failure must still roll everything back, not masquerade as a no-op.
 select jsonb_object_agg(key,to_jsonb(s)) into before_state from _ghee_probe s;
 perform set_config('test.ghee_pool_failure','skip',true);
 begin perform pg_temp.create_ghee_round(req||'{"operationId":"qa-skipped-pool","butterInput":1}'::jsonb);
  raise exception 'Unpersisted pool was accepted';
 exception when others then if sqlerrm<>'Butter pool save was not confirmed' then raise;end if;end;
 perform set_config('test.ghee_pool_failure','off',true);
 select jsonb_object_agg(key,to_jsonb(s)) into after_state from _ghee_probe s;
 if before_state<>after_state then raise exception 'Failed pool confirmation left partial production';end if;
 -- A genuine trigger exception also rolls the complete RPC back.
 perform set_config('test.ghee_pool_failure','raise',true);
 begin perform pg_temp.create_ghee_round(req||'{"operationId":"qa-failed-pool","butterInput":1}'::jsonb);
  raise exception 'Injected failure ignored';
 exception when others then if sqlerrm<>'Synthetic pool failure' then raise;end if;end;
 perform set_config('test.ghee_pool_failure','off',true);
 select jsonb_object_agg(key,to_jsonb(s)) into after_state from _ghee_probe s;
 if before_state<>after_state then raise exception 'Trigger failure left partial production';end if;
 -- Late butter output takes the same path: source AFTER trigger updates the
 -- pool before the RPC's explicit pool save. Cover allocations and a safe retry.
 insert into _ghee_probe(key,value) values('qa-unused','[]') on conflict do nothing;
 update _ghee_probe set value=value||'[{"id":"qa-internal-output","type":"Butter","milkLotId":"ml-1792993001303","milkLotCode":"261026","creamSource":"internal","status":"churning","butterOutput":0,"remainingBalance":0,"startTime":"2026-11-05T12:00:00Z"}]'::jsonb where key='vejoy_productionRounds';
 result:=pg_temp.record_butter_output('{"operationId":"qa-output-op","roundId":"qa-internal-output","butterOutput":50,"buttermilkOutput":0}');
 if (result#>>'{round,butterOutput}')::numeric<>50 or (result->>'matchedKg')::numeric<>50 then raise exception 'Late internal output failed';end if;
 select r->'butterPool' into current_pool from _ghee_probe s cross join lateral jsonb_array_elements(s.value) r where s.key='vejoy_milkLots' and r->>'id'='ml-1792993001303';
 if current_pool is distinct from result#>'{milkLot,butterPool}' then raise exception 'Output returned an unconfirmed pool';end if;
 select jsonb_object_agg(key,to_jsonb(s)) into before_state from _ghee_probe s;
 replay:=pg_temp.record_butter_output('{"operationId":"qa-output-op","roundId":"qa-internal-output","butterOutput":50,"buttermilkOutput":0}');
 select jsonb_object_agg(key,to_jsonb(s)) into after_state from _ghee_probe s;
 if not (replay->>'replayed')::boolean or after_state<>before_state then raise exception 'Butter output retry deducted twice';end if;
 -- Purchased cream is explicit and cannot be allocated to outstanding internal ghee.
 update _ghee_probe set value=value||'[{"id":"qa-external-output","type":"Butter","creamLotId":"qa-cream","creamSource":"external","milkLotId":"","status":"churning","butterOutput":0,"remainingBalance":0}]'::jsonb where key='vejoy_productionRounds';
 select jsonb_object_agg(key,value) into before_state from _ghee_probe;
 result:=pg_temp.record_butter_output('{"operationId":"qa-external-op","roundId":"qa-external-output","butterOutput":50,"buttermilkOutput":0}');
 if (result->>'matchedKg')::numeric<>0 or (result#>>'{round,remainingBalance}')::numeric<>50
  or (select value from _ghee_probe where key='vejoy_milkLots')<>before_state->'vejoy_milkLots' then raise exception 'External butter was automatically used';end if;
 insert into _ghee_results values(jsonb_build_object('fullLiveTriggerChain',true,'realLotRoundConfirmed',true,'retriesDeductOnce',true,
  'realFailuresRollBack',true,'overdrawAllowed',true,'lateButterOutputConfirmed',true,'externalButterExcluded',true,
  'sampleAvailableBeforeKg',source_balance,'sampleAvailableAfter92_5Kg',greatest(0,source_balance-92.5),'operationalRecordsChanged',false));
end;$test$;
select result from _ghee_results;
rollback;
