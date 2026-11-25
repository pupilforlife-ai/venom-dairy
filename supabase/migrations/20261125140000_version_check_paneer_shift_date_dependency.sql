-- Add an optional read-only shift-date dependency. No production records are updated.
-- Existing source/audit triggers, permissions, version checks and retries remain active.
begin;
set local lock_timeout='3s';
create or replace function public.commit_paneer_traceability(actor_id uuid,command jsonb,expected jsonb,changes jsonb,command_result jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare profile record; receipt public.paneer_traceability_commands; e jsonb; row_data public.app_state; returned jsonb; command_id text;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Server command access required';end if;
 select username,role into strict profile from public.profiles where id=actor_id and status='approved' and role in ('owner','admin','staff');
 if command->>'_role' is distinct from profile.role then raise exception 'Account permissions changed; sign in again before retrying';end if;
 command_id:=command->>'id';if nullif(command_id,'') is null or length(command_id)>120 then raise exception 'A save reference is required';end if;
 perform set_config('lock_timeout','3s',true);
 perform pg_advisory_xact_lock(hashtext('paneer-traceability-commands'));
 select * into receipt from public.paneer_traceability_commands where id=command_id;
 if found then
  if receipt.actor_id<>actor_id or receipt.request<>command then raise exception 'Save reference belongs to a different request';end if;
 else
  if jsonb_typeof(expected)<>'array' or jsonb_array_length(expected) not in (6,7) or jsonb_typeof(changes)<>'object' then raise exception 'Invalid prepared transition';end if;
  if exists(select 1 from jsonb_object_keys(changes) k where k not in ('vejoy_distributionHandovers','vejoy_finishedStock','vejoy_intermediateLots','vejoy_milkLots','vejoy_productionRounds','vejoy_traceability')) then raise exception 'Unexpected collection';end if;
  if (select count(distinct x->>'key') from jsonb_array_elements(expected) x where x->>'key' in ('vejoy_distributionHandovers','vejoy_finishedStock','vejoy_intermediateLots','vejoy_milkLots','vejoy_productionRounds','vejoy_traceability'))<>6 then raise exception 'Incomplete comparison snapshot';end if;
  if (select count(distinct x->>'key') from jsonb_array_elements(expected) x)<>jsonb_array_length(expected)
     or exists(select 1 from jsonb_array_elements(expected) x where coalesce(x->>'key','') not in ('vejoy_distributionHandovers','vejoy_finishedStock','vejoy_intermediateLots','vejoy_milkLots','vejoy_productionRounds','vejoy_traceability','vejoy_productionShifts')) then raise exception 'Unexpected comparison dependency';end if;
  -- The shift row participates in the same ordered locks and version checks.
  -- It is read-only: the changes whitelist above still permits only six rows.
  perform 1 from public.app_state where key in (select x->>'key' from jsonb_array_elements(expected) x) order by key for update;
  for e in select value from jsonb_array_elements(expected) loop
   select * into row_data from public.app_state where key=e->>'key';
   if (case when found then to_jsonb(row_data.version) else 'null'::jsonb end) is distinct from e->'version' then raise exception using errcode='40001',message='Production changed; retry against the latest committed records';end if;
  end loop;
  -- Preserve profile-backed permissions and the existing safety/audit triggers.
  perform set_config('request.jwt.claim.sub',actor_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor_id,'role','authenticated')::text,true);
  perform set_config('app.paneer_traceability','on',true);
  if command->>'kind' in ('handover','intermediate_packing') then perform set_config('app.atomic_paneer_packing','on',true);end if;
  for e in select jsonb_build_object('key',key,'value',value) from jsonb_each(changes) order by key loop
   if e->>'key'<>'vejoy_traceability' and jsonb_typeof(e->'value')<>'array' then raise exception 'Operational collections must remain arrays';end if;
   if e->>'key'='vejoy_traceability' and (jsonb_typeof(e->'value')<>'object' or e->'value'->>'schema'<>'1') then raise exception 'Invalid traceability schema';end if;
   -- Existing collection saves must enter UPDATE guards with OLD available.
   -- INSERT ... ON CONFLICT fires BEFORE INSERT first, which makes unchanged
   -- historical butter allocations look like newly invented audit history.
   -- The version-checked dependency rows are locked above; a missing collection is
   -- the only legitimate INSERT path. Do not bypass any audit/source guard.
   if exists(select 1 from public.app_state where key=e->>'key') then
    update public.app_state set value=e->'value' where key=e->>'key' and value is distinct from e->'value';
   else
    insert into public.app_state(key,value) values(e->>'key',e->'value');
   end if;
  end loop;
  insert into public.paneer_traceability_commands(id,actor_id,request,result) values(command_id,actor_id,command,command_result);
  receipt.result:=command_result;
 end if;
 select jsonb_agg(jsonb_build_object('key',key,'value',value,'version',version) order by key) into returned from public.app_state where key in ('vejoy_distributionHandovers','vejoy_finishedStock','vejoy_intermediateLots','vejoy_milkLots','vejoy_productionRounds','vejoy_traceability');
 return jsonb_build_object('ok',true,'rows',returned,'result',receipt.result);
end;$$;
revoke all on function public.commit_paneer_traceability(uuid,jsonb,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.commit_paneer_traceability(uuid,jsonb,jsonb,jsonb,jsonb) to service_role;

commit;
