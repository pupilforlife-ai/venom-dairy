-- Exercise the installed trigger functions on TEMPORARY copies only.
-- No refresh-after-source trigger is attached to these test tables; therefore
-- these tests cannot update any public operational collection.
do $test$
declare lots jsonb; expected jsonb; actual jsonb; rounds jsonb; batches jsonb;
begin
  select value into strict lots from public.app_state where key='vejoy_milkLots';
  select value into strict rounds from public.app_state where key='vejoy_productionRounds';
  select value into strict batches from public.app_state where key='vejoy_crumbingBatches';
  create temporary table _halloumi_stale_client_probe (key text primary key,value jsonb) on commit drop;
  create trigger normalize_test before insert or update on _halloumi_stale_client_probe
    for each row execute function public.guard_halloumi_pool_state();
  insert into _halloumi_stale_client_probe values('vejoy_milkLots',lots);
  update _halloumi_stale_client_probe set value=(
    select jsonb_agg(case when lot->>'lotCode'='261026' then lot || jsonb_build_object('halloumiPool',
      ((lot->'halloumiPool') - 'hcpAccountingVersion' - 'hcpLegacyStockBasisKg' - 'hcpLegacyUsedKg' - 'hcpOtherAllocatedKg')
      || jsonb_build_object('usedInCrumbing',0,'availableForCrumbing',89.2,'vacuumPacked',1000,'totalProduced',1000)) else lot end)
    from jsonb_array_elements(value) x(lot));
  select value into actual from _halloumi_stale_client_probe;
  expected := public.reconcile_halloumi_state(lots,rounds,batches);
  if actual<>expected then raise exception 'Installed guard did not repair stale counters and missing accounting markers'; end if;
  update _halloumi_stale_client_probe set value=(
    select jsonb_agg(case when lot->>'lotCode'='261026' then lot - 'halloumiPool' else lot end)
    from jsonb_array_elements(value) x(lot));
  select value into actual from _halloumi_stale_client_probe;
  if actual<>expected then raise exception 'Installed guard allowed an older snapshot to erase the pool'; end if;

  create temporary table _hcp_identity_probe (key text primary key,value jsonb) on commit drop;
  create trigger identity_test before insert or update on _hcp_identity_probe
    for each row execute function public.guard_hcp_allocation_identity();
  insert into _hcp_identity_probe values('vejoy_crumbingBatches',batches);
  -- Test a non-null authenticated actor without creating/logging in a user.
  -- This claim exists only in this test transaction and only TEMP data is changed.
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
  begin
    update _hcp_identity_probe set value=(select jsonb_agg(case when b->>'type'='HCP' then b || '{"sourceWeightKg":0}'::jsonb else b end) from jsonb_array_elements(value) x(b));
    raise exception 'Allocation guard failed to reject source overwrite';
  exception when others then
    if sqlerrm not like 'HCP source/issue quantity is protected.%' then raise; end if;
  end;
  begin
    update _hcp_identity_probe set value=(select jsonb_agg(case when b->>'type'='HCP' then b || '{"type":"SPP"}'::jsonb else b end) from jsonb_array_elements(value) x(b));
    raise exception 'Allocation guard failed to reject product conversion';
  exception when others then
    if sqlerrm not like 'An HCP allocation cannot be changed%' then raise; end if;
  end;
  -- Normal tray/recipe progress still passes the identity guard.
  update _hcp_identity_probe set value=(select jsonb_agg(case when b->>'type'='HCP' then b || '{"traysFried":3}'::jsonb else b end) from jsonb_array_elements(value) x(b));
end;
$test$;
select 'Installed stale-client and allocation-identity guard tests passed on temporary copies only' as result;
