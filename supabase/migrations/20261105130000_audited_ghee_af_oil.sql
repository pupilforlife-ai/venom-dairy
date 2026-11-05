-- Definitions only. Existing rounds and quantities are not backfilled or changed.
begin;
set local lock_timeout='3s';
create or replace function public.prepare_ghee_af_oil(r jsonb, request jsonb, actor text, actor_role text, at_time timestamptz, action text)
returns jsonb language plpgsql immutable set search_path=public as $$
declare op text:=request->>'operationId'; event_id text; previous jsonb:=r->'afOilRecord'; event jsonb; entry jsonb;
  actual numeric; recommended numeric; butter numeric; reason text:=trim(coalesce(request->>'reason','')); note text:=trim(coalesce(request->>'note',''));
  mode text:=request->>'mode'; decision text:=request->>'decision'; approval text; history_event jsonb;
begin
  if actor_role not in ('staff','admin','owner') or actor_role is null then raise exception 'Approved production access required';end if;
  if action not in ('record','review') or action is null then raise exception 'Invalid AF oil action';end if;
  if action='review' and actor_role not in ('owner','admin') then raise exception 'Only an owner or admin can review AF oil changes';end if;
  if r is null or r->>'type'<>'Ghee' or r->>'id' is distinct from request->>'roundId' then raise exception 'Select a Ghee round';end if;
  if nullif(op,'') is null or length(op)>120 then raise exception 'An operation ID is required';end if;
  event_id:='af-oil-'||action||'-'||op;
  event:=r->'afOilAuditHistory'->event_id;
  if action='record' then
    if not public.valid_ghee_quantity(request->'actualKg') or mode is null or mode not in ('recommended','changed') then raise exception 'Enter a valid non-negative actual AF oil quantity';end if;
    actual:=round((request->>'actualKg')::numeric,6);
    if event is not null then
      if (event->>'actualKg')::numeric<>actual or event->>'mode' is distinct from mode or event->>'reason' is distinct from reason
        or event->'previousRecordId' is distinct from coalesce(request->'expectedRecordId','null'::jsonb) then raise exception 'This operation ID was used for a different AF oil entry';end if;
      return r;
    end if;
    if coalesce((r->>'locked')::boolean,false) or r->>'status' in ('discarded','cancelled','spoiled','handed_over') then raise exception 'This round is closed for AF oil recording';end if;
    if previous->>'id' is distinct from request->>'expectedRecordId' then raise exception 'The AF oil record changed. Refresh and review it before recording';end if;
    butter:=coalesce((r->>'butterInput')::numeric,(r->>'actualInput')::numeric);
    if butter is null or butter<=0 then raise exception 'The recorded butter input needs review';end if;
    recommended:=round(butter*12.5/92.5,6);
    if (mode='recommended') is distinct from (actual=recommended) then raise exception 'Confirm the recommended quantity or select changed quantity and enter the actual amount';end if;
    if (actual<>recommended or previous is not null) and length(reason)<5 then raise exception 'Enter a reason of at least 5 characters for this change';end if;
    if (previous->>'actualKg')::numeric=actual and previous->>'approvalStatus'<>'rejected' then raise exception 'This quantity is already recorded. Review the existing entry';end if;
    approval:=case when actual<>recommended or previous is not null then 'pending' else 'not_required' end;
    entry:=jsonb_build_object('id',op,'recommendedKg',recommended,'actualKg',actual,'butterInputKg',butter,'mode',mode,'reason',reason,
      'recordedAt',at_time,'recordedBy',actor,'recordedByRole',actor_role,'approvalStatus',approval);
    event:=jsonb_build_object('id',event_id,'kind','record','operationId',op,'recordId',op,'previousRecordId',coalesce(request->'expectedRecordId','null'::jsonb),
      'recommendedKg',recommended,'actualKg',actual,'mode',mode,'reason',reason,'recordedAt',at_time,'recordedBy',actor,'recordedByRole',actor_role);
    history_event:=jsonb_build_object('id',event_id,'type','ghee_af_oil_recorded','stage','AF Oil Added','occurredAt',at_time,'recordedBy',actor,
      'source',case when previous is null then 'workflow' else 'correction' end,'details',format('Actual AF oil %s kg; recommended %s kg. %s %s',actual,recommended,
      case when approval='pending' then 'Owner/admin approval pending.' else 'Recommended amount confirmed.' end,reason));
    r:=r||jsonb_build_object('afOilInput',actual,'expectedYield',round((butter+actual)*0.7,6),
      'status',case when r->>'status' in ('scheduled','butter_selected') then 'af_oil_added' else r->>'status' end);
  else
    if decision is null or decision not in ('approve','reject') then raise exception 'Select approve or reject';end if;
    if event is not null then
      if event->>'recordId' is distinct from request->>'recordId' or event->>'decision' is distinct from decision or event->>'note' is distinct from note then raise exception 'This operation ID was used for a different review';end if;
      return r;
    end if;
    if previous is null or previous->>'id' is distinct from request->>'recordId' or previous->>'approvalStatus'<>'pending' then raise exception 'There is no matching pending AF oil change. Refresh and review the current entry';end if;
    if decision='reject' and length(note)<5 then raise exception 'Enter a rejection reason of at least 5 characters';end if;
    entry:=previous||jsonb_build_object('approvalStatus',case when decision='approve' then 'approved' else 'rejected' end,
      'reviewedAt',at_time,'reviewedBy',actor,'reviewedByRole',actor_role,'reviewNote',note);
    event:=jsonb_build_object('id',event_id,'kind','review','operationId',op,'recordId',previous->>'id','recommendedKg',previous->'recommendedKg',
      'actualKg',previous->'actualKg','decision',decision,'note',note,'recordedAt',at_time,'recordedBy',actor,'recordedByRole',actor_role);
    history_event:=jsonb_build_object('id',event_id,'type','ghee_af_oil_reviewed','stage','AF Oil Review','occurredAt',at_time,'recordedBy',actor,'source','approval',
      'details',format('AF oil %s: actual %s kg; recommended %s kg. Actual input retained. %s',case when decision='approve' then 'approved' else 'rejected' end,previous->>'actualKg',previous->>'recommendedKg',note));
  end if;
  return r||jsonb_build_object('afOilRecord',entry,'afOilAuditHistory',coalesce(r->'afOilAuditHistory','{}'::jsonb)||jsonb_build_object(event_id,event),
    'historyEvents',coalesce(r->'historyEvents','[]'::jsonb)||jsonb_build_array(history_event));
