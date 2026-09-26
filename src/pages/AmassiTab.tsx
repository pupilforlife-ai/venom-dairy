import { useEffect, useState } from 'react';
import { Clock, Package, Plus, Thermometer } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { useToast } from '../components/Toast';
import { Modal } from '../components/Modal';
import { getAmassiBatchCode, milkStorageVessels } from '../data/mockData';

type AmassiStage =
  | 'scheduled'
  | 'vat2'
  | 'vat3'
  | 'heating'
  | 'cooling'
  | 'culture_added'
  | 'bottling'
  | 'incubation'
  | 'blast_freezing'
  | 'stored_in_chiller';

type AmassiType = 'BM' | 'SKM';
type AmassiSku = 'AMASSI 1.8L' | 'AMASSI 2L';

const INCUBATION_SECONDS = 9 * 60 * 60;

const stageLabels: Record<AmassiStage, string> = {
  scheduled: 'Scheduled',
  vat2: 'VAT 2',
  vat3: 'VAT 3',
  heating: 'Heating',
  cooling: 'Cooling',
  culture_added: 'Culture Added',
  bottling: 'Bottling',
  incubation: 'Incubation at 27°C',
  blast_freezing: 'Blast Freezing',
  stored_in_chiller: 'Stored in Chiller',
};

const stageColors: Record<AmassiStage, string> = {
  scheduled: 'bg-slate-400',
  vat2: 'bg-indigo-500',
  vat3: 'bg-indigo-600',
  heating: 'bg-orange-500',
  cooling: 'bg-cyan-500',
  culture_added: 'bg-purple-500',
  bottling: 'bg-pink-500',
  incubation: 'bg-amber-500',
  blast_freezing: 'bg-blue-600',
  stored_in_chiller: 'bg-emerald-600',
};

const stageOptions: AmassiStage[] = [
  'scheduled',
  'vat2',
  'vat3',
  'heating',
  'cooling',
  'culture_added',
  'bottling',
  'incubation',
  'blast_freezing',
  'stored_in_chiller',
];

function roundCode(round: { shiftNumber: number; roundNumber: number }) {
  return `AMASSI S${round.shiftNumber}/R${round.roundNumber}`;
}

