# venom-dairy
dairy production tracking and inventory management

## Supabase setup

1. Run `supabase/schema.sql` in the Supabase SQL Editor.
2. Copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
3. Add the same two variables in the Vercel project settings, then redeploy.

The app keeps localStorage as a fallback and synchronizes the shared application collections through the `app_state` table. The current SQL policies allow anonymous access for this prototype; add Supabase Auth and authenticated row-level security policies before storing sensitive production data.
