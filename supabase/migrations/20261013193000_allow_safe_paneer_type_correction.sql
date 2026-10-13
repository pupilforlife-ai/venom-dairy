-- Allow an audited Paneer C/S <-> D data-entry correction after physical
-- measurements have been recorded. Block weights, cutting details and output
-- describe the same production round and are retained. Genealogy-changing
-- records (cream, packing, intermediate/finished stock, crumbing and waste)
-- remain hard blockers.

create or replace function public.review_production_round_type_change(
  round_id text,
  decision text,
  decision_reason text default null
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
  request_item jsonb;
  updated_round jsonb := null;
  current_type text;
  source_batch_prefix text;
  actor text;
  now_value timestamptz := now();
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid()
      and status = 'approved'
      and role in ('admin', 'owner')
  ) then
    raise exception 'Only approved admins and owners can review type-change requests';
  end if;
  if decision not in ('approve', 'reject') then
    raise exception 'Decision must be approve or reject';
  end if;
  if decision = 'reject' and length(trim(coalesce(decision_reason, ''))) < 5 then
    raise exception 'A rejection note of at least 5 characters is required';
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
      request_item := round_item->'typeChangeRequest';
      if jsonb_typeof(request_item) <> 'object' or request_item->>'status' <> 'pending' then
        raise exception 'There is no pending type-change request for this round';
      end if;

      current_type := round_item->>'type';
      if current_type <> request_item->>'from' then
        raise exception 'The round type changed while this request was pending; review it again';
      end if;

      if decision = 'approve' then
        if coalesce(round_item->>'locked', 'false') = 'true'
           or round_item->>'status' in ('handed_over', 'cancelled', 'spoiled') then
          raise exception 'Locked or closed rounds cannot be reclassified';
        end if;

        -- A Paneer type correction must never silently rewrite genealogy.
        -- Measurements on the round itself are safe and intentionally remain.
        if jsonb_typeof(round_item->'packedSkus') = 'array'
           and jsonb_array_length(round_item->'packedSkus') > 0 then
          raise exception 'Approval blocked: packing has already been recorded';
        end if;
        if round_item->>'creamRecovered' is not null
           or (jsonb_typeof(round_item->'creamBucketWeights') = 'array'
               and jsonb_array_length(round_item->'creamBucketWeights') > 0) then
          raise exception 'Approval blocked: cream recovery has already been recorded';
        end if;
        if round_item->>'sppRecordedWeight' is not null then
          raise exception 'Approval blocked: SPP allocation has already been recorded';
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
          raise exception 'Approval blocked: an intermediate lot already exists';
        end if;

        source_batch_prefix :=
          (round_item->>'milkLotCode') || '/S' || (round_item->>'shiftNumber') ||
          '/R' || (round_item->>'roundNumber') || '/';

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
            and codes.code like source_batch_prefix || '%'
        ) then
          raise exception 'Approval blocked: finished stock already exists';
        end if;
        if exists (
          select 1
          from public.app_state state
          cross join lateral jsonb_array_elements(
            case when jsonb_typeof(state.value) = 'array' then state.value else '[]'::jsonb end
          ) as rows(item)
          where state.key = 'vejoy_crumbingBatches'
            and (
              item->>'sourceBatchId' = round_id
              or item->>'sourceBatchCode' like source_batch_prefix || '%'
            )
        ) then
          raise exception 'Approval blocked: a crumbing batch already references this round';
        end if;
        if exists (
          select 1
          from public.app_state state
          cross join lateral jsonb_array_elements(
            case when jsonb_typeof(state.value) = 'array' then state.value else '[]'::jsonb end
          ) as rows(item)
          where state.key = 'vejoy_wasteEvents'
            and item->>'batchCode' like source_batch_prefix || '%'
        ) then
          raise exception 'Approval blocked: a waste record already references this round';
        end if;

        round_item := jsonb_set(round_item, '{type}', to_jsonb(request_item->>'to'), true);
        round_item := jsonb_set(
          round_item,
          '{typeChangeHistory}',
          (case when jsonb_typeof(round_item->'typeChangeHistory') = 'array'
                then round_item->'typeChangeHistory' else '[]'::jsonb end)
            || jsonb_build_array(jsonb_build_object(
              'from', request_item->>'from',
              'to', request_item->>'to',
              'changedAt', now_value,
              'changedBy', actor,
              'reason', request_item->>'reason',
              'requestedBy', request_item->>'requestedBy',
              'requestedAt', request_item->>'requestedAt',
              'decision', 'approved'
            )),
          true
        );
        round_item := jsonb_set(
          round_item,
          '{historyEvents}',
          (case when jsonb_typeof(round_item->'historyEvents') = 'array'
                then round_item->'historyEvents' else '[]'::jsonb end)
            || jsonb_build_array(jsonb_build_object(
              'id', 'type-change-' || round_id || '-' || floor(extract(epoch from now_value) * 1000)::bigint,
              'type', 'type_changed',
              'stage', 'Paneer Type Corrected',
              'occurredAt', now_value,
              'details', (request_item->>'from') || ' → ' || (request_item->>'to') || ' · ' || (request_item->>'reason'),
              'recordedBy', actor,
              'source', 'override'
            )),
          true
        );
      end if;

      request_item := jsonb_set(request_item, '{status}', to_jsonb(case when decision = 'approve' then 'approved' else 'rejected' end), true);
      request_item := jsonb_set(request_item, '{decidedAt}', to_jsonb(now_value), true);
      request_item := jsonb_set(request_item, '{decidedBy}', to_jsonb(actor), true);
      if nullif(trim(coalesce(decision_reason, '')), '') is not null then
        request_item := jsonb_set(request_item, '{decisionReason}', to_jsonb(trim(decision_reason)), true);
      end if;
      round_item := jsonb_set(round_item, '{typeChangeRequest}', request_item, true);
      updated_round := round_item;
    end if;
    next_rounds := next_rounds || jsonb_build_array(round_item);
  end loop;

  if updated_round is null then
    raise exception 'Production round not found';
  end if;
  update public.app_state set value = next_rounds where key = 'vejoy_productionRounds';
  return updated_round;
end;
$$;

revoke all on function public.review_production_round_type_change(text, text, text) from public, anon;
grant execute on function public.review_production_round_type_change(text, text, text) to authenticated;
