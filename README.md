# venom-dairy
dairy production tracking and inventory management

## Supabase setup

1. Run `supabase/schema.sql` in the Supabase SQL Editor.
2. Copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
3. Add the same two variables in the Vercel project settings, then redeploy.
   Do not set `VITE_LOCAL_DEMO_MODE=true` in Vercel; production builds always
   use Supabase and never treat browser localStorage as the source of truth.

The app uses localStorage only for an explicitly enabled development demo. The
deployed app reads and writes the shared application collections through the
`app_state` table. Supabase Auth and the approved-user row-level security
policies in `supabase/auth_schema.sql` are required for production access.
