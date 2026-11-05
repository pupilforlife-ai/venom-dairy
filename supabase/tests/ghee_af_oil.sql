begin;
set local lock_timeout='3s';
set local statement_timeout='30s';
create temporary table _af_probe(key text primary key,value jsonb,version bigint default 1,updated_at timestamptz default now(),updated_by uuid) on commit drop;
create temporary table _af_history(key text,operation text,old_value jsonb,new_value jsonb,old_version bigint,new_version bigint,changed_by uuid) on commit drop;
insert into _af_probe select key,value,version,updated_at,updated_by from public.app_state
 where key in ('vejoy_milkLots','vejoy_productionRounds','vejoy_creamLots','vejoy_crumbingBatches','vejoy_finishedStock');
do $copy$
declare fn text; body text; trig record;
begin
 for fn in select distinct p.proname from pg_trigger t join pg_proc p on p.oid=t.tgfoid where t.tgrelid='public.app_state'::regclass and not t.tgisinternal
   union select unnest(array['create_ghee_round','record_butter_output','commit_ghee_af_oil','record_ghee_af_oil','review_ghee_af_oil']) order by 1 loop
   select pg_get_functiondef(p.oid) into strict body from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=fn;
   body:=replace(body,'public.'||fn||'(','pg_temp.'||fn||'(');
   body:=replace(replace(body,'public.app_state_history','pg_temp._af_history'),'public.app_state','pg_temp._af_probe');
   body:=replace(body,'public.commit_ghee_af_oil(','pg_temp.commit_ghee_af_oil(');
   if strpos(body,'public.app_state')>0 then raise exception 'Diagnostic isolation failed';end if;
   execute body;
 end loop;
 for trig in select pg_get_triggerdef(t.oid) as definition,p.proname from pg_trigger t join pg_proc p on p.oid=t.tgfoid where t.tgrelid='public.app_state'::regclass and not t.tgisinternal loop
   body:=replace(trig.definition,'ON public.app_state','ON pg_temp._af_probe');
   body:=replace(body,'FUNCTION public.'||trig.proname||'(','FUNCTION pg_temp.'||trig.proname||'(');
   execute replace(body,'FUNCTION '||trig.proname||'(','FUNCTION pg_temp.'||trig.proname||'(');
 end loop;
 if exists(select 1 from pg_trigger t join pg_proc p on p.oid=t.tgfoid where t.tgrelid='pg_temp._af_probe'::regclass and p.pronamespace<>pg_my_temp_schema()) then raise exception 'A diagnostic trigger was not isolated';end if;
end;$copy$;
create function pg_temp.fail_af_save() returns trigger language plpgsql as $$ begin
 if current_setting('test.fail_af_save',true)='on' and new.key='vejoy_productionRounds' then return null;end if;return new;
end;$$;
create trigger z_fail_af_save before update on _af_probe for each row execute function pg_temp.fail_af_save();
do $test$
declare staff_id uuid; manager_id uuid; staff_name text; before_all jsonb; after_all jsonb; rounds_before jsonb; original jsonb; result jsonb; current_round jsonb;
 req jsonb; review_req jsonb; legacy_id text; new_id text; n integer; history_count integer; source_key text;
