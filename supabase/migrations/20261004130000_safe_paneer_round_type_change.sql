-- Allow an approved admin/owner to correct a Paneer round between C/S and D.
-- The correction is deliberately narrow: it is blocked once cutting, cream
-- recovery, packing, or downstream stock has been recorded. This prevents a
-- type correction from silently invalidating product or genealogy records.

create or replace function public.change_production_round_type(
  round_id text,
  new_type text,
  reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_rounds jsonb;
  next_rounds jsonb := '[]'::jsonb;
  round_item jsonb;
  updated_round jsonb := null;
  current_type text;
  source_batch_code text;
  actor text;
begin
  if not exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and status = 'approved'
      and role in ('admin', 'owner')
  ) then
    raise exception 'Only approved admins and owners can change a Paneer round type';
  end if;

  if new_type not in ('D', 'C/S') then
    raise exception 'Paneer round type must be D or C/S';
  end if;

  if length(trim(coalesce(reason, ''))) < 5 then
    raise exception 'A reason of at least 5 characters is required';
  end if;

  select value into current_rounds
  from public.app_state
  where key = 'vejoy_productionRounds'
  for update;

  if current_rounds is null or jsonb_typeof(current_rounds) <> 'array' then
    raise exception 'Production rounds state is unavailable';
  end if;

  actor := coalesce(
    (select username from public.profiles where id = auth.uid() limit 1),
    auth.uid()::text,
    'unknown'
  );

  for round_item in select value from jsonb_array_elements(current_rounds)
  loop
    if round_item->>'id' = round_id then
      current_type := round_item->>'type';

      if current_type not in ('D', 'C/S') then
        raise exception 'Only Paneer rounds can be changed between C/S and D';
      end if;
      if current_type = new_type then
        raise exception 'The round already has that type';
      end if;
      if coalesce(round_item->>'locked', 'false') = 'true'
         or round_item->>'status' in ('handed_over', 'cancelled', 'spoiled') then
        raise exception 'Locked or closed rounds cannot be reclassified';
      end if;
      if coalesce(round_item->>'outputWeight', '0')::numeric > 0 then
        raise exception 'Reclassify the round before cutting or recording output';
      end if;
      if jsonb_typeof(round_item->'blockWeights') = 'array'
         and jsonb_array_length(round_item->'blockWeights') > 0 then
        raise exception 'Reclassify the round before block weights are recorded';
      end if;
      if jsonb_typeof(round_item->'packedSkus') = 'array'
         and jsonb_array_length(round_item->'packedSkus') > 0 then
        raise exception 'Reclassify the round before packing is recorded';
      end if;
      if round_item->>'creamRecovered' is not null
         or round_item->>'sppRecordedWeight' is not null
         or nullif(round_item->>'cuttingType', '') is not null
         or round_item->>'remainingBalance' is not null then
        raise exception 'Reclassify the round before cutting, cream recovery, or packing data is recorded';
      end if;

      if exists (
        select 1
        from public.app_state state
        cross join lateral jsonb_array_elements(
          case when jsonb_typeof(state.value) = 'array' then state.value else '[]'::jsonb end
        ) as rows(item)
        where state.key = 'vejoy_intermediateLots'
          and item->>'sourceBatchId' = round_id
      ) then
        raise exception 'Reclassify the round before an intermediate lot is created';
      end if;

      source_batch_code := coalesce(
        round_item->>'sourceBatchCode',
        round_item->>'batchCode',
        round_item->>'milkLotCode' || '/S' || round_item->>'shiftNumber' || '/R' || round_item->>'roundNumber' || '/' || current_type
      );
      if exists (
        select 1
        from public.app_state state
        cross join lateral jsonb_array_elements(
          case when jsonb_typeof(state.value) = 'array' then state.value else '[]'::jsonb end
        ) as rows(item)
        cross join lateral jsonb_array_elements_text(
          case when jsonb_typeof(item->'sourceBatchCodes') = 'array' then item->'sourceBatchCodes' else '[]'::jsonb end
        ) as codes(code)
        where state.key = 'vejoy_finishedStock'
          and codes.code = source_batch_code
      ) then
        raise exception 'Reclassify the round before finished stock is created';
      end if;

      round_item := jsonb_set(round_item, '{type}', to_jsonb(new_type), true);
      round_item := jsonb_set(
        round_item,
        '{typeChangeHistory}',
        (case when jsonb_typeof(round_item->'typeChangeHistory') = 'array'
              then round_item->'typeChangeHistory' else '[]'::jsonb end)
          || jsonb_build_array(jsonb_build_object(
            'from', current_type,
            'to', new_type,
            'changedAt', now(),
            'changedBy', actor,
            'reason', trim(reason)
          )),
        true
      );
      updated_round := round_item;
    end if;

    next_rounds := next_rounds || jsonb_build_array(round_item);
  end loop;

  if updated_round is null then
    raise exception 'Production round not found';
  end if;

  update public.app_state
  set value = next_rounds
  where key = 'vejoy_productionRounds';

  return updated_round;
end;
$$;

revoke all on function public.change_production_round_type(text, text, text) from public;
grant execute on function public.change_production_round_type(text, text, text) to authenticated;
