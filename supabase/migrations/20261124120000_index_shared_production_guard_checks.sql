-- Performance only: preserve exact validations for changed/new records and every existing guard.
-- No source records are updated by this migration.
begin;
set local lock_timeout='3s';
create or replace function public.guard_paneer_traceability()
returns trigger language plpgsql security definer set search_path=public as $$
declare previous jsonb; item jsonb; incoming jsonb; previous_by_id jsonb; replacements jsonb:='{}'::jsonb; protected_key text; old_pack jsonb; pack jsonb; packs jsonb; trace jsonb; lot jsonb; production_date text; prefix text; letter text; idx integer; has_history boolean;
begin
 if new.key='vejoy_traceability' and auth.uid() is not null and coalesce(current_setting('app.paneer_traceability',true),'off')<>'on' then raise exception 'Use the shared traceability save action';end if;
 select value into trace from public.app_state where key='vejoy_traceability';
 if tg_op='UPDATE' and auth.uid() is not null and coalesce(current_setting('app.paneer_traceability',true),'off')<>'on' then
  if new.key='vejoy_finishedStock' then
   for previous in select value from jsonb_array_elements(old.value) loop
    if previous ? 'mixedCaseId' or exists(select 1 from jsonb_each(coalesce(trace->'mixedCases','{}'::jsonb)) c cross join lateral jsonb_array_elements(coalesce(c.value->'stockLink'->'allocations','[]'::jsonb)) a where not c.value ? 'voided' and a->>'stockId'=previous->>'id') then
     select value into item from jsonb_array_elements(new.value) where value->>'id'=previous->>'id';
     foreach protected_key in array array['cases','loosePackets','totalPackets','weightKg','looseWeightKg','status','storageLocation','mixedCaseId','mixedCaseParts'] loop
      if item->protected_key is distinct from previous->protected_key then raise exception 'Mixed-case stock requires the shared handover/return action. Refresh this app before continuing';end if;
     end loop;
    end if;
   end loop;
  elsif new.key='vejoy_distributionHandovers' and exists(select 1 from jsonb_array_elements(new.value) n where not exists(select 1 from jsonb_array_elements(old.value) o where o->>'id'=n->>'id') and exists(select 1 from jsonb_each(coalesce(trace->'mixedCases','{}'::jsonb)) c where not c.value ? 'voided' and c.value->>'sku'=n->>'sku')) then
   raise exception 'Mixed-case handover requires the shared transaction. Refresh this app before continuing';
  end if;
 end if;
 if new.key<>'vejoy_productionRounds' then return new;end if;
 select coalesce(jsonb_object_agg(value->>'id',value),'{}'::jsonb) into previous_by_id from jsonb_array_elements(case when tg_op='UPDATE' then old.value else '[]'::jsonb end);
 for item in select value from jsonb_array_elements(new.value) loop
  previous:=previous_by_id->(item->>'id');
  -- An identical row cannot change labels, allocations or protected history.
  -- Validate every changed/new row below; avoid rescanning/rebuilding hundreds
  -- of unrelated historical rows for a single paneer stage/temperature save.
  if item is not distinct from previous then continue;end if;
  incoming:=item;
  if previous is not null and auth.uid() is not null and coalesce(current_setting('app.paneer_traceability',true),'off')<>'on' then
   foreach protected_key in array array['paneerAutomaticTrace','paneerBagCorrections','paneerCuttingDetails','paneerCuttingHistory','paneerTrayPackingHistory','traceabilityProductionDate'] loop
    if previous ? protected_key then
     -- Old clients that omit new metadata retain it. Explicit changes must
     -- use the audited transition, rather than overwriting an older snapshot.
     if not item ? protected_key then item:=item||jsonb_build_object(protected_key,previous->protected_key);
     elsif item->protected_key is distinct from previous->protected_key then raise exception 'Paneer traceability changed; refresh and use its audited form';end if;
    end if;
   end loop;
  end if;
  if item->>'type' in ('D','C/S') then
   packs:='[]'::jsonb;idx:=0;
   for pack in select value from jsonb_array_elements(coalesce(item->'packedSkus','[]'::jsonb)) loop
    old_pack:=previous->'packedSkus'->idx;
    -- Original packets already assigned to assembled cases cannot be reduced
    -- or changed independently of their case history, including by old clients.
    select exists(select 1 from jsonb_each(coalesce(trace->'mixedCases','{}'::jsonb)) c cross join lateral jsonb_array_elements(c.value->'parts') part
      where not c.value ? 'voided' and part->'source'->>'roundId'=item->>'id' and (part->'source'->>'packIndex')::integer=idx) into has_history;
    if has_history and (pack->'sku' is distinct from old_pack->'sku' or pack->'cases' is distinct from old_pack->'cases' or pack->'loose' is distinct from old_pack->'loose' or pack->'weightKg' is distinct from old_pack->'weightKg') then raise exception 'Packing supplies assembled cases. Cancel or review those assemblies before correcting the source';end if;
    if old_pack is not null and old_pack->>'sku'=pack->>'sku' then
     foreach protected_key in array array['packetBatchCode','caseBatchCode','traceabilityProductionDate','traceabilityPrefixVersion','traceabilityGap'] loop
      if old_pack ? protected_key then pack:=pack||jsonb_build_object(protected_key,old_pack->protected_key);end if;
     end loop;
    end if;
    if pack->>'lastSaveOperationId' is not null and pack->>'lastSaveOperationId' is distinct from old_pack->>'lastSaveOperationId' and not pack ? 'packetBatchCode' then
     production_date:=coalesce(nullif(item->'paneerAutomaticTrace'->>'productionDate',''),nullif(item->>'traceabilityProductionDate',''),nullif(trace->'lots'->(item->>'milkLotId')->'value'->>'productionDate',''));
     if production_date is null then select x.value into lot from public.app_state s cross join lateral jsonb_array_elements(case when s.key='vejoy_milkLots' then s.value else '[]'::jsonb end) x(value) where s.key='vejoy_milkLots' and x.value->>'id'=item->>'milkLotId';production_date:=lot->>'traceabilityProductionDate';end if;
     prefix:=coalesce(trace->'prefixes'->(pack->>'sku')->>'value',case pack->>'sku' when 'MPAN100' then '11' when 'MPAN200' then '12' when 'MPAN400' then '13' when 'VJPAN' then '14' when 'MPAN101' then '15' when 'MPAN101 SPC CUT' then '15' when 'MPAN010' then '16' when 'RPAN100' then '21' when 'RPAN100 Rylands' then '21' when 'RPAN200' then '22' when 'RPAN400' then '23' when 'RPAN400 Rylands' then '23' when 'RPAN101' then '25' when 'RPAN101 SPC CUT' then '25' when 'RPAN010' then '26' end);
     letter:=(array['A','B','C','D','F','G','H','J','M','N'])[(item->>'shiftNumber')::integer];
     if prefix is not null and production_date ~ '^\d{4}-\d{2}-\d{2}$' and letter is not null then
      pack:=pack||jsonb_build_object('packetBatchCode',prefix||'-'||to_char(production_date::date,'DDMM')||letter||(item->>'roundNumber'),'caseBatchCode',prefix||'-'||to_char(production_date::date,'DDMM')||letter,'traceabilityProductionDate',production_date,'traceabilityPrefixVersion','proposed-20261111-v1');
     else pack:=pack||jsonb_build_object('traceabilityGap','Confirm start of production date and SKU prefix.');end if;
    end if;
    packs:=packs||jsonb_build_array(pack);idx:=idx+1;
   end loop;
   if item ? 'packedSkus' then item:=item||jsonb_build_object('packedSkus',packs);end if;
  end if;
  if item is distinct from incoming then replacements:=replacements||jsonb_build_object(item->>'id',item);end if;
 end loop;
 if replacements<>'{}'::jsonb then
  new.value:=(select jsonb_agg(coalesce(replacements->(value->>'id'),value) order by ord) from jsonb_array_elements(new.value) with ordinality t(value,ord));
 end if;
 if tg_op='UPDATE' and auth.uid() is not null and exists(select 1 from jsonb_array_elements(old.value) o where (o ? 'paneerAutomaticTrace' or o ? 'paneerCuttingHistory' or o ? 'paneerTrayPackingHistory') and not exists(select 1 from jsonb_array_elements(new.value) n where n->>'id'=o->>'id')) then raise exception 'Audited paneer rounds cannot be removed';end if;
 return new;
