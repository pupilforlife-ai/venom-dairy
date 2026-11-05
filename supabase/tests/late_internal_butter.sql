-- Exact RPC/trigger copies on TEMP tables. No operational writes.
begin;
create temporary table _late_probe (key text primary key,value jsonb,version bigint default 1,updated_at timestamptz default now(),updated_by uuid) on commit drop;
do $copy$ begin
 execute replace(replace(pg_get_functiondef('public.record_butter_output(jsonb)'::regprocedure),'public.record_butter_output(','pg_temp.record_butter_output('),'public.app_state','pg_temp._late_probe');
 execute replace(replace(pg_get_functiondef('public.enforce_late_butter_accounting()'::regprocedure),'public.enforce_late_butter_accounting(','pg_temp.enforce_late_butter_accounting('),'public.app_state','pg_temp._late_probe');
 execute replace(replace(pg_get_functiondef('public.create_ghee_round(jsonb)'::regprocedure),'public.create_ghee_round(','pg_temp.create_ghee_round('),'public.app_state','pg_temp._late_probe');
end; $copy$;
create trigger enforce_late before insert or update on _late_probe for each row execute function pg_temp.enforce_late_butter_accounting();
create trigger guard_ghee before insert or update on _late_probe for each row execute function public.guard_ghee_numeric_state();
create trigger protect_state before update on _late_probe for each row execute function public.protect_app_state_update();
create function pg_temp.fail_late_pool() returns trigger language plpgsql as $$ begin
 if new.key='vejoy_milkLots' and current_setting('test.fail_late_pool',true)='on' then raise exception 'Synthetic pool failure'; end if; return new;
end; $$;
create trigger fail_pool before update on _late_probe for each row execute function pg_temp.fail_late_pool();
do $test$
declare rounds jsonb; lot jsonb; req jsonb; result jsonb; after_rounds jsonb; before_all jsonb; after_all jsonb; staff_id uuid;
  other jsonb; partial_result jsonb; new_ghee jsonb;
