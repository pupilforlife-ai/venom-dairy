-- Definitions only: no production data is changed by this migration.
begin;
set local lock_timeout='3s';
create or replace function public.paneer_packing_definition(sku text)
returns jsonb language sql immutable set search_path=public as $$
  select jsonb_build_object('sku',code,'productName',name,'unitWeightKg',kg,'unitsPerCase',units,'mode',mode,'type',kind,'cut',cut)
  from (values
    ('MPAN100','Malai Paneer - 1kg',1::numeric,15,'units','D',null::text),
    ('MPAN200','Malai Paneer - 200g',0.2,24,'units','D',null),
    ('VJPAN','Malai Paneer - 200g (VJ)',0.2,20,'units','D',null),
    ('MPAN400','Malai Paneer - 400g',0.4,24,'units','D',null),
    ('MPAN010','Malai Paneer - Restaurant Blocks',0.4,50,'weight_loose','D','Restaurant blocks'),
    ('MPAN101','Malai Paneer - Clear 1kg',1,15,'units','D','400g cubes'),
    ('MPAN101 SPC CUT','Malai Paneer - Clear 1kg SPC Cut',1,15,'units','D','200g cubes'),
    ('YD200','Malai Paneer - 200g (YD)',0.2,36,'units','D',null),
    ('RPAN100','Rozana Paneer - 1kg',1,15,'units','C/S',null),
    ('RPAN200','Rozana Paneer - 200g',0.2,24,'units','C/S',null),
    ('RPAN400','Rozana Paneer - 400g',0.4,24,'units','C/S',null),
    ('RPAN100 Rylands','Rozana Paneer - 1kg (Rylands)',1,15,'units','C/S',null),
    ('RPAN400 Rylands','Rozana Paneer - 400g (Rylands)',0.4,24,'units','C/S',null),
    ('RPAN010','Rozana Paneer - Restaurant Blocks',0.4,50,'weight_loose','C/S','Restaurant blocks'),
    ('RPAN101','Rozana Paneer - Clear 1kg',1,15,'units','C/S','400g cubes'),
    ('RPAN101 SPC CUT','Rozana Paneer - Clear 1kg SPC Cut',1,15,'units','C/S','200g cubes'),
    ('PAN111','PAN111 - Scramble Paneer',0,0,'weight_only','both',null)
  ) d(code,name,kg,units,mode,kind,cut)
  where code=case when upper(sku)='PAN101' then 'MPAN101'
    when upper(sku)='RPAN100 (RYLANDS)' then 'RPAN100 Rylands'
    when upper(sku)='RPAN400 (RYLANDS)' then 'RPAN400 Rylands' else sku end;
$$;

create or replace function public.paneer_packed_weight(pack jsonb)
returns numeric language plpgsql immutable set search_path=public as $$
declare d jsonb; result numeric;
begin
  d:=public.paneer_packing_definition(pack->>'sku');
  if pack ? 'weightKg' then result:=(pack->>'weightKg')::numeric;
  elsif d is null then raise exception 'Unknown existing paneer SKU: %',pack->>'sku';
  elsif d->>'mode'='weight_only' then result:=0;
  else result:=coalesce((pack->>'cases')::numeric,0)*
    (case when d->>'mode'='weight_loose' then coalesce(nullif((pack->>'caseWeightKg')::numeric,0),(d->>'unitWeightKg')::numeric*(d->>'unitsPerCase')::numeric)
      else (d->>'unitWeightKg')::numeric*(d->>'unitsPerCase')::numeric end)
    +case when d->>'mode'='weight_loose' then coalesce((pack->>'looseWeightKg')::numeric,0)
      else coalesce((pack->>'loose')::numeric,0)*(d->>'unitWeightKg')::numeric end;
  end if;
  if result<0 or result::text in ('NaN','Infinity','-Infinity') then raise exception 'Invalid packed weight'; end if;
  return result;
end;
$$;

