-- Instructions Board: chronological operational tasks with an append-only audit trail.

create table if not exists public.instructions (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 200),
  details text not null default '',
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  sequence_no integer not null default 1 check (sequence_no > 0),
  scheduled_for timestamptz,
  due_at timestamptz,
  assigned_username text,
  assigned_shift_number integer,
  milk_lot_code text,
  related_round_id text,
  status text not null default 'posted' check (status in ('posted', 'acknowledged', 'in_progress', 'completed', 'verified', 'returned', 'cancelled')),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  acknowledged_by uuid references auth.users(id),
  acknowledged_at timestamptz,
  completed_by uuid references auth.users(id),
  completed_at timestamptz,
  verified_by uuid references auth.users(id),
  verified_at timestamptz,
  completion_note text,
  verification_note text
);

create index if not exists instructions_timeline_idx
  on public.instructions (scheduled_for asc nulls last, sequence_no asc, created_at asc);
create index if not exists instructions_status_idx on public.instructions (status);

create table if not exists public.instruction_audit (
  id bigint generated always as identity primary key,
  instruction_id uuid not null references public.instructions(id) on delete cascade,
  action text not null,
  actor_id uuid references auth.users(id),
  actor_username text,
  note text,
  before_value jsonb,
  after_value jsonb,
  created_at timestamptz not null default now()
);

create index if not exists instruction_audit_instruction_idx
  on public.instruction_audit (instruction_id, created_at desc);

alter table public.instructions enable row level security;
alter table public.instruction_audit enable row level security;

create or replace function public.is_approved_admin_or_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and status = 'approved'
      and role in ('admin', 'owner')
  );
$$;

revoke all on function public.is_approved_admin_or_owner() from public;
grant execute on function public.is_approved_admin_or_owner() to authenticated;

drop policy if exists "Approved users can read instructions" on public.instructions;
create policy "Approved users can read instructions"
  on public.instructions for select
  using (public.is_approved_user());

drop policy if exists "Admins can create instructions" on public.instructions;
create policy "Admins can create instructions"
  on public.instructions for insert
  with check (public.is_approved_admin_or_owner() and created_by = auth.uid());

drop policy if exists "Admins can update instructions" on public.instructions;
create policy "Admins can update instructions"
  on public.instructions for update
  using (public.is_approved_admin_or_owner())
  with check (public.is_approved_admin_or_owner());

drop policy if exists "No instruction deletes" on public.instructions;
-- Instructions are soft-cancelled so their record cannot disappear.

drop policy if exists "Approved users can read instruction audit" on public.instruction_audit;
create policy "Approved users can read instruction audit"
  on public.instruction_audit for select
  using (public.is_approved_user());

drop policy if exists "No direct instruction audit writes" on public.instruction_audit;
-- Audit rows are written only by security-definer trigger/RPC code.

create or replace function public.set_instruction_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists instructions_updated_at on public.instructions;
create trigger instructions_updated_at
before update on public.instructions
for each row execute function public.set_instruction_updated_at();

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
    coalesce(new.id, old.id), action_name, auth.uid(), username,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists instructions_audit on public.instructions;
create trigger instructions_audit
after insert or update on public.instructions
for each row execute function public.record_instruction_audit();

create or replace function public.update_instruction_status(
  instruction_id uuid,
  next_status text,
  status_note text default null
)
returns public.instructions
language plpgsql
security definer
set search_path = public
as $$
declare
  current_row public.instructions;
  actor_role text;
  actor_username text;
  now_value timestamptz := now();
begin
  select p.role, p.username into actor_role, actor_username
  from public.profiles p
  where p.id = auth.uid() and p.status = 'approved';
  if actor_role is null then raise exception 'Approved access required'; end if;
  if next_status not in ('acknowledged', 'in_progress', 'completed', 'verified', 'returned', 'cancelled') then
    raise exception 'Invalid instruction status';
  end if;

  select * into current_row from public.instructions where id = instruction_id for update;
  if current_row.id is null then raise exception 'Instruction not found'; end if;

  if actor_role = 'staff' and next_status in ('verified', 'returned', 'cancelled') then
    raise exception 'Only admins and owners can verify, return, or cancel instructions';
  end if;
  if actor_role = 'staff' and current_row.assigned_username is not null
    and lower(current_row.assigned_username) <> lower(actor_username) then
    raise exception 'This instruction is assigned to another user';
  end if;
  if current_row.status in ('verified', 'cancelled') then
    raise exception 'Verified or cancelled instructions cannot be changed';
  end if;

  update public.instructions i
  set status = next_status,
      acknowledged_by = case when next_status = 'acknowledged' then auth.uid() else i.acknowledged_by end,
      acknowledged_at = case when next_status = 'acknowledged' then now_value else i.acknowledged_at end,
      completed_by = case when next_status = 'completed' then auth.uid() else i.completed_by end,
      completed_at = case when next_status = 'completed' then now_value else i.completed_at end,
      verified_by = case when next_status = 'verified' then auth.uid() else i.verified_by end,
      verified_at = case when next_status = 'verified' then now_value else i.verified_at end,
      completion_note = case when next_status = 'completed' then nullif(btrim(status_note), '') else i.completion_note end,
      verification_note = case when next_status in ('verified', 'returned') then nullif(btrim(status_note), '') else i.verification_note end
  where i.id = instruction_id;

  insert into public.instruction_audit (instruction_id, action, actor_id, actor_username, note, after_value)
  select instruction_id, next_status, auth.uid(), actor_username, nullif(btrim(status_note), ''), to_jsonb(i)
  from public.instructions i where i.id = instruction_id;

  select * into current_row from public.instructions where id = instruction_id;
  return current_row;
end;
$$;

revoke all on function public.update_instruction_status(uuid, text, text) from public;
grant execute on function public.update_instruction_status(uuid, text, text) to authenticated;

revoke all on table public.instructions from anon;
revoke all on table public.instruction_audit from anon;
grant select on public.instructions to authenticated;
grant insert, update on public.instructions to authenticated;
grant select on public.instruction_audit to authenticated;

