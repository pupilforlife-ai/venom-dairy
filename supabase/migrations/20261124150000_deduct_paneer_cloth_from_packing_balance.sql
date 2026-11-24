-- Definitions only. Keep gross weights, cloth, packing and all historical records intact.
-- Older open clients using the atomic packing RPC also receive the net balance.
begin;
set local lock_timeout='3s';
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
  balance:=round(coalesce((r->>'outputWeight')::numeric,0)
    -greatest(0,coalesce((r->'paneerCuttingDetails'->>'clothKg')::numeric,0))-greatest(0,coalesce((r->>'sppRecordedWeight')::numeric,0))
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

commit;
