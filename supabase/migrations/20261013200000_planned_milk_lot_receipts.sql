-- Planned milk lots let production start while a tanker is being offloaded.
-- Receipt details are completed later. Lot-code corrections remain owner/admin
-- only and are rejected at the database boundary, not just in the UI.

create or replace function public.guard_milk_lot_code_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and new.key = 'vejoy_milkLots'
     and auth.uid() is not null
     and exists (
       select 1
       from jsonb_array_elements(case when jsonb_typeof(old.value) = 'array' then old.value else '[]'::jsonb end) old_item
       join jsonb_array_elements(case when jsonb_typeof(new.value) = 'array' then new.value else '[]'::jsonb end) new_item
         on new_item->>'id' = old_item->>'id'
       where coalesce(new_item->>'lotCode', '') <> coalesce(old_item->>'lotCode', '')
     )
     and not exists (
       select 1
       from public.profiles
       where id = auth.uid()
         and status = 'approved'
         and role in ('owner', 'admin')
     ) then
    raise exception using
      errcode = '42501',
      message = 'Only an approved owner or admin can change a milk lot code';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_milk_lot_code_changes() from public;
grant execute on function public.guard_milk_lot_code_changes() to authenticated;

drop trigger if exists guard_milk_lot_code_changes on public.app_state;
create trigger guard_milk_lot_code_changes
before update on public.app_state
for each row execute function public.guard_milk_lot_code_changes();
