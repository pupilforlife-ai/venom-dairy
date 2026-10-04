-- Staff may request a Paneer C/S <-> D correction without stopping the round.
-- An approved admin/owner reviews it. Approval is only applied before
-- type-specific output or downstream stock exists, keeping ingredients and
-- genealogy aligned with the final type.

create or replace function public.request_production_round_type_change(
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
  actor text;
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and status = 'approved'
  ) then
    raise exception 'Approved access required';
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
        raise exception 'Only Paneer rounds can request a C/S or D correction';
      end if;
      if current_type = new_type then
        raise exception 'The round already has that type';
      end if;
      if coalesce(round_item->>'locked', 'false') = 'true'
         or round_item->>'status' in ('handed_over', 'cancelled', 'spoiled') then
        raise exception 'Locked or closed rounds cannot request reclassification';
      end if;
      if jsonb_typeof(round_item->'typeChangeRequest') = 'object'
         and round_item->'typeChangeRequest'->>'status' = 'pending' then
        raise exception 'This round already has a pending type-change request';
      end if;

      round_item := jsonb_set(
        round_item,
        '{typeChangeRequest}',
        jsonb_build_object(
          'status', 'pending',
          'from', current_type,
          'to', new_type,
          'reason', trim(reason),
          'requestedAt', now(),
          'requestedBy', actor
        ),
        true
      );
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
  source_batch_code text;
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
        if coalesce(round_item->>'outputWeight', '0')::numeric > 0 then
          raise exception 'Approval blocked: output has already been recorded';
        end if;
        if jsonb_typeof(round_item->'blockWeights') = 'array'
           and jsonb_array_length(round_item->'blockWeights') > 0 then
          raise exception 'Approval blocked: block weights have already been recorded';
        end if;
        if jsonb_typeof(round_item->'packedSkus') = 'array'
           and jsonb_array_length(round_item->'packedSkus') > 0 then
          raise exception 'Approval blocked: packing has already been recorded';
        end if;
        if round_item->>'creamRecovered' is not null
           or round_item->>'sppRecordedWeight' is not null
           or nullif(round_item->>'cuttingType', '') is not null
           or round_item->>'remainingBalance' is not null then
          raise exception 'Approval blocked: type-specific production data already exists';
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

        source_batch_code := coalesce(
          round_item->>'sourceBatchCode',
          round_item->>'batchCode',
          (round_item->>'milkLotCode') || '/S' || (round_item->>'shiftNumber') || '/R' || (round_item->>'roundNumber') || '/' || current_type
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
          raise exception 'Approval blocked: finished stock already exists';
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

revoke all on function public.change_production_round_type(text, text, text) from public;
revoke all on function public.request_production_round_type_change(text, text, text) from public;
revoke all on function public.review_production_round_type_change(text, text, text) from public;
grant execute on function public.request_production_round_type_change(text, text, text) to authenticated;
grant execute on function public.review_production_round_type_change(text, text, text) to authenticated;
