-- Run after the migration, or concatenate its definitions and these tests in
-- one ROLLBACK-only transaction. All operational mutations target TEMP copies.
begin;
create temporary table _butter_loss_probe (key text primary key,value jsonb,version bigint default 1,updated_at timestamptz default now(),updated_by uuid) on commit drop;
create trigger loss_guard before insert or update on _butter_loss_probe for each row execute function public.guard_butter_loss_state();
create trigger state_guard before update on _butter_loss_probe for each row execute function public.protect_app_state_update();
do $copy$
begin
  execute replace(replace(pg_get_functiondef('public.record_butter_pool_loss(jsonb)'::regprocedure),
    'public.record_butter_pool_loss(','pg_temp.record_butter_pool_loss('),'public.app_state','pg_temp._butter_loss_probe');
end;
$copy$;
do $test$
declare req jsonb:='{"operationId":"test-loss","poolId":"blend-one","quantityKg":3.5,"expectedBalanceKg":3.5,"reason":"moisture_loss","note":"Confirmed physical moisture loss"}';
  original jsonb:='[{"id":"one","type":"Butter","status":"pubbb_pool","blendedPoolId":"blend-one","batchCode":"PUBBB-281026","pool":"PUBBB","outputWeight":43,"packedButterWeight":39.5,"remainingBalance":3.5,"packedSkus":[{"sku":"PUBBB","cases":2,"loose":7}]},
    {"id":"other","type":"Butter","status":"pubbb_pool","blendedPoolId":"blend-two","batchCode":"PUBBB-281026","outputWeight":28.02,"packedButterWeight":28,"remainingBalance":0.02}]';
  result jsonb; current_rounds jsonb; loss_round jsonb; staff_id uuid; manager_id uuid; bad jsonb;
begin
  select id into strict staff_id from public.profiles where role='staff' and status='approved' order by username limit 1;
  select id into strict manager_id from public.profiles where role in ('owner','admin') and status='approved' order by username limit 1;
  insert into _butter_loss_probe(key,value) values('vejoy_productionRounds',original);
  perform set_config('request.jwt.claim.sub',staff_id::text,true);
  begin
    perform pg_temp.record_butter_pool_loss(req); raise exception 'Staff recorded a butter loss';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub','',true);
  begin
    perform pg_temp.record_butter_pool_loss(req); raise exception 'Anonymous recorded a butter loss';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',manager_id::text,true);
  for bad in select value from jsonb_array_elements('[null,"3.5",-1,0,4]') loop
    begin
      perform pg_temp.record_butter_pool_loss(req||jsonb_build_object('quantityKg',bad)); raise exception 'Invalid loss accepted';
    exception when others then if sqlerrm='Invalid loss accepted' then raise; end if; end;
  end loop;
  begin
    perform pg_temp.record_butter_pool_loss(req||'{"expectedBalanceKg":10}'); raise exception 'Stale loss accepted';
  exception when others then if sqlerrm not like 'Butter balance changed%' then raise; end if; end;
  if (select value from _butter_loss_probe)<>original then raise exception 'Rejected operation mutated source records'; end if;
  result:=pg_temp.record_butter_pool_loss(req);
  select value into current_rounds from _butter_loss_probe;
  select value into loss_round from jsonb_array_elements(current_rounds) where value->>'id'='one';
  if (loss_round->>'remainingBalance')::numeric<>0 or (loss_round->>'outputWeight')::numeric<>43
    or (loss_round->>'packedButterWeight')::numeric<>39.5 or loss_round->'packedSkus'<>original#>'{0,packedSkus}'
    or current_rounds->1<>original->1 or result#>>'{loss,recordedById}'<>manager_id::text then raise exception 'Loss equation, identity or source isolation failed'; end if;
  result:=pg_temp.record_butter_pool_loss(req);
  if not (result->>'replayed')::boolean or (select value from _butter_loss_probe)<>current_rounds then raise exception 'Retry duplicated loss'; end if;
  begin
    update _butter_loss_probe set value=jsonb_set(value,'{0,remainingBalance}','3.5'); raise exception 'Stale balance restored';
  exception when others then if sqlerrm not like 'Butter balance changed after a recorded loss%' then raise; end if; end;
  begin
    update _butter_loss_probe set value=jsonb_set(value,'{0,butterLossHistory}','{}'); raise exception 'Loss audit removed';
  exception when others then if sqlerrm not like 'Butter loss history is protected%' then raise; end if; end;
  -- Start a separate partial-loss pool using a pure synthetic transition.
  req:=req||'{"operationId":"partial-loss","poolId":"partial","quantityKg":1,"expectedBalanceKg":3.5}';
  perform set_config('app.record_butter_loss','on',true);
  insert into _butter_loss_probe values('scratch','[]');
  update _butter_loss_probe set value=jsonb_build_array((original->0)||'{"id":"partial","blendedPoolId":"partial"}') where key='scratch';
  result:=public.prepare_butter_pool_loss((select value from _butter_loss_probe where key='scratch'),req,'test',manager_id,now());
  update _butter_loss_probe set value=result->'rounds' where key='scratch';
  -- The guard only operates on the production-round key, so run packing
  -- checks on the same TEMP production collection after installing this fixture.
  update _butter_loss_probe set value=value||(result->'rounds') where key='vejoy_productionRounds';
  perform set_config('app.record_butter_loss','off',true);
  -- Proper new packing: 2.5 kg remaining - 1 kg packing = 1.5 kg.
  update _butter_loss_probe set value=jsonb_set(jsonb_set(value,'{2,remainingBalance}','1.5'),'{2,packedButterWeight}','40.5') where key='vejoy_productionRounds';
  begin
    -- An older phone computes from 3.5 kg instead of the actual 1.5 kg.
    update _butter_loss_probe set value=jsonb_set(jsonb_set(value,'{2,remainingBalance}','2.5'),'{2,packedButterWeight}','41.5') where key='vejoy_productionRounds';
    raise exception 'Stale packing ignored loss';
  exception when others then if sqlerrm not like 'Butter balance changed after a recorded loss%' then raise; end if; end;
  perform set_config('request.jwt.claim.sub',staff_id::text,true);
  begin
    update _butter_loss_probe set value=jsonb_set(value,'{0,butterLossHistory}','{"fake":{"quantityKg":1}}') where key='vejoy_productionRounds';
    raise exception 'Staff forged loss history';
  exception when others then if sqlerrm not like 'Butter loss history is protected%' then raise; end if; end;
  if not has_function_privilege('authenticated','public.record_butter_pool_loss(jsonb)','EXECUTE')
    or has_function_privilege('anon','public.record_butter_pool_loss(jsonb)','EXECUTE')
    or has_function_privilege('authenticated','public.prepare_butter_pool_loss(jsonb,jsonb,text,uuid,timestamptz)','EXECUTE') then raise exception 'RPC privileges incorrect'; end if;
end;
$test$;
select 'Butter-loss tests passed: arithmetic, role checks, retry, stale packing, audit protection and source isolation on TEMP copies only' as result;
rollback;
