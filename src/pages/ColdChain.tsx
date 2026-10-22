import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Plus, Snowflake, Thermometer, Truck, XCircle } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { useToast } from '../components/Toast';
import { Modal } from '../components/Modal';
import { useSupabaseState } from '../hooks/useSupabaseState';
import type { TemperatureReading } from '../data/mockData';
import { isRawMilkTemperatureInRange, RAW_MILK_TEMP_MAX_C, RAW_MILK_TEMP_MIN_C, temperatureTargetLabel } from '../lib/coldChain';
import { factoryDate, factoryTemperaturePoints, factoryTemperatureInRange, factoryTemperatureTarget, factoryTemperatureProgress, type MilkStorageStateEvent } from '../lib/factoryChecklist';

const requiredDailyChecks = 2;
const coolingTanks = factoryTemperaturePoints.filter(point => point.section === 'cooling');

const milkStorageLocations = [
  { location: 'Silo', kind: 'vessel' as const },
  { location: 'BMC1', kind: 'vessel' as const },
  { location: 'BMC2', kind: 'vessel' as const },
  { location: 'BMC3', kind: 'vessel' as const },
  { location: 'Truck', kind: 'transport' as const },
  // Keep separate from the existing frozen finished-goods “Coldroom” record.
  { location: 'Milk Coldroom', kind: 'transport' as const },
];

const legacyTempProfiles = [
  { location: 'Chiller', targetMin: 0, targetMax: 5 },
  { location: 'Dairy Container (Intermediate Freezer)', targetMin: -25, targetMax: -10 },
  { location: 'Coldroom', targetMin: -25, targetMax: -10 },
  { location: 'Distribution Coldroom', targetMin: -25, targetMax: -10 },
  { location: 'Rental Cold Storage', targetMin: -25, targetMax: -10 },
];

type StorageStateEvent = MilkStorageStateEvent;

function getCurrentUserName() {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem('vejoy_user_username') || window.localStorage.getItem('vejoy_user_role') || '';
}