end;$$;

create or replace function public.commit_ghee_af_oil(request jsonb, action text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text; actor_role text; rounds jsonb; original jsonb; updated jsonb; saved jsonb;
begin
  select username,role into actor,actor_role from public.profiles where id=auth.uid() and status='approved' and role in ('staff','admin','owner');
  if actor is null then raise exception using errcode='42501',message='Approved production access required';end if;
  if action='review' and actor_role not in ('owner','admin') then raise exception using errcode='42501',message='Only an owner or admin can review AF oil changes';end if;
  perform set_config('lock_timeout','3s',true);
  perform 1 from public.app_state where key in ('vejoy_milkLots','vejoy_productionRounds') order by key for update;
  select value into strict rounds from public.app_state where key='vejoy_productionRounds';
  select r into original from jsonb_array_elements(rounds) r where r->>'id'=request->>'roundId';
  updated:=public.prepare_ghee_af_oil(original,request,actor,actor_role,now(),action);
  if updated=original then return jsonb_build_object('round',original,'replayed',true);end if;
  if (updated-array['afOilInput','expectedYield','status','afOilRecord','afOilAuditHistory','historyEvents']) is distinct from
     (original-array['afOilInput','expectedYield','status','afOilRecord','afOilAuditHistory','historyEvents']) then raise exception 'Unrelated Ghee data changed; save stopped';end if;
  perform set_config('app.atomic_ghee_af_oil','on',true);
  perform set_config('app.atomic_ghee_round','on',true);
  update public.app_state set value=(select jsonb_agg(case when r->>'id'=original->>'id' then updated else r end order by ord)
    from jsonb_array_elements(value) with ordinality t(r,ord)) where key='vejoy_productionRounds';
  select r into saved from public.app_state s cross join lateral jsonb_array_elements(s.value) r where s.key='vejoy_productionRounds' and r->>'id'=original->>'id';
  if saved is distinct from updated then raise exception 'AF oil save was not confirmed';end if;
  perform set_config('app.atomic_ghee_af_oil','off',true);
  perform set_config('app.atomic_ghee_round','off',true);
  return jsonb_build_object('round',saved,'replayed',false);
end;$$;
create or replace function public.record_ghee_af_oil(request jsonb)
returns jsonb language sql security definer set search_path=public as $$ select public.commit_ghee_af_oil(request,'record'); $$;
create or replace function public.review_ghee_af_oil(request jsonb)
returns jsonb language sql security definer set search_path=public as $$ select public.commit_ghee_af_oil(request,'review'); $$;

-- Preserve the existing creation / late-butter / save-confirmation behavior.
-- Only NEW rounds receive the required-confirmation marker.
do $copy$ begin
  if to_regprocedure('public.prepare_ghee_round_before_af_oil(jsonb,jsonb,jsonb,jsonb,text,timestamptz)') is null then
    execute replace(pg_get_functiondef('public.prepare_ghee_round(jsonb,jsonb,jsonb,jsonb,text,timestamptz)'::regprocedure),
      'public.prepare_ghee_round(','public.prepare_ghee_round_before_af_oil(');
  end if;
end;$copy$;
create or replace function public.prepare_ghee_round(rounds jsonb,lots jsonb,creams jsonb,request jsonb,actor text,at_time timestamptz)
returns jsonb language plpgsql immutable set search_path=public as $$
declare result jsonb; created jsonb;
begin
  result:=public.prepare_ghee_round_before_af_oil(rounds,lots,creams,request,actor,at_time);
  if (result->>'replayed')::boolean then return result;end if;
  created:=result->'round'||'{"afOilConfirmationRequired":true}'::jsonb;
  return result||jsonb_build_object('round',created,'rounds',(select jsonb_agg(case when r->>'id'=created->>'id' then created else r end order by ord)
    from jsonb_array_elements(result->'rounds') with ordinality t(r,ord)));
end;$$;

create or replace function public.guard_ghee_af_oil_state()
returns trigger language plpgsql security definer set search_path=public as $$
declare r jsonb; previous jsonb; field text;
begin
  if new.key<>'vejoy_productionRounds' or jsonb_typeof(new.value)<>'array' then return new;end if;
  if current_setting('app.atomic_ghee_af_oil',true)='on' then return new;end if;
  for r in select value from jsonb_array_elements(new.value) loop
    previous:=null;
    if tg_op='UPDATE' then select value into previous from jsonb_array_elements(old.value) where value->>'id'=r->>'id';end if;
    if previous is null and r->>'type'='Ghee' and auth.uid() is not null and coalesce(current_setting('app.atomic_ghee_round',true),'off')<>'on' then raise exception 'Create Ghee rounds through the production form';end if;
    if (r->'afOilRecord' is distinct from previous->'afOilRecord') or (r->'afOilAuditHistory' is distinct from previous->'afOilAuditHistory') then
      raise exception 'AF oil confirmations and approvals require the audited AF oil form';end if;
    if previous->'afOilRecord' is not null and (r->'afOilInput' is distinct from previous->'afOilInput' or r->'expectedYield' is distinct from previous->'expectedYield') then
      raise exception 'Confirmed AF oil input cannot be overwritten by a stale save';end if;
    if previous->'afOilRecord' is not null then
      foreach field in array array['type','butterInput','actualInput','plannedInput','milkLotId','sourceCreamLotId','sourceButterLotKey'] loop
        if r->field is distinct from previous->field then raise exception 'Confirmed AF oil source and butter input are protected';end if;
      end loop;
    end if;
    if previous->>'afOilConfirmationRequired'='true' and r->'afOilConfirmationRequired' is distinct from previous->'afOilConfirmationRequired' then raise exception 'AF oil confirmation requirement cannot be removed';end if;
    if r->>'afOilConfirmationRequired'='true' and r->'afOilRecord' is null and r->>'status' not in ('scheduled','butter_selected','discarded','cancelled','spoiled') then
      raise exception 'Confirm the actual AF oil quantity before proceeding';end if;
  end loop;
  if tg_op='UPDATE' and exists(select 1 from jsonb_array_elements(old.value) o where o->'afOilRecord' is not null
    and not exists(select 1 from jsonb_array_elements(new.value) n where n->>'id'=o->>'id')) then raise exception 'Audited AF oil records cannot be removed';end if;
  return new;
end;$$;
create or replace trigger guard_ghee_af_oil_state before insert or update on public.app_state for each row execute function public.guard_ghee_af_oil_state();
revoke all on function public.prepare_ghee_af_oil(jsonb,jsonb,text,text,timestamptz,text) from public,anon,authenticated;
revoke all on function public.commit_ghee_af_oil(jsonb,text) from public,anon,authenticated;
revoke all on function public.prepare_ghee_round_before_af_oil(jsonb,jsonb,jsonb,jsonb,text,timestamptz) from public,anon,authenticated;
revoke all on function public.guard_ghee_af_oil_state() from public,anon,authenticated;
revoke all on function public.record_ghee_af_oil(jsonb) from public,anon;
revoke all on function public.review_ghee_af_oil(jsonb) from public,anon;
grant execute on function public.record_ghee_af_oil(jsonb) to authenticated;
grant execute on function public.review_ghee_af_oil(jsonb) to authenticated;
commit;
