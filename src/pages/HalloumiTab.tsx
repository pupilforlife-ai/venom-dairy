import { useState } from 'react';
import { useApp } from '../store/AppContext';
import { useToast } from '../components/Toast';
import { Modal } from '../components/Modal';
import { Plus, Filter, AlertTriangle, Clock, Scissors, Package, CheckCircle2 } from 'lucide-react';
import { milkLots, statusLabels, statusColors } from '../data/mockData';

// Halloumi-specific status flow
const halloumiStatusFlow = [
  'scheduled',
  'in_production',
  'coagulation',
  'pressing',
  'cooling',
  'resting',
  'ready_cutting',
  'cut',
  'vacuum_packed',
  'sent_to_hcp',
  'handed_over',
] as const;

export default function HalloumiTab() {
  const { productionRounds, productionShifts, updateProductionRound, addProductionRound, addProductionShift } = useApp();
  const { showToast } = useToast();

  const [showNewShiftModal, setShowNewShiftModal] = useState(false);
  const [showNewRoundModal, setShowNewRoundModal] = useState(false);
  const [showRecipeModal, setShowRecipeModal] = useState(false);
  const [selectedRound, setSelectedRound] = useState<string | null>(null);

  // Filter halloumi rounds only
  const halloumiRounds = productionRounds.filter(r => r.type === 'Halloumi');
  const halloumiShifts = productionShifts.filter(s => 
    halloumiRounds.some(r => r.shiftId === s.id)
  );

  // Group by shift
  const groupedByShift = halloumiRounds.reduce((acc, round) => {
    if (!acc[round.shiftId]) acc[round.shiftId] = [];
    acc[round.shiftId].push(round);
    return acc;
  }, {} as Record<string, typeof halloumiRounds>);

  const activeMilkLot = milkLots.find(m => m.status === 'active');

  // New shift form
  const [newShift, setNewShift] = useState({
    milkLotId: activeMilkLot?.id || '',
    shiftNumber: 1,
    team: '',
    startedAt: new Date().toISOString().slice(0, 16),
  });

  // New round form
  const [newRound, setNewRound] = useState({
    shiftId: '',
    roundNumber: 1,
    plannedInput: 240, // Default 240L for halloumi
    team: '',
  });

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
    showToast('success', `Halloumi Shift ${newShift.shiftNumber} created`);
    setShowNewShiftModal(false);
    setNewShift({ milkLotId: activeMilkLot?.id || '', shiftNumber: 1, team: '', startedAt: new Date().toISOString().slice(0, 16) });
  };

  const handleCreateRound = () => {
    if (!newRound.shiftId) {
      showToast('error', 'Please select a shift');
      return;
    }
    const shift = productionShifts.find(s => s.id === newRound.shiftId);
    if (!shift) return;

    addProductionRound({
      milkLotId: shift.milkLotId,
      milkLotCode: shift.milkLotCode,
      shiftId: shift.id,
      shiftNumber: shift.shiftNumber,
      roundNumber: newRound.roundNumber,
      type: 'Halloumi',
      status: 'scheduled',
      team: newRound.team ? newRound.team.split(',').map(t => t.trim()).filter(Boolean) : shift.team,
      plannedInput: newRound.plannedInput,
      actualInput: 0,
      outputWeight: 0,
      startTime: new Date().toISOString(),
      locked: false,
    });
    showToast('success', `Halloumi round created: ${shift.milkLotCode}/S${shift.shiftNumber}/R${newRound.roundNumber}`);
    setShowNewRoundModal(false);
    setNewRound({ shiftId: '', roundNumber: 1, plannedInput: 240, team: '' });
  };

  const handleStatusChange = (roundId: string, newStatus: string) => {
    const updates: any = { status: newStatus };
    
    if (newStatus === 'pressing') {
      updates.pressingStartedAt = new Date().toISOString();
    } else if (newStatus === 'cooling') {
      updates.coolingStartedAt = new Date().toISOString();
    } else if (newStatus === 'resting') {
      updates.restingStartedAt = new Date().toISOString();
    }

    updateProductionRound(roundId, updates);
    showToast('success', `Status updated to ${statusLabels[newStatus]}`);
  };

  const handleDiscard = (roundId: string) => {
    const reason = prompt('Enter discard reason:');
    if (!reason) return;

    const responsible = prompt('Who is responsible?');
    if (!responsible) return;

    updateProductionRound(roundId, {
      status: 'handed_over',
      locked: true,
      notes: `DISCARDED: ${reason} (Responsible: ${responsible})`,
      completedAt: new Date().toISOString(),
    });
    showToast('success', 'Round discarded and locked');
  };

  const getActionButtons = (round: any) => {
    const buttons = [];

    if (round.status === 'scheduled') {
      buttons.push(
        <button
          key="start"
          onClick={() => handleStatusChange(round.id, 'in_production')}
          className="px-3 py-1.5 bg-blue-500 text-white rounded text-xs font-medium hover:bg-blue-600"
        >
          Start Production
        </button>
      );
    } else if (round.status === 'in_production') {
      buttons.push(
        <button
          key="coagulation"
          onClick={() => handleStatusChange(round.id, 'coagulation')}
          className="px-3 py-1.5 bg-violet-500 text-white rounded text-xs font-medium hover:bg-violet-600"
        >
          Start Coagulation
        </button>
      );
    } else if (round.status === 'coagulation') {
      buttons.push(
        <button
          key="pressing"
          onClick={() => handleStatusChange(round.id, 'pressing')}
          className="px-3 py-1.5 bg-purple-500 text-white rounded text-xs font-medium hover:bg-purple-600"
        >
          Start Pressing (30 min)
        </button>
      );
    } else if (round.status === 'pressing') {
      buttons.push(
        <div key="pressing-timer" className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-purple-500" />
          <span className="text-xs font-mono text-purple-700">30:00</span>
          <button
            onClick={() => handleStatusChange(round.id, 'cooling')}
            className="px-3 py-1.5 bg-cyan-500 text-white rounded text-xs font-medium hover:bg-cyan-600"
          >
            Start Cooling
          </button>
        </div>
      );
    } else if (round.status === 'cooling') {
      buttons.push(
        <div key="cooling-timer" className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-cyan-500" />
          <span className="text-xs font-mono text-cyan-700">90:00</span>
          <button
            onClick={() => handleStatusChange(round.id, 'resting')}
            className="px-3 py-1.5 bg-teal-500 text-white rounded text-xs font-medium hover:bg-teal-600"
          >
            Start Resting (90 min)
          </button>
        </div>
      );
    } else if (round.status === 'resting') {
      buttons.push(
        <div key="resting-timer" className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-teal-500" />
          <span className="text-xs font-mono text-teal-700">90:00</span>
          <button
            onClick={() => handleStatusChange(round.id, 'ready_cutting')}
            className="px-3 py-1.5 bg-amber-500 text-white rounded text-xs font-medium hover:bg-amber-600"
          >
            Ready to Cut
          </button>
        </div>
      );
    } else if (round.status === 'ready_cutting') {
      buttons.push(
        <button
          key="cut"
          onClick={() => handleStatusChange(round.id, 'cut')}
          className="flex items-center gap-1 px-3 py-1.5 bg-orange-500 text-white rounded text-xs font-medium hover:bg-orange-600"
        >
          <Scissors className="w-3 h-3" /> Cut
        </button>
      );
    } else if (round.status === 'cut') {
      buttons.push(
        <div key="cut-actions" className="flex gap-2">
          <button
            onClick={() => handleStatusChange(round.id, 'vacuum_packed')}
            className="flex items-center gap-1 px-3 py-1.5 bg-emerald-500 text-white rounded text-xs font-medium hover:bg-emerald-600"
          >
            <Package className="w-3 h-3" /> Vacuum Pack
          </button>
          <button
            onClick={() => handleStatusChange(round.id, 'sent_to_hcp')}
            className="flex items-center gap-1 px-3 py-1.5 bg-pink-500 text-white rounded text-xs font-medium hover:bg-pink-600"
          >
            Send to HCP
          </button>
        </div>
      );
    } else if (round.status === 'vacuum_packed' || round.status === 'sent_to_hcp') {
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

    // Discard button (for owner/supervisor - we'll add role check later)
    if (round.status !== 'handed_over') {
      buttons.push(
        <button
          key="discard"
          onClick={() => handleDiscard(round.id)}
          className="px-3 py-1.5 bg-red-500 text-white rounded text-xs font-medium hover:bg-red-600"
        >
          Discard
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
          <h3 className="text-lg font-bold text-slate-900">Halloumi Production</h3>
          <p className="text-sm text-slate-500">
            Milk Lot: <span className="font-medium text-slate-700">{activeMilkLot?.lotCode}</span> • Default input: 240L
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowRecipeModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-purple-600 text-white hover:bg-purple-700"
          >
            View Recipe
          </button>
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
                      <th className="px-4 py-2 text-left font-medium text-slate-500 text-xs uppercase tracking-wide w-20">Input</th>
                      <th className="px-4 py-2 text-left font-medium text-slate-500 text-xs uppercase tracking-wide w-20">Output</th>
                      <th className="px-4 py-2 text-left font-medium text-slate-500 text-xs uppercase tracking-wide">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {rounds.map((round) => (
                      <tr key={round.id} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3">
                          <div className="font-mono text-xs font-bold text-slate-900">
                            {round.milkLotCode}/S{round.shiftNumber}/R{round.roundNumber}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-white ${statusColors[round.status]}`}>
                            {statusLabels[round.status]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600 text-xs">{round.actualInput > 0 ? `${round.actualInput}L` : '—'}</td>
                        <td className="px-4 py-3 text-slate-600 text-xs">{round.outputWeight > 0 ? `${round.outputWeight} kg` : '—'}</td>
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

        {halloumiRounds.length === 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
            <p className="text-slate-500">No halloumi rounds yet. Create a shift and round to begin.</p>
          </div>
        )}
      </div>

      {/* New Shift Modal */}
      <Modal isOpen={showNewShiftModal} onClose={() => setShowNewShiftModal(false)} title="Create New Halloumi Shift">
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Milk Lot</label>
            <select
              value={newShift.milkLotId}
              onChange={(e) => setNewShift({ ...newShift, milkLotId: e.target.value })}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
            >
              <option value="">Select milk lot</option>
              {milkLots.map(lot => (
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
      <Modal isOpen={showNewRoundModal} onClose={() => setShowNewRoundModal(false)} title="Create New Halloumi Round">
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Shift</label>
            <select
              value={newRound.shiftId}
              onChange={(e) => setNewRound({ ...newRound, shiftId: e.target.value })}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
            >
              <option value="">Select shift</option>
              {halloumiShifts.filter(s => s.status === 'active').map(s => (
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
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Planned Input (L) - Default 240L</label>
            <input
              type="number"
              value={newRound.plannedInput}
              onChange={(e) => setNewRound({ ...newRound, plannedInput: parseInt(e.target.value) })}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
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

      {/* Recipe Modal */}
      <Modal isOpen={showRecipeModal} onClose={() => setShowRecipeModal(false)} title="Halloumi Recipe" size="lg">
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm font-medium text-blue-900 mb-2">Standard Halloumi Recipe (240L milk)</p>
            <div className="space-y-2 text-sm text-blue-800">
              <div className="flex justify-between">
                <span>Raw milk:</span>
                <span className="font-medium">240 L</span>
              </div>
              <div className="flex justify-between">
                <span>CaCl2 solution:</span>
                <span className="font-medium">240 mL</span>
              </div>
              <div className="flex justify-between">
                <span>Rennet:</span>
                <span className="font-medium">60 mL</span>
              </div>
              <div className="flex justify-between">
                <span>Salt:</span>
                <span className="font-medium">2.4 kg</span>
              </div>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <p className="text-sm font-medium text-amber-900 mb-2">Process Steps</p>
            <ol className="space-y-2 text-sm text-amber-800 list-decimal list-inside">
              <li>Heat milk to 34°C</li>
              <li>Add CaCl2 solution, stir gently</li>
              <li>Add rennet, stir gently</li>
              <li>Let coagulate for 30-45 minutes</li>
              <li>Cut curd into 2cm cubes</li>
              <li>Heat to 40°C over 30 minutes, stirring gently</li>
              <li>Let curd settle, drain whey</li>
              <li>Press curd for 2-3 hours</li>
              <li>Cut into blocks</li>
              <li>Cook blocks in hot whey (90°C) for 30 minutes</li>
              <li>Cool in cold water</li>
              <li>Salt in brine for 2-4 hours</li>
            </ol>
          </div>

          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
            <p className="text-sm font-medium text-emerald-900 mb-2">Expected Yield</p>
            <div className="text-sm text-emerald-800">
              <p>Approximately <span className="font-bold">24-28 kg</span> of halloumi from 240L milk</p>
              <p className="text-xs mt-1">Yield varies based on milk composition and process control</p>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
