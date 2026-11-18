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

-- Regression: starting paneer must preserve OLD context for every unchanged
-- audited butter round in the same collection. The former upsert fails here.
select set_config('app.atomic_ghee_round','on',true);
select set_config('app.record_butter_loss','on',true);
update pg_temp.state_test set value=value||'[
 {"id":"test-vat-start","type":"C/S","milkLotId":"test-milk","milkLotCode":"151126","shiftNumber":1,"roundNumber":2,"status":"scheduled","plannedInput":500,"packedSkus":[]},
 {"id":"historical-butter","type":"Butter","creamSource":"internal","milkLotId":"historical-milk","status":"churned","butterOutput":30,"remainingBalance":10,"usedInGhee":20,"butterSettlementHistory":{"settled":{"matchedKg":20,"recordedBy":"previous supervisor"}}},
 {"id":"historical-blend","type":"Butter","blendedPoolId":"historic-blend","pool":"PSBBB","status":"psbbb_pool","outputWeight":20,"butterOutput":16.5,"remainingBalance":0,"packedButterWeight":19,"butterLossHistory":{"loss":{"quantityKg":1,"recordedBy":"previous owner"}}}
]'::jsonb where key='vejoy_productionRounds';
select set_config('app.atomic_ghee_round','off',true);
select set_config('app.record_butter_loss','off',true);
do $$
declare actor uuid; expected jsonb; before_rounds jsonb; after_rounds jsonb; before_other jsonb; after_other jsonb; changes jsonb; response jsonb; before_version bigint; after_version bigint; commands integer;
begin
 select id into strict actor from pg_temp.profiles_test;
 select value,version into before_rounds,before_version from pg_temp.state_test where key='vejoy_productionRounds';
 select jsonb_agg(jsonb_build_object('key',key,'value',value,'version',version) order by key) into before_other from pg_temp.state_test where key<>'vejoy_productionRounds';
 select jsonb_agg(jsonb_build_object('key',key,'version',version)) into expected from pg_temp.state_test;
 changes:=jsonb_build_object('vejoy_productionRounds',(select jsonb_agg(case when x->>'id'='test-vat-start' then x||'{"status":"in_production","vat":"vat2","startingTemperature":4}'::jsonb else x end order by ord) from jsonb_array_elements(before_rounds) with ordinality t(x,ord)));
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 response:=pg_temp.commit_paneer_traceability(actor,'{"id":"start-with-audited-butter","kind":"activity","_role":"owner"}',expected,changes,'null');
 if response->>'ok'<>'true' then raise exception 'Vat start not confirmed';end if;
 select value,version into after_rounds,after_version from pg_temp.state_test where key='vejoy_productionRounds';
 if after_version<>before_version+1 then raise exception 'Vat start must write exactly once';end if;
 if not exists(select 1 from jsonb_array_elements(after_rounds) r where r->>'id'='test-vat-start' and r->>'vat'='vat2' and r->>'status'='in_production') then raise exception 'Vat/production save missing';end if;
 if exists(select 1 from jsonb_array_elements(before_rounds) b join jsonb_array_elements(after_rounds) a on b->>'id'=a->>'id' where b->>'id'<>'test-vat-start' and b is distinct from a) then raise exception 'Paneer start changed unrelated historical records';end if;
 select jsonb_agg(jsonb_build_object('key',key,'value',value,'version',version) order by key) into after_other from pg_temp.state_test where key<>'vejoy_productionRounds';
 if after_other is distinct from before_other then raise exception 'Vat start changed another collection';end if;
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 response:=pg_temp.commit_paneer_traceability(actor,'{"id":"start-with-audited-butter","kind":"activity","_role":"owner"}','[]','{}','null');
 if (select version from pg_temp.state_test where key='vejoy_productionRounds')<>after_version then raise exception 'Vat-start retry wrote twice';end if;
 -- The fix must not make allocation or loss receipts editable.
 perform set_config('app.paneer_traceability','off',true);
 begin
  update pg_temp.state_test set value=(select jsonb_agg(case when r->>'id'='historical-butter' then r||'{"butterSettlementHistory":{"wrong":true}}'::jsonb else r end) from jsonb_array_elements(value) r) where key='vejoy_productionRounds';
  raise exception 'Historical settlement guard was bypassed';
 exception when others then if sqlerrm not like '%Late-butter allocation history%' then raise;end if;end;
 begin
  update pg_temp.state_test set value=(select jsonb_agg(case when r->>'id'='historical-blend' then r||'{"butterLossHistory":{"wrong":true}}'::jsonb else r end) from jsonb_array_elements(value) r) where key='vejoy_productionRounds';
  raise exception 'Historical loss guard was bypassed';
 exception when others then if sqlerrm not like '%Butter loss history%' then raise;end if;end;
 if (select value from pg_temp.state_test where key='vejoy_productionRounds') is distinct from after_rounds then raise exception 'Rejected edits changed records';end if;
end $$;
select 'vat start with historical butter settlement/loss receipts / exact source preservation / single write / retry / active guards passed' as result;
