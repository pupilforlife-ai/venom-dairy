import type { SupabaseClient } from '@supabase/supabase-js';
// Local transport only: no environment reads and no network client.
export const supabaseEnabled = false;
export const supabase: SupabaseClient | null = null;
