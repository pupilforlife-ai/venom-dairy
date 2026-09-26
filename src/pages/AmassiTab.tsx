import { useEffect, useState } from 'react';
import { Clock, Plus, Thermometer } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { useToast } from '../components/Toast';
import { Modal } from '../components/Modal';
import { getAmassiBatchCode, getCreamBatchCode, milkStorageVessels } from '../data/mockData';

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
    updateMilkLot,
    addProductionRound,
    addProductionShift,
    addIntermediateLot,
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
  const [showCreamModal, setShowCreamModal] = useState(false);
  const [showPhModal, setShowPhModal] = useState(false);
  const [selectedRound, setSelectedRound] = useState<string | null>(null);
  const [creamRoundId, setCreamRoundId] = useState<string | null>(null);
  const [phRoundId, setPhRoundId] = useState<string | null>(null);
  const [phCheckpoint, setPhCheckpoint] = useState<'before_freezing' | 'final'>('before_freezing');
  const [phInput, setPhInput] = useState(0);
  const [packSku, setPackSku] = useState<AmassiSku>('AMASSI 1.8L');
  const [packBottles, setPackBottles] = useState(0);
  const [creamForm, setCreamForm] = useState({ numberOfBuckets: 0, bucketWeights: [] as number[], recordedBy: '' });
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
    if (nextStage === 'blast_freezing' && round.amassiPhBeforeFreezing === undefined) {
      showToast('error', 'Record pH before freezing before moving this round to Blast Freezing');
      return;
    }
    if (nextStage === 'incubation' && (!round.amassiPacked || round.amassiPacked.length === 0)) {
      showToast('error', 'Record the bottle SKU and bottle count before starting incubation');
      return;
    }
    if (nextStage === 'stored_in_chiller' && (round.amassiPhBeforeFreezing === undefined || round.amassiFinalPh === undefined)) {
      showToast('error', 'Record pH before freezing and final pH before storing this round in the chiller');
      return;
    }
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

  const openPhModal = (roundId: string, checkpoint: 'before_freezing' | 'final') => {
    setPhRoundId(roundId);
    setPhCheckpoint(checkpoint);
    setPhInput(0);
    setShowPhModal(true);
  };

  const handleRecordPh = () => {
    if (!phRoundId || phInput <= 0 || phInput > 14) {
      showToast('error', 'Enter a valid pH reading between 0 and 14');
      return;
    }
    const round = amassiRounds.find(item => item.id === phRoundId);
    if (!round) return;
    if (phCheckpoint === 'final' && round.amassiPhBeforeFreezing === undefined) {
      showToast('error', 'Record pH before freezing first');
      return;
    }
    if (phCheckpoint === 'before_freezing') {
      updateProductionRound(round.id, { amassiPhBeforeFreezing: phInput, status: 'blast_freezing' });
      showToast('success', `pH before freezing recorded: ${phInput.toFixed(2)}`);
    } else {
      updateProductionRound(round.id, { amassiFinalPh: phInput, status: 'stored_in_chiller' });
      showToast('success', `Final pH recorded: ${phInput.toFixed(2)} · Stored in Chiller`);
    }
    setShowPhModal(false);
    setPhRoundId(null);
    setPhInput(0);
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
    if (stage === 'bottling') return <button onClick={() => { setSelectedRound(round.id); setPackSku('AMASSI 1.8L'); setPackBottles(0); setShowPackModal(true); }} className="rounded bg-amber-500 px-2 py-1 text-xs font-medium text-white">Record Bottles & Incubate</button>;
    if (stage === 'incubation') {
      const remaining = timers[round.id] ?? INCUBATION_SECONDS;
      return <div className="flex flex-wrap items-center gap-2"><span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-1 text-xs font-mono font-bold text-amber-800"><Clock className="h-3 w-3" />{formatTime(remaining)}</span>{remaining === 0 && <button onClick={() => openPhModal(round.id, 'before_freezing')} className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white">Record pH & Blast Freeze</button>}</div>;
    }
    if (stage === 'blast_freezing') return <button onClick={() => openPhModal(round.id, 'final')} className="rounded bg-emerald-600 px-2 py-1 text-xs font-medium text-white">Record Final pH & Store</button>;
    return null;
  };

  const handleRecordBottlesAndIncubate = () => {
    if (!selectedRound || packBottles <= 0) {
      showToast('error', 'Enter a valid number of bottles');
      return;
    }
    const round = amassiRounds.find(item => item.id === selectedRound);
    if (!round) return;
    if (round.status !== 'bottling') {
      showToast('error', 'Bottle quantity must be recorded during Bottling, immediately before incubation');
      return;
    }
    const existing = round.amassiPacked || [];
    const index = existing.findIndex(item => item.sku === packSku);
    const packed = index >= 0
      ? existing.map((item, itemIndex) => itemIndex === index ? { ...item, bottles: item.bottles + packBottles } : item)
      : [...existing, { sku: packSku, bottles: packBottles }];
    updateProductionRound(round.id, { amassiPacked: packed, status: 'incubation', amassiIncubationStartedAt: new Date().toISOString() });
    showToast('success', `Recorded ${packBottles} bottles as ${packSku} · 9-hour incubation started`);
    setShowPackModal(false);
    setPackBottles(0);
  };

  const openCreamModal = (roundId: string) => {
    setCreamRoundId(roundId);
    setCreamForm({ numberOfBuckets: 0, bucketWeights: [], recordedBy: '' });
    setShowCreamModal(true);
  };

  const handleRecordCream = () => {
    if (!creamRoundId) return;
    const round = amassiRounds.find(item => item.id === creamRoundId);
    if (!round) return;
    const totalWeight = creamForm.bucketWeights.reduce((sum, weight) => sum + weight, 0);
    if (totalWeight <= 0) {
      showToast('error', 'Enter valid cream bucket weights');
      return;
    }

    updateProductionRound(round.id, {
      creamRecovered: totalWeight,
      creamRecoveredAt: new Date().toISOString(),
      creamRecoveredBy: creamForm.recordedBy,
    });

    const milkLot = milkLots.find(lot => lot.id === round.milkLotId);
    if (milkLot) {
      const existingPool = milkLot.creamPool || {
        milkLotId: milkLot.id,
        milkLotCode: milkLot.lotCode,
        batchId: getCreamBatchCode(milkLot.lotCode),
        totalCream: 0,
        usedInButter: 0,
        availableBalance: 0,
        roundsContributed: [],
      };
      updateMilkLot(milkLot.id, {
        creamPool: {
          ...existingPool,
          batchId: existingPool.batchId || getCreamBatchCode(milkLot.lotCode),
          totalCream: existingPool.totalCream + totalWeight,
          availableBalance: existingPool.availableBalance + totalWeight,
          roundsContributed: existingPool.roundsContributed.includes(round.id)
            ? existingPool.roundsContributed
            : [...existingPool.roundsContributed, round.id],
        },
      });
    }

    addIntermediateLot({
      lotCode: `CREAM-${round.milkLotCode}-S${round.shiftNumber}-R${round.roundNumber}`,
      productId: 'cream',
      productName: 'Recovered Cream (from Amassi)',
      productClass: 'intermediate',
      sourceBatchId: round.id,
      sourceBatchCode: `${round.milkLotCode}/S${round.shiftNumber}/R${round.roundNumber}/Amassi`,
      producedQuantity: totalWeight,
      currentQuantity: totalWeight,
      uom: 'kg',
      storageLocation: 'Chiller',
      status: 'available',
      producedAt: new Date().toISOString(),
      sourceMilkLotCode: round.milkLotCode,
      sourceShift: round.shiftNumber,
      sourceRound: round.roundNumber,
    });

    showToast('success', `Cream recorded: ${totalWeight.toFixed(2)} kg · added to ${getCreamBatchCode(round.milkLotCode)}`);
    setShowCreamModal(false);
    setCreamRoundId(null);
    setCreamForm({ numberOfBuckets: 0, bucketWeights: [], recordedBy: '' });
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
                <table className="w-full min-w-[1320px] text-sm">
                  <thead><tr className="border-b border-slate-100"><th className="px-3 py-2 text-left text-xs uppercase tracking-wide text-slate-500">Batch ID</th><th className="px-3 py-2 text-left text-xs uppercase tracking-wide text-slate-500">Milk Quantity</th><th className="px-3 py-2 text-left text-xs uppercase tracking-wide text-slate-500">Milk Temp</th><th className="px-3 py-2 text-left text-xs uppercase tracking-wide text-slate-500">Type</th><th className="px-3 py-2 text-left text-xs uppercase tracking-wide text-slate-500">Current Stage</th><th className="px-3 py-2 text-left text-xs uppercase tracking-wide text-slate-500">pH Before Freezing</th><th className="px-3 py-2 text-left text-xs uppercase tracking-wide text-slate-500">Final pH</th><th className="px-3 py-2 text-left text-xs uppercase tracking-wide text-slate-500">Packed Into</th></tr></thead>
                  <tbody className="divide-y divide-slate-50">
                    {rounds.map(round => {
                      const packed = round.amassiPacked || [];
                      return <tr key={round.id} className="align-middle hover:bg-slate-50/50">
                        <td className="px-3 py-3"><div className="inline-flex rounded-lg border border-slate-200 bg-white px-2 py-1 font-mono text-sm font-bold text-slate-900">{roundCode(round)}</div><div className="mt-1 text-xs text-slate-500">{round.milkLotCode}</div></td>
                        <td className="px-3 py-3"><input type="number" min="0" value={round.actualInput || round.plannedInput} onChange={event => { const quantity = Number(event.target.value) || 0; updateProductionRound(round.id, { plannedInput: quantity, actualInput: quantity }); }} className="w-28 rounded-lg border border-slate-200 px-2 py-1.5 text-sm" /> <span className="text-xs text-slate-500">L</span></td>
                        <td className="px-3 py-3"><div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5"><Thermometer className="h-3.5 w-3.5 text-cyan-600" /><input type="number" step="0.1" value={round.startingTemperature ?? ''} onChange={event => updateProductionRound(round.id, { startingTemperature: Number(event.target.value) || 0 })} className="w-16 border-0 p-0 text-sm outline-none" />°C</div></td>
                        <td className="px-3 py-3"><div><span className="inline-flex rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 font-bold text-slate-700">{round.amassiType || '—'}</span>{round.creamRecovered !== undefined && <div className="mt-1 inline-flex rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700">Cream {round.creamRecovered.toFixed(2)} kg</div>}{round.status !== 'scheduled' && round.creamRecovered === undefined && <button onClick={() => openCreamModal(round.id)} className="mt-1 flex w-fit items-center rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-100">+ Cream</button>}</div></td>
                        <td className="min-w-[370px] px-3 py-3"><div className="flex flex-wrap items-center gap-2">{canForceStage ? <select value={round.status} onChange={event => handleStageChange(round.id, event.target.value as AmassiStage)} className="w-48 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-semibold text-slate-700">{stageOptions.map(stage => <option key={stage} value={stage}>{stageLabels[stage]}</option>)}</select> : <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold text-white ${stageColors[round.status as AmassiStage] || 'bg-slate-400'}`}>{stageLabels[round.status as AmassiStage] || round.status}</span>}{round.status === 'incubation' && <span className="text-xs text-slate-500">at 27°C</span>}{getAction(round)}</div></td>
                        <td className="px-3 py-3"><span className={`inline-flex rounded-lg border px-2 py-1 font-semibold ${round.amassiPhBeforeFreezing !== undefined ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 bg-slate-50 text-slate-400'}`}>{round.amassiPhBeforeFreezing !== undefined ? round.amassiPhBeforeFreezing.toFixed(2) : '—'}</span></td>
                        <td className="px-3 py-3"><span className={`inline-flex rounded-lg border px-2 py-1 font-semibold ${round.amassiFinalPh !== undefined ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-400'}`}>{round.amassiFinalPh !== undefined ? round.amassiFinalPh.toFixed(2) : '—'}</span></td>
                        <td className="min-w-[260px] px-3 py-3"><div className="space-y-1">{packed.length > 0 ? packed.map(item => <div key={item.sku} className="inline-flex rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">{item.sku}: {item.bottles} bottles</div>) : <span className="text-slate-400">—</span>}</div></td>
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

      <Modal isOpen={showPackModal} onClose={() => setShowPackModal(false)} title="Record bottles before incubation">
        <div className="space-y-4"><p className="text-xs text-slate-500">Record the final bottle SKU and quantity now, immediately before incubation. These bottle details remain unchanged through blast freezing and chiller storage.</p><div><label className="text-xs font-medium uppercase tracking-wide text-slate-600">Packed into</label><select value={packSku} onChange={event => setPackSku(event.target.value as AmassiSku)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"><option value="AMASSI 1.8L">AMASSI 1.8L</option><option value="AMASSI 2L">AMASSI 2L</option></select></div><div><label className="text-xs font-medium uppercase tracking-wide text-slate-600">Quantity in bottles</label><input type="number" min="1" value={packBottles} onChange={event => setPackBottles(Number(event.target.value) || 0)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></div><div className="flex gap-2"><button onClick={handleRecordBottlesAndIncubate} className="flex-1 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-medium text-white">Save bottles & start incubation</button><button onClick={() => setShowPackModal(false)} className="rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-700">Cancel</button></div></div>
      </Modal>

      <Modal isOpen={showCreamModal} onClose={() => setShowCreamModal(false)} title="Record Cream Recovery (Amassi)">
        <div className="space-y-4"><p className="text-xs text-slate-500">Record the cream recovered from this Amassi round. It will be added to the milk lot’s common {activeMilkLot?.lotCode ? getCreamBatchCode(activeMilkLot.lotCode) : 'CRM'} pool for Butter production.</p><div><label className="text-xs font-medium uppercase tracking-wide text-slate-600">Number of buckets</label><input type="number" min="1" value={creamForm.numberOfBuckets} onChange={event => { const count = Number(event.target.value) || 0; setCreamForm({ ...creamForm, numberOfBuckets: count, bucketWeights: Array(count).fill(0) }); }} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></div>{creamForm.bucketWeights.length > 0 && <div><label className="text-xs font-medium uppercase tracking-wide text-slate-600">Bucket weights (kg)</label><div className="mt-2 space-y-2">{creamForm.bucketWeights.map((weight, index) => <div key={index} className="flex items-center gap-2"><span className="w-20 text-sm">Bucket {index + 1}</span><input type="number" min="0" step="0.01" value={weight || ''} onChange={event => { const next = [...creamForm.bucketWeights]; next[index] = Number(event.target.value) || 0; setCreamForm({ ...creamForm, bucketWeights: next }); }} className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm" /><span className="text-sm text-slate-500">kg</span></div>)}</div><div className="mt-2 rounded-lg bg-slate-50 p-2 text-sm font-medium">Total: {creamForm.bucketWeights.reduce((sum, weight) => sum + weight, 0).toFixed(2)} kg</div></div>}<div><label className="text-xs font-medium uppercase tracking-wide text-slate-600">Recorded by</label><input value={creamForm.recordedBy} onChange={event => setCreamForm({ ...creamForm, recordedBy: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Worker name" /></div><div className="flex gap-2"><button onClick={handleRecordCream} className="flex-1 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-medium text-white">Record Cream</button><button onClick={() => setShowCreamModal(false)} className="rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-700">Cancel</button></div></div>
      </Modal>

      <Modal isOpen={showPhModal} onClose={() => setShowPhModal(false)} title={phCheckpoint === 'before_freezing' ? 'Record pH before Blast Freezing' : 'Record Final pH before Chiller'}>
        <div className="space-y-4"><p className="text-xs text-slate-500">This reading is required before the round can advance to the next Amassi stage.</p><div><label className="text-xs font-medium uppercase tracking-wide text-slate-600">{phCheckpoint === 'before_freezing' ? 'pH before freezing' : 'Final pH'}</label><input type="number" min="0" max="14" step="0.01" value={phInput || ''} onChange={event => setPhInput(Number(event.target.value) || 0)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="e.g. 4.50" /></div><div className="flex gap-2"><button onClick={handleRecordPh} className="flex-1 rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-medium text-white">Save pH and continue</button><button onClick={() => setShowPhModal(false)} className="rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-700">Cancel</button></div></div>
      </Modal>
    </div>
  );
}
