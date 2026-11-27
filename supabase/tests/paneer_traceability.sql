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

-- Shared-index optimization must preserve Ghee / butter numeric protections.
select set_config('app.atomic_ghee_round','on',true);
select set_config('app.atomic_ghee_af_oil','on',true);
update pg_temp.state_test set value=value||'[
 {"id":"ghee-guard-fixture","type":"Ghee","status":"scheduled","butterInput":92.5,"actualInput":105,"plannedInput":105,"afOilInput":12.5,"expectedYield":73.5,"gheeInputVersion":1,"afOilConfirmationRequired":true,"afOilRecord":{"actualKg":12.5,"confirmedBy":"owner"},"afOilAuditHistory":[{"id":"confirmed"}]},
 {"id":"butter-numeric-fixture","type":"Butter","butterOutput":25,"remainingBalance":25,"usedInGhee":0,"status":"churned"}
]'::jsonb where key='vejoy_productionRounds';
select set_config('app.atomic_ghee_round','off',true);
select set_config('app.atomic_ghee_af_oil','off',true);
do $$
declare before_value jsonb;
begin
 select value into before_value from pg_temp.state_test where key='vejoy_productionRounds';
 begin
  update pg_temp.state_test set value=(select jsonb_agg(case when r->>'id'='ghee-guard-fixture' then r||'{"afOilRecord":{"actualKg":99}}'::jsonb else r end) from jsonb_array_elements(value) r) where key='vejoy_productionRounds';
  raise exception 'AF oil receipt overwrite accepted';
 exception when others then if sqlerrm not like '%AF oil confirmations and approvals%' then raise;end if;end;
 begin
  update pg_temp.state_test set value=(select jsonb_agg(case when r->>'id'='ghee-guard-fixture' then r||'{"butterInput":90}'::jsonb else r end) from jsonb_array_elements(value) r) where key='vejoy_productionRounds';
  raise exception 'Confirmed ghee source edit accepted';
 exception when others then if sqlerrm not like '%Confirmed AF oil source and butter input%' then raise;end if;end;
 begin
  update pg_temp.state_test set value=(select jsonb_agg(case when r->>'id'='butter-numeric-fixture' then r||'{"remainingBalance":-1}'::jsonb else r end) from jsonb_array_elements(value) r) where key='vejoy_productionRounds';
  raise exception 'Negative butter balance accepted';
 exception when others then if sqlerrm not like '%Invalid remainingBalance%' then raise;end if;end;
 if (select value from pg_temp.state_test where key='vejoy_productionRounds') is distinct from before_value then raise exception 'Rejected numeric/source changes wrote records';end if;
end $$;
select 'indexed shared guards retain ghee AF oil/source and butter numeric protections' as result;

-- Cloth is tare, not paneer. Exercise the actual atomic path and retry on TEMP records.
do $$
declare response jsonb; saved jsonb; prior jsonb; actor uuid;
begin
 select id into actor from pg_temp.profiles_test;
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',actor)::text,true);
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform set_config('app.paneer_traceability','on',true);
 update pg_temp.state_test set value=value||'[{"id":"cloth-packing","type":"C/S","milkLotId":"test-milk","milkLotCode":"151126","shiftNumber":1,"roundNumber":5,"plannedInput":500,"status":"cut","outputWeight":72,"blockWeights":[12,12,12,12,12,12],"remainingBalance":72,"paneerCuttingDetails":{"clothKg":1.789},"packedSkus":[]}]'::jsonb where key='vejoy_productionRounds';
 perform set_config('app.paneer_traceability','off',true);
 select value into prior from pg_temp.state_test where key='vejoy_productionRounds';
 response:=pg_temp.commit_paneer_packing('{"operationId":"cloth-pack","roundId":"cloth-packing","sku":"RPAN100","cases":4,"loose":12}');
 saved:=response->'round';
 if (saved->>'remainingBalance')::numeric<>-1.789 then raise exception 'Cloth missing/deducted twice: %',saved;end if;
 if saved->'outputWeight'<>'72'::jsonb or saved->'blockWeights'<>'[12,12,12,12,12,12]'::jsonb or saved->'paneerCuttingDetails'->'clothKg'<>'1.789'::jsonb then raise exception 'Gross weights or source cloth changed';end if;
 if response->'stock'->>'cases'<>'4' or response->'stock'->>'loosePackets'<>'12' then raise exception 'Cloth changed packed case counts';end if;
 response:=pg_temp.commit_paneer_packing('{"operationId":"cloth-pack","roundId":"cloth-packing","sku":"RPAN100","cases":4,"loose":12}');
 if (response->'round'->>'remainingBalance')::numeric<>-1.789 or jsonb_array_length(response->'round'->'packedSkus')<>1 then raise exception 'Retry deducted cloth again';end if;
 response:=pg_temp.commit_paneer_packing(jsonb_build_object('operationId','cloth-correct','roundId','cloth-packing','packIndex',0,'expectedPack',saved->'packedSkus'->0,'sku','RPAN100','cases',0,'loose',0));
 if (response->'round'->>'remainingBalance')::numeric<>70.211 then raise exception 'Correction failed to return packed weight with cloth retained';end if;
 if exists(select 1 from jsonb_array_elements(prior) b join pg_temp.state_test st on st.key='vejoy_productionRounds' cross join lateral jsonb_array_elements(st.value) a where a->>'id'=b->>'id' and b->>'id'<>'cloth-packing' and a is distinct from b) then raise exception 'Cloth packing altered unrelated records';end if;
 if (pg_temp.prepare_paneer_packing('{"id":"legacy-cloth","type":"D","status":"cut","outputWeight":72,"paneerCuttingDetails":{"clothKg":null}}','[]','{"operationId":"legacy","roundId":"legacy-cloth","sku":"MPAN100","cases":4,"loose":12}','owner','owner',now())->'round'->>'remainingBalance')::numeric<>0 then raise exception 'Legacy/no-cloth packing changed';end if;