-- Pure transition for exhaustive synthetic tests. The RPC below supplies the
-- latest locked records; no client-supplied stock totals, actor or audit time.
create or replace function public.prepare_paneer_packing(r jsonb, stocks jsonb, request jsonb, actor text, actor_role text, at_time timestamptz)
returns jsonb language plpgsql immutable set search_path=public as $$
declare d jsonb; p jsonb; old_pack jsonb; packs jsonb; s jsonb; event jsonb;
  idx integer; op text; run_id text; source_code text; c numeric; l numeric; cw numeric; lw numeric; w numeric; balance numeric;
begin
  op:=request->>'operationId';
  if nullif(op,'') is null or length(op)>120 then raise exception 'A packing operation ID is required'; end if;
  if r is null or r->>'id' is distinct from request->>'roundId' or r->>'type' not in ('D','C/S') then raise exception 'Paneer round not found'; end if;
  -- A response lost after commit can be retried without adding packing again.
  if exists(select 1 from jsonb_array_elements(coalesce(r->'historyEvents','[]'::jsonb)) e where e->>'id'='packing-op-'||op) then
    select value into p from jsonb_array_elements(r->'packedSkus') where value->>'lastSaveOperationId'=op;
    select value into s from jsonb_array_elements(stocks) where value->>'packingRunId'=p->>'packingRunId';
    return jsonb_build_object('round',r,'stock',s,'replayed',true);
  end if;
  packs:=coalesce(r->'packedSkus','[]'::jsonb);
  idx:=(request->>'packIndex')::integer;
  if idx is not null then
    if actor_role<>'owner' then raise exception 'Only the owner can correct recorded packing'; end if;
    old_pack:=packs->idx;
    if idx<0 or old_pack is null or old_pack is distinct from request->'expectedPack' then
      raise exception 'This packing entry changed. Refresh and review it before correcting'; end if;
  elsif coalesce((r->>'locked')::boolean,false) or r->>'status' not in ('cut','chiller_storage','frozen','packed') or r->>'pan111ApprovalStatus'='pending' then
    raise exception 'This round is not available for packing';
  end if;
  d:=public.paneer_packing_definition(request->>'sku');
  if d is null or (d->>'type'<>'both' and d->>'type'<>r->>'type')
    or (d->>'cut' is not null and nullif(r->>'cuttingType','') is not null and d->>'cut'<>r->>'cuttingType') then
    raise exception 'That SKU is not permitted for this paneer type or cutting option'; end if;
  if d->>'mode'='weight_only' and idx is null then raise exception 'New PAN111 must use the approval workflow'; end if;
  c:=coalesce((request->>'cases')::numeric,0); l:=coalesce((request->>'loose')::numeric,0);
  cw:=coalesce((request->>'caseWeightKg')::numeric,0); lw:=coalesce((request->>'looseWeightKg')::numeric,0);
  w:=coalesce((request->>'weightKg')::numeric,0);
  if exists(select 1 from unnest(array[c,l,cw,lw,w]) n where n<0 or n::text in ('NaN','Infinity','-Infinity'))
    or c<>trunc(c) or l<>trunc(l) then raise exception 'Enter valid non-negative quantities and whole case/packet counts'; end if;
  run_id:=coalesce(nullif(old_pack->>'packingRunId',''),'pb-'||(r->>'id')||'-'||op);
  p:=jsonb_build_object('sku',d->>'sku','cases',c,'loose',l,'packingRunId',run_id,
    'recordedBy',actor,'recordedAt',at_time,'lastSaveOperationId',op);
  if d->>'mode'='weight_loose' then
    if cw<=0 then raise exception 'Enter a positive case weight'; end if;
    p:=p||jsonb_build_object('caseWeightKg',cw,'looseWeightKg',lw);
  elsif d->>'mode'='weight_only' then
    if length(trim(coalesce(request->>'reason','')))<3 then raise exception 'A PAN111 correction reason is required'; end if;
    p:=p||jsonb_build_object('cases',0,'loose',0,'weightKg',w,'reason',request->>'reason');
  end if;
  w:=public.paneer_packed_weight(p);
  if w<=0 and idx is null then raise exception 'Enter a packed quantity'; end if;
  if idx is null then packs:=packs||jsonb_build_array(p); else packs:=jsonb_set(packs,array[idx::text],p); end if;
  balance:=round(coalesce((r->>'outputWeight')::numeric,0)-greatest(0,coalesce((r->>'sppRecordedWeight')::numeric,0))
    -(select coalesce(sum(public.paneer_packed_weight(value)),0) from jsonb_array_elements(packs)),6);
  source_code:=coalesce(nullif(r->>'batchCode',''),nullif(r->>'sourceBatchCode',''),
    (r->>'milkLotCode')||'/S'||(r->>'shiftNumber')||'/R'||(r->>'roundNumber')||'/'||(r->>'type'));
  if (select count(*) from jsonb_array_elements(stocks) x where x->>'packingRunId'=run_id)>1 then raise exception 'Duplicate stock identity requires owner review'; end if;
  select value into s from jsonb_array_elements(stocks) where value->>'packingRunId'=run_id;
  -- Support owner correction of legacy/synthetic lines without losing transfer
  -- history. Never claim a different entry with the same SKU/quantity alone.
  if s is null and idx is not null and old_pack->>'packingRunId' is null then
    select value into s from jsonb_array_elements(stocks) where value->>'packingRunId'='legacy-'||(r->>'id')||'-'||idx;
    if s is null then
      if (select count(*) from jsonb_array_elements(stocks) x where x->'sourceBatchCodes'=jsonb_build_array(source_code)
        and x->>'sku'=old_pack->>'sku' and coalesce(x->>'cases','0')=coalesce(old_pack->>'cases','0')
        and coalesce(x->>'loosePackets','0')=coalesce(old_pack->>'loose','0') and nullif(x->>'packingRunId','') is null)>1 then
        raise exception 'Ambiguous legacy stock requires owner review'; end if;
      select value into s from jsonb_array_elements(stocks) where value->'sourceBatchCodes'=jsonb_build_array(source_code)
        and value->>'sku'=old_pack->>'sku' and coalesce(value->>'cases','0')=coalesce(old_pack->>'cases','0')
        and coalesce(value->>'loosePackets','0')=coalesce(old_pack->>'loose','0') and nullif(value->>'packingRunId','') is null;
    end if;
  end if;
  if d->>'mode'<>'weight_only' or s is not null then
    if s is null and exists(select 1 from jsonb_array_elements(stocks) x where x->>'id'='fs-'||op) then
      raise exception 'Packing operation identity is already used by another stock entry'; end if;
    s:=(coalesce(s,'{}'::jsonb)-'weightKg'-'caseWeightKg'-'looseWeightKg')||jsonb_build_object(
      'id',coalesce(s->>'id','fs-'||op),'sku',d->>'sku','productName',d->>'productName','packingRunId',run_id,
      'cases',p->'cases','loosePackets',p->'loose','totalPackets',case when d->>'mode'='units' then c*(d->>'unitsPerCase')::numeric+l else 0 end,
      'storageLocation',coalesce(s->>'storageLocation','Dairy Container (Finished Stock)'),
      'status',coalesce(s->>'status','awaiting_handover'),'createdAt',coalesce(s->>'createdAt',at_time::text),
      'sourceBatchCodes',jsonb_build_array(source_code));
    if d->>'mode'='weight_loose' then s:=s||jsonb_build_object('caseWeightKg',cw,'looseWeightKg',lw);
    elsif d->>'mode'='weight_only' then s:=s||jsonb_build_object('weightKg',w); end if;
  end if;
  event:=jsonb_build_object('id','packing-op-'||op,'type',case when idx is null then 'packing_recorded' else 'packing_corrected' end,
    'stage',case when idx is null then 'Packing Recorded' else 'Packing Corrected' end,'occurredAt',at_time,'recordedBy',actor,
    'source',case when idx is null then 'workflow' else 'correction' end,
    'details',(p->>'sku')||' · '||c||' cases + '||l||' loose · '||w||' kg · Balance '||balance||' kg');
  r:=r||jsonb_build_object('packedSkus',packs,'remainingBalance',balance,
    'status',case when balance<=0 then 'packed' else r->>'status' end,
    'historyEvents',coalesce(r->'historyEvents','[]'::jsonb)||jsonb_build_array(event));
  return jsonb_build_object('round',r,'stock',s,'replayed',false);
