-- Internal cream only. Definitions do not reconcile or rewrite historical rows.
begin;
set local lock_timeout='3s';
create or replace function public.settle_late_internal_butter(rounds jsonb, source_key text, event_id text, actor text, at_time timestamptz)
returns jsonb language plpgsql immutable set search_path=public as $$
declare claim jsonb; src jsonb; original_src jsonb; updates jsonb:='{}'; additions jsonb; receipt jsonb;
  lot_id text:=substring(source_key from 6); pending numeric; needed numeric; used numeric; available numeric;
  allocated numeric; matched numeric:=0; receipt_id text;
begin
  if source_key not like 'milk:%' or nullif(lot_id,'') is null then
    return jsonb_build_object('rounds',rounds,'changedRounds','[]'::jsonb,'matchedKg',0);
  end if;
  for claim in select value from jsonb_array_elements(rounds) where value->>'type'='Ghee'
    and nullif(value->>'sourceCreamLotId','') is null and value->>'milkLotId'=lot_id
    and public.valid_ghee_quantity(value->'butterOverdrawKg') and (value->>'butterOverdrawKg')::numeric>0
    order by value->>'startTime',value->>'id' loop
    receipt_id:=event_id||':'||(claim->>'id');
    if claim->'butterSettlementHistory' ? receipt_id then continue; end if;
    pending:=(claim->>'butterOverdrawKg')::numeric;
    select coalesce(sum((value->>'quantityKg')::numeric),0) into allocated
      from jsonb_array_elements(coalesce(claim->'butterSourceAllocations','[]'::jsonb));
    if not public.valid_ghee_quantity(claim->'butterInput') or abs((claim->>'butterInput')::numeric-allocated-pending)>0.000001 then
      raise exception 'Ghee input and outstanding allocation need review for %',claim->>'id'; end if;
    needed:=pending; additions:='[]';
    for original_src in select value from jsonb_array_elements(rounds) where value->>'type'='Butter'
      and coalesce(value->>'creamSource','internal')<>'external' and value->>'milkLotId'=lot_id
      and nullif(value->>'blendedPoolId','') is null and coalesce(value->>'status','') not in ('cancelled','discarded','spoiled')
      and public.valid_ghee_quantity(value->'butterOutput') and (value->>'butterOutput')::numeric>0
      order by value->>'startTime',value->>'id' loop
      exit when needed<=0;
      src:=coalesce(updates->(original_src->>'id'),original_src);
      if not public.valid_ghee_quantity(src->'remainingBalance') then continue; end if;
      available:=(src->>'remainingBalance')::numeric; used:=least(available,needed);
      if used<=0 then continue; end if;
      additions:=additions||jsonb_build_array(jsonb_build_object('id',src->>'id','quantityKg',used));
      src:=src||jsonb_build_object('remainingBalance',round(available-used,6),
        'usedInGhee',round(coalesce((src->>'usedInGhee')::numeric,0)+used,6),'destination','ghee');
      updates:=updates||jsonb_build_object(src->>'id',src); needed:=greatest(0,round(needed-used,6));
    end loop;
    if jsonb_array_length(additions)=0 then continue; end if;
    receipt:=jsonb_build_object('id',receipt_id,'sourceKey',source_key,'recordedAt',at_time,'recordedBy',actor,
      'matchedKg',round(pending-needed,6),'pendingBeforeKg',pending,'pendingAfterKg',needed,'allocations',additions);
    claim:=claim||jsonb_build_object('butterOverdrawKg',needed,
      'butterOriginalOverdrawKg',coalesce(claim->'butterOriginalOverdrawKg',to_jsonb(pending)),
      'butterSourceAllocations',coalesce(claim->'butterSourceAllocations','[]'::jsonb)||additions,
      'butterSettlementHistory',coalesce(claim->'butterSettlementHistory','{}'::jsonb)||jsonb_build_object(receipt_id,receipt));
    updates:=updates||jsonb_build_object(claim->>'id',claim);
    for src in select updates->(value->>'id') from jsonb_array_elements(additions) loop
      updates:=updates||jsonb_build_object(src->>'id',src||jsonb_build_object('butterSettlementHistory',
        coalesce(src->'butterSettlementHistory','{}'::jsonb)||jsonb_build_object(receipt_id,receipt)));
    end loop;
    matched:=matched+pending-needed;
  end loop;
  return jsonb_build_object('rounds',(select coalesce(jsonb_agg(coalesce(updates->(r->>'id'),r) order by ord),'[]'::jsonb)
    from jsonb_array_elements(rounds) with ordinality t(r,ord)),
    'changedRounds',coalesce((select jsonb_agg(value) from jsonb_each(updates)),'[]'::jsonb),'matchedKg',round(matched,6));
