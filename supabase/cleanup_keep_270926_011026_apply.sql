-- APPLY: retain only milk lots 270926 and 011026 and their linked records.
--
-- This is intentionally destructive to the selected app_state collections.
-- A persistent backup is created first so the affected JSON arrays can be
-- restored if the owner later decides the cleanup was too broad.
-- The linked Supabase CLI should run this file; no SQL Editor is required.

begin;

create table if not exists public.app_state_cleanup_backup_270926_011026 (
  key text primary key,
  value jsonb not null,
  backed_up_at timestamptz not null default now()
);

insert into public.app_state_cleanup_backup_270926_011026 (key, value)
select key, value
from public.app_state
where key in (
  'vejoy_milkLots',
  'vejoy_productionShifts',
  'vejoy_productionRounds',
  'vejoy_creamLots',
  'vejoy_intermediateLots',
  'vejoy_finishedStock',
  'vejoy_crumbingBatches',
  'vejoy_temperatureReadings',
  'vejoy_wasteEvents',
  'vejoy_distributionHandovers',
  'vejoy_utilityLogs'
)
on conflict (key) do nothing;

do $$
begin
  if not exists (
    select 1 from public.app_state state
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(state.value) = 'array' then state.value else '[]'::jsonb end
    ) as rows(item)
    where state.key = 'vejoy_milkLots' and item->>'lotCode' = '270926'
  ) or not exists (
    select 1 from public.app_state state
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(state.value) = 'array' then state.value else '[]'::jsonb end
    ) as rows(item)
    where state.key = 'vejoy_milkLots' and item->>'lotCode' = '011026'
  ) then
    raise exception 'Required milk lots 270926 and 011026 were not both found; no data was changed';
  end if;
end $$;

