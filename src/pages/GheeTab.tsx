import { useState } from 'react';
import { Plus, Package, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { useToast } from '../components/Toast';
import { Modal } from '../components/Modal';

type GheeStatus = 
  | 'scheduled'
  | 'butter_selected'
  | 'af_oil_added'
  | 'cooking'
  | 'supervisor_check'
  | 'packing'
  | 'packed'
  | 'handed_over'
  | 'discarded';

const gheeStatusLabels: Record<GheeStatus, string> = {
  scheduled: 'Scheduled',
  butter_selected: 'Butter Selected',
  af_oil_added: 'AF Oil Added',
  cooking: 'Cooking',
  supervisor_check: 'Supervisor Check',
  packing: 'Packing',
  packed: 'Packed',
  handed_over: 'Handed Over',
  discarded: 'Discarded',
};

const gheeStatusColors: Record<GheeStatus, string> = {
  scheduled: 'bg-slate-400',
  butter_selected: 'bg-amber-500',
  af_oil_added: 'bg-orange-500',
  cooking: 'bg-red-500',
  supervisor_check: 'bg-purple-500',
  packing: 'bg-indigo-500',
  packed: 'bg-emerald-500',
  handed_over: 'bg-emerald-700',
  discarded: 'bg-gray-600',
};

export default function GheeTab() {
  const { productionRounds, productionShifts, milkLots, updateProductionRound, addProductionRound, addProductionShift } = useApp();
  const { showToast } = useToast();

  const [showNewShiftModal, setShowNewShiftModal] = useState(false);
  const [showNewRoundModal, setShowNewRoundModal] = useState(false);
  const [showPackingModal, setShowPackingModal] = useState(false);
  const [showDiscardModal, setShowDiscardModal] = useState(false);
  const [selectedRound, setSelectedRound] = useState<string | null>(null);

  // Forms
  const [newShift, setNewShift] = useState({
    milkLotId: '',
    shiftNumber: 1,
    team: '',
    startedAt: new Date().toISOString().slice(0, 16),
  });

  const [newRound, setNewRound] = useState({
    shiftId: '',
    roundNumber: 1,
    milkLotId: '', // Select specific milk lot
    butterInput: 0,
    team: '',
  });

  const [packingForm, setPackingForm] = useState({
    sku: '',
    buckets: 0,
  });

  const [discardForm, setDiscardForm] = useState({
    reason: '',
    responsible: '',
  });

  // Filter ghee rounds
  const gheeRounds = productionRounds.filter(r => r.type === 'Ghee');
  // Show ALL active shifts, not just those with ghee rounds
  const gheeShifts = productionShifts.filter(s => s.status === 'active');

  // Group by shift
  const groupedByShift = gheeRounds.reduce((acc, round) => {
    if (!acc[round.shiftId]) acc[round.shiftId] = [];
    acc[round.shiftId].push(round);
    return acc;
  }, {} as Record<string, typeof gheeRounds>);

  // Get available butter from specific milk lots
  const getAvailableButter = (milkLotId: string) => {
    const butterRounds = productionRounds.filter(r => 
      r.type === 'Butter' && 
      r.milkLotId === milkLotId && 
      r.butterOutput && 
      r.butterOutput > 0 &&
      (r.remainingBalance || 0) > 0 &&
      r.destination !== 'ghee' // Not already sent to ghee
    );
    
    return butterRounds.reduce((total, round) => {
      return total + (round.remainingBalance || 0);
    }, 0);
  };

  // Calculate AF oil based on butter input (92.5:12.5 ratio)
  const calculateAFOil = (butterInput: number) => {
    return (butterInput * 12.5) / 92.5;
  };

  // Calculate expected yield (70%)
  const calculateExpectedYield = (totalInput: number) => {
    return totalInput * 0.7;
  };

  // Calculate actual yield from packed SKUs
  const calculateActualYield = (round: any) => {
    if (!round.packedSkus || round.packedSkus.length === 0) return 0;
    
    return round.packedSkus.reduce((total: number, pack: any) => {
      if (pack.sku === 'GHEE-400') {
        // 27 buckets per case, 400g per bucket = 10.8 kg per case
        return total + (pack.cases * 10.8) + (pack.loose * 0.4);
      } else if (pack.sku === 'GHEE-1500') {
        // 6 buckets per case, 1.5kg per bucket = 9 kg per case
        return total + (pack.cases * 9) + (pack.loose * 1.5);
      }
      return total;
    }, 0);
  };

  // Handlers
  const handleCreateShift = () => {
    if (!newShift.milkLotId) {
      showToast('error', 'Please select a milk lot');
      return;
    }
    const milkLot = milkLots.find(m => m.id === newShift.milkLotId);
    if (!milkLot) return;

    addProductionShift({
      milkLotId: newShift.milkLotId,
      milkLotCode: milkLot.lotCode,
      shiftNumber: newShift.shiftNumber,
      startedAt: new Date(newShift.startedAt).toISOString(),
      team: newShift.team.split(',').map(t => t.trim()).filter(Boolean),
      status: 'active',
    });
    showToast('success', `Ghee Shift ${newShift.shiftNumber} created`);
    setShowNewShiftModal(false);
    setNewShift({ milkLotId: '', shiftNumber: 1, team: '', startedAt: new Date().toISOString().slice(0, 16) });
  };

  const handleCreateRound = () => {
    if (!newRound.shiftId || !newRound.milkLotId || newRound.butterInput <= 0) {
      showToast('error', 'Please fill all required fields');
      return;
    }

    const shift = productionShifts.find(s => s.id === newRound.shiftId);
    if (!shift) return;

    const milkLot = milkLots.find(m => m.id === newRound.milkLotId);
    if (!milkLot) return;

    const availableButter = getAvailableButter(newRound.milkLotId);
    if (newRound.butterInput > availableButter) {
      showToast('error', `Not enough butter available. Available: ${availableButter.toFixed(2)} kg`);
      return;
    }

    const afOilInput = calculateAFOil(newRound.butterInput);
    const totalInput = newRound.butterInput + afOilInput;
    const expectedYield = calculateExpectedYield(totalInput);

    addProductionRound({
      milkLotId: shift.milkLotId,
      milkLotCode: shift.milkLotCode,
      shiftId: shift.id,
      shiftNumber: shift.shiftNumber,
      roundNumber: newRound.roundNumber,
      type: 'Ghee',
      status: 'butter_selected',
      team: newRound.team ? newRound.team.split(',').map(t => t.trim()).filter(Boolean) : shift.team,
      plannedInput: newRound.butterInput,
      actualInput: newRound.butterInput,
      outputWeight: 0,
      startTime: new Date().toISOString(),
      locked: false,
      butterInput: newRound.butterInput,
      afOilInput: afOilInput,
      expectedYield: expectedYield,
      remainingBalance: 0,
    });

    // Update butter rounds to mark as used in ghee
    const butterRounds = productionRounds.filter(r => 
      r.type === 'Butter' && 
      r.milkLotId === newRound.milkLotId && 
      (r.remainingBalance || 0) > 0 &&
      r.destination !== 'ghee'
    );

    let remainingButterNeeded = newRound.butterInput;
    butterRounds.forEach(round => {
      if (remainingButterNeeded <= 0) return;
      
      const available = round.remainingBalance || 0;
      const toUse = Math.min(available, remainingButterNeeded);
      
      updateProductionRound(round.id, {
        usedInGhee: (round.usedInGhee || 0) + toUse,
        remainingBalance: available - toUse,
        destination: 'ghee',
      });
      
      remainingButterNeeded -= toUse;
    });

    showToast('success', `Ghee round created: 04-${shift.milkLotCode}/S${shift.shiftNumber}/R${newRound.roundNumber}`);
    setShowNewRoundModal(false);
    setNewRound({ shiftId: '', roundNumber: 1, milkLotId: '', butterInput: 0, team: '' });
  };

  const handleStatusChange = (roundId: string, newStatus: GheeStatus) => {
    updateProductionRound(roundId, { status: newStatus });
    showToast('success', `Status: ${gheeStatusLabels[newStatus]}`);
  };

  const handleSupervisorCheck = (roundId: string) => {
    updateProductionRound(roundId, { 
      status: 'supervisor_check',
      notes: 'Supervisor checked and approved',
    });
    showToast('success', 'Supervisor check completed');
  };

  const handleDiscard = () => {
    if (!selectedRound || !discardForm.reason || !discardForm.responsible) {
      showToast('error', 'Please fill all fields');
      return;
    }

    updateProductionRound(selectedRound, {
      status: 'discarded',
      locked: true,
      notes: `DISCARDED: ${discardForm.reason} (Responsible: ${discardForm.responsible})`,
      completedAt: new Date().toISOString(),
    });

    showToast('success', 'Round discarded');
    setShowDiscardModal(false);
    setDiscardForm({ reason: '', responsible: '' });
  };

  const handlePack = () => {
    if (!selectedRound || packingForm.buckets <= 0) {
      showToast('error', 'Please enter valid quantity');
      return;
    }

    const round = gheeRounds.find(r => r.id === selectedRound);
    if (!round) return;

    // Calculate weight based on SKU
    let weightPerBucket = 0;
    let bucketsPerCase = 0;

    if (packingForm.sku === 'GHEE-400') {
      weightPerBucket = 0.4; // 400g
      bucketsPerCase = 27;
    } else if (packingForm.sku === 'GHEE-1500') {
      weightPerBucket = 1.5; // 1.5kg
      bucketsPerCase = 6;
    }

    const totalWeight = packingForm.buckets * weightPerBucket;
    const cases = Math.floor(packingForm.buckets / bucketsPerCase);
    const looseBuckets = packingForm.buckets % bucketsPerCase;

    // Update packing sessions
    const existingPacking = round.packedSkus || [];
    const newPacking = [...existingPacking, {
      sku: packingForm.sku,
      cases,
      loose: looseBuckets,
    }];

    const actualYield = calculateActualYield({ ...round, packedSkus: newPacking });

    updateProductionRound(selectedRound, {
      packedSkus: newPacking,
      outputWeight: actualYield,
      status: 'packed',
    });

    showToast('success', `Packed: ${cases} cases + ${looseBuckets} loose buckets`);
    setShowPackingModal(false);
    setPackingForm({ sku: '', buckets: 0 });
  };

  const handleCloseProduction = (roundId: string) => {
    const round = gheeRounds.find(r => r.id === roundId);
    if (!round) return;

    const actualYield = calculateActualYield(round);
    const expectedYield = round.expectedYield || 0;
    const moistureLoss = expectedYield - actualYield;

    updateProductionRound(roundId, {
      status: 'handed_over',
      locked: true,
      completedAt: new Date().toISOString(),
      outputWeight: actualYield,
    });

    showToast('success', `Production closed. Moisture loss: ${moistureLoss.toFixed(2)} kg`);
  };

  const getActionButtons = (round: any) => {
    const buttons = [];

    if (round.status === 'scheduled') {
      buttons.push(
        <button
          key="select_butter"
          onClick={() => handleStatusChange(round.id, 'butter_selected')}
          className="px-3 py-1.5 bg-amber-500 text-white rounded text-xs font-medium hover:bg-amber-600"
        >
          Select Butter
        </button>
      );
    } else if (round.status === 'butter_selected') {
      buttons.push(
        <button
          key="add_af_oil"
          onClick={() => handleStatusChange(round.id, 'af_oil_added')}
          className="px-3 py-1.5 bg-orange-500 text-white rounded text-xs font-medium hover:bg-orange-600"
        >
          Add AF Oil
        </button>
      );
    } else if (round.status === 'af_oil_added') {
      buttons.push(
        <button
          key="start_cooking"
          onClick={() => handleStatusChange(round.id, 'cooking')}
          className="px-3 py-1.5 bg-red-500 text-white rounded text-xs font-medium hover:bg-red-600"
        >
          Start Cooking
        </button>
      );
    } else if (round.status === 'cooking') {
      buttons.push(
        <button
          key="supervisor_check"
          onClick={() => handleSupervisorCheck(round.id)}
          className="flex items-center gap-1 px-3 py-1.5 bg-purple-500 text-white rounded text-xs font-medium hover:bg-purple-600"
        >
          <CheckCircle2 className="w-3 h-3" /> Supervisor Check
        </button>
      );
    } else if (round.status === 'supervisor_check') {
      buttons.push(
        <button
          key="start_packing"
          onClick={() => handleStatusChange(round.id, 'packing')}
          className="px-3 py-1.5 bg-indigo-500 text-white rounded text-xs font-medium hover:bg-indigo-600"
        >
          Start Packing
        </button>
      );
    } else if (round.status === 'packing') {
      buttons.push(
        <button
          key="pack"
          onClick={() => {
            setSelectedRound(round.id);
            setShowPackingModal(true);
          }}
          className="flex items-center gap-1 px-3 py-1.5 bg-emerald-500 text-white rounded text-xs font-medium hover:bg-emerald-600"
        >
          <Package className="w-3 h-3" /> Pack
        </button>
      );
    } else if (round.status === 'packed') {
      buttons.push(
        <button
          key="close"
          onClick={() => handleCloseProduction(round.id)}
          className="flex items-center gap-1 px-3 py-1.5 bg-emerald-700 text-white rounded text-xs font-medium hover:bg-emerald-800"
        >
          <CheckCircle2 className="w-3 h-3" /> Close Production
        </button>
      );
    }

    // Discard button (available until handed_over)
    if (round.status !== 'handed_over' && round.status !== 'discarded') {
      buttons.push(
        <button
          key="discard"
          onClick={() => {
            setSelectedRound(round.id);
            setShowDiscardModal(true);
          }}
          className="flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white rounded text-xs font-medium hover:bg-red-700"
        >
          <XCircle className="w-3 h-3" /> Discard
        </button>
      );
    }

    return buttons;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-900">Ghee Production</h3>
          <p className="text-sm text-slate-500">
            Butter + AF Oil → Ghee (70% yield)
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowNewShiftModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700"
          >
            <Plus className="w-4 h-4" /> New Shift
          </button>
          <button
            onClick={() => setShowNewRoundModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700"
          >
            <Plus className="w-4 h-4" /> New Round
          </button>
        </div>
      </div>

      {/* Production Board */}
      <div className="space-y-4">
        {Object.entries(groupedByShift).map(([shiftId, rounds]) => {
          const shift = productionShifts.find(s => s.id === shiftId);
          if (!shift) return null;

          return (
            <div key={shiftId} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              {/* Shift Header */}
              <div className="px-4 py-3 bg-indigo-50 border-b border-indigo-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-full bg-indigo-600 text-white text-sm font-bold flex items-center justify-center">
                      {shift.shiftNumber}
                    </span>
                    <div>
                      <div className="text-sm font-semibold text-slate-900">Shift {shift.shiftNumber}</div>
                      <div className="text-xs text-slate-500">Team: {shift.team.join(', ')}</div>
                    </div>
                  </div>
                  <span className="text-xs text-slate-500">{rounds.length} round{rounds.length !== 1 ? 's' : ''}</span>
                </div>
              </div>

              {/* Rounds Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="px-4 py-2 text-left font-medium text-slate-500 text-xs uppercase tracking-wide w-36">Batch ID</th>
                      <th className="px-4 py-2 text-left font-medium text-slate-500 text-xs uppercase tracking-wide">Status</th>
                      <th className="px-4 py-2 text-left font-medium text-slate-500 text-xs uppercase tracking-wide w-20">Butter</th>
                      <th className="px-4 py-2 text-left font-medium text-slate-500 text-xs uppercase tracking-wide w-20">AF Oil</th>
                      <th className="px-4 py-2 text-left font-medium text-slate-500 text-xs uppercase tracking-wide w-20">Expected</th>
                      <th className="px-4 py-2 text-left font-medium text-slate-500 text-xs uppercase tracking-wide w-20">Actual</th>
                      <th className="px-4 py-2 text-left font-medium text-slate-500 text-xs uppercase tracking-wide">Packed</th>
                      <th className="px-4 py-2 text-left font-medium text-slate-500 text-xs uppercase tracking-wide">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {rounds.map((round) => (
                      <tr key={round.id} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3">
                          <div className="font-mono text-xs font-bold text-slate-900">
                            04-{round.milkLotCode}/S{round.shiftNumber}/R{round.roundNumber}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-white ${gheeStatusColors[round.status as GheeStatus]}`}>
                            {gheeStatusLabels[round.status as GheeStatus]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600 text-xs">{round.butterInput || '—'} kg</td>
                        <td className="px-4 py-3 text-slate-600 text-xs">{round.afOilInput?.toFixed(2) || '—'} kg</td>
                        <td className="px-4 py-3 text-slate-600 text-xs">{round.expectedYield?.toFixed(2) || '—'} kg</td>
                        <td className="px-4 py-3 text-slate-600 text-xs">
                          {round.outputWeight > 0 ? `${round.outputWeight.toFixed(2)} kg` : '—'}
                        </td>
                        <td className="px-4 py-3">
                          {round.packedSkus && round.packedSkus.length > 0 ? (
                            <div className="text-xs">
                              {round.packedSkus.map((p: any, i: number) => (
                                <div key={i}>{p.sku}: {p.cases}c + {p.loose}l</div>
                              ))}
                            </div>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1 flex-wrap">
                            {getActionButtons(round)}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}

        {gheeRounds.length === 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
            <p className="text-slate-500">No ghee rounds yet. Create a shift and round to begin.</p>
          </div>
        )}
      </div>

      {/* Modals */}
      {/* New Shift Modal */}
      <Modal isOpen={showNewShiftModal} onClose={() => setShowNewShiftModal(false)} title="Create New Ghee Shift">
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Milk Lot</label>
            <select
              value={newShift.milkLotId}
              onChange={(e) => setNewShift({ ...newShift, milkLotId: e.target.value })}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
            >
              <option value="">Select milk lot</option>
              {milkLots.filter(l => l.status === 'active').map(lot => (
                <option key={lot.id} value={lot.id}>{lot.lotCode}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Shift Number</label>
            <input
              type="number"
              value={newShift.shiftNumber}
              onChange={(e) => setNewShift({ ...newShift, shiftNumber: parseInt(e.target.value) })}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              min="1"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Team (comma-separated)</label>
            <input
              type="text"
              value={newShift.team}
              onChange={(e) => setNewShift({ ...newShift, team: e.target.value })}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              placeholder="e.g. Rajesh, Amit, Suresh"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <button
              onClick={handleCreateShift}
              className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
            >
              Create Shift
            </button>
            <button
              onClick={() => setShowNewShiftModal(false)}
              className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {/* New Round Modal */}
      <Modal isOpen={showNewRoundModal} onClose={() => setShowNewRoundModal(false)} title="Create New Ghee Round">
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Shift</label>
            <select
              value={newRound.shiftId}
              onChange={(e) => {
                const shiftId = e.target.value;
                const existingRounds = gheeRounds.filter(r => r.shiftId === shiftId).length;
                setNewRound({ ...newRound, shiftId, roundNumber: existingRounds + 1 });
              }}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
            >
              <option value="">Select shift</option>
              {gheeShifts.filter(s => s.status === 'active').map(s => (
                <option key={s.id} value={s.id}>Shift {s.shiftNumber} - {s.milkLotCode}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Round Number</label>
            <input
              type="number"
              value={newRound.roundNumber}
              onChange={(e) => setNewRound({ ...newRound, roundNumber: parseInt(e.target.value) })}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              min="1"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Milk Lot (Butter Source)</label>
            <select
              value={newRound.milkLotId}
              onChange={(e) => setNewRound({ ...newRound, milkLotId: e.target.value })}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
            >
              <option value="">Select milk lot</option>
              {milkLots.map(lot => {
                const availableButter = getAvailableButter(lot.id);
                return (
                  <option key={lot.id} value={lot.id} disabled={availableButter === 0}>
                    {lot.lotCode} - {availableButter.toFixed(2)} kg butter available
                  </option>
                );
              })}
            </select>
          </div>
          {newRound.milkLotId && (
            <div>
              <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Butter Input (kg)</label>
              <input
                type="number"
                value={newRound.butterInput}
                onChange={(e) => setNewRound({ ...newRound, butterInput: parseFloat(e.target.value) })}
                className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                step="0.1"
                min="0"
                max={getAvailableButter(newRound.milkLotId)}
              />
              <p className="text-xs text-slate-500 mt-1">
                Available: {getAvailableButter(newRound.milkLotId).toFixed(2)} kg
              </p>
            </div>
          )}
          {newRound.butterInput > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-xs font-medium text-amber-900 mb-2">Recipe Calculation:</p>
              <div className="space-y-1 text-xs text-amber-800">
                <div className="flex justify-between">
                  <span>Butter:</span>
                  <span className="font-medium">{newRound.butterInput.toFixed(2)} kg</span>
                </div>
                <div className="flex justify-between">
                  <span>AF Oil (auto):</span>
                  <span className="font-medium">{calculateAFOil(newRound.butterInput).toFixed(2)} kg</span>
                </div>
                <div className="flex justify-between border-t border-amber-300 pt-1">
                  <span>Total Input:</span>
                  <span className="font-medium">{(newRound.butterInput + calculateAFOil(newRound.butterInput)).toFixed(2)} kg</span>
                </div>
                <div className="flex justify-between">
                  <span>Expected Yield (70%):</span>
                  <span className="font-bold text-emerald-600">{calculateExpectedYield(newRound.butterInput + calculateAFOil(newRound.butterInput)).toFixed(2)} kg</span>
                </div>
              </div>
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Team (optional)</label>
            <input
              type="text"
              value={newRound.team}
              onChange={(e) => setNewRound({ ...newRound, team: e.target.value })}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              placeholder="Leave empty to use shift team"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <button
              onClick={handleCreateRound}
              className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700"
            >
              Create Round
            </button>
            <button
              onClick={() => setShowNewRoundModal(false)}
              className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {/* Packing Modal */}
      <Modal isOpen={showPackingModal} onClose={() => setShowPackingModal(false)} title="Pack Ghee">
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">SKU</label>
            <select
              value={packingForm.sku}
              onChange={(e) => setPackingForm({ ...packingForm, sku: e.target.value })}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
            >
              <option value="">Select SKU</option>
              <option value="GHEE-400">Ghee 400g (27 buckets/case = 10.8 kg)</option>
              <option value="GHEE-1500">Ghee 1.5kg (6 buckets/case = 9 kg)</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Number of Buckets</label>
            <input
              type="number"
              value={packingForm.buckets}
              onChange={(e) => setPackingForm({ ...packingForm, buckets: parseInt(e.target.value) })}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              min="0"
            />
          </div>
          {packingForm.sku && packingForm.buckets > 0 && (
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-xs text-slate-600">
                <strong>Packing Preview:</strong>
              </p>
              <p className="text-sm font-medium text-slate-900 mt-1">
                {packingForm.buckets} buckets = {Math.floor(packingForm.buckets / (packingForm.sku === 'GHEE-400' ? 27 : 6))} cases + {packingForm.buckets % (packingForm.sku === 'GHEE-400' ? 27 : 6)} loose buckets
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Total weight: {(packingForm.buckets * (packingForm.sku === 'GHEE-400' ? 0.4 : 1.5)).toFixed(2)} kg
              </p>
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <button
              onClick={handlePack}
              className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700"
            >
              Pack
            </button>
            <button
              onClick={() => setShowPackingModal(false)}
              className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {/* Discard Modal */}
      <Modal isOpen={showDiscardModal} onClose={() => setShowDiscardModal(false)} title="Discard Ghee Round">
        <div className="space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-xs text-red-800">
              <strong>Warning:</strong> This will lock the round and mark it as discarded. This action cannot be undone.
            </p>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Reason for Discard</label>
            <textarea
              value={discardForm.reason}
              onChange={(e) => setDiscardForm({ ...discardForm, reason: e.target.value })}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              rows={3}
              placeholder="e.g., Spoiled, Contaminated, Quality issue"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Responsible Person</label>
            <input
              type="text"
              value={discardForm.responsible}
              onChange={(e) => setDiscardForm({ ...discardForm, responsible: e.target.value })}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              placeholder="Supervisor name"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <button
              onClick={handleDiscard}
              className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700"
            >
              Discard Round
            </button>
            <button
              onClick={() => setShowDiscardModal(false)}
              className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