end;
$$;

create or replace function public.sync_internal_butter_pool(lot jsonb, rounds jsonb)
returns jsonb language plpgsql immutable set search_path=public as $$
declare produced numeric; available numeric; pending numeric; consumed numeric; pool jsonb;
begin
  select coalesce(sum((r->>'butterOutput')::numeric),0),coalesce(sum(case when public.valid_ghee_quantity(r->'remainingBalance') then (r->>'remainingBalance')::numeric else 0 end),0)
    into produced,available from jsonb_array_elements(rounds) r where r->>'type'='Butter'
    and r->>'milkLotId'=lot->>'id' and coalesce(r->>'creamSource','internal')<>'external' and nullif(r->>'blendedPoolId','') is null
    and coalesce(r->>'status','') not in ('cancelled','discarded','spoiled') and public.valid_ghee_quantity(r->'butterOutput');
  select coalesce(sum(case when public.valid_ghee_quantity(r->'butterOverdrawKg') then (r->>'butterOverdrawKg')::numeric else 0 end),0),
    coalesce(sum(case when public.valid_ghee_quantity(r->'butterInput') then (r->>'butterInput')::numeric else 0 end),0)
    into pending,consumed from jsonb_array_elements(rounds) r where r->>'type'='Ghee' and r->>'milkLotId'=lot->>'id'
    and nullif(r->>'sourceCreamLotId','') is null;
  pool:=coalesce(lot->'butterPool',jsonb_build_object('batchId','BUT-'||(lot->>'lotCode'),'sourceCreamBatchId','CRM-'||(lot->>'lotCode'),
    'milkLotId',lot->>'id','usedInBlending',0,'packedAsPubb',0));
  return lot||jsonb_build_object('butterPool',pool||jsonb_build_object('totalButterProduced',round(produced,6),'usedInGhee',round(consumed,6),
    'availableBalance',greatest(0,round(available-pending,6)),'lateButterAccountingVersion',1,
    'roundsContributed',coalesce(pool->'roundsContributed','[]'::jsonb)||coalesce((select jsonb_agg(r->>'id' order by r->>'startTime',r->>'id') from jsonb_array_elements(rounds) r
      where r->>'type'='Butter' and r->>'milkLotId'=lot->>'id' and coalesce(r->>'creamSource','internal')<>'external'
      and nullif(r->>'blendedPoolId','') is null and public.valid_ghee_quantity(r->'butterOutput') and (r->>'butterOutput')::numeric>0
      and not coalesce(pool->'roundsContributed','[]'::jsonb) ? (r->>'id')),'[]'::jsonb)));
end;
$$;

-- Keep the existing creation arithmetic; prepend settlement of OLD internal
-- claims before a NEW ghee round can claim the same butter.
do $copy$
begin
  if to_regprocedure('public.prepare_ghee_round_without_late_settlement(jsonb,jsonb,jsonb,jsonb,text,timestamptz)') is null then
    execute replace(pg_get_functiondef('public.prepare_ghee_round(jsonb,jsonb,jsonb,jsonb,text,timestamptz)'::regprocedure),
      'public.prepare_ghee_round(','public.prepare_ghee_round_without_late_settlement(');
  end if;
