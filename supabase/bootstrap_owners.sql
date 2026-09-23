-- Run after HK, SA, and KB have each submitted an access request from the login page.
-- Usernames are normalized to lowercase by the app.
update public.profiles
set role = 'owner',
    status = 'approved',
    approved_at = now()
where username in ('hk', 'sa', 'kb');

select username, role, status
from public.profiles
where username in ('hk', 'sa', 'kb')
order by username;
