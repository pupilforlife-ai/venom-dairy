-- Index only existing audit lookups; preserve every allocation and source protection.
-- No production records are changed by this definition-only migration.
begin;
set local lock_timeout='3s';
CREATE OR REPLACE FUNCTION public.enforce_late_butter_accounting()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r jsonb; previous jsonb; field text; sources jsonb; pool jsonb; previous_pool jsonb; max_remaining numeric; old_by_id jsonb; incoming_by_id jsonb;
begin
  if jsonb_typeof(new.value) is distinct from 'array' then return new; end if;
  if new.key='vejoy_productionRounds' and coalesce(current_setting('app.atomic_ghee_round',true),'off')<>'on' then
    select coalesce(jsonb_object_agg(value->>'id',value),'{}'::jsonb) into old_by_id
      from jsonb_array_elements(case when tg_op='UPDATE' then old.value else '[]'::jsonb end) where value ? 'butterSettlementHistory';
    select coalesce(jsonb_object_agg(value->>'id',value),'{}'::jsonb) into incoming_by_id
      from jsonb_array_elements(new.value) where value ? 'butterSettlementHistory' or old_by_id ? (value->>'id');
    for r in select value from jsonb_array_elements(new.value) where value ? 'butterSettlementHistory' loop
      previous:=old_by_id->(r->>'id');
      if r->'butterSettlementHistory' is distinct from previous->'butterSettlementHistory' then raise exception 'Late-butter allocation history is protected. Refresh the production board'; end if;
    end loop;
    if tg_op='UPDATE' then
      for previous in select value from jsonb_array_elements(old.value) where value ? 'butterSettlementHistory' loop
        r:=incoming_by_id->(previous->>'id');
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
$function$
;
commit;
