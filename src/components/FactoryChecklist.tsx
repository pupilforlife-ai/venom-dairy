import { useCallback, useEffect, useState } from 'react';
import { ClipboardCheck, AlertTriangle, History } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Modal } from './Modal';
import { useToast } from './Toast';
import { useApp } from '../store/AppContext';
import { useSupabaseState } from '../hooks/useSupabaseState';
import { supabase } from '../lib/supabase';
import {
  FACTORY_CHECKLIST_START_DATE, corridorNightShiftReasons, factoryCheckDates, factoryDate,
  factoryLockPoints, factoryReadingValue, factoryTemperaturePoints, factoryTemperatureInRange, factoryTemperatureTarget, factoryTemperatureProgress, latestFactoryChecks,
  missedFactoryCheckReasons, validateFactoryCheck,
  type FactoryCheckPayload, type FactoryCheckRecord, type FactoryLockAnswer,
  type FactoryTemperatureAnswer, type MilkStorageStateEvent,
} from '../lib/factoryChecklist';

const fieldClass = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';
const displayTime = (date: string) => new Date(date).toLocaleString('en-GB', { timeZone: 'Africa/Johannesburg' });
const displayDate = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { dateStyle: 'full' });

export function FactoryChecklist() {
  const role = localStorage.getItem('vejoy_user_role');
  return role === 'owner' || role === 'admin' ? <ManagerFactoryChecklist /> : null;
}

