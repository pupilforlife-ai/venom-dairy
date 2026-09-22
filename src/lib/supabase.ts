import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseEnabled = Boolean(supabaseUrl && supabasePublishableKey);

export const supabase = supabaseEnabled
  ? createClient(supabaseUrl, supabasePublishableKey)
  : null;
