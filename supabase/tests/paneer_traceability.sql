-- All writes below target synthetic TEMP copies, never operational collections.
insert into pg_temp.state_test(key,value) values
 ('vejoy_milkLots','[{"id":"test-milk","lotCode":"151126","receiptDate":"2026-11-15","traceabilityProductionDate":"2026-11-15","litresReceived":1000}]'),
 ('vejoy_productionRounds','[{"id":"test-r1","milkLotId":"test-milk","milkLotCode":"151126","shiftNumber":1,"roundNumber":1,"type":"D","status":"cut","cuttingType":"200g cubes","plannedInput":500,"actualInput":500,"outputWeight":80,"packedSkus":[]},{"id":"unrelated-round","type":"D","milkLotId":"other-milk","plannedInput":500,"status":"scheduled"}]'),
 ('vejoy_finishedStock','[]'),('vejoy_intermediateLots','[]'),('vejoy_distributionHandovers','[]');

do $$
declare actor uuid;expected jsonb;response jsonb;before_other jsonb;after_other jsonb;before_history integer;saved jsonb;commands integer;
begin
 select id into strict actor from pg_temp.profiles_test;
 if has_function_privilege('authenticated','pg_temp.commit_paneer_traceability(uuid,jsonb,jsonb,jsonb,jsonb)','execute') then raise exception 'Browser callers can bypass Edge validation';end if;
 select r into before_other from pg_temp.state_test s cross join lateral jsonb_array_elements(s.value) r where s.key='vejoy_productionRounds' and r->>'id'='unrelated-round';
 select jsonb_agg(jsonb_build_object('key',k,'version',s.version)) into expected from unnest(array['vejoy_distributionHandovers','vejoy_finishedStock','vejoy_intermediateLots','vejoy_milkLots','vejoy_productionRounds','vejoy_traceability']) k left join pg_temp.state_test s on s.key=k;
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 response:=pg_temp.commit_paneer_traceability(actor,('{"id":"trace-command-1","kind":"save"}'::jsonb||'{"_role":"owner"}'::jsonb),expected,'{"vejoy_traceability":{"schema":1,"lots":{},"rounds":{},"prefixes":{}}}','"saved"');
 if response->>'ok'<>'true' then raise exception 'Shared commit not confirmed';end if;
 if not exists(select 1 from pg_temp.history_test where key='vejoy_traceability' and changed_by=actor) then raise exception 'Server actor missing from audit';end if;
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 response:=pg_temp.commit_paneer_traceability(actor,('{"id":"trace-command-1","kind":"save"}'::jsonb||'{"_role":"owner"}'::jsonb),'[]','{}','null');
 if (select count(*) from pg_temp.commands_test)<>1 then raise exception 'Retry duplicated receipt';end if;
 begin
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  perform pg_temp.commit_paneer_traceability(actor,('{"id":"trace-command-1","kind":"different"}'::jsonb||'{"_role":"owner"}'::jsonb),'[]','{}','null');
  raise exception 'Reused save reference accepted';
 exception when others then if sqlerrm not like '%different request%' then raise;end if;end;
 begin
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  perform pg_temp.commit_paneer_traceability(actor,('{"id":"stale-command","kind":"save"}'::jsonb||'{"_role":"owner"}'::jsonb),expected,'{}','null');
  raise exception 'Stale snapshot accepted';
 exception when serialization_failure then null;end;
 select jsonb_agg(jsonb_build_object('key',key,'version',version)) into expected from pg_temp.state_test;
 select count(*) into before_history from pg_temp.history_test;
 begin
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  perform pg_temp.commit_paneer_traceability(actor,('{"id":"invalid-command","kind":"save"}'::jsonb||'{"_role":"owner"}'::jsonb),expected,'{"vejoy_finishedStock":{"wrong":"shape"}}','null');
  raise exception 'Invalid operational shape accepted';
 exception when others then if sqlerrm not like '%must remain arrays%' then raise;end if;end;
 if (select count(*) from pg_temp.history_test)<>before_history then raise exception 'Failure left a partial audit/write';end if;
 if exists(select 1 from pg_temp.commands_test where id in ('invalid-command','stale-command')) then raise exception 'Rejected save acquired a receipt';end if;
 -- Exact atomic packing path: new packet/case labels in both source and stock.
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',actor)::text,true);
 perform set_config('request.jwt.claim.sub',actor::text,true);
 response:=pg_temp.commit_paneer_packing('{"operationId":"pack-1","roundId":"test-r1","packIndex":null,"sku":"MPAN200","cases":2,"loose":3}');
 if response->'round'->'packedSkus'->0->>'packetBatchCode'<>'12-1511A1' then raise exception 'Packet label missing/wrong: %',response;end if;
 if response->'stock'->>'caseBatchCode'<>'12-1511A' then raise exception 'Stock/case label missing';end if;
 response:=pg_temp.commit_paneer_packing('{"operationId":"pack-1","roundId":"test-r1","packIndex":null,"sku":"MPAN200","cases":2,"loose":3}');
 if jsonb_array_length(response->'round'->'packedSkus')<>1 then raise exception 'Packing retry duplicated source';end if;
 select r into after_other from pg_temp.state_test s cross join lateral jsonb_array_elements(s.value) r where s.key='vejoy_productionRounds' and r->>'id'='unrelated-round';
 if after_other is distinct from before_other then raise exception 'Unrelated round changed';end if;
 -- Older snapshots omitting new fields retain the latest metadata.
 perform set_config('app.paneer_traceability','on',true);
 update pg_temp.state_test set value=jsonb_set(value,'{0,paneerAutomaticTrace}','{"code":"80-1511A1"}') where key='vejoy_productionRounds';
 perform set_config('app.paneer_traceability','off',true);
 update pg_temp.state_test set value=jsonb_set(value,'{0}',(value->0)-'paneerAutomaticTrace') where key='vejoy_productionRounds';
 if not exists(select 1 from pg_temp.state_test where key='vejoy_productionRounds' and value->0->'paneerAutomaticTrace'->>'code'='80-1511A1') then raise exception 'Old snapshot erased trace metadata';end if;
 begin
  update pg_temp.state_test set value=jsonb_set(value,'{0,paneerAutomaticTrace}','{"code":"wrong"}') where key='vejoy_productionRounds';
  raise exception 'Old snapshot replaced trace metadata';
 exception when others then if sqlerrm not like '%audited form%' then raise;end if;end;
end $$;
select 'paneer shared transaction / retry / stale / rollback / labels / old-client guards / lot isolation passed' as result;