begin
 select id,username into strict staff_id,staff_name from public.profiles where status='approved' and role='staff' order by username limit 1;
 select id into strict manager_id from public.profiles where status='approved' and role='owner' order by username limit 1;
 select value into rounds_before from _af_probe where key='vejoy_productionRounds';
 select r into strict original from jsonb_array_elements(rounds_before) r where r->>'type'='Ghee' and not coalesce((r->>'locked')::boolean,false)
  and r->'afOilRecord' is null and r->>'status' not in ('discarded','cancelled','spoiled','handed_over') and (r->>'butterInput')::numeric>0 order by r->>'startTime' limit 1;
 legacy_id:=original->>'id';source_key:=case when nullif(original->>'sourceCreamLotId','') is not null then 'cream:'||(original->>'sourceCreamLotId') else 'milk:'||(original->>'milkLotId') end;
 perform set_config('request.jwt.claim.sub',staff_id::text,true);
 req:=jsonb_build_object('operationId','qa-standard','roundId',legacy_id,'expectedRecordId',null,'mode','recommended','actualKg',round((original->>'butterInput')::numeric*12.5/92.5,6),'reason','');
 select jsonb_object_agg(key,to_jsonb(s)) into before_all from _af_probe s;
 result:=pg_temp.record_ghee_af_oil(req);current_round:=result->'round';
 if current_round#>>'{afOilRecord,approvalStatus}'<>'not_required' or current_round#>>'{afOilRecord,recordedBy}'<>staff_name
   or current_round->>'status'<>original->>'status' or current_round->'packedSkus' is distinct from original->'packedSkus'
   or current_round->'butterSourceAllocations' is distinct from original->'butterSourceAllocations' then raise exception 'Standard confirmation changed production facts';end if;
 select jsonb_object_agg(key,to_jsonb(s)) into after_all from _af_probe s;
 if (after_all-'vejoy_productionRounds')<>(before_all-'vejoy_productionRounds') then raise exception 'AF oil confirmation changed source stock or other collections';end if;
 select count(*) into history_count from _af_history;
 result:=pg_temp.record_ghee_af_oil(req);
 if not (result->>'replayed')::boolean or (select count(*) from _af_history)<>history_count then raise exception 'Standard retry duplicated an audit';end if;
 -- Changed actual input is retained, changes yield, and needs review.
 req:=req||'{"operationId":"qa-change","expectedRecordId":"qa-standard","mode":"changed","actualKg":10,"reason":"Reduced due to availability"}'::jsonb;
 result:=pg_temp.record_ghee_af_oil(req);current_round:=result->'round';
 if (current_round->>'afOilInput')::numeric<>10 or current_round#>>'{afOilRecord,approvalStatus}'<>'pending'
  or (current_round->>'expectedYield')::numeric<>round(((original->>'butterInput')::numeric+10)*0.7,6) then raise exception 'Actual input or pending approval missing';end if;
 review_req:=jsonb_build_object('operationId','qa-review','roundId',legacy_id,'recordId','qa-change','decision','approve','note','');
 begin perform pg_temp.review_ghee_af_oil(review_req);raise exception 'Staff approval accepted';exception when insufficient_privilege then null;end;
 -- Stale / forged browser writes cannot erase approvals or reset actual usage.
 begin update _af_probe set value=(select jsonb_agg(case when r->>'id'=legacy_id then r-'afOilRecord' else r end) from jsonb_array_elements(value) r) where key='vejoy_productionRounds';raise exception 'Audit erasure accepted';
 exception when others then if sqlerrm not like 'AF oil confirmations and approvals%' then raise;end if;end;
 begin update _af_probe set value=(select jsonb_agg(case when r->>'id'=legacy_id then r||'{"afOilInput":12.5}'::jsonb else r end) from jsonb_array_elements(value) r) where key='vejoy_productionRounds';raise exception 'Stale actual quantity accepted';
 exception when others then if sqlerrm not like 'Confirmed AF oil input cannot be overwritten%' then raise;end if;end;
 begin perform pg_temp.record_ghee_af_oil(req||'{"operationId":"qa-stale","expectedRecordId":"qa-standard"}'::jsonb);raise exception 'Concurrent stale entry accepted';
 exception when others then if sqlerrm not like 'The AF oil record changed%' then raise;end if;end;
 perform set_config('request.jwt.claim.sub',manager_id::text,true);
 result:=pg_temp.review_ghee_af_oil(review_req||'{"decision":"reject","note":"Requires investigation"}'::jsonb);
 if (result#>>'{round,afOilInput}')::numeric<>10 or result#>>'{round,afOilRecord,approvalStatus}'<>'rejected' then raise exception 'Rejection rewrote the actual input';end if;
 -- Returning to the recipe amount is also a correction, not an approval bypass.
 perform set_config('request.jwt.claim.sub',staff_id::text,true);
 req:=req||jsonb_build_object('operationId','qa-correct','expectedRecordId','qa-change','mode','recommended','actualKg',round((original->>'butterInput')::numeric*12.5/92.5,6),'reason','Correction from physical records');
 result:=pg_temp.record_ghee_af_oil(req);
 if result#>>'{round,afOilRecord,approvalStatus}'<>'pending' then raise exception 'Correction bypassed manager review';end if;
 perform set_config('request.jwt.claim.sub',manager_id::text,true);
 review_req:=review_req||'{"operationId":"qa-approve","recordId":"qa-correct"}'::jsonb;
 result:=pg_temp.review_ghee_af_oil(review_req);
 if result#>>'{round,afOilRecord,approvalStatus}'<>'approved' then raise exception 'Owner approval failed';end if;
 select count(*) into history_count from _af_history;
 result:=pg_temp.review_ghee_af_oil(review_req);
 if not (result->>'replayed')::boolean or (select count(*) from _af_history)<>history_count then raise exception 'Review retry duplicated an audit';end if;
 -- Create a NEW round through the actual RPC and all triggers. Existing save
 -- confirmation and butter allocation logic must continue to work unchanged.
 perform set_config('request.jwt.claim.sub',staff_id::text,true);
 result:=pg_temp.create_ghee_round(jsonb_build_object('operationId','qa-af-new','roundDate','2026-11-05','butterSource',source_key,'butterInput',92.5,'team','QA only'));
 new_id:=result#>>'{round,id}';
 if result#>>'{round,afOilConfirmationRequired}'<>'true' then raise exception 'New round missing confirmation gate';end if;
 begin update _af_probe set value=(select jsonb_agg(case when r->>'id'=new_id then r||'{"status":"af_oil_added"}'::jsonb else r end) from jsonb_array_elements(value) r) where key='vejoy_productionRounds';raise exception 'Older client skipped confirmation';
 exception when others then if sqlerrm not like 'Confirm the actual AF oil quantity%' then raise;end if;end;
 req:=jsonb_build_object('operationId','qa-af-new-record','roundId',new_id,'expectedRecordId',null,'mode','changed','actualKg',0,'reason','No AF oil available for this round');
 result:=pg_temp.record_ghee_af_oil(req);
 if result#>>'{round,status}'<>'af_oil_added' or (result#>>'{round,afOilInput}')::numeric<>0 or (result#>>'{round,expectedYield}')::numeric<>64.75 then raise exception 'Zero physical input or next stage was not recorded';end if;
 update _af_probe set value=(select jsonb_agg(case when r->>'id'=new_id then r||'{"status":"cooking"}'::jsonb else r end) from jsonb_array_elements(value) r) where key='vejoy_productionRounds';
 if (select r->>'status' from _af_probe s cross join lateral jsonb_array_elements(s.value) r where s.key='vejoy_productionRounds' and r->>'id'=new_id)<>'cooking' then raise exception 'Pending approval blocked production';end if;
 -- A real failed save must not claim success or leave partial audit entries.
 req:=req||'{"operationId":"qa-af-failure","expectedRecordId":"qa-af-new-record","mode":"changed","actualKg":1,"reason":"Confirmed measured correction"}'::jsonb;
 select jsonb_object_agg(key,to_jsonb(s)) into before_all from _af_probe s;
 perform set_config('test.fail_af_save','on',true);
 begin perform pg_temp.record_ghee_af_oil(req);raise exception 'Unconfirmed save accepted';
 exception when others then if sqlerrm<>'AF oil save was not confirmed' then raise;end if;end;
 perform set_config('test.fail_af_save','off',true);
 select jsonb_object_agg(key,to_jsonb(s)) into after_all from _af_probe s;
 if before_all<>after_all then raise exception 'Failed save left partial state';end if;
 perform set_config('request.jwt.claim.sub','',true);
 begin perform pg_temp.record_ghee_af_oil(req);raise exception 'Anonymous input accepted';exception when insufficient_privilege then null;end;
 if has_function_privilege('authenticated','public.commit_ghee_af_oil(jsonb,text)','EXECUTE') then raise exception 'Private commit helper exposed';end if;
end;$test$;
select 'PASS: complete trigger chain; actual/recommended oil; owner-only review; production continues; corrected inputs/yield; retries; stale writes; failures; unchanged sources and packing' as result;
rollback;