function formatTime(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

export default function AmassiTab({ selectedMilkLotId, canForceStage }: { selectedMilkLotId: string; canForceStage: boolean }) {
  const {
    productionRounds,
    productionShifts,
    milkLots,
    updateProductionRound,
    addProductionRound,
    addProductionShift,
  } = useApp();
  const { showToast } = useToast();

  const activeMilkLot = milkLots.find(lot => lot.id === selectedMilkLotId);
  const amassiRounds = productionRounds.filter(round => round.type === 'Amassi' && round.milkLotId === selectedMilkLotId);
  const amassiShifts = productionShifts.filter(shift => shift.status === 'active' && shift.milkLotId === selectedMilkLotId);
  const groupedByShift = amassiRounds.reduce((groups, round) => {
    if (!groups[round.shiftId]) groups[round.shiftId] = [];
    groups[round.shiftId].push(round);
    return groups;
  }, {} as Record<string, typeof amassiRounds>);

  const [timers, setTimers] = useState<Record<string, number>>({});
  const [showNewShiftModal, setShowNewShiftModal] = useState(false);
  const [showNewRoundModal, setShowNewRoundModal] = useState(false);
  const [showPackModal, setShowPackModal] = useState(false);
  const [selectedRound, setSelectedRound] = useState<string | null>(null);
  const [packSku, setPackSku] = useState<AmassiSku>('AMASSI 1.8L');
  const [packBottles, setPackBottles] = useState(0);
  const [newShift, setNewShift] = useState({
    milkLotId: selectedMilkLotId,
    shiftNumber: 1,
    team: '',
    startedAt: new Date().toISOString().slice(0, 16),
  });
  const [newRound, setNewRound] = useState({
    shiftId: '',
    roundNumber: 1,
    plannedInput: 500,
    milkTemperature: 4,
    amassiType: 'BM' as AmassiType,
    sourceVessel: '',
    team: '',
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setTimers(previous => {
        const next = { ...previous };
        amassiRounds.forEach(round => {
          if (round.status === 'incubation' && round.amassiIncubationStartedAt) {
            const elapsed = Math.floor((Date.now() - new Date(round.amassiIncubationStartedAt).getTime()) / 1000);
            next[round.id] = Math.max(0, INCUBATION_SECONDS - elapsed);
          }
        });
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [amassiRounds]);

  const handleCreateShift = () => {
    if (!newShift.milkLotId || !newShift.team.trim()) {
      showToast('error', 'Select a milk lot and enter the Amassi team');
      return;
    }
    const milkLot = milkLots.find(lot => lot.id === newShift.milkLotId);
    if (!milkLot) return;
    if (milkLot.productionClosed) {
      showToast('error', `Production for milk lot ${milkLot.lotCode} is closed`);
      return;
    }
    addProductionShift({
      milkLotId: milkLot.id,
      milkLotCode: milkLot.lotCode,
      shiftNumber: newShift.shiftNumber,
      startedAt: new Date(newShift.startedAt).toISOString(),
      team: newShift.team.split(',').map(member => member.trim()).filter(Boolean),
      status: 'active',
    });
    showToast('success', `Amassi Shift ${newShift.shiftNumber} created`);
    setShowNewShiftModal(false);
    setNewShift({ milkLotId: selectedMilkLotId, shiftNumber: 1, team: '', startedAt: new Date().toISOString().slice(0, 16) });
  };

  const handleCreateRound = () => {
    if (!newRound.shiftId || !newRound.sourceVessel || newRound.plannedInput <= 0) {
      showToast('error', 'Select a shift, milk vessel, and valid milk quantity');
      return;
    }
    const shift = productionShifts.find(item => item.id === newRound.shiftId);
    const milkLot = shift ? milkLots.find(lot => lot.id === shift.milkLotId) : undefined;
    if (!shift || !milkLot) return;
    if (milkLot.productionClosed) {
      showToast('error', `Production for milk lot ${milkLot.lotCode} is closed`);
      return;
    }

    addProductionRound({
      milkLotId: shift.milkLotId,
      milkLotCode: shift.milkLotCode,
      shiftId: shift.id,
      shiftNumber: shift.shiftNumber,
      roundNumber: newRound.roundNumber,
      type: 'Amassi',
      status: 'scheduled',
      team: newRound.team ? newRound.team.split(',').map(member => member.trim()).filter(Boolean) : shift.team,
      plannedInput: newRound.plannedInput,
      actualInput: newRound.plannedInput,
      sourceVessel: newRound.sourceVessel,
      startingTemperature: newRound.milkTemperature,
      outputWeight: 0,
      startTime: new Date().toISOString(),
      locked: false,
      batchCode: getAmassiBatchCode(shift.milkLotCode),
      amassiType: newRound.amassiType,
    });
    showToast('success', `Amassi round created: ${roundCode({ shiftNumber: shift.shiftNumber, roundNumber: newRound.roundNumber })}`);
    setShowNewRoundModal(false);
    setNewRound({ shiftId: '', roundNumber: 1, plannedInput: 500, milkTemperature: 4, amassiType: 'BM', sourceVessel: '', team: '' });
  };

  const handleStageChange = (roundId: string, nextStage: AmassiStage) => {
    if (!canForceStage) return;
    const round = amassiRounds.find(item => item.id === roundId);
    if (!round || round.status === nextStage) return;
    const updates: any = { status: nextStage };
    if (nextStage === 'incubation') updates.amassiIncubationStartedAt = round.amassiIncubationStartedAt || new Date().toISOString();
    updateProductionRound(roundId, updates);
    showToast('success', `${roundCode(round)} moved to ${stageLabels[nextStage]}`);
  };

  const advance = (round: any, nextStage: AmassiStage) => {
    const updates: any = { status: nextStage };
    if (nextStage === 'incubation') updates.amassiIncubationStartedAt = new Date().toISOString();
    updateProductionRound(round.id, updates);
    showToast('success', `${roundCode(round)} moved to ${stageLabels[nextStage]}`);
  };

  const getAction = (round: any) => {
    const stage = round.status as AmassiStage;
    if (stage === 'scheduled') {
      return <div className="flex flex-wrap gap-1"><button onClick={() => advance(round, 'vat2')} className="rounded bg-indigo-500 px-2 py-1 text-xs font-medium text-white">Start VAT 2</button><button onClick={() => advance(round, 'vat3')} className="rounded bg-indigo-600 px-2 py-1 text-xs font-medium text-white">Start VAT 3</button></div>;
    }
    if (stage === 'vat2' || stage === 'vat3') return <button onClick={() => advance(round, 'heating')} className="rounded bg-orange-500 px-2 py-1 text-xs font-medium text-white">Start Heating</button>;
    if (stage === 'heating') return <button onClick={() => advance(round, 'cooling')} className="rounded bg-cyan-500 px-2 py-1 text-xs font-medium text-white">Start Cooling</button>;
    if (stage === 'cooling') return <button onClick={() => advance(round, 'culture_added')} className="rounded bg-purple-500 px-2 py-1 text-xs font-medium text-white">Add Culture</button>;
    if (stage === 'culture_added') return <button onClick={() => advance(round, 'bottling')} className="rounded bg-pink-500 px-2 py-1 text-xs font-medium text-white">Start Bottling</button>;
    if (stage === 'bottling') return <button onClick={() => advance(round, 'incubation')} className="rounded bg-amber-500 px-2 py-1 text-xs font-medium text-white">Incubate 9 Hours</button>;
    if (stage === 'incubation') {
      const remaining = timers[round.id] ?? INCUBATION_SECONDS;
      return <div className="flex flex-wrap items-center gap-2"><span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-1 text-xs font-mono font-bold text-amber-800"><Clock className="h-3 w-3" />{formatTime(remaining)}</span>{remaining === 0 && <button onClick={() => advance(round, 'blast_freezing')} className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white">Blast Freeze</button>}</div>;
    }
    if (stage === 'blast_freezing') return <button onClick={() => advance(round, 'stored_in_chiller')} className="rounded bg-emerald-600 px-2 py-1 text-xs font-medium text-white">Store in Chiller</button>;
    if (stage === 'stored_in_chiller') return <button onClick={() => { setSelectedRound(round.id); setPackBottles(0); setShowPackModal(true); }} className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2 py-1 text-xs font-medium text-white"><Package className="h-3 w-3" />Pack bottles</button>;
    return null;
  };

  const handlePack = () => {
    if (!selectedRound || packBottles <= 0) {
      showToast('error', 'Enter a valid number of bottles');
      return;
    }
    const round = amassiRounds.find(item => item.id === selectedRound);
    if (!round) return;
    const existing = round.amassiPacked || [];
    const index = existing.findIndex(item => item.sku === packSku);
    const packed = index >= 0
      ? existing.map((item, itemIndex) => itemIndex === index ? { ...item, bottles: item.bottles + packBottles } : item)
      : [...existing, { sku: packSku, bottles: packBottles }];
    updateProductionRound(round.id, { amassiPacked: packed });
    showToast('success', `Packed ${packBottles} bottles as ${packSku}`);
    setShowPackModal(false);
    setPackBottles(0);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-slate-900">Amassi Production</h3>
          <p className="text-sm text-slate-500">Cultured milk · 27°C incubation for 9 hours · Milk lot <span className="font-medium text-slate-700">{activeMilkLot?.lotCode || '—'}</span></p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setNewShift(current => ({ ...current, milkLotId: selectedMilkLotId })); setShowNewShiftModal(true); }} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"><Plus className="h-4 w-4" />New Shift</button>
          <button onClick={() => setShowNewRoundModal(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"><Plus className="h-4 w-4" />New Amassi Round</button>
        </div>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900"><strong>Incubation rule:</strong> once incubation starts, the timer runs for 09:00:00 at 27°C before blast freezing can be started.</div>

      <div className="space-y-4">
        {Object.entries(groupedByShift).map(([shiftId, rounds]) => {
          const shift = productionShifts.find(item => item.id === shiftId);
          if (!shift) return null;
          return (
            <div key={shiftId} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="flex items-center justify-between border-b border-indigo-200 bg-indigo-50 px-4 py-3"><div className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white">{shift.shiftNumber}</span><div><div className="text-sm font-semibold text-slate-900">Shift {shift.shiftNumber} · Batch {shift.milkLotCode}</div><div className="text-xs text-slate-500">Team: {shift.team.join(', ')}</div></div></div><span className="text-xs text-slate-500">{rounds.length} round{rounds.length === 1 ? '' : 's'}</span></div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1080px] text-sm">
                  <thead><tr className="border-b border-slate-100"><th className="px-3 py-2 text-left text-xs uppercase tracking-wide text-slate-500">Batch ID</th><th className="px-3 py-2 text-left text-xs uppercase tracking-wide text-slate-500">Milk Quantity</th><th className="px-3 py-2 text-left text-xs uppercase tracking-wide text-slate-500">Milk Temp</th><th className="px-3 py-2 text-left text-xs uppercase tracking-wide text-slate-500">Type</th><th className="px-3 py-2 text-left text-xs uppercase tracking-wide text-slate-500">Current Stage</th><th className="px-3 py-2 text-left text-xs uppercase tracking-wide text-slate-500">Packed Into</th></tr></thead>
                  <tbody className="divide-y divide-slate-50">
                    {rounds.map(round => {
                      const packed = round.amassiPacked || [];
                      return <tr key={round.id} className="align-middle hover:bg-slate-50/50">
                        <td className="px-3 py-3"><div className="inline-flex rounded-lg border border-slate-200 bg-white px-2 py-1 font-mono text-sm font-bold text-slate-900">{roundCode(round)}</div><div className="mt-1 text-xs text-slate-500">{round.milkLotCode}</div></td>
                        <td className="px-3 py-3"><input type="number" min="0" value={round.actualInput || round.plannedInput} onChange={event => { const quantity = Number(event.target.value) || 0; updateProductionRound(round.id, { plannedInput: quantity, actualInput: quantity }); }} className="w-28 rounded-lg border border-slate-200 px-2 py-1.5 text-sm" /> <span className="text-xs text-slate-500">L</span></td>
                        <td className="px-3 py-3"><div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5"><Thermometer className="h-3.5 w-3.5 text-cyan-600" /><input type="number" step="0.1" value={round.startingTemperature ?? ''} onChange={event => updateProductionRound(round.id, { startingTemperature: Number(event.target.value) || 0 })} className="w-16 border-0 p-0 text-sm outline-none" />°C</div></td>
                        <td className="px-3 py-3"><span className="inline-flex rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 font-bold text-slate-700">{round.amassiType || '—'}</span></td>
                        <td className="min-w-[370px] px-3 py-3"><div className="flex flex-wrap items-center gap-2">{canForceStage ? <select value={round.status} onChange={event => handleStageChange(round.id, event.target.value as AmassiStage)} className="w-48 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-semibold text-slate-700">{stageOptions.map(stage => <option key={stage} value={stage}>{stageLabels[stage]}</option>)}</select> : <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold text-white ${stageColors[round.status as AmassiStage] || 'bg-slate-400'}`}>{stageLabels[round.status as AmassiStage] || round.status}</span>}{round.status === 'incubation' && <span className="text-xs text-slate-500">at 27°C</span>}{getAction(round)}</div></td>
                        <td className="min-w-[260px] px-3 py-3"><div className="space-y-1">{packed.length > 0 ? packed.map(item => <div key={item.sku} className="inline-flex rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">{item.sku}: {item.bottles} bottles</div>) : <span className="text-slate-400">—</span>}{round.status === 'stored_in_chiller' && <div><button onClick={() => { setSelectedRound(round.id); setPackBottles(0); setShowPackModal(true); }} className="mt-1 inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700"><Package className="h-3 w-3" />Pack</button></div>}</div></td>
                      </tr>;
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
        {amassiRounds.length === 0 && <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">No Amassi rounds for this milk lot yet. Create a shift and round to begin.</div>}
      </div>

      <Modal isOpen={showNewShiftModal} onClose={() => setShowNewShiftModal(false)} title="Create Amassi Shift">
        <div className="space-y-4"><div><label className="text-xs font-medium uppercase tracking-wide text-slate-600">Milk Lot</label><select value={newShift.milkLotId} onChange={event => setNewShift({ ...newShift, milkLotId: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"><option value="">Select milk lot</option>{milkLots.map(lot => <option key={lot.id} value={lot.id}>{lot.lotCode}</option>)}</select></div><div><label className="text-xs font-medium uppercase tracking-wide text-slate-600">Shift Number</label><input type="number" min="1" value={newShift.shiftNumber} onChange={event => setNewShift({ ...newShift, shiftNumber: Number(event.target.value) || 1 })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></div><div><label className="text-xs font-medium uppercase tracking-wide text-slate-600">Team</label><input value={newShift.team} onChange={event => setNewShift({ ...newShift, team: event.target.value })} placeholder="Comma-separated names" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></div><div className="flex gap-2"><button onClick={handleCreateShift} className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white">Create Shift</button><button onClick={() => setShowNewShiftModal(false)} className="rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-700">Cancel</button></div></div>
      </Modal>

      <Modal isOpen={showNewRoundModal} onClose={() => setShowNewRoundModal(false)} title="Create Amassi Round">
        <div className="space-y-4"><div><label className="text-xs font-medium uppercase tracking-wide text-slate-600">Shift</label><select value={newRound.shiftId} onChange={event => { const shiftId = event.target.value; const count = amassiRounds.filter(round => round.shiftId === shiftId).length; setNewRound({ ...newRound, shiftId, roundNumber: count + 1 }); }} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"><option value="">Select shift</option>{amassiShifts.map(shift => <option key={shift.id} value={shift.id}>Shift {shift.shiftNumber} · {shift.milkLotCode}</option>)}</select></div><div className="grid grid-cols-2 gap-3"><div><label className="text-xs font-medium uppercase tracking-wide text-slate-600">Milk quantity (L)</label><input type="number" min="0" value={newRound.plannedInput} onChange={event => setNewRound({ ...newRound, plannedInput: Number(event.target.value) || 0 })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></div><div><label className="text-xs font-medium uppercase tracking-wide text-slate-600">Milk temp (°C)</label><input type="number" step="0.1" value={newRound.milkTemperature} onChange={event => setNewRound({ ...newRound, milkTemperature: Number(event.target.value) || 0 })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></div></div><div><label className="text-xs font-medium uppercase tracking-wide text-slate-600">Type</label><select value={newRound.amassiType} onChange={event => setNewRound({ ...newRound, amassiType: event.target.value as AmassiType })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"><option value="BM">BM</option><option value="SKM">SKM</option></select></div><div><label className="text-xs font-medium uppercase tracking-wide text-slate-600">Milk taken from</label><select value={newRound.sourceVessel} onChange={event => setNewRound({ ...newRound, sourceVessel: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"><option value="">Select vessel</option>{milkStorageVessels.map(vessel => <option key={vessel.id} value={vessel.id}>{vessel.label}{vessel.capacity ? ` (${vessel.capacity.toLocaleString()} L)` : ''}</option>)}</select></div><div><label className="text-xs font-medium uppercase tracking-wide text-slate-600">Team (optional)</label><input value={newRound.team} onChange={event => setNewRound({ ...newRound, team: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></div><div className="flex gap-2"><button onClick={handleCreateRound} className="flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white">Create Round</button><button onClick={() => setShowNewRoundModal(false)} className="rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-700">Cancel</button></div></div>
      </Modal>

      <Modal isOpen={showPackModal} onClose={() => setShowPackModal(false)} title="Pack Amassi bottles">
        <div className="space-y-4"><p className="text-xs text-slate-500">Select the final SKU and record the number of bottles packed.</p><div><label className="text-xs font-medium uppercase tracking-wide text-slate-600">Packed into</label><select value={packSku} onChange={event => setPackSku(event.target.value as AmassiSku)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"><option value="AMASSI 1.8L">AMASSI 1.8L</option><option value="AMASSI 2L">AMASSI 2L</option></select></div><div><label className="text-xs font-medium uppercase tracking-wide text-slate-600">Quantity in bottles</label><input type="number" min="1" value={packBottles} onChange={event => setPackBottles(Number(event.target.value) || 0)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></div><div className="flex gap-2"><button onClick={handlePack} className="flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white">Save packing</button><button onClick={() => setShowPackModal(false)} className="rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-700">Cancel</button></div></div>
      </Modal>
    </div>
  );
}
