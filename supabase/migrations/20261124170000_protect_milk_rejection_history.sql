-- Add protection for new rejection receipts. No existing records are changed.
begin;
set local lock_timeout='3s';
create or replace function public.guard_milk_rejection_history()
returns trigger language plpgsql security definer set search_path=public as $$
declare prior jsonb; item jsonb; receipt jsonb; previous_by_id jsonb; actor_role text; rounds_old jsonb; rejected_lots jsonb; replacements jsonb:='{}'::jsonb; correction boolean;
begin
 if new.key='vejoy_milkLots' then
  select coalesce(jsonb_object_agg(value->>'id',value),'{}'::jsonb) into previous_by_id from jsonb_array_elements(case when tg_op='UPDATE' then old.value else '[]'::jsonb end);
  select role into actor_role from public.profiles where id=auth.uid() and status='approved';
  for item in select value from jsonb_array_elements(new.value) loop
   prior:=previous_by_id->(item->>'id');
   if item is not distinct from prior then continue;end if;
   for receipt in select value from jsonb_array_elements(coalesce(item->'milkBalanceReviews','[]'::jsonb)) where value->>'kind'='milk_rejection' loop
    if not coalesce(prior->'milkBalanceReviews','[]'::jsonb) @> jsonb_build_array(receipt) then
     if coalesce(current_setting('app.paneer_traceability',true),'off')<>'on' or coalesce(actor_role,'') not in ('owner','admin') then raise exception 'Record rejected milk using the Owner/Admin Reject milk action';end if;
     if receipt->>'reviewedBy' is distinct from (select username from public.profiles where id=auth.uid()) then raise exception 'Milk rejection recorder must match the signed-in account';end if;
    end if;
   end loop;
   if not exists(select 1 from jsonb_array_elements(coalesce(prior->'milkBalanceReviews','[]'::jsonb)) x where x->>'kind'='milk_rejection') then continue;end if;
   for receipt in select value from jsonb_array_elements(prior->'milkBalanceReviews') loop
    if not coalesce(item->'milkBalanceReviews','[]'::jsonb) @> jsonb_build_array(receipt) then raise exception 'Milk rejection history is protected. Refresh before saving';end if;
   end loop;
   correction:=exists(select 1 from jsonb_array_elements(coalesce(item->'milkBalanceReviews','[]'::jsonb)) e where not coalesce(prior->'milkBalanceReviews','[]'::jsonb) @> jsonb_build_array(e) and e->'before'->'rejected'=prior->'litresRejected' and e->'after'->'rejected'=item->'litresRejected');
   if coalesce((item->>'litresRejected')::numeric,0)<coalesce((prior->>'litresRejected')::numeric,0) and not (coalesce(actor_role,'') in ('owner','admin') and correction) then raise exception 'Rejected milk cannot be reset by a stale save. Use Review and correct milk balance';end if;
   if prior->>'status'='rejected' and not correction and item->>'status' is distinct from 'rejected' then
    -- Adding a newer lot must not relabel this rejected receipt as completed.
    item:=item||'{"status":"rejected"}'::jsonb;replacements:=replacements||jsonb_build_object(item->>'id',item);
   elsif prior->>'status'='rejected' and correction and coalesce((item->>'litresRemaining')::numeric,0)>0 and item->>'status'='rejected' then
    item:=item||jsonb_build_object('status',case when item->>'isLatest'='true' then 'active' else 'completed' end);replacements:=replacements||jsonb_build_object(item->>'id',item);
   end if;
  end loop;
  if tg_op='UPDATE' and exists(select 1 from jsonb_array_elements(old.value) o cross join lateral jsonb_array_elements(coalesce(o->'milkBalanceReviews','[]'::jsonb)) e where e->>'kind'='milk_rejection' and not exists(select 1 from jsonb_array_elements(new.value) n where n->>'id'=o->>'id')) then raise exception 'A milk lot with rejection history cannot be removed';end if;
  if replacements<>'{}'::jsonb then new.value:=(select jsonb_agg(coalesce(replacements->(value->>'id'),value) order by ord) from jsonb_array_elements(new.value) with ordinality t(value,ord));end if;
 elsif new.key='vejoy_productionRounds' then
  select coalesce(jsonb_agg(l),'[]'::jsonb) into rejected_lots from public.app_state s cross join lateral jsonb_array_elements(s.value) l where s.key='vejoy_milkLots' and l->>'status'='rejected';
  if rejected_lots='[]'::jsonb then return new;end if;
  select coalesce(jsonb_object_agg(value->>'id',value),'{}'::jsonb) into rounds_old from jsonb_array_elements(case when tg_op='UPDATE' then old.value else '[]'::jsonb end);
  for item in select value from jsonb_array_elements(new.value) loop
   prior:=rounds_old->(item->>'id');
   if item is not distinct from prior then continue;end if;
   if item->>'type' in ('D','C/S','Halloumi','Amassi') and item->>'status' not in ('scheduled','cancelled') and (prior is null or prior->>'status' in ('scheduled','cancelled')) and exists(select 1 from jsonb_array_elements(rejected_lots) l where l->>'id'=item->>'milkLotId' or l->>'lotCode'=item->>'milkLotCode') then raise exception 'This milk lot is rejected. Select another milk lot before starting production';end if;
  end loop;
 end if;
 return new;
end;$$;
create or replace trigger guard_milk_rejection_history before insert or update on public.app_state for each row execute function public.guard_milk_rejection_history();
revoke all on function public.guard_milk_rejection_history() from public,anon,authenticated;
commit;
