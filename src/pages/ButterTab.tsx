import { useState } from 'react';
import { Plus, Clock, Package, CheckCircle2, AlertCircle } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { useToast } from '../components/Toast';
import { Modal } from '../components/Modal';

type ButterStatus = 
  | 'scheduled'
  | 'churning'
  | 'churned'
  | 'sent_to_ghee'
  | 'packed_as_pubb'
  | 'blending'
  | 'pubbb_pool'
  | 'psbbb_pool'
  | 'bb05_pool'
  | 'packed'
  | 'handed_over';

const butterStatusLabels: Record<ButterStatus, string> = {
  scheduled: 'Scheduled',
  churning: 'Churning',
  churned: 'Churned (Butter)',
  sent_to_ghee: 'Sent to Ghee',
  packed_as_pubb: 'Packed as PUBB',
  blending: 'Blending',
  pubbb_pool: 'PUBBB Pool',
  psbbb_pool: 'PSBBB Pool',
  bb05_pool: 'BB05 Pool',
  packed: 'Packed',
  handed_over: 'Handed Over',
};

const butterStatusColors: Record<ButterStatus, string> = {
  scheduled: 'bg-slate-400',
  churning: 'bg-blue-500',
  churned: 'bg-blue-600',
  sent_to_ghee: 'bg-orange-500',
  packed_as_pubb: 'bg-emerald-500',
  blending: 'bg-purple-500',
  pubbb_pool: 'bg-indigo-500',
  psbbb_pool: 'bg-pink-500',
  bb05_pool: 'bg-rose-500',
  packed: 'bg-emerald-600',
  handed_over: 'bg-emerald-700',
};

