import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (request) => {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: 'Missing authorization' }), { status: 401, headers });
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });
    const { data: caller } = await admin.from('profiles').select('role, status').eq('id', user.id).maybeSingle();
    if (caller?.role !== 'owner' || caller.status !== 'approved') return new Response(JSON.stringify({ error: 'Owner access required' }), { status: 403, headers });
    const { userId, password } = await request.json();
    if (typeof userId !== 'string' || typeof password !== 'string' || password.length < 6) return new Response(JSON.stringify({ error: 'Invalid password request' }), { status: 400, headers });
    const { error } = await admin.auth.admin.updateUserById(userId, { password });
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers });
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unexpected error' }), { status: 500, headers });
  }
});
