import { useState } from 'react';
import { Download } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { FactoryCheckRecord } from '../lib/factoryChecklist';

export function FactoryChecklistDownload({ record }: { record: FactoryCheckRecord }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [requested, setRequested] = useState(false);
  if (localStorage.getItem('vejoy_user_role') !== 'owner') return null;

  async function download() {
    if (busy) return;
    setBusy(true); setError(''); setRequested(false);
    try {
      let saved = record;
      if (supabase) {
        const { data: auth, error: authError } = await supabase.auth.getUser();
        if (authError || !auth.user) throw new Error('Sign in again before downloading.');
        const { data: profile, error: profileError } = await supabase.from('profiles').select('role,status').eq('id', auth.user.id).single();
        if (profileError || profile?.role !== 'owner' || profile.status !== 'approved') throw new Error('Only an approved owner can download this checklist.');
        // Select by immutable submission ID, never by date or latest readings.
        const { data, error: readError } = await supabase.from('factory_daily_checks').select('*').eq('id', record.id).single();
        if (readError || !data) throw new Error('Could not retrieve this saved checklist. Please retry.');
        saved = data as FactoryCheckRecord;
      } else if (import.meta.env.PROD || import.meta.env.VITE_LOCAL_DEMO_MODE !== 'true') {
        throw new Error('A live connection is required to download this checklist.');
      }
      const { downloadFactoryChecklistPdf } = await import('../lib/factoryChecklistPdf');
      await downloadFactoryChecklistPdf(saved);
      setRequested(true);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not create this checklist PDF.'); }
    finally { setBusy(false); }
  }
  return <div className="space-y-2">
    <button type="button" disabled={busy} onClick={() => void download()} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"><Download className="h-4 w-4" />{busy ? 'Preparing checklist PDF…' : 'Download this checklist (PDF)'}</button>
    <p className="text-xs text-slate-500">Only this saved submission, not the whole day. Morning and evening checks download separately.</p>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-2 text-sm text-red-800">{error}</p>}
    {requested && <p role="status" className="text-xs text-emerald-700">PDF download requested. Check your browser’s downloads.</p>}
  </div>;
}