with
keep_codes(code) as (
  values ('270926'), ('011026')
),
keep_tokens(token) as (
  values ('270926'), ('011026'), ('20260927'), ('20261001')
),
keep_dates(date_text) as (
  values ('2026-09-27'), ('2026-10-01')
),
kept_milk_ids as (
  select item->>'id' as id
  from public.app_state state
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(state.value) = 'array' then state.value else '[]'::jsonb end
  ) as rows(item)
  where state.key = 'vejoy_milkLots'
    and item->>'lotCode' in (select code from keep_codes)
),
new_values(key, value) as (
  select
    'vejoy_milkLots',
    coalesce((
      select jsonb_agg(rows.item order by rows.ordinality)
      from jsonb_array_elements(
        case when state.value is not null and jsonb_typeof(state.value) = 'array'
             then state.value else '[]'::jsonb end
      ) with ordinality as rows(item, ordinality)
      where rows.item->>'lotCode' in (select code from keep_codes)
    ), '[]'::jsonb)
  from public.app_state state
  where state.key = 'vejoy_milkLots'

  union all

  select
    'vejoy_productionShifts',
    coalesce((
      select jsonb_agg(rows.item order by rows.ordinality)
      from jsonb_array_elements(
        case when state.value is not null and jsonb_typeof(state.value) = 'array'
             then state.value else '[]'::jsonb end
      ) with ordinality as rows(item, ordinality)
      where rows.item->>'milkLotCode' in (select code from keep_codes)
         or rows.item->>'milkLotId' in (select id from kept_milk_ids)
    ), '[]'::jsonb)
  from public.app_state state
  where state.key = 'vejoy_productionShifts'

  union all

  select
    'vejoy_productionRounds',
    coalesce((
      select jsonb_agg(rows.item order by rows.ordinality)
      from jsonb_array_elements(
        case when state.value is not null and jsonb_typeof(state.value) = 'array'
             then state.value else '[]'::jsonb end
      ) with ordinality as rows(item, ordinality)
      where rows.item->>'milkLotCode' in (select code from keep_codes)
         or rows.item->>'milkLotId' in (select id from kept_milk_ids)
    ), '[]'::jsonb)
  from public.app_state state
  where state.key = 'vejoy_productionRounds'

  union all

  select
    'vejoy_creamLots',
    coalesce((
      select jsonb_agg(rows.item order by rows.ordinality)
      from jsonb_array_elements(
        case when state.value is not null and jsonb_typeof(state.value) = 'array'
             then state.value else '[]'::jsonb end
      ) with ordinality as rows(item, ordinality)
      where exists (
        select 1 from keep_tokens kept
        where rows.item->>'lotCode' ~ ('(^|[^0-9])' || kept.token || '([^0-9]|$)')
      )
    ), '[]'::jsonb)
  from public.app_state state
  where state.key = 'vejoy_creamLots'

  union all

  select
    'vejoy_intermediateLots',
    coalesce((
      select jsonb_agg(rows.item order by rows.ordinality)
      from jsonb_array_elements(
        case when state.value is not null and jsonb_typeof(state.value) = 'array'
             then state.value else '[]'::jsonb end
      ) with ordinality as rows(item, ordinality)
      where exists (
        select 1 from keep_tokens kept
        where coalesce(rows.item->>'sourceMilkLotCode', rows.item->>'sourceBatchCode', rows.item->>'lotCode')
          ~ ('(^|[^0-9])' || kept.token || '([^0-9]|$)')
      )
    ), '[]'::jsonb)
  from public.app_state state
  where state.key = 'vejoy_intermediateLots'

  union all

  select
    'vejoy_finishedStock',
    coalesce((
      select jsonb_agg(rows.item order by rows.ordinality)
      from jsonb_array_elements(
        case when state.value is not null and jsonb_typeof(state.value) = 'array'
             then state.value else '[]'::jsonb end
      ) with ordinality as rows(item, ordinality)
      where exists (
        select 1
        from jsonb_array_elements_text(
          case when jsonb_typeof(rows.item->'sourceBatchCodes') = 'array'
               then rows.item->'sourceBatchCodes' else '[]'::jsonb end
        ) as codes(code)
        cross join keep_tokens kept
        where codes.code ~ ('(^|[^0-9])' || kept.token || '([^0-9]|$)')
      )
    ), '[]'::jsonb)
  from public.app_state state
  where state.key = 'vejoy_finishedStock'

  union all

  select
    'vejoy_crumbingBatches',
    coalesce((
      select jsonb_agg(rows.item order by rows.ordinality)
      from jsonb_array_elements(
        case when state.value is not null and jsonb_typeof(state.value) = 'array'
             then state.value else '[]'::jsonb end
      ) with ordinality as rows(item, ordinality)
      where exists (
        select 1 from keep_tokens kept
        where rows.item->>'sourceBatchCode' ~ ('(^|[^0-9])' || kept.token || '([^0-9]|$)')
      )
    ), '[]'::jsonb)
  from public.app_state state
  where state.key = 'vejoy_crumbingBatches'

  union all

  select
    'vejoy_temperatureReadings',
    coalesce((
      select jsonb_agg(rows.item order by rows.ordinality)
      from jsonb_array_elements(
        case when state.value is not null and jsonb_typeof(state.value) = 'array'
             then state.value else '[]'::jsonb end
      ) with ordinality as rows(item, ordinality)
      where left(rows.item->>'recordedAt', 10) in (select date_text from keep_dates)
    ), '[]'::jsonb)
  from public.app_state state
  where state.key = 'vejoy_temperatureReadings'

  union all

  select
    'vejoy_wasteEvents',
    coalesce((
      select jsonb_agg(rows.item order by rows.ordinality)
      from jsonb_array_elements(
        case when state.value is not null and jsonb_typeof(state.value) = 'array'
             then state.value else '[]'::jsonb end
      ) with ordinality as rows(item, ordinality)
      where exists (
        select 1 from keep_tokens kept
        where rows.item->>'batchCode' ~ ('(^|[^0-9])' || kept.token || '([^0-9]|$)')
      )
         or left(rows.item->>'date', 10) in (select date_text from keep_dates)
    ), '[]'::jsonb)
  from public.app_state state
  where state.key = 'vejoy_wasteEvents'

  union all

  select
    'vejoy_distributionHandovers',
    coalesce((
      select jsonb_agg(rows.item order by rows.ordinality)
      from jsonb_array_elements(
        case when state.value is not null and jsonb_typeof(state.value) = 'array'
             then state.value else '[]'::jsonb end
      ) with ordinality as rows(item, ordinality)
      where exists (
        select 1 from keep_tokens kept
        where rows.item->>'batchCode' ~ ('(^|[^0-9])' || kept.token || '([^0-9]|$)')
      )
    ), '[]'::jsonb)
  from public.app_state state
  where state.key = 'vejoy_distributionHandovers'

  union all

  select
    'vejoy_utilityLogs',
    coalesce((
      select jsonb_agg(rows.item order by rows.ordinality)
      from jsonb_array_elements(
        case when state.value is not null and jsonb_typeof(state.value) = 'array'
             then state.value else '[]'::jsonb end
      ) with ordinality as rows(item, ordinality)
      where left(rows.item->>'periodEnd', 10) in (select date_text from keep_dates)
    ), '[]'::jsonb)
  from public.app_state state
  where state.key = 'vejoy_utilityLogs'
)
update public.app_state state
set value = new_values.value
from new_values
where state.key = new_values.key;

select
  key,
  jsonb_array_length(value) as remaining_count
from public.app_state
where key in (
  'vejoy_milkLots',
  'vejoy_productionShifts',
  'vejoy_productionRounds',
  'vejoy_creamLots',
  'vejoy_intermediateLots',
  'vejoy_finishedStock',
  'vejoy_crumbingBatches',
  'vejoy_temperatureReadings',
  'vejoy_wasteEvents',
  'vejoy_distributionHandovers',
  'vejoy_utilityLogs'
)
order by key;

commit;
