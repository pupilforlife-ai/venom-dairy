import { useState } from 'react';
import { Download, FileText, RefreshCw } from 'lucide-react';
import type { TemperatureReading } from '../data/mockData';
import { supabase } from '../lib/supabase';
import { buildColdChainReport, coldChainReportDates, type ColdChainReport as Report } from '../lib/coldChainReport';
import { factoryDate, formatFactoryRecordedAt, type FactoryCheckRecord, type MilkStorageStateEvent } from '../lib/factoryChecklist';
import { Modal } from './Modal';

interface Props { readings: TemperatureReading[]; events: MilkStorageStateEvent[] }

export function ColdChainReport({ readings, events }: Props) {
  const role = localStorage.getItem('vejoy_user_role');
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(factoryDate());
  const [to, setTo] = useState(factoryDate());
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [downloaded, setDownloaded] = useState(false);
  if (role !== 'owner' && role !== 'admin') return null;

  async function verifiedUser(ownerOnly = false) {
    if (!supabase) {
      if (import.meta.env.PROD || import.meta.env.VITE_LOCAL_DEMO_MODE !== 'true') throw new Error('A live connection is required to review records.');
      if (ownerOnly && role !== 'owner') throw new Error('Only the owner can download operational reports.');
      return localStorage.getItem('vejoy_user_username') || 'Local demo';
    }
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) throw new Error('Sign in again before reviewing records.');
    const { data: profile, error: profileError } = await supabase.from('profiles').select('username,role,status').eq('id', auth.user.id).single();
    if (profileError || profile?.status !== 'approved' || (ownerOnly ? profile.role !== 'owner' : !['admin', 'owner'].includes(profile.role))) {
      throw new Error(ownerOnly ? 'Only an approved owner can download operational reports.' : 'Only approved admins and owners can review this report.');
    }
    return profile.username || auth.user.id;
  }

  async function review() {
    setBusy(true); setError(''); setReport(null); setDownloaded(false);
    try {
      coldChainReportDates(from, to);
      const name = await verifiedUser();
      let snapshotReadings = readings;
      let snapshotEvents = events;
      let checks: FactoryCheckRecord[] = [];
      if (supabase) {
        // Read both collections together, rather than exporting optimistic / cached edits.
        const { data, error: readError } = await supabase.from('app_state').select('key,value').in('key', ['vejoy_temperatureReadings', 'vejoy_coldChainStorageEvents']);
        if (readError) throw readError;
        const collection = (key: string) => {
          const row = data.find(item => item.key === key);
          if (row && !Array.isArray(row.value)) throw new Error(`Cannot read ${key}: stored collection is not an array.`);
          return row?.value || [];
        };
        snapshotReadings = collection('vejoy_temperatureReadings');
        snapshotEvents = collection('vejoy_coldChainStorageEvents');
        for (let offset = 0; ; offset += 500) {
          const { data: page, error: checkError } = await supabase.from('factory_daily_checks').select('*')
            .gte('check_date', from).lte('check_date', to).order('recorded_at').order('id').range(offset, offset + 499);
          if (checkError) throw checkError;
          checks.push(...page as FactoryCheckRecord[]);
          if (page.length < 500) break;
        }
      } else checks = JSON.parse(localStorage.getItem('vejoy_factoryDailyChecks') || '[]');
      setReport(buildColdChainReport({ from, to, generatedAt: new Date().toISOString(), generatedBy: name, readings: snapshotReadings, events: snapshotEvents, checks }));
    } catch (err) { setError(err instanceof Error ? err.message : (err as { message?: string }).message || 'Could not load the report. Please try again.'); }
    finally { setBusy(false); }
  }

  async function download() {
    if (!report || busy) return;
    setBusy(true); setError(''); setDownloaded(false);
    try {
      await verifiedUser(true);
      const { downloadColdChainPdf } = await import('../lib/coldChainPdf');
      await downloadColdChainPdf(report);
      setDownloaded(true);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not create the PDF. Please try again.'); }
    finally { setBusy(false); }
  }

  return <>
    <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"><FileText className="h-4 w-4" /> Review / PDF report</button>
    <Modal isOpen={open} onClose={() => { if (!busy) setOpen(false); }} title="Cold Chain — Review & PDF" size="lg">
      <div className="space-y-4">
        <p className="text-sm text-slate-600">Review recorded observations, daily coverage and storage status. Select up to 31 days. No records will be changed.</p>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs font-semibold text-slate-700">From (SAST)<input aria-label="Report start date" type="date" max={factoryDate()} value={from} disabled={busy} onChange={e => { setFrom(e.target.value); setReport(null); }} className="mt-1 block w-full min-w-0 rounded-lg border border-slate-300 px-2 py-2 text-sm" /></label>
          <label className="text-xs font-semibold text-slate-700">To (SAST)<input aria-label="Report end date" type="date" max={factoryDate()} value={to} disabled={busy} onChange={e => { setTo(e.target.value); setReport(null); }} className="mt-1 block w-full min-w-0 rounded-lg border border-slate-300 px-2 py-2 text-sm" /></label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => void review()} className="flex items-center gap-2 rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"><RefreshCw className="h-4 w-4" />{busy ? 'Please wait…' : report ? 'Refresh snapshot' : 'Review observations'}</button>
          {report && role === 'owner' && <button type="button" disabled={busy} onClick={() => void download()} className="flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"><Download className="h-4 w-4" /> Download PDF</button>}
        </div>
        {role !== 'owner' && <p className="text-xs text-slate-500">Admins can review; only the owner can download.</p>}
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {downloaded && <p role="status" className="text-sm text-emerald-700">PDF download requested. Check your browser’s downloads.</p>}
        {report && <>
          <div className="rounded-lg bg-teal-50 p-3 text-sm text-teal-900"><strong>{report.observationCount} observations · {report.excursions} excursions</strong><p className="mt-1 text-xs">Snapshot: {formatFactoryRecordedAt(report.generatedAt)} · {report.generatedBy}</p>{!supabase && <p className="font-bold">LOCAL DEMO — NOT PRODUCTION RECORDS</p>}</div>
          <details className="text-xs text-slate-600"><summary className="cursor-pointer font-semibold">How to read this report</summary><ul className="mt-2 list-disc space-y-2 pl-4">{report.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></details>
          {report.tables.map(table => <section key={table.title}>
            <h4 className="mb-2 text-sm font-bold text-slate-900">{table.title}</h4>
            {table.rows.length ? <div className="max-h-80 overflow-auto rounded-lg border border-slate-200"><table className="w-full text-xs"><thead className="sticky top-0 bg-slate-100 text-left"><tr>{table.headers.map(header => <th key={header} className="min-w-24 px-2 py-2">{header}</th>)}</tr></thead><tbody className="divide-y divide-slate-200">{table.rows.map((row, i) => <tr key={i} className={table.alertRows.includes(i) ? 'bg-rose-50 text-rose-900' : ''}>{row.map((cell, j) => <td key={j} className="whitespace-pre-line px-2 py-2 align-top">{cell}</td>)}</tr>)}</tbody></table></div> : <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">No records for this period.</p>}
          </section>)}
        </>}
      </div>
    </Modal>
  </>;
}
