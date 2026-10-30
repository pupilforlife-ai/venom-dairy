-- Reject invalid numeric writes from older open clients as well as new code.
-- Existing untouched legacy fields are retained; no records are rewritten.
begin;
set local lock_timeout='3s';
create or replace function public.valid_ghee_quantity(v jsonb)
returns boolean language sql immutable set search_path=public as $$
  select case when jsonb_typeof(v)='number' then (v#>>'{}')::numeric>=0 else false end;
$$;
create or replace function public.guard_ghee_numeric_state()
returns trigger language plpgsql security definer set search_path=public as $$
declare r jsonb; previous jsonb; field text; fields text[]; old_pool jsonb; pool jsonb;
begin
  if auth.uid() is null or jsonb_typeof(new.value)<>'array' then return new; end if;
  if new.key='vejoy_productionRounds' then
    for r in select value from jsonb_array_elements(new.value) loop
      previous:=null;
      if tg_op='UPDATE' then select value into previous from jsonb_array_elements(old.value) where value->>'id'=r->>'id'; end if;
      if previous->>'gheeInputVersion'='1' and r->>'type' is distinct from 'Ghee' then raise exception 'An audited ghee round cannot be converted into another product'; end if;
      if r->>'type' not in ('Butter','Ghee') then continue; end if;
      fields:=case when r->>'type'='Ghee' then array['butterInput','actualInput','plannedInput','afOilInput','expectedYield','butterOverdrawKg']
        else array['butterOutput','remainingBalance','usedInGhee'] end;
      foreach field in array fields loop
        if (previous is null and r ? field) or (previous is not null and r->field is distinct from previous->field) then
          if not public.valid_ghee_quantity(r->field) then
            raise exception 'Invalid % for % round %. Enter a finite non-negative number; no source balances were changed.',field,r->>'type',r->>'id';
          end if;
        end if;
      end loop;
      if r->>'type'='Ghee' and previous is null and (not public.valid_ghee_quantity(r->'butterInput') or (r->>'butterInput')::numeric<=0) then
        raise exception 'A ghee round requires a finite positive butter input';
      end if;
      if previous->>'gheeInputVersion'='1' and coalesce(current_setting('app.atomic_ghee_round',true),'off')<>'on'
        and (r->'butterInput' is distinct from previous->'butterInput' or r->'afOilInput' is distinct from previous->'afOilInput'
          or r->'butterSourceAllocations' is distinct from previous->'butterSourceAllocations' or r->'gheeInputVersion' is distinct from previous->'gheeInputVersion') then
        raise exception 'Audited ghee inputs and source allocations require a reviewed correction; refresh before saving';
      end if;
      if r->>'type'='Butter' and public.valid_ghee_quantity(previous->'usedInGhee')
        and (previous->>'usedInGhee')::numeric>coalesce((r->>'usedInGhee')::numeric,0) then
        raise exception 'Recorded butter use in ghee cannot be reset by a stale snapshot';
      end if;
    end loop;
  elsif new.key='vejoy_milkLots' then
    for r in select value from jsonb_array_elements(new.value) loop
      previous:=null;
      if tg_op='UPDATE' then select value into previous from jsonb_array_elements(old.value) where value->>'id'=r->>'id'; end if;
      pool:=r->'butterPool'; old_pool:=previous->'butterPool';
      if public.valid_ghee_quantity(old_pool->'usedInGhee') and (old_pool->>'usedInGhee')::numeric>0
        and jsonb_typeof(pool) is distinct from 'object' then raise exception 'Audited butter pool cannot be erased by a stale snapshot'; end if;
      if jsonb_typeof(pool) is distinct from 'object' then continue; end if;
      foreach field in array array['totalButterProduced','usedInGhee','usedInBlending','packedAsPubb','availableBalance'] loop
        if pool->field is distinct from old_pool->field and not public.valid_ghee_quantity(pool->field) then
          raise exception 'Invalid butter pool %; no source balances were changed',field;
        end if;
      end loop;
      if public.valid_ghee_quantity(old_pool->'usedInGhee') and (old_pool->>'usedInGhee')::numeric>coalesce((pool->>'usedInGhee')::numeric,0) then
        raise exception 'Recorded lot butter use in ghee cannot be reset by a stale snapshot';
      end if;
    end loop;
  end if;
  return new;
end;
$$;
revoke all on function public.valid_ghee_quantity(jsonb) from public,anon,authenticated;
revoke all on function public.guard_ghee_numeric_state() from public,anon,authenticated;
create or replace trigger guard_ghee_numeric_state before insert or update on public.app_state
  for each row execute function public.guard_ghee_numeric_state();
commit;