end $$;
select 'cloth net balance / exact source preservation / atomic retry / owner correction / old client packing / lot isolation passed' as result;

-- New rejected-milk receipts use the existing atomic transaction and survive old clients.
insert into pg_temp.state_test(key,value) values('unused-milk-test','[]');
update pg_temp.state_test set value=value||'[{"id":"reject-test","lotCode":"191126","receiptStatus":"received","status":"completed","litresReceived":26000,"litresConsumed":0,"litresRemaining":26000,"litresRejected":0,"litresSpilled":0}]'::jsonb where key='vejoy_milkLots';
do $$
declare actor uuid; actor_name text; before_value jsonb; expected jsonb; changed jsonb; target jsonb; receipt jsonb; response jsonb; saved jsonb; version_after bigint;
begin
 select id,username into actor,actor_name from pg_temp.profiles_test;
 select value into before_value from pg_temp.state_test where key='vejoy_milkLots';
 select x into target from jsonb_array_elements(before_value) x where x->>'id'='reject-test';
 receipt:=jsonb_build_object('id','milk-rejection-test','kind','milk_rejection','eventDate','2026-11-19','rejectedLitres',26000,'reviewedAt',now(),'reviewedBy',actor_name,'reviewerRole','owner','reason','Milk quality rejected','before',jsonb_build_object('rejected',0,'remaining',26000),'after',jsonb_build_object('rejected',26000,'remaining',0),'roundCorrections','[]'::jsonb);
 target:=target||jsonb_build_object('status','rejected','litresRejected',26000,'litresRemaining',0,'milkBalanceReviews',jsonb_build_array(receipt));
 select jsonb_agg(case when x->>'id'='reject-test' then target else x end order by ord) into changed from jsonb_array_elements(before_value) with ordinality t(x,ord);
 select jsonb_agg(jsonb_build_object('key',k,'version',s.version)) into expected from unnest(array['vejoy_distributionHandovers','vejoy_finishedStock','vejoy_intermediateLots','vejoy_milkLots','vejoy_productionRounds','vejoy_traceability']) k left join pg_temp.state_test s on s.key=k;
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 response:=pg_temp.commit_paneer_traceability(actor,'{"id":"reject-milk-op","kind":"milk_rejection","_role":"owner"}',expected,jsonb_build_object('vejoy_milkLots',changed),'null');
 select value,version into saved,version_after from pg_temp.state_test where key='vejoy_milkLots';
 if saved is distinct from changed then raise exception 'Rejection not stored exactly';end if;
 if exists(select 1 from jsonb_array_elements(before_value) b join jsonb_array_elements(saved) a on a->>'id'=b->>'id' where b->>'id'<>'reject-test' and a is distinct from b) then raise exception 'Rejection changed another milk lot';end if;
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 response:=pg_temp.commit_paneer_traceability(actor,'{"id":"reject-milk-op","kind":"milk_rejection","_role":"owner"}','[]','{}','null');
 if (select version from pg_temp.state_test where key='vejoy_milkLots')<>version_after then raise exception 'Retry duplicated rejection';end if;
 perform set_config('app.paneer_traceability','off',true);
 begin
  update pg_temp.state_test set value=before_value where key='vejoy_milkLots';
  raise exception 'Stale client erased rejection';
 exception when others then if sqlerrm not like '%Milk rejection history is protected%' then raise;end if;end;
 begin
  update pg_temp.state_test set value=(select jsonb_agg(case when x->>'id'='reject-test' then x||'{"litresRejected":0,"litresRemaining":26000}'::jsonb else x end) from jsonb_array_elements(value) x) where key='vejoy_milkLots';
  raise exception 'Stale balance reset rejection';
 exception when others then if sqlerrm not like '%cannot be reset%' then raise;end if;end;
 begin
  update pg_temp.state_test set value=value||'[{"id":"start-rejected","type":"D","milkLotId":"reject-test","milkLotCode":"191126","plannedInput":500,"actualInput":500,"status":"in_production"}]'::jsonb where key='vejoy_productionRounds';
  raise exception 'Production started on rejected milk';
 exception when others then if sqlerrm not like '%milk lot is rejected%' then raise;end if;end;
 begin
  update pg_temp.state_test set value=(select jsonb_agg(case when x->>'id'='reject-test' then x||jsonb_build_object('milkBalanceReviews',(x->'milkBalanceReviews')||jsonb_build_array(receipt||'{"id":"forged"}'::jsonb)) else x end) from jsonb_array_elements(value) x) where key='vejoy_milkLots';
  raise exception 'Snapshot forged new rejection receipt';
 exception when others then if sqlerrm not like '%Owner/Admin Reject milk action%' then raise;end if;end;
 -- Older code marks the previous latest lot completed when receiving a new one.
 update pg_temp.state_test set value=(select jsonb_agg(case when x->>'id'='reject-test' then x||'{"status":"completed","isLatest":false}'::jsonb else x end) from jsonb_array_elements(value) x) where key='vejoy_milkLots';
 if not exists(select 1 from pg_temp.state_test s cross join lateral jsonb_array_elements(s.value) x where s.key='vejoy_milkLots' and x->>'id'='reject-test' and x->>'status'='rejected') then raise exception 'New receipt relabeled a rejected lot';end if;
 -- Existing Owner/Admin balance-review corrections remain usable and retain history.
 receipt:=jsonb_build_object('id','owner-rejection-correction','reviewedBy',actor_name,'reviewerRole','owner','reason','Correct physical rejection total','before',jsonb_build_object('rejected',26000),'after',jsonb_build_object('rejected',25000));
 update pg_temp.state_test set value=(select jsonb_agg(case when x->>'id'='reject-test' then x||jsonb_build_object('litresRejected',25000,'litresRemaining',1000,'milkBalanceReviews',(x->'milkBalanceReviews')||jsonb_build_array(receipt)) else x end) from jsonb_array_elements(value) x) where key='vejoy_milkLots';
 if not exists(select 1 from pg_temp.state_test s cross join lateral jsonb_array_elements(s.value) x where s.key='vejoy_milkLots' and x->>'id'='reject-test' and x->>'status'='completed' and x->>'litresRejected'='25000' and jsonb_array_length(x->'milkBalanceReviews')=2) then raise exception 'Owner rejection correction failed';end if;
