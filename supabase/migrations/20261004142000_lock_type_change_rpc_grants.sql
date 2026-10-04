-- Type-change requests are authenticated operational actions, never anonymous.
revoke all on function public.request_production_round_type_change(text, text, text) from anon;
revoke all on function public.review_production_round_type_change(text, text, text) from anon;
