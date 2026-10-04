-- Keep the audit trigger return path explicit for INSERT/UPDATE rows.
create or replace function public.record_instruction_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  username text;
  action_name text;
begin
  select p.username into username from public.profiles p where p.id = auth.uid();
  action_name := case when tg_op = 'INSERT' then 'created'
    when old.status is distinct from new.status then 'status_changed'
    else 'updated' end;
  insert into public.instruction_audit (
    instruction_id, action, actor_id, actor_username,
    before_value, after_value
  ) values (
    case when tg_op = 'DELETE' then old.id else new.id end,
    action_name, auth.uid(), username,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

