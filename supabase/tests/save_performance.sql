CREATE OR REPLACE FUNCTION pg_temp.original_late_butter_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    select value into sources from pg_temp.state_test where key='vejoy_productionRounds';
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
create temporary table late_before (key text,value jsonb);
create temporary table late_after (like late_before);
create trigger original_guard before update on late_before for each row execute function pg_temp.original_late_butter_guard();
create trigger optimized_guard before update on late_after for each row execute function pg_temp.enforce_late_butter_accounting();
do $$ declare baseline jsonb; candidate jsonb; outcome_before text; outcome_after text; trial integer;
begin
 perform set_config('app.atomic_ghee_round','off',true);
 baseline:='[{"id":"b","type":"Butter","milkLotId":"lot","creamSource":"internal","butterOutput":30,"usedInGhee":20,"remainingBalance":10,"butterSettlementHistory":{"event":{"matchedKg":20}}},{"id":"g","type":"Ghee","milkLotId":"lot","butterOverdrawKg":5,"butterSourceAllocations":[{"id":"b","quantityKg":20}],"butterSettlementHistory":{"event":{"matchedKg":20}}},{"id":"p","type":"D","notes":"Original"}]';
 for trial in 1..10 loop
  candidate:=case trial
   when 1 then jsonb_set(baseline,'{2,notes}','"Staff paneer update"')
   when 2 then jsonb_set(baseline,'{0,butterSettlementHistory}','{"changed":true}')
   when 3 then jsonb_set(baseline,'{0}',(baseline->0)-'butterSettlementHistory')
   when 4 then baseline-0
   when 5 then jsonb_set(baseline,'{0,remainingBalance}','11')
   when 6 then jsonb_set(baseline,'{0,milkLotId}','"other"')
   when 7 then jsonb_set(baseline,'{1,butterOverdrawKg}','0')
   when 8 then jsonb_set(baseline,'{2,butterSettlementHistory}','{"invented":true}')
   when 9 then jsonb_set(jsonb_set(baseline,'{0,butterOutput}','32'),'{0,remainingBalance}','12')
   else jsonb_build_array(baseline->2,baseline->1,baseline->0) end;
  delete from late_before;delete from late_after;
  insert into late_before values('vejoy_productionRounds',baseline);insert into late_after values('vejoy_productionRounds',baseline);
  outcome_before:='accepted';outcome_after:='accepted';
  begin update late_before set value=candidate;exception when others then outcome_before:=sqlerrm;end;
  begin update late_after set value=candidate;exception when others then outcome_after:=sqlerrm;end;
  if outcome_before is distinct from outcome_after then raise exception 'Guard behavior changed for scenario %: % versus %',trial,outcome_before,outcome_after;end if;
  if trial in (1,9,10) and outcome_after<>'accepted' then raise exception 'Valid unchanged/source-balanced save rejected';end if;
  if trial between 2 and 8 and outcome_after='accepted' then raise exception 'Unsafe source/history change accepted';end if;
 end loop;
end;$$;
select 'Original and optimized late-butter guard decisions match in all ten safety scenarios' as result;
