import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const localDemoMode = import.meta.env.VITE_LOCAL_DEMO_MODE === 'true';

export const supabaseEnabled = !localDemoMode && Boolean(supabaseUrl && supabasePublishableKey);

export const supabase = supabaseEnabled
  ? createClient(supabaseUrl, supabasePublishableKey)
  : null;
