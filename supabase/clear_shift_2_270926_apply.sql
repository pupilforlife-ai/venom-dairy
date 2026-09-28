-- APPLY: remove demonstration shift 2 for milk lot 270926.
--
-- The preview must be run first:
--   clear_shift_2_270926_preview.sql
--
-- This version is safe to run in the Supabase SQL Editor, which may execute
-- statements in separate sessions. It does not use temporary tables. A
-- persistent backup is created before the atomic app_state update.

create table if not exists public.app_state_cleanup_backup_270926_s2 (
  key text primary key,
  value jsonb not null,
  backed_up_at timestamptz not null default now()
);

insert into public.app_state_cleanup_backup_270926_s2 (key, value)
select key, value
from public.app_state
where key in (
  'vejoy_productionShifts',
  'vejoy_productionRounds',
  'vejoy_intermediateLots',
  'vejoy_finishedStock',
  'vejoy_crumbingBatches',
  'vejoy_wasteEvents'
)
on conflict (key) do nothing;

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
new_values as (
  select
    'vejoy_productionShifts' as key,
    coalesce((
      select jsonb_agg(item order by elements.ordinality)
      from jsonb_array_elements(
        case when state.value is not null and jsonb_typeof(state.value) = 'array'
             then state.value else '[]'::jsonb end
      ) with ordinality as elements(item, ordinality)
      where not exists (
        select 1 from target_shifts target where target.id = item->>'id'
      )
    ), '[]'::jsonb) as value
  from public.app_state state
  where state.key = 'vejoy_productionShifts'
    and exists (select 1 from target_shifts)

  union all

  select
    'vejoy_productionRounds',
    coalesce((
      select jsonb_agg(item order by elements.ordinality)
      from jsonb_array_elements(
        case when state.value is not null and jsonb_typeof(state.value) = 'array'
             then state.value else '[]'::jsonb end
      ) with ordinality as elements(item, ordinality)
      where not exists (
        select 1 from target_rounds target where target.id = item->>'id'
      )
    ), '[]'::jsonb)
  from public.app_state state
  where state.key = 'vejoy_productionRounds'
    and exists (select 1 from target_shifts)

  union all

  select
    'vejoy_intermediateLots',
    coalesce((
      select jsonb_agg(item order by elements.ordinality)
      from jsonb_array_elements(
        case when state.value is not null and jsonb_typeof(state.value) = 'array'
             then state.value else '[]'::jsonb end
      ) with ordinality as elements(item, ordinality)
      where not exists (
        select 1 from target_rounds target where target.id = item->>'sourceBatchId'
      )
        and (
          coalesce(item->>'sourceMilkLotCode', '') <> '270926'
          or coalesce(item->>'sourceShift', '') <> '2'
        )
    ), '[]'::jsonb)
  from public.app_state state
  where state.key = 'vejoy_intermediateLots'
    and exists (select 1 from target_shifts)

  union all

  select
    'vejoy_finishedStock',
    coalesce((
      select jsonb_agg(item order by elements.ordinality)
      from jsonb_array_elements(
        case when state.value is not null and jsonb_typeof(state.value) = 'array'
             then state.value else '[]'::jsonb end
      ) with ordinality as elements(item, ordinality)
      where not exists (
        select 1
        from jsonb_array_elements_text(
          case when jsonb_typeof(item->'sourceBatchCodes') = 'array'
               then item->'sourceBatchCodes' else '[]'::jsonb end
        ) as codes(code)
        where code like '270926/S2/%'
           or exists (
             select 1 from target_rounds target
             where code = target.source_batch_code
           )
      )
    ), '[]'::jsonb)
  from public.app_state state
  where state.key = 'vejoy_finishedStock'
    and exists (select 1 from target_shifts)

  union all

  select
    'vejoy_crumbingBatches',
    coalesce((
      select jsonb_agg(item order by elements.ordinality)
      from jsonb_array_elements(
        case when state.value is not null and jsonb_typeof(state.value) = 'array'
             then state.value else '[]'::jsonb end
      ) with ordinality as elements(item, ordinality)
      where item->>'sourceBatchCode' is null
         or (
           item->>'sourceBatchCode' not like '270926/S2/%'
           and not exists (
             select 1 from target_rounds target
             where item->>'sourceBatchCode' = target.source_batch_code
           )
         )
    ), '[]'::jsonb)
  from public.app_state state
  where state.key = 'vejoy_crumbingBatches'
    and exists (select 1 from target_shifts)

  union all

  select
    'vejoy_wasteEvents',
    coalesce((
      select jsonb_agg(item order by elements.ordinality)
      from jsonb_array_elements(
        case when state.value is not null and jsonb_typeof(state.value) = 'array'
             then state.value else '[]'::jsonb end
      ) with ordinality as elements(item, ordinality)
      where item->>'batchCode' is null
         or (
           item->>'batchCode' not like '270926/S2/%'
           and not exists (
             select 1 from target_rounds target
             where item->>'batchCode' = target.source_batch_code
           )
         )
    ), '[]'::jsonb)
  from public.app_state state
  where state.key = 'vejoy_wasteEvents'
    and exists (select 1 from target_shifts)
),
updated as (
  update public.app_state state
  set value = new_values.value
  from new_values
  where state.key = new_values.key
  returning state.key, jsonb_array_length(state.value) as remaining_count
)
select key, remaining_count
from updated
order by key;
