-- Rebuild stored internal cream pools from their auditable round records.
-- The application also derives these values at runtime; this migration fixes
-- historical snapshots used by exports and direct database audits.

begin;

create table if not exists public.app_state_cream_pool_backup_20261005 (
  key text primary key,
  value jsonb not null,
  backed_up_at timestamptz not null default now()
);

insert into public.app_state_cream_pool_backup_20261005 (key, value)
select key, value
from public.app_state
where key in ('vejoy_milkLots', 'vejoy_productionRounds')
on conflict (key) do nothing;

with
round_items as (
  select round_item, position
  from public.app_state state
  cross join lateral jsonb_array_elements(
    case
      when jsonb_typeof(state.value) = 'array' then state.value
      else '[]'::jsonb
    end
  ) with ordinality as rounds(round_item, position)
  where state.key = 'vejoy_productionRounds'
),
rebuilt as (
  select jsonb_agg(
    case
      when milk_item ? 'creamPool' or totals.recovered_kg > 0 or totals.butter_input_kg > 0
      then milk_item || jsonb_build_object(
        'creamPool',
        coalesce(milk_item->'creamPool', '{}'::jsonb) || jsonb_build_object(
          'milkLotId', milk_item->>'id',
          'milkLotCode', milk_item->>'lotCode',
          'batchId', coalesce(
            nullif(milk_item->'creamPool'->>'batchId', ''),
            'CRM-' || (milk_item->>'lotCode')
          ),
          'totalCream', totals.recovered_kg,
          'usedInButter', totals.butter_input_kg,
          'availableBalance', greatest(0, totals.recovered_kg - totals.butter_input_kg),
          'roundsContributed', totals.contributing_round_ids
        )
      )
      else milk_item
    end
    order by milk_position
  ) as value
  from public.app_state milk_state
  cross join lateral jsonb_array_elements(
    case
      when jsonb_typeof(milk_state.value) = 'array' then milk_state.value
      else '[]'::jsonb
    end
  ) with ordinality as milk(milk_item, milk_position)
  cross join lateral (
    select
      round(coalesce(sum(
        case
          when coalesce(round_item->>'status', '') not in ('cancelled', 'spoiled')
            and coalesce(round_item->>'creamRecovered', '') ~ '^[0-9]+([.][0-9]+)?$'
          then greatest(0, (round_item->>'creamRecovered')::numeric)
          else 0
        end
      ), 0), 2) as recovered_kg,
      round(coalesce(sum(
        case
          when round_item->>'type' = 'Butter'
            and coalesce(round_item->>'status', '') <> 'cancelled'
            and (
              round_item->>'creamSource' = 'internal'
              or round_item->>'sourceBatchCode' = 'CRM-' || (milk_item->>'lotCode')
            )
          then case
            when coalesce(round_item->>'actualInput', '') ~ '^[0-9]+([.][0-9]+)?$'
              and (round_item->>'actualInput')::numeric > 0
            then (round_item->>'actualInput')::numeric
            when coalesce(round_item->>'plannedInput', '') ~ '^[0-9]+([.][0-9]+)?$'
            then greatest(0, (round_item->>'plannedInput')::numeric)
            else 0
          end
          else 0
        end
      ), 0), 2) as butter_input_kg,
      coalesce(
        jsonb_agg(to_jsonb(round_item->>'id') order by position)
          filter (
            where coalesce(round_item->>'status', '') not in ('cancelled', 'spoiled')
              and coalesce(round_item->>'creamRecovered', '') ~ '^[0-9]+([.][0-9]+)?$'
              and (round_item->>'creamRecovered')::numeric > 0
          ),
        '[]'::jsonb
      ) as contributing_round_ids
    from round_items
    where round_item->>'milkLotId' = milk_item->>'id'
       or round_item->>'milkLotCode' = milk_item->>'lotCode'
  ) totals
  where milk_state.key = 'vejoy_milkLots'
)
update public.app_state state
set value = rebuilt.value
from rebuilt
where state.key = 'vejoy_milkLots';

commit;
