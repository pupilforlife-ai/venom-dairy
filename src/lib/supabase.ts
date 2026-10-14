import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
// Demo storage is intentionally development-only. A production bundle must
// never silently fall back to browser localStorage, otherwise staff can enter
// data that is invisible to the deployed Supabase-backed application. The
// explicit preview flag is the sole exception: it creates an isolated staff
// test build that cannot read or write the live Supabase project.
const isolatedPreviewMode = import.meta.env.VITE_PREVIEW_MODE === 'true';
const localDemoMode = isolatedPreviewMode || (!import.meta.env.PROD && import.meta.env.VITE_LOCAL_DEMO_MODE === 'true');

export const supabaseEnabled = !localDemoMode && Boolean(supabaseUrl && supabasePublishableKey);

export const supabase = supabaseEnabled
  ? createClient(supabaseUrl!, supabasePublishableKey!)
  : null;
