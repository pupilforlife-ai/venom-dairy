-- Butter source-lot closure is a manager-only operational action.
-- A closure is append-only from the application: reopening/removing one
-- requires an explicit reviewed database maintenance operation.

create or replace function public.guard_butter_lot_closure_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.key <> 'vejoy_butterLotClosures' then
      return old;
    end if;

    if auth.uid() is not null and not exists (
      select 1 from public.profiles
      where id = auth.uid() and status = 'approved' and role in ('owner', 'admin')
    ) then
      raise exception using
        errcode = '42501',
        message = 'Only an approved owner or admin can change butter-lot closure records.';
    end if;
    return old;
  end if;

  if new.key <> 'vejoy_butterLotClosures' then
    return new;
  end if;

  -- SQL maintenance sessions have no auth.uid() and remain available for
  -- explicit recovery. Application writes must be made by an approved manager.
  if auth.uid() is not null and not exists (
    select 1 from public.profiles
    where id = auth.uid() and status = 'approved' and role in ('owner', 'admin')
  ) then
    raise exception using
      errcode = '42501',
      message = 'Only an approved owner or admin can close a butter lot.';
  end if;

  if jsonb_typeof(new.value) <> 'array' then
    raise exception using
      errcode = '23514',
      message = 'Butter-lot closure records must be stored as an array.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(new.value) item
    where nullif(item->>'id', '') is null
  ) then
    raise exception using
      errcode = '23514',
      message = 'Every butter-lot closure must have a stable ID.';
  end if;

  if tg_op = 'UPDATE'
     and old.key = 'vejoy_butterLotClosures'
     and jsonb_typeof(old.value) = 'array'
     and auth.uid() is not null
     and exists (
       select 1
       from jsonb_array_elements(old.value) old_item
       where not exists (
         select 1
         from jsonb_array_elements(new.value) new_item
         where new_item->>'id' = old_item->>'id'
       )
     ) then
    raise exception using
      errcode = '23514',
      message = 'Butter-lot closure records cannot be removed from the application.';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_butter_lot_closure_write on public.app_state;
create trigger guard_butter_lot_closure_write
before insert or update or delete on public.app_state
for each row execute function public.guard_butter_lot_closure_write();