begin
 select id into strict staff_id from public.profiles where role='staff' and status='approved' order by username limit 1;
 rounds:='[{"id":"old","type":"Butter","milkLotId":"ml","creamSource":"internal","butterOutput":287.7,"remainingBalance":0,"usedInGhee":287.7,"status":"churned","startTime":"2026-10-28"},
 {"id":"late","type":"Butter","milkLotId":"ml","creamSource":"internal","butterOutput":0,"remainingBalance":0,"status":"churning","startTime":"2026-11-03"},
 {"id":"g-old","type":"Ghee","milkLotId":"ml","butterInput":277.5,"butterOverdrawKg":0,"status":"packed","startTime":"2026-10-29"},
 {"id":"g1","type":"Ghee","milkLotId":"ml","butterInput":92.5,"butterOverdrawKg":82.3,"gheeInputVersion":1,"butterSourceAllocations":[{"id":"old","quantityKg":10.2}],"status":"supervisor_check","startTime":"2026-11-02T10:00:00Z"},
 {"id":"g2","type":"Ghee","milkLotId":"ml","butterInput":92.5,"butterOverdrawKg":92.5,"gheeInputVersion":1,"butterSourceAllocations":[],"status":"supervisor_check","startTime":"2026-11-02T13:00:00Z"},
 {"id":"g3","type":"Ghee","milkLotId":"ml","butterInput":92.5,"butterOverdrawKg":92.5,"gheeInputVersion":1,"butterSourceAllocations":[],"status":"butter_selected","startTime":"2026-11-03T10:00:00Z"},
 {"id":"external","type":"Butter","milkLotId":"","creamSource":"external","creamLotId":"cream","butterOutput":999,"remainingBalance":999,"status":"churned"},
 {"id":"external-ghee","type":"Ghee","milkLotId":"","sourceCreamLotId":"cream","butterInput":92.5,"butterOverdrawKg":92.5,"status":"cooking"},
 {"id":"blend","type":"Butter","milkLotId":"ml","blendedPoolId":"blend","butterOutput":999,"remainingBalance":999,"status":"pubbb_pool"},
 {"id":"other","type":"Butter","milkLotId":"other","butterOutput":999,"remainingBalance":999,"status":"churned"}]';
 lot:='{"id":"ml","lotCode":"261026","butterPool":{"totalButterProduced":287.7,"availableBalance":0,"usedInGhee":555,"usedInBlending":0,"packedAsPubb":0,"roundsContributed":["old"]}}';
 insert into _late_probe(key,value) values('vejoy_productionRounds',rounds),('vejoy_milkLots',jsonb_build_array(lot)),('vejoy_creamLots','[{"id":"cream","lotCode":"GG-TEST"}]');
 perform set_config('request.jwt.claim.sub',staff_id::text,true);
 req:='{"operationId":"butter-one","roundId":"late","butterOutput":543.3,"buttermilkOutput":100}';
 select jsonb_object_agg(key,value) into before_all from _late_probe;
 perform set_config('test.fail_late_pool','on',true);
 begin perform pg_temp.record_butter_output(req); raise exception 'Pool failure ignored';
 exception when others then if sqlerrm<>'Synthetic pool failure' then raise; end if; end;
 select jsonb_object_agg(key,value) into after_all from _late_probe;
 if before_all<>after_all then raise exception 'Output/allocation partial save escaped rollback'; end if;
 perform set_config('test.fail_late_pool','off',true);
 result:=pg_temp.record_butter_output(req); select value into after_rounds from _late_probe where key='vejoy_productionRounds';
 if (result->>'matchedKg')::numeric<>267.3 or (result#>>'{round,remainingBalance}')::numeric<>276
  or (result#>>'{milkLot,butterPool,availableBalance}')::numeric<>276 or (result#>>'{milkLot,butterPool,usedInGhee}')::numeric<>555
  or (result#>>'{milkLot,butterPool,totalButterProduced}')::numeric<>831 then raise exception 'Expected 831 - 555 = 276, matching only 267.3'; end if;
 if result#>'{milkLot,butterPool,roundsContributed}'<>'["old","late"]'::jsonb then raise exception 'Source genealogy was reordered or lost'; end if;
 if (select sum((x->>'butterOverdrawKg')::numeric) from jsonb_array_elements(after_rounds) x where x->>'id' in ('g1','g2','g3'))<>0 then raise exception 'Old claims not settled'; end if;
 for other in select value from jsonb_array_elements(rounds) where value->>'id' in ('external','external-ghee','blend','other','old','g-old') loop
  if other<>(select value from jsonb_array_elements(after_rounds) where value->>'id'=other->>'id') then raise exception 'Unrelated/external source changed'; end if;
 end loop;
 result:=pg_temp.record_butter_output(req);
 if not (result->>'replayed')::boolean or (select value from _late_probe where key='vejoy_productionRounds')<>after_rounds then raise exception 'Output retry duplicated allocation'; end if;
 begin update _late_probe set value=jsonb_set(value,'{1,remainingBalance}','543.3') where key='vejoy_productionRounds'; raise exception 'Source stock resurrected';
 exception when others then if sqlerrm not like 'Butter already matched to ghee%' then raise; end if; end;
 begin update _late_probe set value=jsonb_set(value,'{3,butterOverdrawKg}','82.3') where key='vejoy_productionRounds'; raise exception 'Settled claim restored';
 exception when others then if sqlerrm not like 'Outstanding ghee allocation cannot be reset%' then raise; end if; end;
 -- A stale lot counter is projected from source records, not accepted as truth.
 update _late_probe set value=jsonb_set(value,'{0,butterPool,availableBalance}','543.3') where key='vejoy_milkLots';
 if (select (value#>>'{0,butterPool,availableBalance}')::numeric from _late_probe where key='vejoy_milkLots')<>276 then raise exception 'Stale pool availability restored'; end if;
 -- Recording purchased-cream butter is allowed, but cannot settle any old claim automatically.
 select jsonb_object_agg(key,value) into before_all from _late_probe;
 update _late_probe set value=value||'[{"id":"external-new","type":"Butter","creamSource":"external","creamLotId":"cream","milkLotId":"","status":"churning","butterOutput":0,"remainingBalance":0}]'::jsonb where key='vejoy_productionRounds';
 result:=pg_temp.record_butter_output('{"operationId":"external-output","roundId":"external-new","butterOutput":50,"buttermilkOutput":0}');
 if (result->>'matchedKg')::numeric<>0 or (result#>>'{round,remainingBalance}')::numeric<>50
  or (select value from _late_probe where key='vejoy_milkLots')<>before_all->'vejoy_milkLots'
  or (select x from _late_probe s cross join lateral jsonb_array_elements(s.value) x where s.key='vejoy_productionRounds' and x->>'id'='external-ghee')<>rounds->7
 then raise exception 'External output reconciled an old claim or changed internal pool'; end if;
 -- Pure FIFO partial coverage, then another later output; no external use.
 rounds:=jsonb_set(jsonb_set(rounds,'{1,butterOutput}','50'),'{1,remainingBalance}','50');
 partial_result:=public.settle_late_internal_butter(rounds,'milk:ml','partial','test',now());
 if (partial_result#>>'{rounds,3,butterOverdrawKg}')::numeric<>32.3 or (partial_result#>>'{rounds,4,butterOverdrawKg}')::numeric<>92.5 then raise exception 'FIFO partial allocation incorrect'; end if;
 if public.settle_late_internal_butter(rounds,'cream:cream','external','test',now())->'rounds'<>rounds then raise exception 'External cream was automatically reconciled'; end if;
 -- Before a NEW ghee round, prior claims consume internal butter first.
 rounds:=jsonb_set(jsonb_set(rounds,'{1,butterOutput}','543.3'),'{1,remainingBalance}','543.3');
 new_ghee:=public.prepare_ghee_round(rounds,jsonb_build_array(lot),'[]','{"operationId":"new-ghee","butterSource":"milk:ml","butterInput":92.5,"roundDate":"2026-11-03","team":"Test"}','test',now());
 if (new_ghee#>>'{milkLot,butterPool,availableBalance}')::numeric<>183.5 then raise exception 'New ghee stole butter owed to prior rounds'; end if;
 perform set_config('request.jwt.claim.sub','',true);
 begin perform pg_temp.record_butter_output(req); raise exception 'Anonymous output accepted'; exception when insufficient_privilege then null; end;
 if has_function_privilege('authenticated','public.settle_late_internal_butter(jsonb,text,text,text,timestamptz)','EXECUTE') then raise exception 'Private transition exposed'; end if;
end;
$test$;
select 'Late INTERNAL butter tests passed: 267.3 kg, FIFO, atomic output/lot save, replay, stale clients, source isolation and external cream exclusion' as result;
rollback;
