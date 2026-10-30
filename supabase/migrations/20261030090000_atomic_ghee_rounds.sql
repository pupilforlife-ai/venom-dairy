-- Pure transition plus approved-user RPC. Definitions only; no data rewrite.
begin;
set local lock_timeout='3s';
create or replace function public.prepare_ghee_round(rounds jsonb,lots jsonb,creams jsonb,request jsonb,actor text,at_time timestamptz)
returns jsonb language plpgsql immutable set search_path=public as $$
declare source_type text; source_id text; label text; op text; date_value date; date_text text;
  lot jsonb; cream jsonb; r jsonb; created jsonb; source_updates jsonb:='{}'; allocations jsonb:='[]'; warnings jsonb:='[]';
  input_kg numeric; need numeric; available numeric; used numeric; covered numeric:=0; af numeric; n integer;
  pool jsonb; ghee_pool jsonb;
begin
  if not public.valid_ghee_quantity(request->'butterInput') or (request->>'butterInput')::numeric<=0 then
    raise exception 'Enter a finite positive butter input'; end if;
  input_kg:=(request->>'butterInput')::numeric;
  op:=request->>'operationId';
  if nullif(op,'') is null or length(op)>120 then raise exception 'A ghee operation ID is required'; end if;
  source_type:=split_part(request->>'butterSource',':',1); source_id:=split_part(request->>'butterSource',':',2);
  if source_type='milk' then
    select value into lot from jsonb_array_elements(lots) where value->>'id'=source_id;
    label:=lot->>'lotCode';
  elsif source_type='cream' then
    select value into cream from jsonb_array_elements(creams) where value->>'id'=source_id;
    label:=cream->>'lotCode';
  else raise exception 'Select a valid milk or purchased cream source'; end if;
  if nullif(label,'') is null then raise exception 'The selected source lot was not found'; end if;
  date_text:=request->>'roundDate'; date_value:=date_text::date;
  if date_value is null or to_char(date_value,'YYYY-MM-DD')<>date_text then raise exception 'Select a valid production date'; end if;
  select value into created from jsonb_array_elements(rounds) where value->>'id'='ghee-'||op;
  if created is not null then
    if created->>'type'<>'Ghee' or created->>'gheeOperationId'<>op or created->'butterInput'<>request->'butterInput'
      or created->>'sourceButterLotKey'<>request->>'butterSource' then raise exception 'Ghee operation identity is already in use'; end if;
    return jsonb_build_object('round',created,'rounds',rounds,'milkLot',lot,'sourceRounds','[]'::jsonb,'replayed',true);
  end if;
  need:=input_kg;
  for r in select value from jsonb_array_elements(rounds) where value->>'type'='Butter'
    and public.valid_ghee_quantity(value->'butterOutput') and (value->>'butterOutput')::numeric>0
    and nullif(value->>'blendedPoolId','') is null and coalesce(value->>'status','') not in ('cancelled','spoiled','discarded')
    and (case when source_type='cream' then value->>'creamSource'='external' and value->>'creamLotId'=source_id
      else coalesce(value->>'creamSource','internal')<>'external' and value->>'milkLotId'=source_id end) loop
    exit when need<=0;
    if not public.valid_ghee_quantity(r->'remainingBalance') then
      warnings:=warnings||jsonb_build_array('Missing/invalid source balance: '||(r->>'id')); continue;
    end if;
    available:=(r->>'remainingBalance')::numeric; used:=least(available,need);
    if used<=0 then continue; end if;
    r:=r||jsonb_build_object('remainingBalance',round(available-used,6),'usedInGhee',
      round(coalesce((r->>'usedInGhee')::numeric,0)+used,6),'destination','ghee');
    source_updates:=source_updates||jsonb_build_object(r->>'id',r);
    allocations:=allocations||jsonb_build_array(jsonb_build_object('id',r->>'id','quantityKg',used));
    need:=round(need-used,6); covered:=covered+used;
  end loop;
  select coalesce(max((x->>'roundNumber')::integer),0)+1 into n from jsonb_array_elements(rounds) x
    where x->>'type'='Ghee' and coalesce(x->>'roundDate',left(x->>'startTime',10))=date_text
      and (case when source_type='milk' then x->>'milkLotId'=source_id else x->>'sourceCreamLotId'=source_id end);
  af:=round(input_kg*12.5/92.5,6);
  created:=jsonb_build_object('id','ghee-'||op,'gheeOperationId',op,'gheeInputVersion',1,
    'sourceButterLotKey',request->>'butterSource','milkLotId',coalesce(lot->>'id',''),'milkLotCode',coalesce(lot->>'lotCode',''),
    'roundDate',date_text,'shiftId','ghee-'||date_text||'-'||source_type||'-'||source_id,'shiftNumber',0,'roundNumber',n,
    'type','Ghee','status','butter_selected','team',coalesce((select jsonb_agg(trim(t)) from unnest(string_to_array(coalesce(request->>'team',''),',')) t where trim(t)<>''),'[]'::jsonb),
    'plannedInput',input_kg,'actualInput',input_kg,'butterInput',input_kg,'afOilInput',af,'expectedYield',round((input_kg+af)*0.7,6),
    'outputWeight',0,'remainingBalance',0,'locked',false,'startTime',at_time,
    'butterOverdrawKg',need,'butterSourceAllocations',allocations,'butterBalanceWarnings',warnings,
    'batchCode',case when source_type='milk' then 'GHEE-'||to_char(date_value,'DDMMYY') else 'GHEE-'||label end,
    'sourceBatchCode','BUT-'||label,'historyEvents',jsonb_build_array(jsonb_build_object('id','ghee-created-'||op,
      'type','ghee_input_recorded','stage','Butter Selected','occurredAt',at_time,'recordedBy',actor,'source','workflow',
      'details',input_kg||' kg butter + '||af||' kg AF oil; source allocation '||covered||' kg; overdraw '||need||' kg.')));
  if source_type='cream' then created:=created||jsonb_build_object('sourceCreamLotId',source_id); end if;
  if need>0 then created:=jsonb_set(created,'{historyEvents}',(created->'historyEvents')||jsonb_build_array(jsonb_build_object(
    'id','ghee-overdraw-'||op,'type','butter_balance_overdraw','stage','Butter balance review','occurredAt',at_time,
    'recordedBy',actor,'source','override','details',need||' kg above recorded source balance. Physical production retained for review.'))); end if;
  rounds:=(select jsonb_agg(coalesce(source_updates->(x->>'id'),x) order by ord) from jsonb_array_elements(rounds) with ordinality t(x,ord));
  rounds:=coalesce(rounds,'[]'::jsonb)||jsonb_build_array(created);
  if lot is not null then
    pool:=coalesce(lot->'butterPool',jsonb_build_object('batchId','BUT-'||label,'sourceCreamBatchId','CRM-'||label,
      'milkLotId',source_id,'totalButterProduced',0,'usedInGhee',0,'usedInBlending',0,'packedAsPubb',0,'availableBalance',0,'roundsContributed','[]'::jsonb));
    if not public.valid_ghee_quantity(pool->'usedInGhee') or not public.valid_ghee_quantity(pool->'availableBalance') then
      raise exception 'Source butter pool quantities need review; no production records changed'; end if;
    pool:=pool||jsonb_build_object('usedInGhee',round((pool->>'usedInGhee')::numeric+input_kg,6),
      'availableBalance',greatest(0,round((pool->>'availableBalance')::numeric-input_kg,6)));
    ghee_pool:=coalesce(lot->'gheePool',jsonb_build_object('batchId','GHEE-'||label,'sourceButterBatchId','BUT-'||label,
      'milkLotId',source_id,'totalGheeProduced',0,'packedWeight',0,'availableBalance',0,'roundsContributed','[]'::jsonb));
    lot:=lot||jsonb_build_object('butterPool',pool,'gheePool',ghee_pool);
  end if;
  return jsonb_build_object('round',created,'rounds',rounds,'milkLot',lot,
    'sourceRounds',coalesce((select jsonb_agg(value) from jsonb_each(source_updates)),'[]'::jsonb),'replayed',false);
