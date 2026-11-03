-- Definitions only. No historical butter, packing or stock records are changed.
begin;
set local lock_timeout='3s';

create or replace function public.prepare_butter_pool_loss(rounds jsonb, request jsonb, actor text, actor_id uuid, at_time timestamptz)
returns jsonb language plpgsql immutable set search_path=public as $$
declare op text:=request->>'operationId'; pool_id text:=request->>'poolId'; qty numeric;
  available numeric:=0; need numeric; used numeric; r jsonb; saved jsonb; receipt jsonb;
  allocations jsonb:='[]'; updates jsonb:='{}'; first_round jsonb; expected numeric;
begin
  if jsonb_typeof(rounds) is distinct from 'array' then raise exception 'Butter records are unavailable'; end if;
  if nullif(op,'') is null or length(op)>120 or nullif(pool_id,'') is null then raise exception 'Reopen the butter loss form'; end if;
  if not public.valid_ghee_quantity(request->'quantityKg') or (request->>'quantityKg')::numeric<0.001
    or not public.valid_ghee_quantity(request->'expectedBalanceKg') then raise exception 'Enter a valid positive loss weight and source balance'; end if;
  qty:=(request->>'quantityKg')::numeric; expected:=(request->>'expectedBalanceKg')::numeric;
  if coalesce(request->>'reason','') not in ('moisture_loss','handling_loss','other') or length(trim(coalesce(request->>'note','')))<5 then
    raise exception 'Select a reason and explain the confirmed loss'; end if;
  select value->'butterLossHistory'->op into saved from jsonb_array_elements(rounds) where value->'butterLossHistory' ? op limit 1;
  if saved is not null then
    if saved->>'poolId' is distinct from pool_id or saved->'quantityKg' is distinct from request->'quantityKg'
      or saved->>'reason' is distinct from request->>'reason' or saved->>'note' is distinct from trim(request->>'note') then
      raise exception 'Loss operation ID is already used for a different entry'; end if;
    return jsonb_build_object('loss',saved,'rounds',coalesce((select jsonb_agg(value) from jsonb_array_elements(rounds)
      where coalesce(value->>'blendedPoolId','blended:'||(value->>'id'))=pool_id),'[]'::jsonb),'replayed',true);
  end if;
  for r in select value from jsonb_array_elements(rounds) where value->>'type'='Butter'
    and coalesce(nullif(value->>'blendedPoolId',''),'blended:'||(value->>'id'))=pool_id
    and (nullif(value->>'blendedPoolId','') is not null or value->>'status' in ('pubbb_pool','psbbb_pool','bb05_pool')) loop
    if r->>'status' in ('cancelled','discarded','spoiled','handed_over') then raise exception 'This pool is not available for a production loss'; end if;
    if not public.valid_ghee_quantity(r->'remainingBalance') then raise exception 'The source butter balance needs review'; end if;
    if first_round is null then first_round:=r; end if;
    available:=available+(r->>'remainingBalance')::numeric;
  end loop;
  available:=round(available,6);
  if first_round is null then raise exception 'This blended butter pool was not found'; end if;
  if abs(available-expected)>0.000001 then raise exception 'Butter balance changed. Reopen and verify the loss before saving'; end if;
  if qty>available then raise exception 'Loss cannot exceed the available butter balance'; end if;
  need:=qty;
  for r in select value from jsonb_array_elements(rounds) where value->>'type'='Butter'
    and coalesce(nullif(value->>'blendedPoolId',''),'blended:'||(value->>'id'))=pool_id loop
    exit when need<=0;
    used:=least(round((r->>'remainingBalance')::numeric,6),need);
    if used<=0 then continue; end if;
    allocations:=allocations||jsonb_build_array(jsonb_build_object('roundId',r->>'id','quantityKg',used,
      'balanceBeforeKg',(r->>'remainingBalance')::numeric,'balanceAfterKg',round((r->>'remainingBalance')::numeric-used,6)));
    updates:=updates||jsonb_build_object(r->>'id',r||jsonb_build_object('remainingBalance',round((r->>'remainingBalance')::numeric-used,6)));
    need:=round(need-used,6);
  end loop;
  receipt:=request||jsonb_build_object('note',trim(request->>'note'),'batchCode',coalesce(first_round->>'batchCode',pool_id),
    'poolSku',coalesce(first_round->>'pool','PUBBB'),'recordedAt',at_time,'recordedBy',actor,'recordedById',actor_id,
    'balanceAfterKg',round(available-qty,6),'allocations',allocations);
  select jsonb_object_agg(key,value||jsonb_build_object('butterLossHistory',coalesce(value->'butterLossHistory','{}'::jsonb)||jsonb_build_object(op,receipt)))
    into updates from jsonb_each(updates);
  return jsonb_build_object('loss',receipt,'rounds',coalesce((select jsonb_agg(value) from jsonb_each(updates)),'[]'::jsonb),'replayed',false);
end;
$$;

