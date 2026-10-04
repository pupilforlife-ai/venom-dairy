-- Force all production-board type changes through the request/review flow.
revoke all on function public.change_production_round_type(text, text, text) from public, anon, authenticated;