end;
$$;

create or replace function public.commit_paneer_packing(request jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare rounds jsonb; stocks jsonb; r jsonb; s jsonb; result jsonb; actor text; actor_role text; n integer;
begin
  select username,role into actor,actor_role from public.profiles where id=auth.uid() and status='approved' and role in ('staff','admin','owner');
  if actor is null then raise exception 'Approved production access required'; end if;
  perform set_config('lock_timeout','3s',true);
  -- Ordered short locks. Both collections are committed or neither is.
  perform 1 from public.app_state where key in ('vejoy_finishedStock','vejoy_milkLots','vejoy_productionRounds') order by key for update;
  select value into strict rounds from public.app_state where key='vejoy_productionRounds';
  select value into strict stocks from public.app_state where key='vejoy_finishedStock';
  select value into strict r from jsonb_array_elements(rounds) where value->>'id'=request->>'roundId';
  result:=public.prepare_paneer_packing(r,stocks,request,actor,actor_role,now());
  if (result->>'replayed')::boolean then return result; end if;
  r:=result->'round'; s:=result->'stock';
  perform set_config('app.atomic_paneer_packing','on',true);
  update public.app_state set value=(select jsonb_agg(case when x->>'id'=r->>'id' then r else x end order by ord)
    from jsonb_array_elements(rounds) with ordinality t(x,ord)) where key='vejoy_productionRounds';
  get diagnostics n=row_count;
  if n<>1 then raise exception 'Round save was not confirmed'; end if;
  if s is not null and s<>'null'::jsonb then
    if exists(select 1 from jsonb_array_elements(stocks) x where x->>'id'=s->>'id') then
      stocks:=(select jsonb_agg(case when x->>'id'=s->>'id' then s else x end order by ord) from jsonb_array_elements(stocks) with ordinality t(x,ord));
    else stocks:=stocks||jsonb_build_array(s); end if;
    update public.app_state set value=stocks where key='vejoy_finishedStock';
    get diagnostics n=row_count;
    if n<>1 then raise exception 'Stock save was not confirmed'; end if;
  end if;
  perform set_config('app.atomic_paneer_packing','off',true);
  return result;
end;
$$;

-- Older open clients may still save whole snapshots. They must not erase or
-- change an entry saved by the atomic path when editing another round/field.
create or replace function public.guard_atomic_paneer_packing()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.key='vejoy_productionRounds' and auth.uid() is not null
    and coalesce(current_setting('app.atomic_paneer_packing',true),'off')<>'on' and exists(
      select 1 from jsonb_array_elements(old.value) r
      cross join lateral jsonb_array_elements(coalesce(r->'packedSkus','[]'::jsonb)) p
      where (p ? 'lastSaveOperationId' or p ? 'recoveredAt') and not exists(
        select 1 from jsonb_array_elements(new.value) nr
        cross join lateral jsonb_array_elements(coalesce(nr->'packedSkus','[]'::jsonb)) np
        where nr->>'id'=r->>'id' and np=p)) then
    raise exception 'Saved packing cannot be overwritten by a snapshot. Refresh and use Correct Packing.';
  end if;
  return new;
end;
$$;
create or replace trigger guard_atomic_paneer_packing before update on public.app_state
  for each row execute function public.guard_atomic_paneer_packing();
revoke all on function public.guard_atomic_paneer_packing() from public,anon,authenticated;
revoke all on function public.paneer_packing_definition(text) from public,anon,authenticated;
revoke all on function public.paneer_packed_weight(jsonb) from public,anon,authenticated;
revoke all on function public.prepare_paneer_packing(jsonb,jsonb,jsonb,text,text,timestamptz) from public,anon,authenticated;
revoke all on function public.commit_paneer_packing(jsonb) from public,anon;
grant execute on function public.commit_paneer_packing(jsonb) to authenticated;
commit;
