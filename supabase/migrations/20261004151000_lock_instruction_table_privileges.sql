-- Keep the Instructions Board append-only from the client side.
-- Admin/owner edits still pass through RLS; status changes use the RPC.

revoke all on table public.instructions from public, anon, authenticated;
revoke all on table public.instruction_audit from public, anon, authenticated;

grant select, insert, update on table public.instructions to authenticated;
grant select on table public.instruction_audit to authenticated;