end;
$copy$;
create or replace function public.prepare_ghee_round(rounds jsonb,lots jsonb,creams jsonb,request jsonb,actor text,at_time timestamptz)
returns jsonb language plpgsql immutable set search_path=public as $$
declare original jsonb:=rounds; settled jsonb; result jsonb; lot jsonb; source_key text:=request->>'butterSource';
begin
  if source_key like 'milk:%' and not exists(select 1 from jsonb_array_elements(rounds) r where r->>'id'='ghee-'||(request->>'operationId')) then
    settled:=public.settle_late_internal_butter(rounds,source_key,'before-ghee-'||(request->>'operationId'),actor,at_time);
    rounds:=settled->'rounds';
    select value into lot from jsonb_array_elements(lots) where value->>'id'=substring(source_key from 6);
    if lot is not null then
      lot:=public.sync_internal_butter_pool(lot,rounds);
      lots:=(select jsonb_agg(case when r->>'id'=lot->>'id' then lot else r end order by ord) from jsonb_array_elements(lots) with ordinality t(r,ord));
    end if;
  end if;
  result:=public.prepare_ghee_round_without_late_settlement(rounds,lots,creams,request,actor,at_time);
  if not (result->>'replayed')::boolean then
    result:=result||jsonb_build_object('sourceRounds',coalesce((select jsonb_agg(r) from jsonb_array_elements(result->'rounds') r
      where r->>'id'<>(result#>>'{round,id}') and exists(select 1 from jsonb_array_elements(original) old_r where old_r->>'id'=r->>'id' and old_r<>r)),'[]'::jsonb));
  end if;
  return result;
end;
$$;

create or replace function public.record_butter_output(request jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text; rounds jsonb; original jsonb; source jsonb; output_round jsonb; lot jsonb; result jsonb; settled jsonb;
  op text:=request->>'operationId'; source_key text; changed jsonb; n integer;
begin
  select username into actor from public.profiles where id=auth.uid() and status='approved' and role in ('staff','admin','owner');
  if actor is null then raise exception using errcode='42501',message='Approved production access required'; end if;
  if nullif(op,'') is null or length(op)>120 then raise exception 'A butter output operation ID is required'; end if;
  if not public.valid_ghee_quantity(request->'butterOutput') or (request->>'butterOutput')::numeric<=0
    or not public.valid_ghee_quantity(request->'buttermilkOutput') then raise exception 'Enter valid butter and buttermilk outputs'; end if;
  perform set_config('lock_timeout','3s',true);
  perform 1 from public.app_state where key in ('vejoy_milkLots','vejoy_productionRounds') order by key for update;
  select value into strict rounds from public.app_state where key='vejoy_productionRounds'; original:=rounds;
  select value into source from jsonb_array_elements(rounds) where value->>'id'=request->>'roundId';
  if source is null or source->>'type'<>'Butter' or nullif(source->>'blendedPoolId','') is not null then raise exception 'Select a cream-to-butter round'; end if;
  source_key:=case when source->>'creamSource'='external' then 'cream:'||(source->>'creamLotId') else 'milk:'||(source->>'milkLotId') end;
  if source->>'creamSource'<>'external' or source->>'creamSource' is null then
    select x into lot from public.app_state s cross join lateral jsonb_array_elements(s.value) x where s.key='vejoy_milkLots' and x->>'id'=source->>'milkLotId';
    if lot is null then raise exception 'The internal butter milk lot was not found'; end if;
  end if;
  if source->>'butterOutputOperationId'=op then
    if source->'butterOutput'<>request->'butterOutput' or source->'buttermilkOutput'<>request->'buttermilkOutput' then raise exception 'This output operation ID was used for different quantities'; end if;
    return jsonb_build_object('round',source,'changedRounds',jsonb_build_array(source),'milkLot',lot,'matchedKg',0,'replayed',true);
  end if;
  if coalesce((source->>'butterOutput')::numeric,0)>0 or source->>'status' not in ('scheduled','churning') then
    raise exception 'This butter output is already recorded or the round is not awaiting output. Review its existing record'; end if;
  source:=source||jsonb_build_object('butterOutput',request->'butterOutput','buttermilkOutput',request->'buttermilkOutput',
    'remainingBalance',request->'butterOutput','status','churned','butterOutputOperationId',op,'butterOutputRecordedAt',now(),'butterOutputRecordedBy',actor,
    'butterPoolId',case when lot is null then 'direct:external:'||coalesce(source->>'sourceBatchCode',source->>'creamLotId') else 'direct:internal:'||(lot->>'id') end);
  rounds:=(select jsonb_agg(case when r->>'id'=source->>'id' then source else r end order by ord) from jsonb_array_elements(rounds) with ordinality t(r,ord));
  -- External cream is explicitly excluded from automatic reconciliation.
  settled:=public.settle_late_internal_butter(rounds,source_key,'butter-output-'||op,actor,now()); rounds:=settled->'rounds';
  perform set_config('app.atomic_ghee_round','on',true);
  update public.app_state set value=rounds where key='vejoy_productionRounds';
  get diagnostics n=row_count; if n<>1 then raise exception 'Butter output save was not confirmed'; end if;
  if lot is not null then
    lot:=public.sync_internal_butter_pool(lot,rounds);
    update public.app_state set value=(select jsonb_agg(case when r->>'id'=lot->>'id' then lot else r end order by ord) from jsonb_array_elements(value) with ordinality t(r,ord)) where key='vejoy_milkLots';
    get diagnostics n=row_count; if n<>1 then raise exception 'Butter pool save was not confirmed'; end if;
  end if;
  perform set_config('app.atomic_ghee_round','off',true);
  select value into output_round from jsonb_array_elements(rounds) where value->>'id'=source->>'id';
  select jsonb_agg(r) into changed from jsonb_array_elements(rounds) r where exists(select 1 from jsonb_array_elements(original) old_r where old_r->>'id'=r->>'id' and old_r<>r);
  return jsonb_build_object('round',output_round,'changedRounds',coalesce(changed,'[]'::jsonb),'milkLot',lot,'matchedKg',settled->'matchedKg','replayed',false);
end;
$$;

-- Ledger protection applies even to older open clients. Only atomic server
-- actions may add settlement receipts or alter their allocation history.
create or replace function public.enforce_late_butter_accounting()
returns trigger language plpgsql security definer set search_path=public as $$
declare r jsonb; previous jsonb; field text; sources jsonb; pool jsonb; previous_pool jsonb; max_remaining numeric;
begin
  if jsonb_typeof(new.value) is distinct from 'array' then return new; end if;
  if new.key='vejoy_productionRounds' and coalesce(current_setting('app.atomic_ghee_round',true),'off')<>'on' then
    for r in select value from jsonb_array_elements(new.value) where value ? 'butterSettlementHistory' loop
      previous:=null; if tg_op='UPDATE' then select value into previous from jsonb_array_elements(old.value) where value->>'id'=r->>'id'; end if;
      if r->'butterSettlementHistory' is distinct from previous->'butterSettlementHistory' then raise exception 'Late-butter allocation history is protected. Refresh the production board'; end if;
    end loop;
    if tg_op='UPDATE' then
      for previous in select value from jsonb_array_elements(old.value) where value ? 'butterSettlementHistory' loop
        select value into r from jsonb_array_elements(new.value) where value->>'id'=previous->>'id';
        if r is null or r->'butterSettlementHistory' is distinct from previous->'butterSettlementHistory' then raise exception 'Late-butter allocation history cannot be removed'; end if;
        foreach field in array array['type','milkLotId','creamSource','creamLotId','sourceCreamLotId','sourceButterLotKey','blendedPoolId','butterOriginalOverdrawKg'] loop
          if r->field is distinct from previous->field then raise exception 'Late-butter source identity is protected'; end if;
        end loop;
        if previous->>'type'='Ghee' and r->'butterOverdrawKg' is distinct from previous->'butterOverdrawKg' then raise exception 'Outstanding ghee allocation cannot be reset by a stale snapshot'; end if;
        if previous->>'type'='Ghee' and r->'butterSourceAllocations' is distinct from previous->'butterSourceAllocations' then raise exception 'Late-butter source allocations are protected'; end if;
        if previous->>'type'='Butter' then
          max_remaining:=coalesce((previous->>'remainingBalance')::numeric,0)
            +coalesce((r->>'butterOutput')::numeric,0)-coalesce((previous->>'butterOutput')::numeric,0)
            -(coalesce((r->>'usedInGhee')::numeric,0)-coalesce((previous->>'usedInGhee')::numeric,0));
          if not public.valid_ghee_quantity(r->'remainingBalance') or (r->>'remainingBalance')::numeric>max_remaining+0.000001 then
            raise exception 'Butter already matched to ghee cannot become available again. Refresh before saving'; end if;
        end if;
      end loop;
    end if;
  elsif new.key='vejoy_milkLots' then
    select value into sources from public.app_state where key='vejoy_productionRounds';
    for r in select value from jsonb_array_elements(new.value) loop
      previous:=null; if tg_op='UPDATE' then select value into previous from jsonb_array_elements(old.value) where value->>'id'=r->>'id'; end if;
      pool:=r->'butterPool'; previous_pool:=previous->'butterPool';
      if pool->>'lateButterAccountingVersion'='1' or previous_pool->>'lateButterAccountingVersion'='1' then
        if jsonb_typeof(pool) is distinct from 'object' then r:=r||jsonb_build_object('butterPool',previous_pool); end if;
        r:=public.sync_internal_butter_pool(r,coalesce(sources,'[]'::jsonb));
        new.value:=(select jsonb_agg(case when x->>'id'=r->>'id' then r else x end order by ord) from jsonb_array_elements(new.value) with ordinality t(x,ord));
      end if;
    end loop;
  end if;
  return new;
end;
$$;
create or replace trigger enforce_late_butter_accounting before insert or update on public.app_state for each row execute function public.enforce_late_butter_accounting();
revoke all on function public.settle_late_internal_butter(jsonb,text,text,text,timestamptz) from public,anon,authenticated;
revoke all on function public.sync_internal_butter_pool(jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.prepare_ghee_round_without_late_settlement(jsonb,jsonb,jsonb,jsonb,text,timestamptz) from public,anon,authenticated;
revoke all on function public.enforce_late_butter_accounting() from public,anon,authenticated;
revoke all on function public.record_butter_output(jsonb) from public,anon;
grant execute on function public.record_butter_output(jsonb) to authenticated;
commit;
