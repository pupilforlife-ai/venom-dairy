-- READ-ONLY PREVIEW: keep only milk lots 270926 and 011026.
--
-- This query changes nothing. It reports the records that would remain and
-- be removed from each lot-linked app_state collection. Missing or malformed
-- identifiers are retained conservatively so they can be reviewed separately.
-- Do not run an APPLY script until these counts have been checked.

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
    ('vejoy_distributionHandovers')
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
milk_items as (
  select item->>'id' as id, item->>'lotCode' as lot_code
  from arrays
  cross join lateral jsonb_array_elements(arrays.value) as rows(item)
  where arrays.key = 'vejoy_milkLots'
),
kept_milk_ids as (
  select id
  from milk_items
  where lot_code in (select code from keep_codes)
),
preview as (
  -- Milk lots: an empty/missing lot code is kept for safety; named lots must
  -- be one of the two requested codes.
  select
    arrays.key,
    jsonb_array_length(arrays.value) as before_count,
    jsonb_array_length(coalesce((
      select jsonb_agg(rows.item order by rows.ordinality)
      from jsonb_array_elements(arrays.value) with ordinality as rows(item, ordinality)
      where nullif(rows.item->>'lotCode', '') is null
         or rows.item->>'lotCode' in (select code from keep_codes)
    ), '[]'::jsonb)) as after_count
  from arrays
  where arrays.key = 'vejoy_milkLots'

  union all

  select
    arrays.key,
    jsonb_array_length(arrays.value),
    jsonb_array_length(coalesce((
      select jsonb_agg(rows.item order by rows.ordinality)
      from jsonb_array_elements(arrays.value) with ordinality as rows(item, ordinality)
      where (
        nullif(rows.item->>'milkLotCode', '') is null
        and nullif(rows.item->>'milkLotId', '') is null
      )
      or rows.item->>'milkLotCode' in (select code from keep_codes)
      or rows.item->>'milkLotId' in (select id from kept_milk_ids)
    ), '[]'::jsonb))
  from arrays
  where arrays.key = 'vejoy_productionShifts'

  union all

  select
    arrays.key,
    jsonb_array_length(arrays.value),
    jsonb_array_length(coalesce((
      select jsonb_agg(rows.item order by rows.ordinality)
      from jsonb_array_elements(arrays.value) with ordinality as rows(item, ordinality)
      where (
        nullif(rows.item->>'milkLotCode', '') is null
        and nullif(rows.item->>'milkLotId', '') is null
      )
      or rows.item->>'milkLotCode' in (select code from keep_codes)
      or rows.item->>'milkLotId' in (select id from kept_milk_ids)
    ), '[]'::jsonb))
  from arrays
  where arrays.key = 'vejoy_productionRounds'

  union all

  select
    arrays.key,
    jsonb_array_length(arrays.value),
    jsonb_array_length(coalesce((
      select jsonb_agg(rows.item order by rows.ordinality)
      from jsonb_array_elements(arrays.value) with ordinality as rows(item, ordinality)
      where nullif(rows.item->>'lotCode', '') is null
         or exists (
           select 1 from keep_tokens kept
           where rows.item->>'lotCode' ~ ('(^|[^0-9])' || kept.token || '([^0-9]|$)')
         )
    ), '[]'::jsonb))
  from arrays
  where arrays.key = 'vejoy_creamLots'

  union all

  select
    arrays.key,
    jsonb_array_length(arrays.value),
    jsonb_array_length(coalesce((
      select jsonb_agg(rows.item order by rows.ordinality)
      from jsonb_array_elements(arrays.value) with ordinality as rows(item, ordinality)
      where nullif(coalesce(rows.item->>'sourceMilkLotCode', rows.item->>'sourceBatchCode', rows.item->>'lotCode'), '') is null
         or exists (
           select 1 from keep_tokens kept
           where coalesce(rows.item->>'sourceMilkLotCode', rows.item->>'sourceBatchCode', rows.item->>'lotCode')
             ~ ('(^|[^0-9])' || kept.token || '([^0-9]|$)')
         )
    ), '[]'::jsonb))
  from arrays
  where arrays.key = 'vejoy_intermediateLots'

  union all

  select
    arrays.key,
    jsonb_array_length(arrays.value),
    jsonb_array_length(coalesce((
      select jsonb_agg(rows.item order by rows.ordinality)
      from jsonb_array_elements(arrays.value) with ordinality as rows(item, ordinality)
      where jsonb_typeof(rows.item->'sourceBatchCodes') <> 'array'
         or jsonb_array_length(case when jsonb_typeof(rows.item->'sourceBatchCodes') = 'array' then rows.item->'sourceBatchCodes' else '[]'::jsonb end) = 0
         or exists (
           select 1
           from jsonb_array_elements_text(rows.item->'sourceBatchCodes') as codes(code)
           cross join keep_tokens kept
           where codes.code ~ ('(^|[^0-9])' || kept.token || '([^0-9]|$)')
         )
    ), '[]'::jsonb))
  from arrays
  where arrays.key = 'vejoy_finishedStock'

  union all

  select
    arrays.key,
    jsonb_array_length(arrays.value),
    jsonb_array_length(coalesce((
      select jsonb_agg(rows.item order by rows.ordinality)
      from jsonb_array_elements(arrays.value) with ordinality as rows(item, ordinality)
      where nullif(rows.item->>'sourceBatchCode', '') is null
         or exists (
           select 1 from keep_tokens kept
           where rows.item->>'sourceBatchCode' ~ ('(^|[^0-9])' || kept.token || '([^0-9]|$)')
         )
    ), '[]'::jsonb))
  from arrays
  where arrays.key = 'vejoy_crumbingBatches'

  union all

  -- Cold-chain readings have no lot id, so the preview keeps readings on the
  -- two lot dates and retains malformed/missing dates for manual review.
  select
    arrays.key,
    jsonb_array_length(arrays.value),
    jsonb_array_length(coalesce((
      select jsonb_agg(rows.item order by rows.ordinality)
      from jsonb_array_elements(arrays.value) with ordinality as rows(item, ordinality)
      where nullif(rows.item->>'recordedAt', '') is null
         or left(rows.item->>'recordedAt', 10) !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
         or left(rows.item->>'recordedAt', 10) in (select date_text from keep_dates)
    ), '[]'::jsonb))
  from arrays
  where arrays.key = 'vejoy_temperatureReadings'

  union all

  select
    arrays.key,
    jsonb_array_length(arrays.value),
    jsonb_array_length(coalesce((
      select jsonb_agg(rows.item order by rows.ordinality)
      from jsonb_array_elements(arrays.value) with ordinality as rows(item, ordinality)
      where (
        nullif(rows.item->>'batchCode', '') is null
        and (
          nullif(rows.item->>'date', '') is null
          or left(rows.item->>'date', 10) !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
          or left(rows.item->>'date', 10) in (select date_text from keep_dates)
        )
      )
      or exists (
        select 1 from keep_tokens kept
        where rows.item->>'batchCode' ~ ('(^|[^0-9])' || kept.token || '([^0-9]|$)')
      )
    ), '[]'::jsonb))
  from arrays
  where arrays.key = 'vejoy_wasteEvents'

  union all

  -- A handover with no batch code is retained conservatively; coded
  -- handovers are kept only when they reference one of the two lots.
  select
    arrays.key,
    jsonb_array_length(arrays.value),
    jsonb_array_length(coalesce((
      select jsonb_agg(rows.item order by rows.ordinality)
      from jsonb_array_elements(arrays.value) with ordinality as rows(item, ordinality)
      where nullif(rows.item->>'batchCode', '') is null
         or exists (
           select 1 from keep_tokens kept
           where rows.item->>'batchCode' ~ ('(^|[^0-9])' || kept.token || '([^0-9]|$)')
         )
    ), '[]'::jsonb))
  from arrays
  where arrays.key = 'vejoy_distributionHandovers'
)
select
  key,
  before_count,
  after_count,
  before_count - after_count as deleted_count
from preview
order by key;