end $$;
select 'milk rejection atomic save / retries / stale writes / immutable receipts / rejected-source gate / owner corrections / lot isolation passed' as result;

-- Additive Halloumi plan + mL preparation persists through the same shared RPC.
do $$
declare actor uuid; expected jsonb; before_trace jsonb; prepared jsonb; response jsonb; before_other jsonb; after_other jsonb; saved_version bigint;
begin
 select id into actor from pg_temp.profiles_test;
 select value into before_trace from pg_temp.state_test where key='vejoy_traceability';
 prepared:=before_trace||'{"liquidReadiness":{"test-milk":{"rennet":{"value":{"planRevision":"hall-plan","requiredMl":150,"floorBalanceMl":500,"floorBatchCodes":"R1","containers":[],"responsible":"Test preparer","supplier":"","onSite":true,"checkedBy":"Test preparer","checkedAt":"2026-11-24T10:00:00Z"},"audit":[]}}}}'::jsonb;
 select jsonb_agg(jsonb_build_object('key',key,'value',value,'version',version) order by key) into before_other from pg_temp.state_test where key<>'vejoy_traceability';
 select jsonb_agg(jsonb_build_object('key',k,'version',s.version)) into expected from unnest(array['vejoy_distributionHandovers','vejoy_finishedStock','vejoy_intermediateLots','vejoy_milkLots','vejoy_productionRounds','vejoy_traceability']) k left join pg_temp.state_test s on s.key=k;
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 response:=pg_temp.commit_paneer_traceability(actor,'{"id":"halloumi-checklist-rpc","kind":"checklist","_role":"owner"}',expected,jsonb_build_object('vejoy_traceability',prepared),'null');
 if (select value from pg_temp.state_test where key='vejoy_traceability') is distinct from prepared then raise exception 'Liquid preparation not stored exactly';end if;
 select version into saved_version from pg_temp.state_test where key='vejoy_traceability';
 select jsonb_agg(jsonb_build_object('key',key,'value',value,'version',version) order by key) into after_other from pg_temp.state_test where key<>'vejoy_traceability';
 if before_other is distinct from after_other then raise exception 'Halloumi planning changed production/source records';end if;
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 response:=pg_temp.commit_paneer_traceability(actor,'{"id":"halloumi-checklist-rpc","kind":"checklist","_role":"owner"}','[]','{}','null');
 if (select version from pg_temp.state_test where key='vejoy_traceability')<>saved_version then raise exception 'Checklist retry wrote twice';end if;
