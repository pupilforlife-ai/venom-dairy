-- Owner confirmed 287.7 kg butter and two ghee inputs of 92.5 kg each.
-- Recover quantities only. Preserve round IDs, progress, output and packing.
begin;
set local lock_timeout='3s';
do $repair$
declare rounds jsonb; lots jsonb; r jsonb; lot jsonb; b jsonb; g jsonb;
  source_ids text[]:=array['pr-1793202566133','pr-1793202657977','pr-1793273428502','pr-1793273444784','pr-1793273463200','pr-1793273487900','pr-1793273503400','pr-1793273521083','pr-1793273539215'];
  ghee_ids text[]:=array['pr-1793298032031','pr-1793298064945'];
  updates jsonb:='{}'; balances jsonb:='{}'; allocations jsonb; need numeric; available numeric; used numeric; id text;
begin
  perform 1 from public.app_state where key in ('vejoy_milkLots','vejoy_productionRounds') order by key for update;
  select value into strict rounds from public.app_state where key='vejoy_productionRounds';
  select value into strict lots from public.app_state where key='vejoy_milkLots';
  select value into strict lot from jsonb_array_elements(lots) where value->>'id'='ml-1792993001303' and value->>'lotCode'='261026';
  if (select count(*) from jsonb_array_elements(rounds) x where x->>'type'='Butter' and x->>'milkLotId'=lot->>'id')<>9
    or (select count(*) from jsonb_array_elements(rounds) x where x->>'type'='Ghee' and x->>'milkLotId'=lot->>'id')<>2
    or (select count(*) from jsonb_array_elements(rounds) x where x->>'id'=any(source_ids) and x->>'type'='Butter'
      and x->>'milkLotId'=lot->>'id' and x->'remainingBalance'='null'::jsonb and x->'usedInGhee'='null'::jsonb
      and nullif(x->>'blendedPoolId','') is null and coalesce(jsonb_array_length(x->'packedSkus'),0)=0)<>9
    or abs((select sum((x->>'butterOutput')::numeric) from jsonb_array_elements(rounds) x where x->>'id'=any(source_ids))-287.7)>0.000001
    or (select count(*) from jsonb_array_elements(rounds) x where x->>'id'=any(ghee_ids) and x->>'type'='Ghee'
      and x->>'milkLotId'=lot->>'id' and x->>'status'='supervisor_check' and coalesce(jsonb_array_length(x->'packedSkus'),0)=0)<>2
    or (select x->'butterInput' from jsonb_array_elements(rounds) x where x->>'id'=ghee_ids[1])<>'null'::jsonb
    or (select (x->>'butterInput')::numeric from jsonb_array_elements(rounds) x where x->>'id'=ghee_ids[2])<>92.5
    or coalesce((lot#>>'{butterPool,usedInBlending}')::numeric,0)<>0
    or coalesce((lot#>>'{butterPool,packedAsPubb}')::numeric,0)<>0 then
    raise exception 'Reviewed source records changed; abort and inspect before repairing';
  end if;
  create table public.app_state_backup_261026_ghee_20261030 as
    select key,value,version as source_version,now() as backed_up_at from public.app_state where key in ('vejoy_milkLots','vejoy_productionRounds');
  alter table public.app_state_backup_261026_ghee_20261030 enable row level security;
  revoke all on public.app_state_backup_261026_ghee_20261030 from public,anon,authenticated;
  foreach id in array source_ids loop
    select value into strict b from jsonb_array_elements(rounds) where value->>'id'=id;
    balances:=balances||jsonb_build_object(id,(b->>'butterOutput')::numeric);
  end loop;
  foreach id in array ghee_ids loop
    select value into strict g from jsonb_array_elements(rounds) where value->>'id'=id;
    need:=92.5; allocations:='[]';
    foreach id in array source_ids loop
      exit when need<=0;
      available:=(balances->>id)::numeric; used:=least(available,need);
      if used>0 then allocations:=allocations||jsonb_build_array(jsonb_build_object('id',id,'quantityKg',used)); end if;
      balances:=balances||jsonb_build_object(id,available-used); need:=need-used;
    end loop;
    if need<>0 then raise exception 'Insufficient audited source stock'; end if;
    g:=g||jsonb_build_object('plannedInput',92.5,'actualInput',92.5,'butterInput',92.5,'afOilInput',12.5,'expectedYield',73.5,
      'butterOverdrawKg',0,'gheeInputVersion',1,'butterSourceAllocations',allocations,
      'historyEvents',coalesce(g->'historyEvents','[]'::jsonb)||jsonb_build_array(jsonb_build_object(
        'id','recover-ghee-input-'||(g->>'id'),'type','ghee_input_recovered','stage','Ghee Input Reconciled','occurredAt',now(),
        'recordedBy','Owner-authorized maintenance','source','correction',
        'details','Owner confirmed 92.50 kg butter + 12.50 kg AF oil. Recovered FIFO source allocations after invalid numeric save; prior overdraw alert superseded. Production progress and actual output unchanged.')));
    updates:=updates||jsonb_build_object(g->>'id',g);
  end loop;
  foreach id in array source_ids loop
    select value into strict b from jsonb_array_elements(rounds) where value->>'id'=id;
    b:=b||jsonb_build_object('remainingBalance',(balances->>id)::numeric,'usedInGhee',(b->>'butterOutput')::numeric-(balances->>id)::numeric);
    updates:=updates||jsonb_build_object(id,b);
  end loop;
  if (select sum(value::numeric) from jsonb_each_text(balances))<>102.7 then raise exception 'Recovered balance must equal 102.7 kg'; end if;
  update public.app_state set value=(select jsonb_agg(coalesce(updates->(x->>'id'),x) order by ord)
    from jsonb_array_elements(rounds) with ordinality t(x,ord)) where key='vejoy_productionRounds';
  lot:=jsonb_set(lot,'{butterPool}',(lot->'butterPool')||'{"usedInGhee":185,"availableBalance":102.7}'::jsonb);
  update public.app_state set value=(select jsonb_agg(case when x->>'id'=lot->>'id' then lot else x end order by ord)
    from jsonb_array_elements(value) with ordinality t(x,ord)) where key='vejoy_milkLots';
  if exists(select 1 from jsonb_array_elements((select value from public.app_state where key='vejoy_productionRounds')) x
    where not (updates ? (x->>'id')) and x is distinct from (select old_x from jsonb_array_elements(rounds) old_x where old_x->>'id'=x->>'id')) then
    raise exception 'Unrelated round changed during repair'; end if;
end;
$repair$;
commit;
