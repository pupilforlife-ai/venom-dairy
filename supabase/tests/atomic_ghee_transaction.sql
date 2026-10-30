-- Exact installed RPC copied onto temporary tables; no public operational writes.
begin;
create temporary table _ghee_probe (key text primary key,value jsonb,version bigint default 1,updated_at timestamptz default now(),updated_by uuid) on commit drop;
create function pg_temp.reject_ghee_test_pool() returns trigger language plpgsql as $$
begin
  if new.key='vejoy_milkLots' and current_setting('test.reject_ghee_pool',true)='on' then raise exception 'Synthetic pool failure'; end if;
  return new;
end;
$$;
create trigger reject_pool before update on _ghee_probe for each row execute function pg_temp.reject_ghee_test_pool();
create trigger numeric_guard before insert or update on _ghee_probe for each row execute function public.guard_ghee_numeric_state();
create trigger protect_state before update on _ghee_probe for each row execute function public.protect_app_state_update();
do $copy$
begin
  execute replace(replace(pg_get_functiondef('public.create_ghee_round(jsonb)'::regprocedure),
    'public.create_ghee_round(','pg_temp.create_ghee_round('),'public.app_state','pg_temp._ghee_probe');
end;
$copy$;
do $test$
declare req jsonb; before_rows jsonb; after_rows jsonb; result jsonb; staff_id uuid;
begin
  select id into strict staff_id from public.profiles where role='staff' and status='approved' order by username limit 1;
  insert into _ghee_probe(key,value) values('vejoy_creamLots','[]'),
    ('vejoy_milkLots','[{"id":"ml","lotCode":"test","butterPool":{"totalButterProduced":100,"usedInGhee":0,"usedInBlending":0,"packedAsPubb":0,"availableBalance":100}}]'),
    ('vejoy_productionRounds','[{"id":"b","type":"Butter","status":"churned","milkLotId":"ml","butterOutput":100,"remainingBalance":100}]');
  perform set_config('request.jwt.claim.sub',staff_id::text,true);
  req:='{"operationId":"temp-rpc","butterSource":"milk:ml","butterInput":92.5,"roundDate":"2026-10-30","team":"staff"}';
  select jsonb_object_agg(key,value) into before_rows from _ghee_probe;
  perform set_config('test.reject_ghee_pool','on',true);
  begin
    perform pg_temp.create_ghee_round(req);
    raise exception 'Injected pool failure ignored';
  exception when others then if sqlerrm<>'Synthetic pool failure' then raise; end if; end;
  select jsonb_object_agg(key,value) into after_rows from _ghee_probe;
  if after_rows<>before_rows then raise exception 'Partial ghee/source save escaped rollback'; end if;
  perform set_config('test.reject_ghee_pool','off',true);
  result:=pg_temp.create_ghee_round(req);
  if (result#>>'{milkLot,butterPool,availableBalance}')::numeric<>7.5 or (result#>>'{sourceRounds,0,usedInGhee}')::numeric<>92.5 then raise exception 'Confirmed transaction wrong'; end if;
  result:=pg_temp.create_ghee_round(req);
  if not (result->>'replayed')::boolean or (select jsonb_array_length(value) from _ghee_probe where key='vejoy_productionRounds')<>2 then raise exception 'RPC retry duplicated usage'; end if;
  begin
    update _ghee_probe set value=(select jsonb_agg(case when r->>'type'='Butter' then r||'{"remainingBalance":null}'::jsonb else r end) from jsonb_array_elements(value) r) where key='vejoy_productionRounds';
    raise exception 'Null balance accepted';
  exception when others then if sqlerrm not like 'Invalid remainingBalance%' then raise; end if; end;
  begin
    update _ghee_probe set value=(select jsonb_agg(case when r->>'type'='Ghee' then r||'{"butterInput":null}'::jsonb else r end) from jsonb_array_elements(value) r) where key='vejoy_productionRounds';
    raise exception 'Null ghee input accepted';
  exception when others then if sqlerrm not like 'Invalid butterInput%' then raise; end if; end;
  begin
    update _ghee_probe set value=(select jsonb_agg(case when r->>'type'='Butter' then r||'{"usedInGhee":0}'::jsonb else r end) from jsonb_array_elements(value) r) where key='vejoy_productionRounds';
    raise exception 'Stale use reset accepted';
  exception when others then if sqlerrm not like 'Recorded butter use in ghee cannot be reset%' then raise; end if; end;
  -- Normal workflow progress is not blocked by the input protection.
  update _ghee_probe set value=(select jsonb_agg(case when r->>'type'='Ghee' then r||'{"status":"cooking"}'::jsonb else r end) from jsonb_array_elements(value) r) where key='vejoy_productionRounds';
  perform set_config('request.jwt.claim.sub','',true);
  begin
    perform pg_temp.create_ghee_round(req);
    raise exception 'Anonymous ghee creation accepted';
  exception when others then if sqlerrm<>'Approved production access required' then raise; end if; end;
end;
$test$;
select 'Exact ghee RPC rollback, retry, numeric guard, stale-client, normal progress and approval tests passed on TEMP copies only' as result;
rollback;