end;
$$;

create or replace function public.create_ghee_round(request jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare rounds jsonb; lots jsonb; creams jsonb; result jsonb; lot jsonb; actor text; n integer;
begin
  select username into actor from public.profiles where id=auth.uid() and status='approved' and role in ('staff','admin','owner');
  if actor is null then raise exception 'Approved production access required'; end if;
  perform set_config('lock_timeout','3s',true);
  perform 1 from public.app_state where key in ('vejoy_creamLots','vejoy_milkLots','vejoy_productionRounds') order by key for update;
  select value into strict rounds from public.app_state where key='vejoy_productionRounds';
  select value into strict lots from public.app_state where key='vejoy_milkLots';
  select value into creams from public.app_state where key='vejoy_creamLots';
  result:=public.prepare_ghee_round(rounds,lots,coalesce(creams,'[]'::jsonb),request,actor,now());
  if (result->>'replayed')::boolean then return result-'rounds'; end if;
  perform set_config('app.atomic_ghee_round','on',true);
  update public.app_state set value=result->'rounds' where key='vejoy_productionRounds';
  get diagnostics n=row_count;
  if n<>1 then raise exception 'Ghee/source round save was not confirmed'; end if;
  lot:=result->'milkLot';
  if lot is not null and lot<>'null'::jsonb then
    update public.app_state set value=(select jsonb_agg(case when x->>'id'=lot->>'id' then lot else x end order by ord)
      from jsonb_array_elements(value) with ordinality t(x,ord)) where key='vejoy_milkLots';
    get diagnostics n=row_count;
    if n<>1 then raise exception 'Butter pool save was not confirmed'; end if;
  end if;
  perform set_config('app.atomic_ghee_round','off',true);
  return result-'rounds';
end;
$$;
revoke all on function public.prepare_ghee_round(jsonb,jsonb,jsonb,jsonb,text,timestamptz) from public,anon,authenticated;
revoke all on function public.create_ghee_round(jsonb) from public,anon;
grant execute on function public.create_ghee_round(jsonb) to authenticated;
commit;
