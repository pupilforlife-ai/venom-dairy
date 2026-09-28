-- READ-ONLY PREVIEW for records before lot 270926 (27 Sep 2026).
--
-- This query changes nothing. It uses no temporary tables, no temporary
-- functions, and no transaction control. Run the whole query once in the
-- Supabase SQL Editor. It reports how many records would remain and how many
-- would be removed from each stored collection.
--
-- Records dated/source-coded 270926 or later are kept. Missing or malformed
-- identifiers are kept conservatively.

with
cutoff as (
  select date '2026-09-27' as cutoff_date
),
required_keys(key) as (
  values
    ('vejoy_milkLots'),
    ('vejoy_productionShifts'),
    ('vejoy_productionRounds'),
    ('vejoy_creamLots'),
    ('vejoy_intermediateLots'),
    ('vejoy_finishedStock'),
    ('vejoy_crumbingBatches'),
    ('vejoy_temperatureReadings'),
    ('vejoy_wasteEvents'),
    ('vejoy_utilityLogs')
),
state as (
  select key, value
  from public.app_state
  where key in (select key from required_keys)
),
arrays as (
  select
    required.key,
    coalesce(
      case when jsonb_typeof(state.value) = 'array' then state.value end,
      '[]'::jsonb
    ) as value
  from required_keys required
  left join state on state.key = required.key
),
milk_lot_items as (
  select
    item->>'id' as id,
    item->>'lotCode' as code
  from arrays
  cross join lateral jsonb_array_elements(arrays.value) as elements(item)
  where arrays.key = 'vejoy_milkLots'
),
all_lot_codes as (
  select code from milk_lot_items
  union
  select item->>'milkLotCode'
  from arrays
  cross join lateral jsonb_array_elements(arrays.value) as elements(item)
  where arrays.key in ('vejoy_productionShifts', 'vejoy_productionRounds')
  union
  select item->>'lotCode'
  from arrays
  cross join lateral jsonb_array_elements(arrays.value) as elements(item)
  where arrays.key = 'vejoy_creamLots'
  union
  select coalesce(item->>'sourceMilkLotCode', item->>'sourceBatchCode', item->>'lotCode')
  from arrays
  cross join lateral jsonb_array_elements(arrays.value) as elements(item)
  where arrays.key = 'vejoy_intermediateLots'
  union
  select batch_codes.code
  from arrays
  cross join lateral jsonb_array_elements(arrays.value) as elements(item)
  cross join lateral jsonb_array_elements_text(
    case
      when jsonb_typeof(elements.item->'sourceBatchCodes') = 'array'
        then elements.item->'sourceBatchCodes'
      else '[]'::jsonb
    end
  ) as batch_codes(code)
  where arrays.key = 'vejoy_finishedStock'
  union
  select item->>'sourceBatchCode'
  from arrays
  cross join lateral jsonb_array_elements(arrays.value) as elements(item)
  where arrays.key = 'vejoy_crumbingBatches'
  union
  select item->>'batchCode'
  from arrays
  cross join lateral jsonb_array_elements(arrays.value) as elements(item)
  where arrays.key = 'vejoy_wasteEvents'
),
parsed_lot_codes as (
  select
    code,
    case
      when (regexp_match(coalesce(code, ''), '(20[0-9]{2}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01]))')) is not null
        then to_date(
          (regexp_match(coalesce(code, ''), '(20[0-9]{2}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01]))'))[1],
          'YYYYMMDD'
        )
      when (regexp_match(coalesce(code, ''), '((0[1-9]|[12][0-9]|3[01])(0[1-9]|1[0-2])[0-9]{2})')) is not null
        then to_date(
          (regexp_match(coalesce(code, ''), '((0[1-9]|[12][0-9]|3[01])(0[1-9]|1[0-2])[0-9]{2})'))[1],
          'DDMMYY'
        )
      else null
    end as parsed_date
  from all_lot_codes
),
keep_lot_codes as (
  select parsed.code
  from parsed_lot_codes parsed
  cross join cutoff
  where parsed.code is null
     or parsed.parsed_date is null
     or parsed.parsed_date >= cutoff.cutoff_date
),
keep_milk_lot_ids as (
  select milk.id
  from milk_lot_items milk
  where milk.code is null
     or milk.code in (select code from keep_lot_codes)
),
preview as (
  select
    arrays.key,
    jsonb_array_length(arrays.value) as before_count,
    jsonb_array_length(coalesce((
      select jsonb_agg(elements.item order by elements.ordinality)
      from jsonb_array_elements(arrays.value) with ordinality as elements(item, ordinality)
      where elements.item->>'lotCode' is null
         or elements.item->>'lotCode' in (select code from keep_lot_codes)
    ), '[]'::jsonb)) as after_count
  from arrays
  where arrays.key = 'vejoy_milkLots'

  union all

  select
    arrays.key,
    jsonb_array_length(arrays.value),
    jsonb_array_length(coalesce((
      select jsonb_agg(elements.item order by elements.ordinality)
      from jsonb_array_elements(arrays.value) with ordinality as elements(item, ordinality)
      where (elements.item->>'milkLotCode' is null
             or elements.item->>'milkLotCode' in (select code from keep_lot_codes))
        and (
          elements.item->>'milkLotId' is null
          or elements.item->>'milkLotId' in (select id from keep_milk_lot_ids)
        )
    ), '[]'::jsonb))
  from arrays
  where arrays.key = 'vejoy_productionShifts'

  union all

  select
    arrays.key,
    jsonb_array_length(arrays.value),
    jsonb_array_length(coalesce((
      select jsonb_agg(elements.item order by elements.ordinality)
      from jsonb_array_elements(arrays.value) with ordinality as elements(item, ordinality)
      where (elements.item->>'milkLotCode' is null
             or elements.item->>'milkLotCode' in (select code from keep_lot_codes))
        and (
          elements.item->>'milkLotId' is null
          or elements.item->>'milkLotId' in (select id from keep_milk_lot_ids)
        )
    ), '[]'::jsonb))
  from arrays
  where arrays.key = 'vejoy_productionRounds'

  union all

  select
    arrays.key,
    jsonb_array_length(arrays.value),
    jsonb_array_length(coalesce((
      select jsonb_agg(elements.item order by elements.ordinality)
      from jsonb_array_elements(arrays.value) with ordinality as elements(item, ordinality)
      where elements.item->>'lotCode' is null
         or elements.item->>'lotCode' in (select code from keep_lot_codes)
    ), '[]'::jsonb))
  from arrays
  where arrays.key = 'vejoy_creamLots'

  union all

  select
    arrays.key,
    jsonb_array_length(arrays.value),
    jsonb_array_length(coalesce((
      select jsonb_agg(elements.item order by elements.ordinality)
      from jsonb_array_elements(arrays.value) with ordinality as elements(item, ordinality)
      where coalesce(
          elements.item->>'sourceMilkLotCode',
          elements.item->>'sourceBatchCode',
          elements.item->>'lotCode'
        ) is null
         or coalesce(
          elements.item->>'sourceMilkLotCode',
          elements.item->>'sourceBatchCode',
          elements.item->>'lotCode'
        ) in (select code from keep_lot_codes)
    ), '[]'::jsonb))
  from arrays
  where arrays.key = 'vejoy_intermediateLots'

  union all

  select
    arrays.key,
    jsonb_array_length(arrays.value),
    jsonb_array_length(coalesce((
      select jsonb_agg(elements.item order by elements.ordinality)
      from jsonb_array_elements(arrays.value) with ordinality as elements(item, ordinality)
      where case
        when jsonb_typeof(elements.item->'sourceBatchCodes') = 'array'
          and jsonb_array_length(elements.item->'sourceBatchCodes') > 0
        then exists (
          select 1
          from jsonb_array_elements_text(elements.item->'sourceBatchCodes') as source(code)
          where source.code is null or source.code in (select code from keep_lot_codes)
        )
        else (
          elements.item->>'createdAt' is null
          or elements.item->>'createdAt' = ''
          or left(elements.item->>'createdAt', 10) !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
          or left(elements.item->>'createdAt', 10) >= (select cutoff_date::text from cutoff)
        )
      end
    ), '[]'::jsonb))
  from arrays
  where arrays.key = 'vejoy_finishedStock'

  union all

  select
    arrays.key,
    jsonb_array_length(arrays.value),
    jsonb_array_length(coalesce((
      select jsonb_agg(elements.item order by elements.ordinality)
      from jsonb_array_elements(arrays.value) with ordinality as elements(item, ordinality)
      where (elements.item->>'sourceBatchCode' is null
             or elements.item->>'sourceBatchCode' in (select code from keep_lot_codes))
        and (
          elements.item->>'createdAt' is null
          or elements.item->>'createdAt' = ''
          or left(elements.item->>'createdAt', 10) !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
          or left(elements.item->>'createdAt', 10) >= (select cutoff_date::text from cutoff)
        )
    ), '[]'::jsonb))
  from arrays
  where arrays.key = 'vejoy_crumbingBatches'

  union all

  select
    arrays.key,
    jsonb_array_length(arrays.value),
    jsonb_array_length(coalesce((
      select jsonb_agg(elements.item order by elements.ordinality)
      from jsonb_array_elements(arrays.value) with ordinality as elements(item, ordinality)
      where elements.item->>'recordedAt' is null
         or elements.item->>'recordedAt' = ''
         or left(elements.item->>'recordedAt', 10) !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
         or left(elements.item->>'recordedAt', 10) >= (select cutoff_date::text from cutoff)
    ), '[]'::jsonb))
  from arrays
  where arrays.key = 'vejoy_temperatureReadings'

  union all

  select
    arrays.key,
    jsonb_array_length(arrays.value),
    jsonb_array_length(coalesce((
      select jsonb_agg(elements.item order by elements.ordinality)
      from jsonb_array_elements(arrays.value) with ordinality as elements(item, ordinality)
      where case
        when nullif(elements.item->>'batchCode', '') is not null
        then elements.item->>'batchCode' in (select code from keep_lot_codes)
        else (
          elements.item->>'date' is null
          or elements.item->>'date' = ''
          or left(elements.item->>'date', 10) !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
          or left(elements.item->>'date', 10) >= (select cutoff_date::text from cutoff)
        )
      end
    ), '[]'::jsonb))
  from arrays
  where arrays.key = 'vejoy_wasteEvents'

  union all

  select
    arrays.key,
    jsonb_array_length(arrays.value),
    jsonb_array_length(coalesce((
      select jsonb_agg(elements.item order by elements.ordinality)
      from jsonb_array_elements(arrays.value) with ordinality as elements(item, ordinality)
      where elements.item->>'periodEnd' is null
         or elements.item->>'periodEnd' = ''
         or left(elements.item->>'periodEnd', 10) !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
         or left(elements.item->>'periodEnd', 10) >= (select cutoff_date::text from cutoff)
    ), '[]'::jsonb))
  from arrays
  where arrays.key = 'vejoy_utilityLogs'
)
select
  key,
  before_count,
  after_count,
  before_count - after_count as deleted_count
from preview
order by key;
