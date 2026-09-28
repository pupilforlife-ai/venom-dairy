-- READ-ONLY PREVIEW: demonstration shift 2 for milk lot 270926.
-- This query changes nothing. It identifies the shift, its rounds, and
-- downstream records that explicitly reference those rounds.

with
target_shifts as (
  select item->>'id' as id
  from public.app_state state
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(state.value) = 'array' then state.value else '[]'::jsonb end
  ) as rows(item)
  where state.key = 'vejoy_productionShifts'
    and item->>'milkLotCode' = '270926'
    and item->>'shiftNumber' = '2'
),
target_rounds as (
  select
    item->>'id' as id,
    item->>'shiftId' as shift_id,
    concat(item->>'milkLotCode', '/S', item->>'shiftNumber', '/R', item->>'roundNumber', '/') as source_prefix,
    item->>'sourceBatchCode' as source_batch_code
  from public.app_state state
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(state.value) = 'array' then state.value else '[]'::jsonb end
  ) as rows(item)
  where state.key = 'vejoy_productionRounds'
    and (
      item->>'shiftId' in (select id from target_shifts)
      or (item->>'milkLotCode' = '270926' and item->>'shiftNumber' = '2')
    )
),
impact as (
  select
    'vejoy_productionShifts' as key,
    (select count(*) from jsonb_array_elements(coalesce(state.value, '[]'::jsonb))) as before_count,
    (select count(*) from jsonb_array_elements(coalesce(state.value, '[]'::jsonb)) as rows(item)
     where item->>'id' in (select id from target_shifts)) as targeted_count
  from public.app_state state
  where state.key = 'vejoy_productionShifts'

  union all

  select
    'vejoy_productionRounds',
    (select count(*) from jsonb_array_elements(coalesce(state.value, '[]'::jsonb))),
    (select count(*) from target_rounds)
  from public.app_state state
  where state.key = 'vejoy_productionRounds'

  union all

  select
    'vejoy_intermediateLots',
    (select count(*) from jsonb_array_elements(coalesce(state.value, '[]'::jsonb))),
    (select count(*)
     from jsonb_array_elements(coalesce(state.value, '[]'::jsonb)) as rows(item)
     where item->>'sourceBatchId' in (select id from target_rounds)
        or (item->>'sourceMilkLotCode' = '270926' and item->>'sourceShift' = '2'))
  from public.app_state state
  where state.key = 'vejoy_intermediateLots'

  union all

  select
    'vejoy_finishedStock',
    (select count(*) from jsonb_array_elements(coalesce(state.value, '[]'::jsonb))),
    (select count(*)
     from jsonb_array_elements(coalesce(state.value, '[]'::jsonb)) as rows(item)
     where exists (
       select 1
       from jsonb_array_elements_text(
         case when jsonb_typeof(item->'sourceBatchCodes') = 'array'
              then item->'sourceBatchCodes' else '[]'::jsonb end
       ) as codes(code)
       where code like '270926/S2/%'
          or exists (select 1 from target_rounds round where code = round.source_batch_code)
     ))
  from public.app_state state
  where state.key = 'vejoy_finishedStock'

  union all

  select
    'vejoy_crumbingBatches',
    (select count(*) from jsonb_array_elements(coalesce(state.value, '[]'::jsonb))),
    (select count(*)
     from jsonb_array_elements(coalesce(state.value, '[]'::jsonb)) as rows(item)
     where item->>'sourceBatchCode' like '270926/S2/%'
        or exists (select 1 from target_rounds round where item->>'sourceBatchCode' = round.source_batch_code))
  from public.app_state state
  where state.key = 'vejoy_crumbingBatches'

  union all

  select
    'vejoy_wasteEvents',
    (select count(*) from jsonb_array_elements(coalesce(state.value, '[]'::jsonb))),
    (select count(*)
     from jsonb_array_elements(coalesce(state.value, '[]'::jsonb)) as rows(item)
     where item->>'batchCode' like '270926/S2/%'
        or exists (select 1 from target_rounds round where item->>'batchCode' = round.source_batch_code))
  from public.app_state state
  where state.key = 'vejoy_wasteEvents'
)
select key, before_count, targeted_count
from impact
order by key;