end $$;
select 'Halloumi liquid checklist stored exactly / idempotent retry / no production or source changes passed' as result;

-- Approved defaults agree with the frontend, including older open packing clients.
do $$
declare actor uuid; item record; response jsonb; saved jsonb; before_packs jsonb; response2 jsonb;
begin
 select id into actor from pg_temp.profiles_test;
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',actor)::text,true);perform set_config('request.jwt.claim.sub',actor::text,true);
 for item in select * from (values ('prefix-mspc','D','200g cubes','MPAN101 SPC CUT','18'),('prefix-r101','C/S','400g cubes','RPAN101','27'),('prefix-rspc','C/S','200g cubes','RPAN101 SPC CUT','28'),('prefix-ry100','C/S','400g cubes','RPAN100 Rylands','24'),('prefix-ry400','C/S','400g cubes','RPAN400 Rylands','25'),('prefix-yd','D','200g cubes','YD200','17')) t(id,kind,cut,sku,prefix) loop
  update pg_temp.state_test set value=value||jsonb_build_array(jsonb_build_object('id',item.id,'type',item.kind,'status','cut','milkLotId','test-milk','milkLotCode','151126','shiftNumber',1,'roundNumber',10,'plannedInput',500,'actualInput',500,'outputWeight',80,'cuttingType',item.cut,'packedSkus','[]'::jsonb)) where key='vejoy_productionRounds';
  response:=pg_temp.commit_paneer_packing(jsonb_build_object('operationId',item.id||'-pack','roundId',item.id,'sku',item.sku,'cases',1,'loose',0));
  if response->'round'->'packedSkus'->0->>'packetBatchCode'<>item.prefix||'-1511A10' then raise exception 'Wrong approved prefix for %: %',item.sku,response;end if;
  if response->'stock'->>'caseBatchCode'<>item.prefix||'-1511A' then raise exception 'Stock label mismatch for %',item.sku;end if;
 end loop;
 -- A historical packet printed as 15 retains 15 when counts are corrected.
 perform set_config('app.atomic_paneer_packing','on',true);
 update pg_temp.state_test set value=value||'[{"id":"saved-old-prefix","type":"D","status":"cut","milkLotId":"test-milk","milkLotCode":"151126","shiftNumber":1,"roundNumber":11,"plannedInput":500,"actualInput":500,"outputWeight":80,"cuttingType":"200g cubes","packedSkus":[{"sku":"MPAN101 SPC CUT","cases":1,"loose":0,"packetBatchCode":"15-1511A11","caseBatchCode":"15-1511A","traceabilityProductionDate":"2026-11-15","traceabilityPrefixVersion":"proposed-20261111-v1","lastSaveOperationId":"historical-prefix"}]}]'::jsonb where key='vejoy_productionRounds';
 perform set_config('app.atomic_paneer_packing','off',true);
 select r->'packedSkus'->0 into saved from pg_temp.state_test s cross join lateral jsonb_array_elements(s.value) r where s.key='vejoy_productionRounds' and r->>'id'='saved-old-prefix';
 response:=pg_temp.commit_paneer_packing(jsonb_build_object('operationId','correct-old-prefix','roundId','saved-old-prefix','packIndex',0,'expectedPack',saved,'sku','MPAN101 SPC CUT','cases',2,'loose',0));
 if response->'round'->'packedSkus'->0->>'packetBatchCode'<>'15-1511A11' or response->'stock'->>'caseBatchCode'<>'15-1511A' then raise exception 'Approval relabeled a previously printed code';end if;