function ManagerFactoryChecklist() {
  const { temperatureReadings, addTemperatureReading, milkLots } = useApp();
  const { showToast } = useToast();
  const [storageEvents, setStorageEvents] = useSupabaseState<MilkStorageStateEvent[]>('vejoy_coldChainStorageEvents', []);
  const [records, setRecords] = useState<FactoryCheckRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [today, setToday] = useState(factoryDate());
  const [checkDate, setCheckDate] = useState(today);
  const [status, setStatus] = useState<FactoryCheckRecord['status']>('completed');
  const [payload, setPayload] = useState<FactoryCheckPayload>({ locks: {}, corridorReasons: [], temperatures: {} });
  const [editing, setEditing] = useState(false);
  const [history, setHistory] = useState(false);
  const [review, setReview] = useState<FactoryCheckRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [allDays, setAllDays] = useState(false);
  const latest = latestFactoryChecks(records);
  const missing = factoryCheckDates(today).filter(date => !latest.has(date)
    || latest.get(date)?.status === 'completed' && factoryTemperatureProgress(date, temperatureReadings, storageEvents).some(row => !row.complete));
  const todayRecord = latest.get(today);
  const temperatureProgress = factoryTemperatureProgress(today, temperatureReadings, storageEvents);
  const temperaturesComplete = temperatureProgress.every(row => row.complete);

  const reload = useCallback(async () => {
    try {
      if (supabase) {
        const loaded: FactoryCheckRecord[] = [];
        for (let offset = 0; ; offset += 500) {
          const { data, error } = await supabase.from('factory_daily_checks').select('*').order('recorded_at', { ascending: false }).order('id').range(offset, offset + 499);
          if (error) throw error;
          loaded.push(...data as FactoryCheckRecord[]);
          if (data.length < 500) break;
        }
        setRecords(loaded);
      } else {
        setRecords(JSON.parse(localStorage.getItem('vejoy_factoryDailyChecks') || '[]'));
      }
      setLoadError('');
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String((error as { message?: string }).message || error));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    void reload();
    const refresh = () => { setToday(factoryDate()); void reload(); };
    const interval = window.setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh);
    const channel = supabase?.channel('factory-checklist-dashboard').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'factory_daily_checks' }, refresh).subscribe();
    return () => { clearInterval(interval); window.removeEventListener('focus', refresh); if (channel) void supabase?.removeChannel(channel); };
  }, [reload]);

  function open(date: string, mode: FactoryCheckRecord['status'], scope: FactoryCheckPayload['scope'] = 'all') {
    const temperatures: FactoryCheckPayload['temperatures'] = {};
    factoryTemperaturePoints.forEach(point => {
      const event = [...storageEvents].filter(item => item.location === point.location).sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))[0];
      temperatures[point.id] = {
        status: point.section === 'cold' ? 'active' : event ? event.status === 'empty' ? 'empty' : 'active' : temperatureProgress.find(row => row.point.id === point.id)?.activity || '',
        ...(point.section === 'milk' ? { milkLotCode: event?.milkLotCode || milkLots.find(lot => lot.status === 'active')?.lotCode } : {}),
      };
    });
    setCheckDate(date); setStatus(mode); setPayload({ scope, locks: {}, corridorReasons: [], temperatures, notes: '' });
    setSaveError(''); setEditing(true);
  }
  function changeTemperature(id: string, patch: Partial<FactoryTemperatureAnswer>) {
    setPayload(current => ({ ...current, temperatures: { ...current.temperatures, [id]: { ...current.temperatures[id], ...patch } } }));
  }
  async function save() {
    const validation = validateFactoryCheck(payload, status);
    if (validation) { setSaveError(validation); return; }
    setBusy(true); setSaveError('');
    try {
      let saved: FactoryCheckRecord;
      if (supabase) {
        const { data, error } = await supabase.rpc('submit_factory_daily_check', { p_check_date: checkDate, p_status: status, p_payload: payload });
        if (error) throw error;
        saved = data as FactoryCheckRecord;
      } else {
        // Development-only demo: production never falls back to local storage.
        if (import.meta.env.PROD || import.meta.env.VITE_LOCAL_DEMO_MODE !== 'true') throw new Error('Cloud connection is unavailable. Nothing has been signed off.');
        saved = { id: crypto.randomUUID(), check_date: checkDate, status, payload: structuredClone(payload), recorded_at: new Date().toISOString(), recorded_by: 'local-demo', recorded_by_name: localStorage.getItem('vejoy_user_username') || 'Demo admin' };
        if (status === 'completed' && payload.scope !== 'locks') {
          for (const point of factoryTemperaturePoints) {
            const answer = saved.payload.temperatures[point.id];
            if (point.section !== 'cold') setStorageEvents(current => [...current, { id: crypto.randomUUID(), location: point.location, status: answer.status === 'active' ? point.section === 'milk' ? 'milk_present' : 'in_use' : 'empty', milkLotCode: answer.milkLotCode, recordedAt: saved.recorded_at, recordedBy: saved.recorded_by_name }]);
            if (answer.status !== 'active') continue;
            const existing = temperatureReadings.find(reading => reading.id === answer.existingReadingId && reading.location === point.location && factoryDate(reading.recordedAt) === today);
            if (answer.existingReadingId && !existing) throw new Error('Selected reading is no longer available.');
            const value = existing ? factoryReadingValue(point, existing)! : answer.temperature!;
            const inRange = factoryTemperatureInRange(point, value);
            if (!existing) addTemperatureReading({ location: point.location, temperature: value, targetMin: point.min ?? 0, targetMax: point.max ?? 0, recordedAt: saved.recorded_at, recordedBy: saved.recorded_by_name, factoryChecklistId: saved.id, ...(point.section === 'milk' ? { coldChainStorageReading: true, milkTemperature: value, milkTemperatureInRange: inRange, milkLotCode: answer.milkLotCode } : {}), ...(point.min === null ? point.max === null ? { rangeNotConfigured: true } : { upperLimitOnly: true } : {}) });
            saved.payload.temperatures[point.id] = { ...answer, temperature: value, observedAt: existing?.recordedAt || saved.recorded_at, recordedBy: existing?.recordedBy || saved.recorded_by_name, readingId: existing?.id, inRange, targetLabel: factoryTemperatureTarget(point) };
          }
        }
        localStorage.setItem('vejoy_factoryDailyChecks', JSON.stringify([saved, ...records]));
      }
      setRecords(current => [saved, ...current.filter(record => record.id !== saved.id)]);
      setEditing(false); setReview(saved);
      showToast('success', status === 'completed' ? payload.scope === 'locks' ? 'Locks and lights check signed off.' : 'Temperature check saved and linked to Cold Chain.' : 'Reason recorded. This day is not marked as inspected.');
    } catch (error) {
      setSaveError(`Not saved: ${error instanceof Error ? error.message : String((error as { message?: string }).message || error)}`);
    } finally { setBusy(false); }
  }

  return <section className="rounded-xl border border-indigo-200 bg-white p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><ClipboardCheck className="h-5 w-5 text-indigo-600" /> Daily factory checklist</h2><p className="mt-1 text-sm text-slate-600">{displayDate(today)} · Owner / admin sign-off</p></div>
      <div className="flex flex-wrap gap-2"><button className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" onClick={() => setHistory(true)}><History className="mr-1 inline h-4 w-4" /> Dated history</button><Link to="/cold-chain" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cold Chain</Link></div>
    </div>
    {loading ? <p className="mt-3 text-sm text-slate-500">Checking saved sign-offs…</p> : loadError ? <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">Cannot verify checklist history: {loadError} <button onClick={() => void reload()} className="underline">Retry</button></div> : <>
      <div className={`mt-4 rounded-lg p-3 text-sm ${todayRecord?.status === 'completed' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`}>
        {todayRecord ? <><p className="font-semibold">{todayRecord.status === 'completed' ? 'Locks and lights signed off' : `Not inspected: ${todayRecord.payload.missedReason}`}</p><p className="mt-1">{todayRecord.recorded_by_name} · {displayTime(todayRecord.recorded_at)}</p><button className="mt-1 underline" onClick={() => setReview(todayRecord)}>View recorded form</button></> : <p className="font-semibold">Today’s locks and lights have not been checked.</p>}
      </div>
      <div className="mt-3 flex flex-wrap gap-2"><button className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700" onClick={() => open(today, 'completed', 'locks')}>{todayRecord ? 'Recheck locks and lights' : 'Check locks and lights'}</button><button className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" onClick={() => open(today, 'not_completed')}>Record closure / missed-check reason</button></div>
      <div className={`mt-4 rounded-lg border p-3 ${temperaturesComplete ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
        <h3 className="font-semibold text-slate-900">Temperatures — twice daily</h3>
        <p className="mt-1 text-xs text-slate-600">Two separate readings per in-use location each day. Empty vessels need no reading. Readings entered in Cold Chain count here; reusing one reading never counts as a second check.</p>
        <div className="my-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{temperatureProgress.map(row => <div key={row.point.id} className="flex items-center justify-between gap-2 rounded border border-white bg-white/80 px-2 py-2 text-xs"><span>{row.point.label}</span><span className={row.complete ? 'font-semibold text-emerald-700' : 'font-semibold text-amber-800'}>{row.activity === 'empty' ? 'Empty / not in use' : row.activity === undefined ? 'Confirm status' : `${row.count}/2 readings`}</span></div>)}</div>
        <p className={`mb-2 text-sm font-semibold ${temperaturesComplete ? 'text-emerald-800' : 'text-amber-900'}`}>{temperaturesComplete ? 'Both temperature checks recorded for all locations in use.' : 'Temperature checks outstanding.'}</p>
        <button className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700" onClick={() => open(today, 'completed', 'temperatures')}>Record temperature check</button>
      </div>
      {missing.filter(date => date < today).length > 0 && <div className="mt-3 rounded-lg border border-amber-200 p-3 text-sm text-amber-900"><p className="mb-2 flex items-center gap-1 font-semibold"><AlertTriangle className="h-4 w-4" /> Missing daily checks — record a reason</p><div className="flex flex-wrap gap-2">{(allDays ? missing : missing.slice(0, 8)).filter(date => date < today).map(date => <button key={date} className="rounded border border-amber-300 px-2 py-1" onClick={() => open(date, 'not_completed')}>{date}</button>)}</div>{missing.length > 8 && <button className="mt-2 underline" onClick={() => setAllDays(!allDays)}>{allDays ? 'Show fewer' : 'Show all missing days'}</button>}</div>}
    </>}

    <Modal isOpen={editing} onClose={() => { if (!busy) setEditing(false); }} title={`${payload.scope === 'temperatures' ? 'Temperature check' : payload.scope === 'locks' ? 'Locks and lights' : 'Daily factory checklist'} · ${checkDate}`} size="lg">
      <form className="space-y-5" onSubmit={event => { event.preventDefault(); void save(); }}>
        <p className="text-sm text-slate-600">Factory time: South Africa. Your account name and submission time are recorded. Earlier submissions remain in history.</p>
        {status === 'not_completed' ? <>
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">This records why an inspection was missed or the factory was closed. It does not mark checks as passed.</p>
          <label className="block text-sm font-medium">Reason<select className={`${fieldClass} mt-1`} value={payload.missedReason || ''} onChange={event => setPayload(current => ({ ...current, missedReason: event.target.value }))}><option value="">Select reason</option>{missedFactoryCheckReasons.map(reason => <option key={reason}>{reason}</option>)}</select></label>
        </> : <>
          {payload.scope !== 'temperatures' && <fieldset className="space-y-3"><legend className="mb-3 font-bold text-slate-900">1. Factory locks and lights</legend>
            {factoryLockPoints.map((point, index) => <label key={point.id} className="block text-sm font-medium">{index + 1}. {point.label}<select className={`${fieldClass} mt-1`} value={payload.locks[point.id] || ''} onChange={event => setPayload(current => ({ ...current, locks: { ...current.locks, [point.id]: event.target.value as FactoryLockAnswer } }))}><option value="">Select status</option><option value={point.kind === 'lock' ? 'locked' : 'off'}>{point.kind === 'lock' ? 'Locked' : 'Off'}</option><option value="night_shift">{point.kind === 'lock' ? 'Left open on account of night shift' : 'On due to night shift'}</option></select></label>)}
            {payload.locks.corridor_lights === 'night_shift' && <div className="rounded-lg bg-amber-50 p-3"><p className="mb-2 text-sm font-semibold">Why are the corridor lights on?</p>{corridorNightShiftReasons.map(reason => <label className="mr-4 inline-flex items-center gap-2 py-1 text-sm" key={reason}><input type="checkbox" checked={payload.corridorReasons.includes(reason)} onChange={event => setPayload(current => ({ ...current, corridorReasons: event.target.checked ? [...current.corridorReasons, reason] : current.corridorReasons.filter(item => item !== reason) }))} />{reason}</label>)}</div>}
          </fieldset>}
          {payload.scope !== 'locks' && (['cold', 'milk', 'cooling'] as const).map(section => <fieldset key={section} className="space-y-3"><legend className="mb-3 font-bold text-slate-900">{section === 'cold' ? '2. Cold-chain temperatures' : section === 'milk' ? '3. Milk temperatures — only where milk is present' : 'Cooling tanks — only while in use'}</legend>
            {factoryTemperaturePoints.filter(point => point.section === section).map(point => {
              const answer = payload.temperatures[point.id];
              const recent = [...temperatureReadings].filter(reading => reading.location === point.location && factoryDate(reading.recordedAt) === today && Number.isFinite(factoryReadingValue(point, reading))).sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))[0];
              const outside = answer?.status === 'active' && answer.temperature !== undefined && factoryTemperatureInRange(point, answer.temperature) === false;
              return <div key={point.id} className="rounded-lg border border-slate-200 p-3">
                <p className="text-sm font-semibold">{point.label}</p>
                <p className="my-1 text-xs text-slate-500">{factoryTemperatureTarget(point)}</p>
                {section !== 'cold' && <label className="block text-sm">Status<select aria-label={`${point.label} status`} className={`${fieldClass} mb-2 mt-1`} value={answer?.status || ''} onChange={event => changeTemperature(point.id, { status: event.target.value as FactoryTemperatureAnswer['status'], temperature: undefined, existingReadingId: undefined })}><option value="">Confirm status</option><option value="active">{section === 'milk' ? 'Milk present' : 'In use'}</option><option value="empty">{section === 'milk' ? 'Empty — no milk' : 'Empty / not in use'}</option></select></label>}
                {answer?.status === 'active' && <>
                  {answer.existingReadingId ? <div className="rounded-lg bg-blue-50 p-2 text-sm text-blue-900">Linked to today’s Cold Chain reading. This does not count as a second observation. <button type="button" className="underline" onClick={() => changeTemperature(point.id, { existingReadingId: undefined })}>Enter a new reading instead</button></div> : <label className="block text-sm">{section === 'milk' ? 'Milk temperature' : 'Temperature'} (°C)<input aria-label={`${point.label} temperature`} type="number" step="any" className={`${fieldClass} mt-1`} value={answer.temperature ?? ''} onChange={event => changeTemperature(point.id, { temperature: event.target.value === '' ? undefined : Number(event.target.value) })} /></label>}
                  {outside && <p className="mt-1 text-sm font-semibold text-red-700">Outside required range — this will be flagged in Cold Chain.</p>}
                  {recent && !answer.existingReadingId && <button type="button" className="mt-2 text-left text-xs text-blue-700 underline" onClick={() => changeTemperature(point.id, { existingReadingId: recent.id, temperature: undefined })}>Use recorded reading: {factoryReadingValue(point, recent)}°C · {displayTime(recent.recordedAt)} · {recent.recordedBy}</button>}
                  {section === 'milk' && <label className="mt-2 block text-xs text-slate-600">Milk lot (optional)<select className={`${fieldClass} mt-1`} value={answer.milkLotCode || ''} onChange={event => changeTemperature(point.id, { milkLotCode: event.target.value })}><option value="">Not specified</option>{milkLots.map(lot => <option key={lot.id}>{lot.lotCode}</option>)}</select></label>}
                </>}
              </div>;
            })}
          </fieldset>)}
        </>}
        <label className="block text-sm font-medium">Notes / explanation<textarea rows={3} className={`${fieldClass} mt-1`} value={payload.notes || ''} onChange={event => setPayload(current => ({ ...current, notes: event.target.value }))} /></label>
        {saveError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{saveError}</p>}
        <button type="submit" disabled={busy} className="w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Saving — please wait…' : status === 'completed' ? payload.scope === 'temperatures' ? 'Save temperature check' : 'Sign off locks and lights' : 'Save reason (not inspected)'}</button>
      </form>
    </Modal>

    <Modal isOpen={history} onClose={() => setHistory(false)} title="Daily factory checklist — dated history" size="lg">
      <div className="space-y-3"><p className="text-sm text-slate-500">Tracking starts {FACTORY_CHECKLIST_START_DATE}. Locks and lights are checked once daily; temperatures need two distinct observations per in-use location. All submissions are retained.</p>{factoryCheckDates(today).map(date => {
        const dayRecords = records.filter(record => record.check_date === date).sort((a, b) => b.recorded_at.localeCompare(a.recorded_at));
        const dailyTemperatures = factoryTemperatureProgress(date, temperatureReadings, storageEvents);
        return <div key={date} className="rounded-lg border border-slate-200 p-3"><p className="mb-2 font-semibold">{displayDate(date)}</p><p className="mb-2 text-xs text-slate-600">Temperature readings: {dailyTemperatures.filter(row => row.activity === 'active').map(row => `${row.point.label} ${row.count}/2`).join(' · ') || 'No active locations confirmed'}</p>{dayRecords.length ? dayRecords.map(record => <button key={record.id} className="my-1 block w-full rounded-lg bg-slate-50 p-2 text-left text-sm hover:bg-slate-100" onClick={() => { setHistory(false); setReview(record); }}>{record.status === 'completed' ? record.payload.scope === 'temperatures' ? 'Temperature check' : record.payload.scope === 'locks' ? 'Locks and lights check' : 'Locks and temperature inspection' : `Not inspected · ${record.payload.missedReason}`}<br /><span className="text-xs text-slate-500">{record.recorded_by_name} · {displayTime(record.recorded_at)}</span></button>) : <button className="text-sm text-amber-800 underline" onClick={() => { setHistory(false); open(date, 'not_completed'); }}>Missing — record reason</button>}</div>;
      })}</div>
    </Modal>
    <Modal isOpen={!!review} onClose={() => setReview(null)} title={`Recorded checklist · ${review?.check_date || ''}`} size="lg">
      {review && <div className="space-y-4"><p className="rounded-lg bg-slate-50 p-3 text-sm">{review.status === 'completed' ? review.payload.scope === 'temperatures' ? 'Temperature check saved' : review.payload.scope === 'locks' ? 'Locks and lights signed off' : 'Locks and temperature inspection signed off' : 'Not inspected'} · {review.recorded_by_name}<br />{displayTime(review.recorded_at)}<br /><span className="break-all text-xs text-slate-500">Record: {review.id}</span></p>
        {review.status === 'not_completed' ? <p>{review.payload.missedReason}</p> : <>
          {review.payload.scope !== 'temperatures' && <><h4 className="font-bold">Locks and lights</h4><dl className="divide-y divide-slate-100">{factoryLockPoints.map(point => <div className="flex justify-between gap-3 py-2 text-sm" key={point.id}><dt>{point.label}</dt><dd className="text-right font-medium">{review.payload.locks[point.id] === 'night_shift' ? point.kind === 'lock' ? 'Left open — night shift' : 'On — night shift' : review.payload.locks[point.id] === 'locked' ? 'Locked' : 'Off'}</dd></div>)}</dl>
          {review.payload.locks.corridor_lights === 'night_shift' && <p className="text-sm">Corridor lights: {review.payload.corridorReasons.join(', ')}</p>}
          </>}
          {review.payload.scope !== 'locks' && <><h4 className="font-bold">Temperatures — linked Cold Chain observations</h4>{factoryTemperaturePoints.map(point => {
            const answer = review.payload.temperatures[point.id];
            return <div key={point.id} className="rounded-lg border border-slate-200 p-3 text-sm"><p className="font-semibold">{point.label}: {answer?.status === 'empty' ? 'Empty / not in use' : `${answer?.temperature ?? '—'}°C`}</p>{answer?.status === 'active' && <><p className={answer.inRange === false ? 'font-semibold text-red-700' : 'text-slate-600'}>{`${answer.inRange === undefined ? '' : answer.inRange ? 'In range · ' : 'OUT OF RANGE · '}${answer.targetLabel || factoryTemperatureTarget(point)}`}</p><p className="text-xs text-slate-500">{answer.observedAt ? displayTime(answer.observedAt) : 'Time unavailable'} · {answer.recordedBy || 'Name unavailable'}{answer.milkLotCode ? ` · Lot ${answer.milkLotCode}` : ''}</p>{answer.readingId && <p className="break-all text-xs text-slate-400">Reading: {answer.readingId}</p>}</>}</div>;
          })}</>}
        </>}
        {review.payload.notes && <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm">Notes: {review.payload.notes}</p>}
        <p className="text-xs text-slate-500">Read-only audit record. Corrections are recorded as a new inspection, not an overwrite.</p>
      </div>}
    </Modal>
  </section>;
}
