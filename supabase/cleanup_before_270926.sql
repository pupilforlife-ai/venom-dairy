-- One-time trial-data cleanup.
--
-- Lot numbers are DDMMYY. This removes records before 270926 (27 Sep 2026)
-- and preserves 270926 itself and all later records. It does not touch
-- auth.users, public.profiles, SKU definitions, or database schema.
-- Run this whole file once in the Supabase SQL Editor as an owner/admin.

begin;

-- A missing/unknown lot code is kept deliberately. That makes this cleanup
-- conservative: only records that can be proven to be before the cutoff are
-- removed.
create or replace function pg_temp.keep_lot_code(code text)
returns boolean
language sql
immutable
as $$
  select coalesce(
    to_date((regexp_match(coalesce(code, ''), '([0-9]{6})'))[1], 'DDMMYY') >= date '2026-09-27',
    true
  );
$$;

create or replace function pg_temp.keep_iso_date(value text)
returns boolean
language sql
immutable
as $$
  select coalesce(
    substring(value from 1 for 10)::date >= date '2026-09-27',
    true
  );
$$;

create temporary table cleanup_keep_milk_lots (id text primary key) on commit drop;
insert into cleanup_keep_milk_lots (id)
select item->>'id'
from jsonb_array_elements(coalesce((select value from public.app_state where key = 'vejoy_milkLots'), '[]'::jsonb)) with ordinality as rows(item, position)
where pg_temp.keep_lot_code(item->>'lotCode');

create temporary table cleanup_values (
  key text primary key,
  old_value jsonb not null,
  new_value jsonb not null
) on commit drop;

insert into cleanup_values (key, old_value, new_value)
select
  'vejoy_milkLots',
  state.value,
  coalesce((
    select jsonb_agg(item order by position)
    from jsonb_array_elements(state.value) with ordinality as rows(item, position)
    where item->>'id' in (select id from cleanup_keep_milk_lots)
  ), '[]'::jsonb)
from public.app_state state
where state.key = 'vejoy_milkLots' and jsonb_typeof(state.value) = 'array';

insert into cleanup_values (key, old_value, new_value)
select
  'vejoy_productionShifts',
  state.value,
  coalesce((
    select jsonb_agg(item order by position)
    from jsonb_array_elements(state.value) with ordinality as rows(item, position)
    where pg_temp.keep_lot_code(item->>'milkLotCode')
      and (
        item->>'milkLotId' is null
        or item->>'milkLotId' in (select id from cleanup_keep_milk_lots)
      )
  ), '[]'::jsonb)
from public.app_state state
where state.key = 'vejoy_productionShifts' and jsonb_typeof(state.value) = 'array';

insert into cleanup_values (key, old_value, new_value)
select
  'vejoy_productionRounds',
  state.value,
  coalesce((
    select jsonb_agg(item order by position)
    from jsonb_array_elements(state.value) with ordinality as rows(item, position)
    where pg_temp.keep_lot_code(item->>'milkLotCode')
      and (
        item->>'milkLotId' is null
        or item->>'milkLotId' in (select id from cleanup_keep_milk_lots)
      )
  ), '[]'::jsonb)
from public.app_state state
where state.key = 'vejoy_productionRounds' and jsonb_typeof(state.value) = 'array';

insert into cleanup_values (key, old_value, new_value)
select
  'vejoy_creamLots',
  state.value,
  coalesce((
    select jsonb_agg(item order by position)
    from jsonb_array_elements(state.value) with ordinality as rows(item, position)
    where pg_temp.keep_lot_code(item->>'lotCode')
  ), '[]'::jsonb)
from public.app_state state
where state.key = 'vejoy_creamLots' and jsonb_typeof(state.value) = 'array';

insert into cleanup_values (key, old_value, new_value)
select
  'vejoy_intermediateLots',
  state.value,
  coalesce((
    select jsonb_agg(item order by position)
    from jsonb_array_elements(state.value) with ordinality as rows(item, position)
    where pg_temp.keep_lot_code(coalesce(item->>'sourceMilkLotCode', item->>'sourceBatchCode', item->>'lotCode'))
  ), '[]'::jsonb)
from public.app_state state
where state.key = 'vejoy_intermediateLots' and jsonb_typeof(state.value) = 'array';

insert into cleanup_values (key, old_value, new_value)
select
  'vejoy_finishedStock',
  state.value,
  coalesce((
    select jsonb_agg(item order by position)
    from jsonb_array_elements(state.value) with ordinality as rows(item, position)
    where case
      when jsonb_typeof(item->'sourceBatchCodes') = 'array'
        and jsonb_array_length(item->'sourceBatchCodes') > 0
      then exists (
        select 1
        from jsonb_array_elements_text(item->'sourceBatchCodes') as source(code)
        where pg_temp.keep_lot_code(source.code)
      )
      else pg_temp.keep_iso_date(item->>'createdAt')
    end
  ), '[]'::jsonb)
from public.app_state state
where state.key = 'vejoy_finishedStock' and jsonb_typeof(state.value) = 'array';

insert into cleanup_values (key, old_value, new_value)
select
  'vejoy_crumbingBatches',
  state.value,
  coalesce((
    select jsonb_agg(item order by position)
    from jsonb_array_elements(state.value) with ordinality as rows(item, position)
    where pg_temp.keep_lot_code(item->>'sourceBatchCode')
      and pg_temp.keep_iso_date(item->>'createdAt')
  ), '[]'::jsonb)
from public.app_state state
where state.key = 'vejoy_crumbingBatches' and jsonb_typeof(state.value) = 'array';

insert into cleanup_values (key, old_value, new_value)
select
  'vejoy_temperatureReadings',
  state.value,
  coalesce((
    select jsonb_agg(item order by position)
    from jsonb_array_elements(state.value) with ordinality as rows(item, position)
    where pg_temp.keep_iso_date(item->>'recordedAt')
  ), '[]'::jsonb)
from public.app_state state
where state.key = 'vejoy_temperatureReadings' and jsonb_typeof(state.value) = 'array';

insert into cleanup_values (key, old_value, new_value)
select
  'vejoy_wasteEvents',
  state.value,
  coalesce((
    select jsonb_agg(item order by position)
    from jsonb_array_elements(state.value) with ordinality as rows(item, position)
    where case
      when nullif(item->>'batchCode', '') is not null
        then pg_temp.keep_lot_code(item->>'batchCode')
      else pg_temp.keep_iso_date(item->>'date')
    end
  ), '[]'::jsonb)
from public.app_state state
where state.key = 'vejoy_wasteEvents' and jsonb_typeof(state.value) = 'array';

insert into cleanup_values (key, old_value, new_value)
select
  'vejoy_utilityLogs',
  state.value,
  coalesce((
    select jsonb_agg(item order by position)
    from jsonb_array_elements(state.value) with ordinality as rows(item, position)
    where pg_temp.keep_iso_date(item->>'periodEnd')
  ), '[]'::jsonb)
from public.app_state state
where state.key = 'vejoy_utilityLogs' and jsonb_typeof(state.value) = 'array';

-- Preview counts inside the transaction before the updates are applied.
select
  key,
  jsonb_array_length(old_value) as before_count,
  jsonb_array_length(new_value) as after_count,
  jsonb_array_length(old_value) - jsonb_array_length(new_value) as deleted_count
from cleanup_values
order by key;

-- Apply the filtered collections atomically.
update public.app_state state
set value = cleanup.new_value
from cleanup_values cleanup
where cleanup.key = state.key
  and cleanup.old_value <> cleanup.new_value;

commit;
