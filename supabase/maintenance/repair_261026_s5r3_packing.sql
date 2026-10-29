-- Owner-authorized recovery of an existing stock entry, NOT additional packing.
begin;
set local lock_timeout='3s';
do $repair$
declare rounds jsonb; stocks jsonb; r jsonb; s jsonb; replacement jsonb; recorder text;
begin
  perform 1 from public.app_state where key in ('vejoy_finishedStock','vejoy_milkLots','vejoy_productionRounds') order by key for update;
  select value into strict rounds from public.app_state where key='vejoy_productionRounds';
  select value into strict stocks from public.app_state where key='vejoy_finishedStock';
  select value into strict r from jsonb_array_elements(rounds) where value->>'id'='pr-1793165382208';
  select value into strict s from jsonb_array_elements(stocks) where value->>'id'='fs-9db1d405-25aa-4329-8c31-f255a8d0b8b2';
  if r->>'milkLotCode'<>'261026' or r->>'shiftNumber'<>'5' or r->>'roundNumber'<>'3'
    or coalesce(jsonb_array_length(r->'packedSkus'),0)<>0
    or abs((r->>'outputWeight')::numeric-70.097)>0.000001
    or coalesce((r->>'sppRecordedWeight')::numeric,0)<>0
    or s->>'packingRunId'<>'pb-pr-1793165382208-1793280922371'
    or s->>'sku'<>'RPAN100' or s->>'cases'<>'3' or s->>'loosePackets'<>'0'
    or s->'sourceBatchCodes'<>'["261026/S5/R3/C/S"]'::jsonb then
    raise exception 'Target changed since review; abort recovery and inspect again';
  end if;
  select username into strict recorder from public.profiles where id='70678d46-eaf8-44c0-8b2d-c397bc5ee6ac';
  create table public.app_state_backup_s5r3_packing_20261029 as
    select key,value,version as source_version,now() as backed_up_at from public.app_state
    where key in ('vejoy_productionRounds','vejoy_finishedStock');
  alter table public.app_state_backup_s5r3_packing_20261029 enable row level security;
  revoke all on public.app_state_backup_s5r3_packing_20261029 from public,anon,authenticated;
  replacement := r || jsonb_build_object('packedSkus',jsonb_build_array(jsonb_build_object(
    'sku','RPAN100','cases',3,'loose',0,'packingRunId',s->>'packingRunId',
    'recordedBy',recorder,'recordedAt',s->>'createdAt','recoveredAt',now())),
    'remainingBalance',round((r->>'outputWeight')::numeric-45,6),
    'historyEvents',coalesce(r->'historyEvents','[]'::jsonb)||jsonb_build_array(jsonb_build_object(
      'id','recover-packing-'||(s->>'packingRunId'),'type','packing_recovered','stage','Packing Entry Recovered',
      'occurredAt',now(),'recordedBy','Owner-authorized maintenance','source','correction',
      'details','Recovered existing RPAN100 3 cases / 45 kg from finished stock. Original recorder: '||recorder||
        '; original entry: '||(s->>'createdAt')||'. No stock created or changed.')));
  update public.app_state set value=(select jsonb_agg(case when item->>'id'=r->>'id' then replacement else item end order by ord)
    from jsonb_array_elements(rounds) with ordinality x(item,ord)) where key='vejoy_productionRounds';
  if (select value from public.app_state where key='vejoy_finishedStock') is distinct from stocks then
    raise exception 'Stock changed during recovery';
  end if;
  if exists(select 1 from jsonb_array_elements((select value from public.app_state where key='vejoy_productionRounds')) item
    where item->>'id'<>r->>'id' and item is distinct from (select old_item from jsonb_array_elements(rounds) old_item where old_item->>'id'=item->>'id')) then
    raise exception 'Unrelated round changed during recovery';
  end if;
end;
$repair$;
commit;