export default function ColdChain() {
  const { temperatureReadings, addTemperatureReading, milkLots } = useApp();
  const { showToast } = useToast();
  const [storageEvents, setStorageEvents] = useSupabaseState<StorageStateEvent[]>('vejoy_coldChainStorageEvents', []);
  const [showLogModal, setShowLogModal] = useState(false);
  const [newReading, setNewReading] = useState({
    location: 'Chiller',
    temperature: '',
    milkTemperature: '',
    storageTemperature: '',
    milkLotCode: '',
    recordedBy: getCurrentUserName(),
  });

  const currentStorageState = useMemo(() => {
    const latestByLocation = new Map<string, StorageStateEvent>();
    [...storageEvents]
      .sort((left, right) => new Date(left.recordedAt).getTime() - new Date(right.recordedAt).getTime())
      .forEach(event => latestByLocation.set(event.location, event));
    return latestByLocation;
  }, [storageEvents]);

  const inRange = temperatureReadings.filter(reading => !reading.rangeNotConfigured && (reading.coldChainStorageReading
    ? reading.milkTemperatureInRange === true
    : reading.inRange));
  const outOfRange = temperatureReadings.filter(reading => !reading.rangeNotConfigured && (reading.coldChainStorageReading
    ? reading.milkTemperatureInRange === false
    : !reading.inRange));

  const latestByLocation = temperatureReadings.reduce((acc, reading) => {
    if (!acc[reading.location] || new Date(reading.recordedAt) > new Date(acc[reading.location].recordedAt)) {
      acc[reading.location] = reading;
    }
    return acc;
  }, {} as Record<string, TemperatureReading>);

  const dailyProgress = factoryTemperatureProgress(factoryDate(), temperatureReadings, storageEvents);
  const todayCount = (location: string) => dailyProgress.find(row => row.point.location === location)?.count || 0;

  const recordStorageState = (location: string, status: StorageStateEvent['status']) => {
    const recordedBy = getCurrentUserName();
    if (!recordedBy) {
      showToast('error', 'Sign in with a named user account before changing storage status');
      return;
    }
    const selectedLotCode = milkLots.find(lot => lot.status === 'active')?.lotCode;
    const event: StorageStateEvent = {
      id: `cold-chain-state-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      location,
      status,
      ...(status === 'milk_present' && selectedLotCode ? { milkLotCode: selectedLotCode } : {}),
      recordedAt: new Date().toISOString(),
      recordedBy,
    };
    setStorageEvents(current => [...current, event]);
    showToast('success', status === 'empty' ? `${location} marked empty` : status === 'in_use' ? `${location} marked in use` : `Milk presence started for ${location}`);
  };

  const handleLogReading = () => {
    const location = milkStorageLocations.find(option => option.location === newReading.location);
    if (!newReading.recordedBy.trim()) {
      showToast('error', 'Please enter who recorded this');
      return;
    }
    if (location && currentStorageState.get(location.location)?.status !== 'milk_present') {
      showToast('error', `Mark ${location.location} as holding milk before logging its temperature`);
      return;
    }

    if (location) {
      const milkTemperature = newReading.milkTemperature.trim() === '' ? undefined : Number(newReading.milkTemperature);
      const storageTemperature = newReading.storageTemperature.trim() === '' ? undefined : Number(newReading.storageTemperature);
      if (location.kind === 'vessel' && milkTemperature === undefined) {
        showToast('error', 'Enter the milk temperature for this vessel');
        return;
      }
      if (location.kind === 'transport' && storageTemperature === undefined) {
        showToast('error', 'Enter the truck or coldroom temperature');
        return;
      }
      if ((milkTemperature !== undefined && !Number.isFinite(milkTemperature))
        || (storageTemperature !== undefined && !Number.isFinite(storageTemperature))) {
        showToast('error', 'Enter valid temperature values');
        return;
      }
      const primaryTemperature = milkTemperature ?? storageTemperature!;
      const milkInRange = milkTemperature === undefined ? undefined : isRawMilkTemperatureInRange(milkTemperature);
      addTemperatureReading({
        location: location.location,
        temperature: primaryTemperature,
        targetMin: RAW_MILK_TEMP_MIN_C,
        targetMax: RAW_MILK_TEMP_MAX_C,
        recordedAt: new Date().toISOString(),
        recordedBy: newReading.recordedBy.trim(),
        coldChainStorageReading: true,
        ...(milkTemperature !== undefined ? { milkTemperature, milkTemperatureInRange: milkInRange } : {}),
        ...(storageTemperature !== undefined ? { storageTemperature } : {}),
        ...(newReading.milkLotCode ? { milkLotCode: newReading.milkLotCode } : {}),
      });
      if (milkInRange === false) {
        showToast('error', `MILK TEMPERATURE EXCURSION: ${milkTemperature}°C at ${location.location}; required ${RAW_MILK_TEMP_MIN_C}–${RAW_MILK_TEMP_MAX_C}°C`);
      } else {
        showToast('success', `Cold-chain check logged for ${location.location}`);
      }
    } else {
      const coolingTank = coolingTanks.find(item => item.location === newReading.location);
      const profile = legacyTempProfiles.find(item => item.location === newReading.location);
      const temperature = Number(newReading.temperature);
      if ((!profile && !coolingTank) || newReading.temperature.trim() === '' || !Number.isFinite(temperature)) {
        showToast('error', 'Enter a valid temperature');
        return;
      }
      addTemperatureReading({
        location: newReading.location,
        temperature,
        targetMin: profile?.targetMin ?? coolingTank?.min ?? 0,
        targetMax: profile?.targetMax ?? coolingTank?.max ?? 0,
        ...(coolingTank ? coolingTank.max === null ? { rangeNotConfigured: true } : { upperLimitOnly: true } : {}),
        recordedAt: new Date().toISOString(),
        recordedBy: newReading.recordedBy.trim(),
      });
      const profileInRange = coolingTank ? factoryTemperatureInRange(coolingTank, temperature) !== false : temperature >= profile!.targetMin && temperature <= profile!.targetMax;
      showToast(profileInRange ? 'success' : 'error', profileInRange
        ? `Temperature logged: ${temperature}°C at ${newReading.location}${coolingTank ? ` (${factoryTemperatureTarget(coolingTank)})` : ''}`
        : `OUT OF RANGE: ${temperature}°C at ${newReading.location} (${coolingTank ? factoryTemperatureTarget(coolingTank) : `${profile!.targetMin}–${profile!.targetMax}°C`})`);
    }

    setShowLogModal(false);
    setNewReading(current => ({ ...current, temperature: '', milkTemperature: '', storageTemperature: '' }));
  };

  const selectedMilkStorageLocation = milkStorageLocations.find(location => location.location === newReading.location);
  return (
    <div className="space-y-5">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Cold Chain Monitoring</h2>
          <p className="mt-0.5 text-sm text-slate-500">Record at least two temperature checks daily for each location in use. Raw milk: 2–6°C.</p>
        </div>
        <button onClick={() => setShowLogModal(true)} className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700">
          <Plus className="h-4 w-4" /> Log Reading
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center"><CheckCircle2 className="mx-auto mb-1 h-6 w-6 text-emerald-600" /><p className="text-2xl font-bold text-emerald-700">{inRange.length}</p><p className="text-xs text-emerald-600">In range</p></div>
        <div className={`${outOfRange.length ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-slate-50'} rounded-xl border p-4 text-center`}><AlertTriangle className={`mx-auto mb-1 h-6 w-6 ${outOfRange.length ? 'text-red-600' : 'text-slate-400'}`} /><p className={`text-2xl font-bold ${outOfRange.length ? 'text-red-700' : 'text-slate-500'}`}>{outOfRange.length}</p><p className={`text-xs ${outOfRange.length ? 'text-red-600' : 'text-slate-400'}`}>Out of range</p></div>
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-center"><Clock className="mx-auto mb-1 h-6 w-6 text-blue-600" /><p className="text-2xl font-bold text-blue-700">{temperatureReadings.length}</p><p className="text-xs text-blue-600">Total readings</p></div>
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-center"><Thermometer className="mx-auto mb-1 h-6 w-6 text-indigo-600" /><p className="text-2xl font-bold text-indigo-700">{milkStorageLocations.filter(location => currentStorageState.get(location.location)?.status === 'milk_present').length}</p><p className="text-xs text-indigo-600">Raw-milk locations active</p></div>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-900">Twice-daily temperature checks</h3>
        <p className="mt-1 text-xs text-slate-500">Shared with the Dashboard checklist. Two distinct readings per location per South African calendar day; empty vessels / unused tanks are exempt.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{dailyProgress.map(row => <div key={row.point.id} className="flex justify-between gap-2 rounded-lg border border-slate-200 p-3 text-xs"><span>{row.point.label}</span><span className={row.complete ? 'font-semibold text-emerald-700' : 'font-semibold text-amber-800'}>{row.activity === 'empty' ? 'Empty / not in use' : row.activity === undefined ? 'Confirm status' : `${row.count}/2 readings`}</span></div>)}</div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-slate-900">Milk storage checks</h3>
          <p className="mt-1 text-xs text-slate-500">Mark a location as holding milk when it is loaded. Mark it empty when it has been cleared; checks are then no longer due.</p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {milkStorageLocations.map(location => {
            const stateEvent = currentStorageState.get(location.location);
            const active = stateEvent?.status === 'milk_present';
            const count = todayCount(location.location);
            const latest = latestByLocation[location.location];
            const temperatureAlert = latest?.coldChainStorageReading && latest.milkTemperatureInRange === false;
            return <article key={location.location} className={`rounded-xl border p-4 ${temperatureAlert ? 'border-red-300 bg-red-50' : active ? count >= requiredDailyChecks ? 'border-emerald-200 bg-emerald-50/50' : 'border-amber-200 bg-amber-50/50' : 'border-slate-200 bg-slate-50'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">{location.kind === 'transport' ? <Truck className="h-4 w-4 text-sky-600" /> : <Snowflake className="h-4 w-4 text-indigo-600" />}<h4 className="font-semibold text-slate-900">{location.location}</h4></div>
                <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${active ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-600'}`}>{active ? 'Milk present' : 'Empty'}</span>
              </div>
              {active ? <>
                <p className={`mt-3 text-sm font-medium ${count >= requiredDailyChecks ? 'text-emerald-700' : 'text-amber-700'}`}>{count}/{requiredDailyChecks} checks recorded today {count >= requiredDailyChecks ? '· complete' : '· check due'}</p>
                <p className={`mt-1 min-h-5 text-xs ${temperatureAlert ? 'font-semibold text-red-700' : 'text-slate-600'}`}>{stateEvent?.milkLotCode ? `Lot ${stateEvent.milkLotCode} · ` : ''}{latest ? `Latest: ${latest.milkTemperature !== undefined ? `milk ${latest.milkTemperature}°C` : `${latest.temperature}°C`}${temperatureAlert ? ' · MILK TEMP EXCURSION' : ''} at ${new Date(latest.recordedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'No temperature recorded yet'}</p>
              </> : <p className="mt-3 text-xs text-slate-500">No temperature checks required while empty.</p>}
              <div className="mt-3 flex gap-2">
                {!active && <button onClick={() => recordStorageState(location.location, 'milk_present')} className="flex-1 rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50">Milk in</button>}
                {active && <button onClick={() => recordStorageState(location.location, 'empty')} className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100">Mark empty</button>}
                {active && <button onClick={() => { setNewReading(current => ({ ...current, location: location.location, milkLotCode: stateEvent?.milkLotCode || milkLots.find(lot => lot.status === 'active')?.lotCode || '' })); setShowLogModal(true); }} className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700">Log check</button>}
              </div>
            </article>;
          })}
        </div>
        <p className="mt-3 text-[11px] text-slate-500">Milk temperature flags below {RAW_MILK_TEMP_MIN_C}°C or above {RAW_MILK_TEMP_MAX_C}°C. Truck and Milk Coldroom storage temperatures are recorded separately; no equipment/air limit has been configured.</p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4"><h3 className="font-semibold text-slate-900">Cooling tanks</h3><p className="mt-1 text-xs text-slate-500">Shared with the daily factory checklist. Mark tanks in use / empty; record two readings daily while in use.</p><div className="mt-3 grid gap-3 sm:grid-cols-2">{coolingTanks.map(tank => {
        const state = currentStorageState.get(tank.location);
        const active = dailyProgress.find(row => row.point.id === tank.id)?.activity === 'active';
        return <div key={tank.id} className="rounded-lg border border-slate-200 p-3"><p className="text-sm font-semibold">{tank.label} · {active ? 'In use' : state?.status === 'empty' ? 'Empty / not in use' : 'Status not confirmed'}</p><p className="mt-1 text-xs text-slate-500">{factoryTemperatureTarget(tank)}</p><p className="my-2 text-sm text-slate-600">{latestByLocation[tank.location] ? `${latestByLocation[tank.location].temperature}°C · ${new Date(latestByLocation[tank.location].recordedAt).toLocaleString()}` : 'No reading recorded'}</p><div className="flex flex-wrap gap-2"><button className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold" onClick={() => recordStorageState(tank.location, active ? 'empty' : 'in_use')}>{active ? 'Mark empty / not in use' : 'Mark in use'}</button>{!active && <button className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold" onClick={() => recordStorageState(tank.location, 'empty')}>Confirm empty</button>}<button className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white" onClick={() => { setNewReading(current => ({ ...current, location: tank.location })); setShowLogModal(true); }}>Log check</button></div></div>;
      })}</div></section>

      {temperatureReadings.length > 0 && <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Temperature history (°C)</h3>
        <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-sm"><thead><tr className="bg-slate-50 text-left text-xs uppercase text-slate-500"><th className="px-3 py-2">Location</th><th className="px-3 py-2">Temperature / milk</th><th className="px-3 py-2">Storage temp</th><th className="px-3 py-2">Range result</th><th className="px-3 py-2">Recorded at / by</th><th className="px-3 py-2">Lot</th></tr></thead><tbody className="divide-y divide-slate-100">
          {[...temperatureReadings].sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime()).map(reading => {
            const hasMilkCheck = !reading.rangeNotConfigured && (reading.coldChainStorageReading ? reading.milkTemperature !== undefined : true);
            const milkTemp = reading.coldChainStorageReading ? reading.milkTemperature : undefined;
            const result = reading.coldChainStorageReading ? reading.milkTemperatureInRange : reading.inRange;
            return <tr key={reading.id} className={result === false ? 'bg-red-50' : ''}>
              <td className="px-3 py-2 font-medium text-slate-900">{reading.location}</td>
              <td className="px-3 py-2">{reading.coldChainStorageReading ? milkTemp === undefined ? '—' : `${milkTemp}°C` : `${reading.temperature}°C`}</td>
              <td className="px-3 py-2">{reading.coldChainStorageReading ? reading.storageTemperature === undefined ? '—' : `${reading.storageTemperature}°C` : '—'}</td>
              <td className="px-3 py-2">{hasMilkCheck ? <span className={`inline-flex items-center gap-1 font-semibold ${result ? 'text-emerald-700' : 'text-red-700'}`}>{result ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}{result ? `${temperatureTargetLabel(reading)} · OK` : `Excursion · ${temperatureTargetLabel(reading)}`}</span> : <span className="text-slate-500">{reading.rangeNotConfigured ? 'Limits not configured' : 'Milk temp not recorded'}</span>}</td>
              <td className="px-3 py-2 text-xs text-slate-600">{new Date(reading.recordedAt).toLocaleString()} · {reading.recordedBy}{reading.factoryChecklistId && <span className="block text-xs font-medium text-indigo-700">Daily factory checklist</span>}</td>
              <td className="px-3 py-2">{reading.milkLotCode || '—'}</td>
            </tr>;
          })}
          {temperatureReadings.length === 0 && <tr><td colSpan={6} className="px-3 py-5 text-center text-slate-500">No readings recorded yet.</td></tr>}
        </tbody></table></div>
      </div>}

      {outOfRange.length > 0 && <section className="rounded-xl border border-red-200 bg-red-50 p-4"><h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-red-800"><XCircle className="h-4 w-4" /> Temperature excursions</h3><ul className="space-y-1 text-sm text-red-800">{outOfRange.map(reading => <li key={reading.id}>{reading.location}: {reading.coldChainStorageReading ? reading.milkTemperature : reading.temperature}°C (target {temperatureTargetLabel(reading)}) · {new Date(reading.recordedAt).toLocaleString()} · {reading.recordedBy}</li>)}</ul></section>}

      {storageEvents.length > 0 && <section className="rounded-xl border border-slate-200 bg-white p-4"><h3 className="mb-2 text-sm font-semibold text-slate-900">Storage status history</h3><ul className="space-y-1 text-xs text-slate-600">{[...storageEvents].sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime()).map(event => <li key={event.id}>{event.location}: <span className="font-medium">{event.status === 'empty' ? 'marked empty' : event.status === 'in_use' ? 'in use' : `milk present${event.milkLotCode ? ` · Lot ${event.milkLotCode}` : ''}`}</span> · {new Date(event.recordedAt).toLocaleString()} · {event.recordedBy}</li>)}</ul></section>}

      <Modal isOpen={showLogModal} onClose={() => setShowLogModal(false)} title="Log Cold-Chain Reading">
        <div className="space-y-4">
          <div><label className="text-xs font-medium uppercase tracking-wide text-slate-600">Location</label><select value={newReading.location} onChange={event => setNewReading(current => ({ ...current, location: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"><optgroup label="Raw milk storage">{milkStorageLocations.map(location => <option key={location.location} value={location.location}>{location.location}</option>)}</optgroup><optgroup label="Other cold storage">{legacyTempProfiles.map(profile => <option key={profile.location} value={profile.location}>{profile.location} ({profile.targetMin}–{profile.targetMax}°C)</option>)}</optgroup><optgroup label="Cooling tanks">{coolingTanks.map(tank => <option key={tank.id} value={tank.location}>{tank.label}</option>)}</optgroup></select></div>
          {selectedMilkStorageLocation ? <>
          <div className="rounded-lg bg-blue-50 p-3 text-xs text-blue-800">Milk temperature must be {RAW_MILK_TEMP_MIN_C}–{RAW_MILK_TEMP_MAX_C}°C. Any reading below {RAW_MILK_TEMP_MIN_C}°C or above {RAW_MILK_TEMP_MAX_C}°C will be flagged.</div>
            {selectedMilkStorageLocation.kind === 'vessel' ? <div><label className="text-xs font-medium uppercase tracking-wide text-slate-600">Milk temperature (°C)</label><input type="number" value={newReading.milkTemperature} onChange={event => setNewReading(current => ({ ...current, milkTemperature: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" step="0.1" inputMode="decimal" placeholder="e.g. 4.2" /></div> : <>
              <div><label className="text-xs font-medium uppercase tracking-wide text-slate-600">{selectedMilkStorageLocation.location === 'Truck' ? 'Truck temperature' : 'Coldroom temperature'} (°C)</label><input type="number" value={newReading.storageTemperature} onChange={event => setNewReading(current => ({ ...current, storageTemperature: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" step="0.1" inputMode="decimal" placeholder="e.g. 4.2" /><p className="mt-1 text-[11px] text-slate-500">Recorded separately; equipment temperature limits have not been set.</p></div>
              <div><label className="text-xs font-medium uppercase tracking-wide text-slate-600">Milk temperature (optional, °C)</label><input type="number" value={newReading.milkTemperature} onChange={event => setNewReading(current => ({ ...current, milkTemperature: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" step="0.1" inputMode="decimal" placeholder="e.g. 4.5" /></div>
            </>}
            <div><label className="text-xs font-medium uppercase tracking-wide text-slate-600">Milk lot (optional)</label><select value={newReading.milkLotCode} onChange={event => setNewReading(current => ({ ...current, milkLotCode: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"><option value="">Not specified</option>{milkLots.map(lot => <option key={lot.id} value={lot.lotCode}>{lot.lotCode}{lot.status === 'active' ? ' · active' : ''}</option>)}</select></div>
          </> : <>
            <div><label className="text-xs font-medium uppercase tracking-wide text-slate-600">Temperature (°C)</label><input type="number" value={newReading.temperature} onChange={event => setNewReading(current => ({ ...current, temperature: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" step="0.1" inputMode="decimal" /></div>
          </>}
          <div><label className="text-xs font-medium uppercase tracking-wide text-slate-600">Recorded by</label><input type="text" value={newReading.recordedBy} onChange={event => setNewReading(current => ({ ...current, recordedBy: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Staff name" /></div>
          <div className="flex gap-2 pt-2"><button onClick={handleLogReading} className="flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700">Log Reading</button><button onClick={() => setShowLogModal(false)} className="rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-200">Cancel</button></div>
        </div>
      </Modal>
    </div>
  );
}
