-- Additive paneer release. No collection is seeded, restored, deleted or rebuilt.
begin;
set local lock_timeout='3s';
create table if not exists public.paneer_traceability_commands (
 id text primary key,actor_id uuid not null,request jsonb not null,result jsonb,created_at timestamptz not null default now()
);
alter table public.paneer_traceability_commands enable row level security;
revoke all on public.paneer_traceability_commands from public,anon,authenticated;
grant select on public.paneer_traceability_commands to service_role;

-- Only the authenticated Edge command handler (service role) may commit a
-- prepared transition. Browser callers cannot submit arbitrary state documents.
create or replace function public.commit_paneer_traceability(actor_id uuid,command jsonb,expected jsonb,changes jsonb,command_result jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare profile record; receipt public.paneer_traceability_commands; e jsonb; row_data public.app_state; returned jsonb; command_id text;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Server command access required';end if;
 select username,role into strict profile from public.profiles where id=actor_id and status='approved' and role in ('owner','admin','staff');
 if command->>'_role' is distinct from profile.role then raise exception 'Account permissions changed; sign in again before retrying';end if;
 command_id:=command->>'id';if nullif(command_id,'') is null or length(command_id)>120 then raise exception 'A save reference is required';end if;
 perform set_config('lock_timeout','3s',true);
 perform pg_advisory_xact_lock(hashtext('paneer-traceability-commands'));
 select * into receipt from public.paneer_traceability_commands where id=command_id;
 if found then
  if receipt.actor_id<>actor_id or receipt.request<>command then raise exception 'Save reference belongs to a different request';end if;
 else
  if jsonb_typeof(expected)<>'array' or jsonb_array_length(expected)<>6 or jsonb_typeof(changes)<>'object' then raise exception 'Invalid prepared transition';end if;
  if exists(select 1 from jsonb_object_keys(changes) k where k not in ('vejoy_distributionHandovers','vejoy_finishedStock','vejoy_intermediateLots','vejoy_milkLots','vejoy_productionRounds','vejoy_traceability')) then raise exception 'Unexpected collection';end if;
  if (select count(distinct x->>'key') from jsonb_array_elements(expected) x where x->>'key' in ('vejoy_distributionHandovers','vejoy_finishedStock','vejoy_intermediateLots','vejoy_milkLots','vejoy_productionRounds','vejoy_traceability'))<>6 then raise exception 'Incomplete comparison snapshot';end if;
  perform 1 from public.app_state where key in ('vejoy_distributionHandovers','vejoy_finishedStock','vejoy_intermediateLots','vejoy_milkLots','vejoy_productionRounds','vejoy_traceability') order by key for update;
  for e in select value from jsonb_array_elements(expected) loop
   select * into row_data from public.app_state where key=e->>'key';
   if (case when found then to_jsonb(row_data.version) else 'null'::jsonb end) is distinct from e->'version' then raise exception using errcode='40001',message='Production changed; retry against the latest committed records';end if;
  end loop;
  -- Preserve profile-backed permissions and the existing safety/audit triggers.
  perform set_config('request.jwt.claim.sub',actor_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor_id,'role','authenticated')::text,true);
  perform set_config('app.paneer_traceability','on',true);
  if command->>'kind' in ('handover','intermediate_packing') then perform set_config('app.atomic_paneer_packing','on',true);end if;
  for e in select jsonb_build_object('key',key,'value',value) from jsonb_each(changes) order by key loop
   if e->>'key'<>'vejoy_traceability' and jsonb_typeof(e->'value')<>'array' then raise exception 'Operational collections must remain arrays';end if;
   if e->>'key'='vejoy_traceability' and (jsonb_typeof(e->'value')<>'object' or e->'value'->>'schema'<>'1') then raise exception 'Invalid traceability schema';end if;
   insert into public.app_state(key,value) values(e->>'key',e->'value') on conflict(key) do update set value=excluded.value where app_state.value is distinct from excluded.value;
  end loop;
  insert into public.paneer_traceability_commands(id,actor_id,request,result) values(command_id,actor_id,command,command_result);
  receipt.result:=command_result;
 end if;
 select jsonb_agg(jsonb_build_object('key',key,'value',value,'version',version) order by key) into returned from public.app_state where key in ('vejoy_distributionHandovers','vejoy_finishedStock','vejoy_intermediateLots','vejoy_milkLots','vejoy_productionRounds','vejoy_traceability');
 return jsonb_build_object('ok',true,'rows',returned,'result',receipt.result);