export default function ButterTab() {
  const { productionRounds, productionShifts, milkLots, creamLots, updateProductionRound, addProductionRound, addProductionShift, updateMilkLot, updateCreamLot } = useApp();
  const { showToast } = useToast();

  const [showNewShiftModal, setShowNewShiftModal] = useState(false);
  const [showNewRoundModal, setShowNewRoundModal] = useState(false);
  const [showOutputModal, setShowOutputModal] = useState(false);
  const [showBlendingModal, setShowBlendingModal] = useState(false);
  const [showPackingModal, setShowPackingModal] = useState(false);
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
    creamSource: 'internal' as 'internal' | 'external',
    creamLotId: '',
    inputQuantity: 0,
    team: '',
  });

  const [outputForm, setOutputForm] = useState({
    butterOutput: 0,
    buttermilkOutput: 0,
  });

  const [blendingForm, setBlendingForm] = useState({
    butterQuantity: 16.5,
    replacerQuantity: 5,
    isSalted: false,
  });

  const [packingForm, setPackingForm] = useState({
    sku: '',
    quantity: 0,
    unit: 'balls' as 'balls' | 'bricks',
  });

  // Filter butter rounds
  const butterRounds = productionRounds.filter(r => r.type === 'Butter');
  // Show ALL active shifts, not just those with butter rounds
  const butterShifts = productionShifts.filter(s => s.status === 'active');

  // Group by shift
  const groupedByShift = butterRounds.reduce((acc, round) => {
    if (!acc[round.shiftId]) acc[round.shiftId] = [];
    acc[round.shiftId].push(round);
    return acc;
  }, {} as Record<string, typeof butterRounds>);

  // Get available cream pools (internal cream from milk lots)
  const internalCreamPools = milkLots.filter(lot => 
    lot.creamPool && lot.creamPool.availableBalance > 0
  );

  const externalCreamLots = [
    ...creamLots,
    ...milkLots.flatMap(lot => lot.creamLots || []),
  ];

  // Handlers
  const handleCreateShift = () => {
    if (!newShift.milkLotId) {
      showToast('error', 'Please select a milk lot');
      return;
    }
    const milkLot = milkLots.find(m => m.id === newShift.milkLotId);
    if (!milkLot) return;
    if (milkLot.productionClosed) {
      showToast('error', `Production for milk lot ${milkLot.lotCode} is closed`);
      return;
    }

    addProductionShift({
      milkLotId: newShift.milkLotId,
      milkLotCode: milkLot.lotCode,
      shiftNumber: newShift.shiftNumber,
      startedAt: new Date(newShift.startedAt).toISOString(),
      team: newShift.team.split(',').map(t => t.trim()).filter(Boolean),
      status: 'active',
    });
    showToast('success', `Butter Shift ${newShift.shiftNumber} created`);
    setShowNewShiftModal(false);
    setNewShift({ milkLotId: '', shiftNumber: 1, team: '', startedAt: new Date().toISOString().slice(0, 16) });
  };

  const handleCreateRound = () => {
    if (!newRound.shiftId || !newRound.creamLotId || newRound.inputQuantity <= 0) {
      showToast('error', 'Please fill all required fields');
      return;
    }
    const shift = productionShifts.find(s => s.id === newRound.shiftId);
    if (!shift) return;

    // For internal cream, deduct from the cream pool
    if (newRound.creamSource === 'internal') {
      const milkLot = milkLots.find(m => m.id === newRound.creamLotId);
      if (milkLot && milkLot.creamPool) {
        if (newRound.inputQuantity > milkLot.creamPool.availableBalance) {
          showToast('error', `Not enough cream in pool. Available: ${milkLot.creamPool.availableBalance} kg`);
          return;
        }
        
        const previousBalance = milkLot.creamPool.availableBalance;
        
        // Update the cream pool
        updateMilkLot(milkLot.id, {
          creamPool: {
            ...milkLot.creamPool,
            usedInButter: milkLot.creamPool.usedInButter + newRound.inputQuantity,
            availableBalance: milkLot.creamPool.availableBalance - newRound.inputQuantity,
          },
        });
        
        console.log(`Cream pool updated: ${previousBalance} kg → ${previousBalance - newRound.inputQuantity} kg (used ${newRound.inputQuantity} kg)`);
      } else {
        console.warn('Milk lot or cream pool not found:', { milkLotId: newRound.creamLotId, milkLot });
      }
    } else {
      const creamLot = externalCreamLots.find(cream => cream.id === newRound.creamLotId);
      if (!creamLot) {
        showToast('error', 'Select a valid purchased cream lot');
        return;
      }
      if (newRound.inputQuantity > creamLot.remaining) {
        showToast('error', `Not enough purchased cream. Available: ${creamLot.remaining} kg`);
        return;
      }
      if (creamLots.some(cream => cream.id === creamLot.id)) {
        updateCreamLot(creamLot.id, {
          consumed: creamLot.consumed + newRound.inputQuantity,
          remaining: creamLot.remaining - newRound.inputQuantity,
        });
      }
    }

    addProductionRound({
      milkLotId: shift.milkLotId,
      milkLotCode: shift.milkLotCode,
      shiftId: shift.id,
      shiftNumber: shift.shiftNumber,
      roundNumber: newRound.roundNumber,
      type: 'Butter',
      status: 'scheduled',
      team: newRound.team ? newRound.team.split(',').map(t => t.trim()).filter(Boolean) : shift.team,
      plannedInput: newRound.inputQuantity,
      actualInput: newRound.inputQuantity,
      outputWeight: 0,
      startTime: new Date().toISOString(),
      locked: false,
      creamSource: newRound.creamSource,
      creamLotId: newRound.creamLotId,
    });
    
    const creamMessage = newRound.creamSource === 'internal' 
      ? ` (cream pool: -${newRound.inputQuantity} kg)` 
      : '';
    showToast('success', `Butter round created: 03-${shift.milkLotCode}/S${shift.shiftNumber}/R${newRound.roundNumber}${creamMessage}`);
    setShowNewRoundModal(false);
    setNewRound({ shiftId: '', roundNumber: 1, creamSource: 'internal', creamLotId: '', inputQuantity: 0, team: '' });
  };

  const handleStatusChange = (roundId: string, newStatus: ButterStatus) => {
    updateProductionRound(roundId, { status: newStatus });
    showToast('success', `Status: ${butterStatusLabels[newStatus]}`);
  };

  const handleRecordOutput = () => {
    if (!selectedRound || outputForm.butterOutput <= 0) {
      showToast('error', 'Please enter valid output quantities');
      return;
    }

    updateProductionRound(selectedRound, {
      butterOutput: outputForm.butterOutput,
      buttermilkOutput: outputForm.buttermilkOutput,
      remainingBalance: outputForm.butterOutput,
      status: 'churned',
    });
    showToast('success', `Output recorded: ${outputForm.butterOutput} kg butter, ${outputForm.buttermilkOutput} kg buttermilk`);
    setShowOutputModal(false);
    setOutputForm({ butterOutput: 0, buttermilkOutput: 0 });
  };

  const handleSendToBlending = () => {
    if (!selectedRound) return;
    
    updateProductionRound(selectedRound, {
      status: 'blending',
      destination: 'blending',
    });
    setShowBlendingModal(true);
  };

  const handleBlending = () => {
    if (!selectedRound || blendingForm.butterQuantity <= 0) {
      showToast('error', 'Please enter valid quantities');
      return;
    }

    const round = butterRounds.find(r => r.id === selectedRound);
    if (!round) return;

    // Auto-calculate replacer (3.3:1 ratio)
    const calculatedReplacer = blendingForm.butterQuantity / 3.3;

    updateProductionRound(selectedRound, {
      replacerQuantity: calculatedReplacer,
      isSalted: blendingForm.isSalted,
      pool: blendingForm.isSalted ? 'PSBBB' : 'PUBBB',
      status: blendingForm.isSalted ? 'psbbb_pool' : 'pubbb_pool',
      remainingBalance: (round.remainingBalance || 0) - blendingForm.butterQuantity,
    });
    showToast('success', `Blended: ${blendingForm.butterQuantity} kg butter + ${calculatedReplacer.toFixed(2)} kg replacer`);
    setShowBlendingModal(false);
    setBlendingForm({ butterQuantity: 16.5, replacerQuantity: 5, isSalted: false });
  };

  const handleMakeBricks = () => {
    if (!selectedRound) return;
    
    updateProductionRound(selectedRound, {
      pool: 'BB05',
      status: 'bb05_pool',
    });
    showToast('success', 'Converted to BB05 bricks');
  };

  const handlePack = () => {
    if (!selectedRound || packingForm.quantity <= 0) {
      showToast('error', 'Please enter valid quantity');
      return;
    }

    const round = butterRounds.find(r => r.id === selectedRound);
    if (!round) return;

    // Calculate weight based on SKU
    let weightPerUnit = 0;
    let unitsPerPacket = 0;
    let packetsPerCase = 0;

    if (packingForm.sku === 'PUBB' || packingForm.sku === 'PUBBB' || packingForm.sku === 'PSBBB') {
      weightPerUnit = 0.5; // 500g per ball
      unitsPerPacket = 12;
      packetsPerCase = 3;
    } else if (packingForm.sku === 'BB05') {
      weightPerUnit = 0.5; // 500g per brick
      unitsPerPacket = 1; // bricks are not packeted
      packetsPerCase = 30;
    }

    const totalWeight = packingForm.quantity * weightPerUnit;
    const packets = Math.floor(packingForm.quantity / unitsPerPacket);
    const cases = Math.floor(packets / packetsPerCase);
    const looseUnits = packingForm.quantity % unitsPerPacket;

    // Update packing sessions
    const existingPacking = round.packedSkus || [];
    const newPacking = [...existingPacking, {
      sku: packingForm.sku,
      cases,
      loose: looseUnits,
    }];

    updateProductionRound(selectedRound, {
      packedSkus: newPacking,
      remainingBalance: (round.remainingBalance || 0) - totalWeight,
      status: 'packed',
    });

    showToast('success', `Packed: ${cases} cases + ${looseUnits} loose ${packingForm.unit}`);
    setShowPackingModal(false);
    setPackingForm({ sku: '', quantity: 0, unit: 'balls' });
  };

  const getActionButtons = (round: any) => {
    const buttons = [];

    if (round.status === 'scheduled') {
      buttons.push(
        <button
          key="churn"
          onClick={() => handleStatusChange(round.id, 'churning')}
          className="px-3 py-1.5 bg-blue-500 text-white rounded text-xs font-medium hover:bg-blue-600"
        >
          Start Churning
        </button>
      );
    } else if (round.status === 'churning') {
      buttons.push(
        <button
          key="record_output"
          onClick={() => {
            setSelectedRound(round.id);
            setShowOutputModal(true);
          }}
          className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700"
        >
          Record Output
        </button>
      );
    } else if (round.status === 'churned') {
      if (round.creamSource === 'internal') {
        // Internal cream: 3 options
        buttons.push(
          <button
            key="ghee"
            onClick={() => handleStatusChange(round.id, 'sent_to_ghee')}
            className="px-3 py-1.5 bg-orange-500 text-white rounded text-xs font-medium hover:bg-orange-600"
          >
            Send to Ghee
          </button>,
          <button
            key="pubb"
            onClick={() => handleStatusChange(round.id, 'packed_as_pubb')}
            className="px-3 py-1.5 bg-emerald-500 text-white rounded text-xs font-medium hover:bg-emerald-600"
          >
            Pack as PUBB
          </button>,
          <button
            key="blend"
            onClick={handleSendToBlending}
            className="px-3 py-1.5 bg-purple-500 text-white rounded text-xs font-medium hover:bg-purple-600"
          >
            Send to Blending
          </button>
        );
      } else {
        // External cream: must blend
        buttons.push(
          <button
            key="blend"
            onClick={handleSendToBlending}
            className="px-3 py-1.5 bg-purple-500 text-white rounded text-xs font-medium hover:bg-purple-600"
          >
            Start Blending
          </button>
        );
      }
    } else if (round.status === 'pubbb_pool') {
      buttons.push(
        <button
          key="pack"
          onClick={() => {
            setSelectedRound(round.id);
            setPackingForm({ ...packingForm, sku: 'PUBBB', unit: 'balls' });
            setShowPackingModal(true);
          }}
          className="flex items-center gap-1 px-3 py-1.5 bg-indigo-500 text-white rounded text-xs font-medium hover:bg-indigo-600"
        >
          <Package className="w-3 h-3" /> Pack as PUBBB
        </button>,
        <button
          key="salt"
          onClick={() => {
            updateProductionRound(round.id, { pool: 'PSBBB', status: 'psbbb_pool', isSalted: true });
            showToast('success', 'Added salt - converted to PSBBB');
          }}
          className="px-3 py-1.5 bg-pink-500 text-white rounded text-xs font-medium hover:bg-pink-600"
        >
          Add Salt → PSBBB
        </button>
      );
    } else if (round.status === 'psbbb_pool') {
      buttons.push(
        <button
          key="pack"
          onClick={() => {
            setSelectedRound(round.id);
            setPackingForm({ ...packingForm, sku: 'PSBBB', unit: 'balls' });
            setShowPackingModal(true);
          }}
          className="flex items-center gap-1 px-3 py-1.5 bg-pink-500 text-white rounded text-xs font-medium hover:bg-pink-600"
        >
          <Package className="w-3 h-3" /> Pack as PSBBB
        </button>,
        <button
          key="bricks"
          onClick={handleMakeBricks}
          className="px-3 py-1.5 bg-rose-500 text-white rounded text-xs font-medium hover:bg-rose-600"
        >
          Make Bricks → BB05
        </button>
      );
    } else if (round.status === 'bb05_pool') {
      buttons.push(
        <button
          key="pack"
          onClick={() => {
            setSelectedRound(round.id);
            setPackingForm({ ...packingForm, sku: 'BB05', unit: 'bricks' });
            setShowPackingModal(true);
          }}
          className="flex items-center gap-1 px-3 py-1.5 bg-rose-500 text-white rounded text-xs font-medium hover:bg-rose-600"
        >
          <Package className="w-3 h-3" /> Pack as BB05
        </button>
      );
    } else if (round.status === 'packed') {
      buttons.push(
        <button
          key="handover"
          onClick={() => handleStatusChange(round.id, 'handed_over')}
          className="flex items-center gap-1 px-3 py-1.5 bg-emerald-700 text-white rounded text-xs font-medium hover:bg-emerald-800"
        >
          <CheckCircle2 className="w-3 h-3" /> Hand Over
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
          <h3 className="text-lg font-bold text-slate-900">Butter Production</h3>
          <p className="text-sm text-slate-500">
            Cream → Churning → Butter → Packing/Blending
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

      {/* Cream Pool Summary */}
      {internalCreamPools.length > 0 && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4">
          <h4 className="text-sm font-semibold text-blue-900 mb-3 flex items-center gap-2">
            <span>🥛</span> Internal Cream Pools
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {internalCreamPools.map(lot => (
              <div key={lot.id} className="bg-white rounded-lg p-3 border border-blue-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-bold text-slate-900">{lot.lotCode}</span>
                  <span className="text-xs text-blue-600">{lot.creamPool?.roundsContributed.length || 0} rounds</span>
                </div>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Total:</span>
                    <span className="font-medium text-slate-900">{lot.creamPool?.totalCream.toFixed(2) || 0} kg</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Used:</span>
                    <span className="font-medium text-orange-600">{lot.creamPool?.usedInButter.toFixed(2) || 0} kg</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-200 pt-1">
                    <span className="text-slate-700 font-medium">Available:</span>
                    <span className="font-bold text-emerald-600">{lot.creamPool?.availableBalance.toFixed(2) || 0} kg</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
                      <th className="px-4 py-2 text-left font-medium text-slate-500 text-xs uppercase tracking-wide">Source</th>
                      <th className="px-4 py-2 text-left font-medium text-slate-500 text-xs uppercase tracking-wide">Status</th>
                      <th className="px-4 py-2 text-left font-medium text-slate-500 text-xs uppercase tracking-wide w-20">Input</th>
                      <th className="px-4 py-2 text-left font-medium text-slate-500 text-xs uppercase tracking-wide w-20">Butter</th>
                      <th className="px-4 py-2 text-left font-medium text-slate-500 text-xs uppercase tracking-wide w-20">Buttermilk</th>
                      <th className="px-4 py-2 text-left font-medium text-slate-500 text-xs uppercase tracking-wide w-20">Balance</th>
                      <th className="px-4 py-2 text-left font-medium text-slate-500 text-xs uppercase tracking-wide">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {rounds.map((round) => (
                      <tr key={round.id} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3">
                          <div className="font-mono text-xs font-bold text-slate-900">
                            03-{round.milkLotCode}/S{round.shiftNumber}/R{round.roundNumber}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                            round.creamSource === 'internal' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                          }`}>
                            {round.creamSource === 'internal' ? 'Internal' : 'External'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-white ${butterStatusColors[round.status as ButterStatus]}`}>
                            {butterStatusLabels[round.status as ButterStatus]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600 text-xs">{round.actualInput} kg</td>
                        <td className="px-4 py-3 text-slate-600 text-xs">{round.butterOutput || '—'} kg</td>
                        <td className="px-4 py-3 text-slate-600 text-xs">{round.buttermilkOutput || '—'} kg</td>
                        <td className="px-4 py-3 text-slate-600 text-xs">{round.remainingBalance || '—'} kg</td>
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

        {butterRounds.length === 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
            <p className="text-slate-500">No butter rounds yet. Create a shift and round to begin.</p>
          </div>
        )}
      </div>

      {/* Modals */}
      {/* New Shift Modal */}
      <Modal isOpen={showNewShiftModal} onClose={() => setShowNewShiftModal(false)} title="Create New Butter Shift">
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
      <Modal isOpen={showNewRoundModal} onClose={() => setShowNewRoundModal(false)} title="Create New Butter Round">
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Shift</label>
            <select
              value={newRound.shiftId}
              onChange={(e) => {
                const shiftId = e.target.value;
                const existingRounds = butterRounds.filter(r => r.shiftId === shiftId).length;
                setNewRound({ ...newRound, shiftId, roundNumber: existingRounds + 1 });
              }}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
            >
              <option value="">Select shift</option>
              {butterShifts.filter(s => s.status === 'active').map(s => (
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
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Cream Source</label>
            <div className="mt-1 flex gap-2">
              <button
                onClick={() => setNewRound({ ...newRound, creamSource: 'internal', creamLotId: '' })}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium ${
                  newRound.creamSource === 'internal' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'
                }`}
              >
                Internal (from C/S)
              </button>
              <button
                onClick={() => setNewRound({ ...newRound, creamSource: 'external', creamLotId: '' })}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium ${
                  newRound.creamSource === 'external' ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-700'
                }`}
              >
                External (Purchased)
              </button>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">
              {newRound.creamSource === 'internal' ? 'Milk Lot (Cream Pool)' : 'Cream Lot'}
            </label>
            <select
              value={newRound.creamLotId}
              onChange={(e) => setNewRound({ ...newRound, creamLotId: e.target.value })}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
            >
              <option value="">Select {newRound.creamSource === 'internal' ? 'milk lot' : 'cream lot'}</option>
              {newRound.creamSource === 'internal' ? (
                internalCreamPools.map(lot => (
                  <option key={lot.id} value={lot.id}>
                    {lot.lotCode} - {lot.creamPool?.availableBalance} kg available (from {lot.creamPool?.roundsContributed.length || 0} rounds)
                  </option>
                ))
              ) : (
                externalCreamLots.map(cream => (
                  <option key={cream.id} value={cream.id}>
                    {cream.lotCode} - {cream.quantity} kg ({cream.supplier})
                  </option>
                ))
              )}
            </select>
          </div>
          
          {/* Show cream pool details when a milk lot is selected */}
          {newRound.creamSource === 'internal' && newRound.creamLotId && (() => {
            const selectedLot = milkLots.find(l => l.id === newRound.creamLotId);
            if (!selectedLot?.creamPool) return null;
            
            return (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs font-medium text-blue-900 mb-2">Cream Pool Details for {selectedLot.lotCode}:</p>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <span className="text-blue-700">Total Cream:</span>
                    <p className="font-bold text-blue-900">{selectedLot.creamPool.totalCream.toFixed(2)} kg</p>
                  </div>
                  <div>
                    <span className="text-blue-700">Used in Butter:</span>
                    <p className="font-bold text-blue-900">{selectedLot.creamPool.usedInButter.toFixed(2)} kg</p>
                  </div>
                  <div>
                    <span className="text-blue-700">Available:</span>
                    <p className="font-bold text-emerald-600">{selectedLot.creamPool.availableBalance.toFixed(2)} kg</p>
                  </div>
                </div>
                <p className="text-xs text-blue-600 mt-2">
                  Contributed by {selectedLot.creamPool.roundsContributed.length} C/S round(s)
                </p>
              </div>
            );
          })()}
          
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Input Quantity (kg)</label>
            <input
              type="number"
              value={newRound.inputQuantity}
              onChange={(e) => setNewRound({ ...newRound, inputQuantity: parseFloat(e.target.value) })}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              step="0.1"
              min="0"
            />
          </div>
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

      {/* Output Modal */}
      <Modal isOpen={showOutputModal} onClose={() => setShowOutputModal(false)} title="Record Butter Output">
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Butter Output (kg)</label>
            <input
              type="number"
              value={outputForm.butterOutput}
              onChange={(e) => setOutputForm({ ...outputForm, butterOutput: parseFloat(e.target.value) })}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              step="0.1"
              min="0"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Buttermilk Output (kg, optional)</label>
            <input
              type="number"
              value={outputForm.buttermilkOutput}
              onChange={(e) => setOutputForm({ ...outputForm, buttermilkOutput: parseFloat(e.target.value) })}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              step="0.1"
              min="0"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <button
              onClick={handleRecordOutput}
              className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              Record Output
            </button>
            <button
              onClick={() => setShowOutputModal(false)}
              className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {/* Blending Modal */}
      <Modal isOpen={showBlendingModal} onClose={() => setShowBlendingModal(false)} title="Blending">
        <div className="space-y-4">
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
            <p className="text-xs text-purple-800">
              <strong>Ratio:</strong> 3.3:1 (Butter : Replacer)
            </p>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Butter Quantity (kg)</label>
            <input
              type="number"
              value={blendingForm.butterQuantity}
              onChange={(e) => setBlendingForm({ ...blendingForm, butterQuantity: parseFloat(e.target.value) })}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              step="0.1"
              min="0"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">
              Replacer Quantity (kg) - Auto-calculated
            </label>
            <input
              type="number"
              value={(blendingForm.butterQuantity / 3.3).toFixed(2)}
              readOnly
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Salt?</label>
            <div className="mt-1 flex gap-2">
              <button
                onClick={() => setBlendingForm({ ...blendingForm, isSalted: false })}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium ${
                  !blendingForm.isSalted ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700'
                }`}
              >
                Unsalted (PUBBB)
              </button>
              <button
                onClick={() => setBlendingForm({ ...blendingForm, isSalted: true })}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium ${
                  blendingForm.isSalted ? 'bg-pink-600 text-white' : 'bg-slate-100 text-slate-700'
                }`}
              >
                Salted (PSBBB)
              </button>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button
              onClick={handleBlending}
              className="flex-1 px-4 py-2.5 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700"
            >
              Start Blending
            </button>
            <button
              onClick={() => setShowBlendingModal(false)}
              className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {/* Packing Modal */}
      <Modal isOpen={showPackingModal} onClose={() => setShowPackingModal(false)} title={`Pack ${packingForm.sku}`}>
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-xs text-blue-800">
              {packingForm.sku === 'BB05' ? (
                <>
                  <strong>BB05:</strong> 500g bricks, 30 bricks/case = 15 kg/case
                </>
              ) : (
                <>
                  <strong>{packingForm.sku}:</strong> 500g balls, 12 balls/packet, 3 packets/case = 18 kg/case
                </>
              )}
            </p>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">
              Number of {packingForm.unit}
            </label>
            <input
              type="number"
              value={packingForm.quantity}
              onChange={(e) => setPackingForm({ ...packingForm, quantity: parseInt(e.target.value) })}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              min="0"
            />
          </div>
          {packingForm.quantity > 0 && (
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-xs text-slate-600">
                <strong>Packing Preview:</strong>
              </p>
              {packingForm.sku === 'BB05' ? (
                <p className="text-sm font-medium text-slate-900 mt-1">
                  {packingForm.quantity} bricks = {Math.floor(packingForm.quantity / 30)} cases + {packingForm.quantity % 30} loose bricks
                </p>
              ) : (
                <p className="text-sm font-medium text-slate-900 mt-1">
                  {packingForm.quantity} balls = {Math.floor(packingForm.quantity / 36)} cases + {Math.floor((packingForm.quantity % 36) / 12)} packets + {packingForm.quantity % 12} loose balls
                </p>
              )}
              <p className="text-xs text-slate-500 mt-1">
                Total weight: {(packingForm.quantity * 0.5).toFixed(1)} kg
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
    </div>
  );
}