create or replace function public.record_butter_pool_loss(request jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text; rounds jsonb; result jsonb; n integer;
begin
  select username into actor from public.profiles where id=auth.uid() and status='approved' and role in ('owner','admin');
  if actor is null then raise exception using errcode='42501',message='Only approved Owner and Admin accounts can record butter losses'; end if;
  perform set_config('lock_timeout','3s',true);
  select value into strict rounds from public.app_state where key='vejoy_productionRounds' for update;
  result:=public.prepare_butter_pool_loss(rounds,request,actor,auth.uid(),now());
  if (result->>'replayed')::boolean then return result; end if;
  perform set_config('app.record_butter_loss','on',true);
  update public.app_state set value=(select jsonb_agg(coalesce((select u from jsonb_array_elements(result->'rounds') u where u->>'id'=r->>'id'),r) order by ord)
    from jsonb_array_elements(rounds) with ordinality t(r,ord)) where key='vejoy_productionRounds';
  get diagnostics n=row_count;
  if n<>1 then raise exception 'Butter loss save was not confirmed'; end if;
  perform set_config('app.record_butter_loss','off',true);
  return result;
end;
$$;

-- Protect loss receipts and the balance equation against older open clients.
-- Ordinary packing must consume exactly its new packed weight, even when an
-- old device started from the pre-loss balance. No stale balance resurrection.
create or replace function public.guard_butter_loss_state()
returns trigger language plpgsql security definer set search_path=public as $$
declare r jsonb; previous jsonb; field text; pool_id text; before_remaining numeric; after_remaining numeric;
  before_packed numeric; after_packed numeric;
begin
  if new.key<>'vejoy_productionRounds' or coalesce(current_setting('app.record_butter_loss',true),'off')='on' then return new; end if;
  if jsonb_typeof(new.value) is distinct from 'array' then return new; end if;
  -- Only compare audit-bearing rounds; do not add an all-rounds quadratic
  -- scan to every ordinary production save during the shift.
  for r in select value from jsonb_array_elements(new.value) where value ? 'butterLossHistory' loop
    previous:=null;
    if tg_op='UPDATE' then select value into previous from jsonb_array_elements(old.value) where value->>'id'=r->>'id'; end if;
    if coalesce(r->'butterLossHistory','{}'::jsonb) is distinct from coalesce(previous->'butterLossHistory','{}'::jsonb) then
      raise exception 'Butter loss history is protected. Use the owner/admin loss action'; end if;
  end loop;
  if tg_op<>'UPDATE' then return new; end if;
  for previous in select value from jsonb_array_elements(old.value) where coalesce(value->'butterLossHistory','{}'::jsonb)<>'{}'::jsonb loop
      select value into r from jsonb_array_elements(new.value) where value->>'id'=previous->>'id';
      if r is null then raise exception 'A butter loss source and its audit history cannot be removed'; end if;
      if r->'butterLossHistory' is distinct from previous->'butterLossHistory' then raise exception 'Butter loss history is protected. Use the owner/admin loss action'; end if;
      foreach field in array array['type','blendedPoolId','batchCode','pool','butterOutput','outputWeight','blendingInput','sourceBatchCode','milkLotId','creamLotId'] loop
        if r->field is distinct from previous->field then raise exception 'Audited butter loss source cannot be changed by a snapshot'; end if;
      end loop;
  end loop;
  for pool_id in select distinct coalesce(nullif(value->>'blendedPoolId',''),'blended:'||(value->>'id')) from jsonb_array_elements(old.value)
    where coalesce(value->'butterLossHistory','{}'::jsonb)<>'{}'::jsonb loop
    for r in select value from jsonb_array_elements(new.value) where coalesce(nullif(value->>'blendedPoolId',''),'blended:'||(value->>'id'))=pool_id loop
      if not exists(select 1 from jsonb_array_elements(old.value) x where x->>'id'=r->>'id'
        and coalesce(nullif(x->>'blendedPoolId',''),'blended:'||(x->>'id'))=pool_id) then raise exception 'A loss-audited butter pool cannot gain unrelated source rounds'; end if;
      if not public.valid_ghee_quantity(r->'remainingBalance') or (r ? 'packedButterWeight' and not public.valid_ghee_quantity(r->'packedButterWeight')) then
        raise exception 'Invalid audited butter balance or packed weight'; end if;
    end loop;
    select sum((value->>'remainingBalance')::numeric),sum(coalesce((value->>'packedButterWeight')::numeric,0)) into before_remaining,before_packed
      from jsonb_array_elements(old.value) where coalesce(nullif(value->>'blendedPoolId',''),'blended:'||(value->>'id'))=pool_id;
    select sum((value->>'remainingBalance')::numeric),sum(coalesce((value->>'packedButterWeight')::numeric,0)) into after_remaining,after_packed
      from jsonb_array_elements(new.value) where coalesce(nullif(value->>'blendedPoolId',''),'blended:'||(value->>'id'))=pool_id;
    if after_packed<before_packed or abs(after_remaining-(before_remaining-(after_packed-before_packed)))>0.000001 then
      raise exception 'Butter balance changed after a recorded loss. Refresh before packing; the loss and packing were not changed'; end if;
  end loop;
  return new;
end;
$$;
revoke all on function public.prepare_butter_pool_loss(jsonb,jsonb,text,uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.guard_butter_loss_state() from public,anon,authenticated;
revoke all on function public.record_butter_pool_loss(jsonb) from public,anon;
grant execute on function public.record_butter_pool_loss(jsonb) to authenticated;
create or replace trigger guard_butter_loss_state before insert or update on public.app_state
  for each row execute function public.guard_butter_loss_state();
commit;