end;$$;
revoke all on function public.commit_paneer_traceability(uuid,jsonb,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.commit_paneer_traceability(uuid,jsonb,jsonb,jsonb,jsonb) to service_role;

create or replace function public.guard_paneer_traceability()
returns trigger language plpgsql security definer set search_path=public as $$
declare previous jsonb; item jsonb; protected_key text; merged jsonb:='[]'::jsonb; old_pack jsonb; pack jsonb; packs jsonb; trace jsonb; lot jsonb; production_date text; prefix text; letter text; idx integer; has_history boolean;
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
 for item in select value from jsonb_array_elements(new.value) loop
  select value into previous from jsonb_array_elements(case when tg_op='UPDATE' then old.value else '[]'::jsonb end) where value->>'id'=item->>'id';
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
  merged:=merged||jsonb_build_array(item);
 end loop;
 if tg_op='UPDATE' and auth.uid() is not null and exists(select 1 from jsonb_array_elements(old.value) o where (o ? 'paneerAutomaticTrace' or o ? 'paneerCuttingHistory' or o ? 'paneerTrayPackingHistory') and not exists(select 1 from jsonb_array_elements(merged) n where n->>'id'=o->>'id')) then raise exception 'Audited paneer rounds cannot be removed';end if;
 new.value:=merged;return new;
end;$$;
-- Run before the existing audit trigger, retaining every existing guard.
create or replace trigger guard_paneer_traceability before insert or update on public.app_state for each row execute function public.guard_paneer_traceability();
revoke all on function public.guard_paneer_traceability() from public,anon,authenticated;
-- Keep the existing atomic packing function and its guards intact. The wrapper
-- returns the stored, label-enriched record and copies those labels to its stock.
do $$ begin
 if to_regprocedure('public.commit_paneer_packing_before_traceability(jsonb)') is null then
  alter function public.commit_paneer_packing(jsonb) rename to commit_paneer_packing_before_traceability;
 end if;
end $$;
create or replace function public.commit_paneer_packing(request jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb; saved jsonb; pack jsonb; stock jsonb; all_stock jsonb;
begin
 result:=public.commit_paneer_packing_before_traceability(request);
 select r into saved from public.app_state s cross join lateral jsonb_array_elements(s.value) r where s.key='vejoy_productionRounds' and r->>'id'=request->>'roundId';
 select p into pack from jsonb_array_elements(saved->'packedSkus') p where p->>'lastSaveOperationId'=request->>'operationId';
 stock:=result->'stock';
 if pack is not null and stock is not null and stock<>'null'::jsonb then
  stock:=stock||(pack - array['sku','cases','loose','packingRunId','recordedBy','recordedAt','lastSaveOperationId','weightKg','caseWeightKg','looseWeightKg','reason']);
  select value into all_stock from public.app_state where key='vejoy_finishedStock';
  perform set_config('app.atomic_paneer_packing','on',true);
  update public.app_state set value=(select jsonb_agg(case when x->>'id'=stock->>'id' then stock else x end order by ord) from jsonb_array_elements(all_stock) with ordinality t(x,ord)) where key='vejoy_finishedStock' and exists(select 1 from jsonb_array_elements(all_stock) x where x->>'id'=stock->>'id' and x is distinct from stock);
 end if;
 return result||jsonb_build_object('round',saved,'stock',stock);
end;$$;
revoke all on function public.commit_paneer_packing_before_traceability(jsonb) from public,anon,authenticated;
revoke all on function public.commit_paneer_packing(jsonb) from public,anon;
grant execute on function public.commit_paneer_packing(jsonb) to authenticated;
commit;