end;$$;
revoke all on function public.guard_paneer_traceability() from public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.guard_ghee_af_oil_state()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r jsonb; previous jsonb; previous_by_id jsonb; field text;
begin
  if new.key<>'vejoy_productionRounds' or jsonb_typeof(new.value)<>'array' then return new;end if;
  if current_setting('app.atomic_ghee_af_oil',true)='on' then return new;end if;
  -- Index the previous collection once; preserve every existing validation.
  select coalesce(jsonb_object_agg(value->>'id',value),'{}'::jsonb) into previous_by_id from jsonb_array_elements(case when tg_op='UPDATE' then old.value else '[]'::jsonb end);
  for r in select value from jsonb_array_elements(new.value) loop
    previous:=previous_by_id->(r->>'id');
    if previous is null and r->>'type'='Ghee' and auth.uid() is not null and coalesce(current_setting('app.atomic_ghee_round',true),'off')<>'on' then raise exception 'Create Ghee rounds through the production form';end if;
    if (r->'afOilRecord' is distinct from previous->'afOilRecord') or (r->'afOilAuditHistory' is distinct from previous->'afOilAuditHistory') then
      raise exception 'AF oil confirmations and approvals require the audited AF oil form';end if;
    if previous->'afOilRecord' is not null and (r->'afOilInput' is distinct from previous->'afOilInput' or r->'expectedYield' is distinct from previous->'expectedYield') then
      raise exception 'Confirmed AF oil input cannot be overwritten by a stale save';end if;
    if previous->'afOilRecord' is not null then
      foreach field in array array['type','butterInput','actualInput','plannedInput','milkLotId','sourceCreamLotId','sourceButterLotKey'] loop
        if r->field is distinct from previous->field then raise exception 'Confirmed AF oil source and butter input are protected';end if;
      end loop;
    end if;
    if previous->>'afOilConfirmationRequired'='true' and r->'afOilConfirmationRequired' is distinct from previous->'afOilConfirmationRequired' then raise exception 'AF oil confirmation requirement cannot be removed';end if;
    if r->>'afOilConfirmationRequired'='true' and r->'afOilRecord' is null and r->>'status' not in ('scheduled','butter_selected','discarded','cancelled','spoiled') then
      raise exception 'Confirm the actual AF oil quantity before proceeding';end if;
  end loop;
  if tg_op='UPDATE' and exists(select 1 from jsonb_array_elements(old.value) o where o->'afOilRecord' is not null
    and not exists(select 1 from jsonb_array_elements(new.value) n where n->>'id'=o->>'id')) then raise exception 'Audited AF oil records cannot be removed';end if;
  return new;
