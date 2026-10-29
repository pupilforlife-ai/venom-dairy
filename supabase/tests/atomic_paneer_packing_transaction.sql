-- Exercise an exact copy of the installed RPC against TEMP tables only.
-- Its SQL body is copied verbatim, substituting only the operational table.
begin;
create temporary table _atomic_packing_probe (key text primary key,value jsonb,version bigint default 1,
  updated_at timestamptz default now(),updated_by uuid) on commit drop;
create function pg_temp.reject_test_stock() returns trigger language plpgsql as $$
begin
  if new.key='vejoy_finishedStock' and current_setting('test.reject_packing_stock',true)='on' then
    raise exception 'Synthetic stock failure'; end if;
  return new;
end;
$$;
create trigger test_stock_failure before update on _atomic_packing_probe for each row execute function pg_temp.reject_test_stock();
create trigger test_snapshot_guard before update on _atomic_packing_probe for each row execute function public.guard_atomic_paneer_packing();
create trigger test_protect_state before update on _atomic_packing_probe for each row execute function public.protect_app_state_update();
do $install_test_copy$
begin
  execute replace(replace(pg_get_functiondef('public.commit_paneer_packing(jsonb)'::regprocedure),
    'public.commit_paneer_packing(', 'pg_temp.commit_paneer_packing('), 'public.app_state','pg_temp._atomic_packing_probe');
end;
$install_test_copy$;
do $test$
declare request jsonb; before_rounds jsonb; saved jsonb; previous jsonb; staff_id uuid; owner_id uuid;
begin
  select id into strict staff_id from public.profiles where status='approved' and role='staff' order by username limit 1;
  select id into strict owner_id from public.profiles where status='approved' and role='owner' order by username limit 1;
  insert into _atomic_packing_probe(key,value) values
    ('vejoy_finishedStock','[]'),('vejoy_milkLots','[]'),
    ('vejoy_productionRounds','[{"id":"r","milkLotCode":"test","shiftNumber":5,"roundNumber":3,"type":"C/S","status":"frozen","outputWeight":70.097},{"id":"other","type":"D","status":"scheduled","plannedInput":500}]');
  request:='{"operationId":"transaction-test","roundId":"r","sku":"RPAN100","cases":3,"loose":0}';
  perform set_config('request.jwt.claim.sub',staff_id::text,true);
  select value into before_rounds from _atomic_packing_probe where key='vejoy_productionRounds';
  perform set_config('test.reject_packing_stock','on',true);
  begin
    perform pg_temp.commit_paneer_packing(request);
    raise exception 'Injected stock failure was ignored';
  exception when others then if sqlerrm<>'Synthetic stock failure' then raise; end if; end;
  if (select value from _atomic_packing_probe where key='vejoy_productionRounds')<>before_rounds
    or (select value from _atomic_packing_probe where key='vejoy_finishedStock')<>'[]'::jsonb then
    raise exception 'Partial transaction was not rolled back'; end if;
  perform set_config('test.reject_packing_stock','off',true);
  saved:=pg_temp.commit_paneer_packing(request);
  if (saved#>>'{round,remainingBalance}')::numeric<>25.097 or (select jsonb_array_length(value) from _atomic_packing_probe where key='vejoy_finishedStock')<>1 then
    raise exception 'Both-record commit failed'; end if;
  perform pg_temp.commit_paneer_packing(request);
  if (select jsonb_array_length(value) from _atomic_packing_probe where key='vejoy_finishedStock')<>1 then raise exception 'RPC retry duplicated stock'; end if;
  if (select value->1 from _atomic_packing_probe where key='vejoy_productionRounds')<>before_rounds->1 then raise exception 'Other round changed'; end if;
  -- An older snapshot cannot delete the atomically saved packing entry.
  begin
    update _atomic_packing_probe set value=before_rounds where key='vejoy_productionRounds';
    raise exception 'Stale snapshot was accepted';
  exception when others then if sqlerrm not like 'Saved packing cannot be overwritten%' then raise; end if; end;
  previous:=saved#>'{round,packedSkus,0}';
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  saved:=pg_temp.commit_paneer_packing(request||jsonb_build_object('operationId','owner-zero','packIndex',0,'expectedPack',previous,'cases',0));
  if (saved#>>'{round,remainingBalance}')::numeric<>70.097 or saved#>>'{stock,cases}'<>'0' then raise exception 'Owner correction failed'; end if;
  saved:=pg_temp.commit_paneer_packing(request||jsonb_build_object('operationId','owner-same-quantity','packIndex',0,'expectedPack',saved#>'{round,packedSkus,0}','cases',0));
  if (saved#>>'{round,remainingBalance}')::numeric<>70.097 then raise exception 'Same-quantity correction failed'; end if;
  perform set_config('request.jwt.claim.sub','',true);
  begin
    perform pg_temp.commit_paneer_packing(request);
    raise exception 'Unauthenticated access accepted';
  exception when others then if sqlerrm<>'Approved production access required' then raise; end if; end;
end;
$test$;
select 'Exact RPC temporary-table tests passed: both-or-neither rollback, confirmed save, retry deduplication, owner correction, stale-client guard and access control' as result;
rollback;
