-- Halloumi accounting from source records, including protection from old tabs.
-- Apply this migration alone. Do not run unrelated pending migrations.
begin;
set local lock_timeout = '3s';

create or replace function public.halloumi_weight(value jsonb)
returns numeric language sql immutable set search_path = public as $$
  select case when jsonb_typeof(value) = 'number' then greatest(0, (value #>> '{}')::numeric) else 0 end;
$$;
revoke all on function public.halloumi_weight(jsonb) from public, anon, authenticated;

create or replace function public.reconcile_halloumi_state(lots jsonb, rounds jsonb, batches jsonb)
returns jsonb language plpgsql immutable set search_path = public as $$
declare
  result jsonb := '[]'::jsonb;
  lot jsonb; pool jsonb; r jsonb; b jsonb; receipts jsonb;
  lot_id text; lot_code text; batch_id text; seen text[];
  produced numeric; vacuumed numeric; allocated numeric; returned numeric;
  issued numeric; back_to_chiller numeric; legacy_stock numeric; legacy_used numeric;
  other_allocated numeric; stock_basis numeric; used_net numeric; available numeric;
  has_rounds boolean; warnings jsonb;
begin
  if jsonb_typeof(lots) <> 'array' or jsonb_typeof(rounds) <> 'array' or jsonb_typeof(batches) <> 'array' then
    raise exception 'Halloumi reconciliation requires operational arrays';
  end if;
  for lot in select value from jsonb_array_elements(lots) loop
    pool := lot->'halloumiPool';
    if jsonb_typeof(pool) is distinct from 'object' then result := result || jsonb_build_array(lot); continue; end if;
    lot_id := lot->>'id'; lot_code := lot->>'lotCode';
    produced := 0; vacuumed := 0; has_rounds := false;
    allocated := 0; returned := 0; seen := array[]::text[]; warnings := '[]'::jsonb;
    receipts := case when jsonb_typeof(pool->'hcpChillerReturns')='object' then pool->'hcpChillerReturns' else '{}'::jsonb end;
    for r in select value from jsonb_array_elements(rounds) where value->>'type'='Halloumi'
      and coalesce(value->>'status','') not in ('cancelled','spoiled')
      and (value->>'milkLotId'=lot_id or (nullif(value->>'milkLotId','') is null and value->>'milkLotCode'=lot_code)) loop
      has_rounds := true;
      produced := produced + public.halloumi_weight(r->'outputWeight');
      vacuumed := vacuumed + public.halloumi_weight(r->'vacuumPackedWeight');
    end loop;
    if not has_rounds then
      produced := public.halloumi_weight(pool->'totalProduced');
      vacuumed := public.halloumi_weight(pool->'vacuumPacked');
    end if;
    for b in select value from jsonb_array_elements(batches) where value->>'type'='HCP'
      and nullif(value->>'clubbedInto','') is null
      and (value->>'sourceBatchId'=lot_id or (nullif(value->>'sourceBatchId','') is null and value->>'sourceBatchCode'=pool->>'batchId')) loop
      batch_id := b->>'id';
      if batch_id is null or batch_id=any(seen) then
        warnings := warnings || jsonb_build_array('Missing/duplicate HCP batch identity; owner review required.'); continue;
      end if;
      seen := array_append(seen,batch_id);
      issued := public.halloumi_weight(b->'sourceWeightKg');
      if issued <= 0 then
        warnings := warnings || jsonb_build_array('HCP batch ' || batch_id || ' has no valid source weight; owner review required.'); continue;
      end if;
      allocated := allocated + issued;
      if nullif(b->>'productionCompletedAt','') is not null and b->>'hcpBalanceDisposition'='chiller' then
        back_to_chiller := public.halloumi_weight(b->'balanceWeightKg');
        if back_to_chiller > issued then
          warnings := warnings || jsonb_build_array('HCP batch ' || batch_id || ' return exceeds its issue; owner review required.');
          back_to_chiller := 0;
        end if;
        returned := returned + back_to_chiller;
        if back_to_chiller > 0 then
          receipts := receipts || jsonb_build_object(batch_id,jsonb_build_object('weightKg',back_to_chiller,
            'recordedAt',b->>'productionCompletedAt','recordedBy',coalesce(b->>'hcpCompletedBy',b->>'crumbingTeam','')));
        end if;
      end if;
    end loop;
    if pool->>'hcpAccountingVersion'='1' then
      legacy_stock := public.halloumi_weight(pool->'hcpLegacyStockBasisKg');
      legacy_used := public.halloumi_weight(pool->'hcpLegacyUsedKg');
      other_allocated := public.halloumi_weight(pool->'hcpOtherAllocatedKg');
    else
      -- Preserve legacy unvacuumed pool stock and unidentified old allocations
      -- explicitly. Do not rewrite old records or invent a source batch.
      legacy_stock := case when public.halloumi_weight(pool->'vacuumPacked')=0 then
        public.halloumi_weight(pool->'availableForCrumbing') + public.halloumi_weight(pool->'usedInCrumbing')
        + public.halloumi_weight(pool->'soldWeight') + public.halloumi_weight(pool->'handedOverWeight') else 0 end;
      legacy_used := greatest(0,public.halloumi_weight(pool->'usedInCrumbing') - greatest(0,allocated-returned));
      other_allocated := greatest(0,greatest(vacuumed,legacy_stock)
        - public.halloumi_weight(pool->'soldWeight') - public.halloumi_weight(pool->'handedOverWeight')
        - public.halloumi_weight(pool->'usedInCrumbing') - coalesce((pool->>'availableForCrumbing')::numeric,0));
    end if;
    stock_basis := greatest(vacuumed,legacy_stock);
    used_net := allocated-returned+legacy_used;
    available := round(stock_basis-used_net-public.halloumi_weight(pool->'soldWeight')
      -public.halloumi_weight(pool->'handedOverWeight')-other_allocated,6);
    pool := pool || jsonb_build_object('hcpAccountingVersion',1,'totalProduced',round(produced,6),'vacuumPacked',round(vacuumed,6),
      'hcpAllocatedKg',round(allocated,6),'hcpReturnedKg',round(returned,6),'usedInCrumbing',round(used_net,6),
      'hcpLegacyStockBasisKg',legacy_stock,'hcpLegacyUsedKg',legacy_used,'hcpOtherAllocatedKg',other_allocated,
      'availableForCrumbing',available,'hcpOverdrawKg',greatest(0,-available),'hcpAccountingWarnings',warnings,
      'hcpChillerReturns',receipts,'hcpChillerReturnsAppliedKg',
      (select coalesce(sum(public.halloumi_weight(value->'weightKg')),0) from jsonb_each(receipts)));
    result := result || jsonb_build_array(lot || jsonb_build_object('halloumiPool',pool));
  end loop;
  return result;
end;
$$;
revoke all on function public.reconcile_halloumi_state(jsonb,jsonb,jsonb) from public, anon, authenticated;

-- Definitions above are pure / data-neutral and may be tested before the
-- activation below. Keep rollback snapshots restricted and never overwrite.
do $activate$
declare rounds jsonb; batches jsonb;
begin
  perform set_config('lock_timeout','3s',true);
  create table if not exists public.app_state_backup_halloumi_guard_20261029 (
    key text primary key, value jsonb not null, source_version bigint not null,
    backed_up_at timestamptz not null default now(), reason text not null
  );
  alter table public.app_state_backup_halloumi_guard_20261029 enable row level security;
  revoke all on public.app_state_backup_halloumi_guard_20261029 from public, anon, authenticated;
  perform 1 from public.app_state where key in ('vejoy_milkLots','vejoy_productionRounds','vejoy_crumbingBatches') order by key for update;
  insert into public.app_state_backup_halloumi_guard_20261029 (key,value,source_version,reason)
  select key,value,version,'Owner approved Halloumi HCP reconciliation and stale-client protection; preserve all source records.'
  from public.app_state where key in ('vejoy_milkLots','vejoy_productionRounds','vejoy_crumbingBatches') on conflict(key) do nothing;
  select value into strict rounds from public.app_state where key='vejoy_productionRounds';
  select value into strict batches from public.app_state where key='vejoy_crumbingBatches';
  update public.app_state set value=public.reconcile_halloumi_state(value,rounds,batches) where key='vejoy_milkLots';
end;
$activate$;

create or replace function public.guard_halloumi_pool_state()
returns trigger language plpgsql security definer set search_path=public as $$
declare old_lot jsonb; lot jsonb; pool jsonb; before_pool jsonb; lots jsonb := '[]'::jsonb;
  rounds jsonb; batches jsonb;
begin
  if new.key <> 'vejoy_milkLots' or jsonb_typeof(new.value) <> 'array' then return new; end if;
  for lot in select value from jsonb_array_elements(new.value) loop
    if tg_op='UPDATE' then
      select value into old_lot from jsonb_array_elements(old.value) where value->>'id'=lot->>'id';
      before_pool := old_lot->'halloumiPool';
      if before_pool->>'hcpAccountingVersion'='1' then
        pool := case when jsonb_typeof(lot->'halloumiPool')='object' then lot->'halloumiPool' else before_pool end;
        -- Old tabs cannot erase or re-infer the audited legacy reservations.
        pool := pool || jsonb_build_object('hcpAccountingVersion',1,
          'hcpLegacyStockBasisKg',public.halloumi_weight(before_pool->'hcpLegacyStockBasisKg'),
          'hcpLegacyUsedKg',public.halloumi_weight(before_pool->'hcpLegacyUsedKg'),
          'hcpOtherAllocatedKg',greatest(public.halloumi_weight(before_pool->'hcpOtherAllocatedKg'),public.halloumi_weight(pool->'hcpOtherAllocatedKg')));
        lot := lot || jsonb_build_object('halloumiPool',pool);
      end if;
    end if;
    lots := lots || jsonb_build_array(lot);
  end loop;
  select value into rounds from public.app_state where key='vejoy_productionRounds';
  select value into batches from public.app_state where key='vejoy_crumbingBatches';
  new.value := public.reconcile_halloumi_state(lots,coalesce(rounds,'[]'::jsonb),coalesce(batches,'[]'::jsonb));
  return new;
end;
$$;
revoke all on function public.guard_halloumi_pool_state() from public, anon, authenticated;

create or replace function public.refresh_halloumi_pool_from_sources()
returns trigger language plpgsql security definer set search_path=public as $$
declare rounds jsonb; batches jsonb;
begin
  if new.key not in ('vejoy_productionRounds','vejoy_crumbingBatches') or (tg_op='UPDATE' and new.value=old.value) then return null; end if;
  select value into rounds from public.app_state where key='vejoy_productionRounds';
  select value into batches from public.app_state where key='vejoy_crumbingBatches';
  update public.app_state set value=public.reconcile_halloumi_state(value,coalesce(rounds,'[]'::jsonb),coalesce(batches,'[]'::jsonb)) where key='vejoy_milkLots';
  return null;
end;
$$;
revoke all on function public.refresh_halloumi_pool_from_sources() from public, anon, authenticated;

create or replace function public.guard_hcp_allocation_identity()
returns trigger language plpgsql security definer set search_path=public as $$
declare b jsonb; previous jsonb;
begin
  if new.key<>'vejoy_crumbingBatches' or jsonb_typeof(new.value)<>'array' then return new; end if;
  for b in select value from jsonb_array_elements(new.value) where value->>'type'='HCP' loop
    previous := null;
    if tg_op='UPDATE' then select value into previous from jsonb_array_elements(old.value) where value->>'id'=b->>'id'; end if;
    if previous is null and (nullif(b->>'sourceBatchId','') is null or public.halloumi_weight(b->'sourceWeightKg')<=0) then
      raise exception 'A new HCP batch requires its source Halloumi pool and a positive recorded issue weight.';
    end if;
    -- Ordinary recipe/tray/packing writes cannot alter an existing issue.
    -- Exceptional source corrections require reviewed database maintenance;
    -- they must not masquerade as another staff workflow save.
    if previous is not null and auth.uid() is not null
      and (b->'sourceBatchId' is distinct from previous->'sourceBatchId'
        or b->'sourceWeightKg' is distinct from previous->'sourceWeightKg') then
      raise exception 'HCP source/issue quantity is protected. Request an audited owner correction instead of overwriting the allocation.';
    end if;
  end loop;
  if tg_op='UPDATE' and auth.uid() is not null and exists (
    select 1 from jsonb_array_elements(old.value) o
    join jsonb_array_elements(new.value) n on n->>'id'=o->>'id'
    where o->>'type'='HCP' and n->>'type' is distinct from 'HCP'
  ) then raise exception 'An HCP allocation cannot be changed into another product type by a snapshot save.'; end if;
  return new;
end;
$$;
revoke all on function public.guard_hcp_allocation_identity() from public, anon, authenticated;

-- Alphabetically before protect_app_state_update: normalize first so a stale
-- no-op creates no false version/history event. Existing safety/audit remain.
create or replace trigger halloumi_pool_reconcile_before_write
before insert or update on public.app_state for each row execute function public.guard_halloumi_pool_state();
create or replace trigger halloumi_pool_refresh_after_source_write
after insert or update on public.app_state for each row execute function public.refresh_halloumi_pool_from_sources();
create or replace trigger hcp_allocation_identity_before_write
before insert or update on public.app_state for each row execute function public.guard_hcp_allocation_identity();
commit;