end;$function$
;

CREATE OR REPLACE FUNCTION public.guard_ghee_numeric_state()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r jsonb; previous jsonb; previous_by_id jsonb; field text; fields text[]; old_pool jsonb; pool jsonb;
begin
  if auth.uid() is null or jsonb_typeof(new.value)<>'array' then return new; end if;
  if new.key='vejoy_productionRounds' then
    -- Constant-time old-row lookup; numeric/source protection is unchanged.
    select coalesce(jsonb_object_agg(value->>'id',value),'{}'::jsonb) into previous_by_id from jsonb_array_elements(case when tg_op='UPDATE' then old.value else '[]'::jsonb end);
    for r in select value from jsonb_array_elements(new.value) loop
      previous:=previous_by_id->(r->>'id');
      if previous->>'gheeInputVersion'='1' and r->>'type' is distinct from 'Ghee' then raise exception 'An audited ghee round cannot be converted into another product'; end if;
      if r->>'type' not in ('Butter','Ghee') then continue; end if;
      fields:=case when r->>'type'='Ghee' then array['butterInput','actualInput','plannedInput','afOilInput','expectedYield','butterOverdrawKg']
        else array['butterOutput','remainingBalance','usedInGhee'] end;
      foreach field in array fields loop
        if (previous is null and r ? field) or (previous is not null and r->field is distinct from previous->field) then
          if not public.valid_ghee_quantity(r->field) then
            raise exception 'Invalid % for % round %. Enter a finite non-negative number; no source balances were changed.',field,r->>'type',r->>'id';
          end if;
        end if;
      end loop;
      if r->>'type'='Ghee' and previous is null and (not public.valid_ghee_quantity(r->'butterInput') or (r->>'butterInput')::numeric<=0) then
        raise exception 'A ghee round requires a finite positive butter input';
      end if;
      if previous->>'gheeInputVersion'='1' and coalesce(current_setting('app.atomic_ghee_round',true),'off')<>'on'
        and (r->'butterInput' is distinct from previous->'butterInput' or r->'afOilInput' is distinct from previous->'afOilInput'
          or r->'butterSourceAllocations' is distinct from previous->'butterSourceAllocations' or r->'gheeInputVersion' is distinct from previous->'gheeInputVersion') then
        raise exception 'Audited ghee inputs and source allocations require a reviewed correction; refresh before saving';
      end if;
      if r->>'type'='Butter' and public.valid_ghee_quantity(previous->'usedInGhee')
        and (previous->>'usedInGhee')::numeric>coalesce((r->>'usedInGhee')::numeric,0) then
        raise exception 'Recorded butter use in ghee cannot be reset by a stale snapshot';
      end if;
    end loop;
  elsif new.key='vejoy_milkLots' then
    for r in select value from jsonb_array_elements(new.value) loop
      previous:=null;
      if tg_op='UPDATE' then select value into previous from jsonb_array_elements(old.value) where value->>'id'=r->>'id'; end if;
      pool:=r->'butterPool'; old_pool:=previous->'butterPool';
      if public.valid_ghee_quantity(old_pool->'usedInGhee') and (old_pool->>'usedInGhee')::numeric>0
        and jsonb_typeof(pool) is distinct from 'object' then raise exception 'Audited butter pool cannot be erased by a stale snapshot'; end if;
      if jsonb_typeof(pool) is distinct from 'object' then continue; end if;
      foreach field in array array['totalButterProduced','usedInGhee','usedInBlending','packedAsPubb','availableBalance'] loop
        if pool->field is distinct from old_pool->field and not public.valid_ghee_quantity(pool->field) then
          raise exception 'Invalid butter pool %; no source balances were changed',field;
        end if;
      end loop;
      if public.valid_ghee_quantity(old_pool->'usedInGhee') and (old_pool->>'usedInGhee')::numeric>coalesce((pool->>'usedInGhee')::numeric,0) then
        raise exception 'Recorded lot butter use in ghee cannot be reset by a stale snapshot';
      end if;
    end loop;
  end if;
  return new;
end;
$function$
;
commit;