end $$;
select 'approved paneer prefixes / app-server alignment / historical printed-label preservation passed' as result;

-- Read-only Shift 1 dates participate in the same CAS as a loose-case save.
do $$ declare actor uuid; expected jsonb; stale jsonb; result jsonb; before_shifts jsonb;
begin
 select id into actor from pg_temp.profiles_test limit 1;
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 insert into pg_temp.state_test(key,value) values('vejoy_productionShifts','[{"id":"date-shift","shiftNumber":1,"startedAt":"2026-10-11T14:27:00Z"}]') on conflict(key) do nothing;
 select value into before_shifts from pg_temp.state_test where key='vejoy_productionShifts';
 select jsonb_agg(jsonb_build_object('key',k,'version',s.version)) into expected from unnest(array['vejoy_distributionHandovers','vejoy_finishedStock','vejoy_intermediateLots','vejoy_milkLots','vejoy_productionRounds','vejoy_traceability','vejoy_productionShifts']) k left join pg_temp.state_test s on s.key=k;
 result:=pg_temp.commit_paneer_traceability(actor,'{"id":"shift-date-dependency","kind":"assemble","_role":"owner"}',expected,'{}','null');
 if result->>'ok'<>'true' then raise exception 'Shift dependency save failed';end if;
 if (select value from pg_temp.state_test where key='vejoy_productionShifts') is distinct from before_shifts then raise exception 'Read-only shifts changed';end if;
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 perform pg_temp.commit_paneer_traceability(actor,'{"id":"shift-date-dependency","kind":"assemble","_role":"owner"}','[]','{}','null');
 select jsonb_agg(case when x->>'key'='vejoy_productionShifts' then jsonb_set(x,'{version}',to_jsonb(-999)) else x end) into stale from jsonb_array_elements(expected) x;
 begin
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 perform pg_temp.commit_paneer_traceability(actor,'{"id":"shift-date-stale","kind":"assemble","_role":"owner"}',stale,'{}','null');
  raise exception 'Stale shift version accepted';
 exception when serialization_failure then null;end;
 begin
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 perform pg_temp.commit_paneer_traceability(actor,'{"id":"shift-date-write","kind":"assemble","_role":"owner"}',expected,'{"vejoy_productionShifts":[]}','null');
  raise exception 'Read-only shift write accepted';
 exception when others then if sqlerrm<>'Unexpected collection' then raise;end if;end;
end;$$;
select 'Shift-date read dependency / stale retry / no shift writes / idempotent replay passed' as result;

-- Response compaction must distinguish a fresh commit from a lost/racing replay.
do $$ declare actor uuid; expected jsonb; response jsonb;
begin
 select id into actor from pg_temp.profiles_test limit 1;
 select jsonb_agg(jsonb_build_object('key',k,'version',s.version)) into expected from unnest(array['vejoy_distributionHandovers','vejoy_finishedStock','vejoy_intermediateLots','vejoy_milkLots','vejoy_productionRounds','vejoy_traceability']) k left join pg_temp.state_test s on s.key=k;
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 response:=pg_temp.commit_paneer_traceability(actor,'{"id":"replay-flag-check","kind":"save","_role":"owner"}',expected,'{}','null');
 if response->'replayed' is distinct from 'false'::jsonb then raise exception 'First commit misidentified as replay';end if;
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 response:=pg_temp.commit_paneer_traceability(actor,'{"id":"replay-flag-check","kind":"save","_role":"owner"}','[]','{}','null');
 if response->'replayed' is distinct from 'true'::jsonb or jsonb_array_length(response->'rows')<>6 then raise exception 'Replay must recover all six source snapshots';end if;
end;$$;
select 'Save replay flag / unchanged legacy full reply / dependency locks passed' as result;
