import { useState, useEffect } from 'react';
import { useApp } from '../store/AppContext';
import { useToast } from '../components/Toast';
import { Modal } from '../components/Modal';
import { Plus, Clock, Package, Scissors, CheckCircle2, Thermometer, Beaker } from 'lucide-react';

// Halloumi-specific status flow
const halloumiStatusFlow = [
  'scheduled',
  'cacl2_added',
  'heating_34c',
  'rennet_added',
  'curd_setting',
  'curd_cut',
  'heating_42c',
  'presses',
  'whey_heating',
  'boiling',
  'salted',
  'chiller_storage',
  'weighed',
  'vacuum_packed',
  'sent_to_hcp',
  'handed_over',
] as const;

type HalloumiStatus = typeof halloumiStatusFlow[number];

const halloumiStatusLabels: Record<string, string> = {
  scheduled: 'Scheduled',
  cacl2_added: 'CaCl2 Added',
  heating_34c: 'Heating to 34°C',
  rennet_added: 'Rennet Added',
  curd_setting: 'Curd Setting',
  curd_cut: 'Curd Cut',
  heating_42c: 'Heating to 42°C',
  presses: 'Presses',
  whey_heating: 'Whey Heating to 90°C',
  boiling: 'Halloumi Boiling',
  salted: 'Salted',
  chiller_storage: 'Chiller Storage',
  weighed: 'Weighed',
  vacuum_packed: 'Vacuum Packed',
  sent_to_hcp: 'Sent to HCP',
  handed_over: 'Handed Over',
};

const halloumiStatusColors: Record<string, string> = {
  scheduled: 'bg-slate-400',
  cacl2_added: 'bg-blue-400',
  heating_34c: 'bg-blue-500',
  rennet_added: 'bg-indigo-400',
  curd_setting: 'bg-indigo-500',
  curd_cut: 'bg-purple-400',
  heating_42c: 'bg-purple-600',
  presses: 'bg-purple-700',
  whey_heating: 'bg-orange-500',
  boiling: 'bg-orange-600',
  salted: 'bg-teal-500',
  chiller_storage: 'bg-cyan-500',
  weighed: 'bg-emerald-400',
  vacuum_packed: 'bg-emerald-600',
  sent_to_hcp: 'bg-pink-500',
  handed_over: 'bg-emerald-700',
};

// Recipe details for each stage
const stageRecipes: Record<string, { title: string; details: string[] }> = {
  cacl2_added: {
    title: 'Add CaCl2 Solution',
    details: ['192g CaCl2 in 3.8L water', 'Add to milk and stir gently'],
  },
  heating_34c: {
    title: 'Heat to 34°C',
    details: ['Heat milk slowly to 34°C', 'Monitor temperature carefully'],
  },
  rennet_added: {
    title: 'Add Rennet',
    details: ['15ml rennet in 500ml water', 'Add to milk and stir gently'],
  },
  curd_setting: {
    title: 'Curd Setting',
    details: ['Let curd set for 30 minutes', 'Do not disturb during this time'],
  },
  curd_cut: {
    title: 'Curd Cutting',
    details: ['Cut curd into pieces', 'Ready for heating'],
  },
  heating_42c: {
    title: 'Heating to 42°C (40 min)',
    details: ['Heat slowly to 42°C over 40 minutes', 'Gently lift curd while heating', 'This separates whey from curd'],
  },
  presses: {
    title: 'Presses',
    details: ['Remove curd into presses', 'Press until firm'],
  },
  whey_heating: {
    title: 'Whey Heating to 90°C',
    details: ['Whey remains in vessel', 'Heat whey to 90°C'],
  },
  boiling: {
    title: 'Halloumi Boiling',
    details: ['Cut pressed halloumi to smaller pieces', 'Cook in hot whey until floating', 'Monitor until pieces float'],
  },
  salted: {
    title: 'Salted',
    details: ['Remove from whey', 'Cool and salt'],
  },
  chiller_storage: {
    title: 'Chiller Storage',
    details: ['Store in chiller', 'Hold for 4-6 hours'],
  },
  weighed: {
    title: 'Record Weight',
    details: ['Weigh final product', 'Record output weight'],
  },
};

export default function HalloumiTab({ selectedMilkLotId }: { selectedMilkLotId: string }) {
  const { productionRounds, productionShifts, milkLots, updateProductionRound, addProductionRound, addProductionShift } = useApp();
  const { showToast } = useToast();

  const [showNewShiftModal, setShowNewShiftModal] = useState(false);
  const [showNewRoundModal, setShowNewRoundModal] = useState(false);
  const [showWeightModal, setShowWeightModal] = useState(false);
  const [selectedRound, setSelectedRound] = useState<string | null>(null);
  const [weightInput, setWeightInput] = useState(0);

  // Timer state
  const [timers, setTimers] = useState<Record<string, number>>({});

  // Filter halloumi rounds only
  const halloumiRounds = productionRounds.filter(r => r.type === 'Halloumi' && r.milkLotId === selectedMilkLotId);
  // Show ALL active shifts, not just those with halloumi rounds
  const halloumiShifts = productionShifts.filter(s => s.status === 'active' && s.milkLotId === selectedMilkLotId);

  // Group by shift
  const groupedByShift = halloumiRounds.reduce((acc, round) => {
    if (!acc[round.shiftId]) acc[round.shiftId] = [];
    acc[round.shiftId].push(round);
    return acc;
  }, {} as Record<string, typeof halloumiRounds>);

  const activeMilkLot = milkLots.find(m => m.id === selectedMilkLotId);

  // Update timers every second
  useEffect(() => {
    const interval = setInterval(() => {
      setTimers(prev => {
        const updated = { ...prev };
        halloumiRounds.forEach(round => {
          if (round.status === 'curd_setting' && round.curdSettingStartedAt) {
            const elapsed = Math.floor((Date.now() - new Date(round.curdSettingStartedAt).getTime()) / 1000);
            updated[round.id] = Math.max(0, 1800 - elapsed); // 30 minutes
          } else if (round.status === 'heating_42c' && round.curdCuttingStartedAt) {
            const elapsed = Math.floor((Date.now() - new Date(round.curdCuttingStartedAt).getTime()) / 1000);
            updated[round.id] = Math.max(0, 2400 - elapsed); // 40 minutes
          }
        });
        return updated;
      });
    }, 1000);
    
    return () => clearInterval(interval);
  }, [halloumiRounds]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

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
    plannedInput: 240,
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
      actualInput: newRound.plannedInput,
      outputWeight: 0,
      startTime: new Date().toISOString(),
      locked: false,
    });
    showToast('success', `Halloumi round created: ${shift.milkLotCode}/S${shift.shiftNumber}/R${newRound.roundNumber}`);
    setShowNewRoundModal(false);
    setNewRound({ shiftId: '', roundNumber: 1, plannedInput: 240, team: '' });
  };

  const handleStatusChange = (roundId: string, newStatus: HalloumiStatus) => {
    const updates: any = { status: newStatus };
    
    if (newStatus === 'curd_setting') {
      updates.curdSettingStartedAt = new Date().toISOString();
    } else if (newStatus === 'heating_42c') {
      updates.curdCuttingStartedAt = new Date().toISOString();
    }

    updateProductionRound(roundId, updates);
    showToast('success', `Status: ${halloumiStatusLabels[newStatus]}`);
  };

  const handleRecordWeight = () => {
    if (!selectedRound || weightInput <= 0) {
      showToast('error', 'Please enter a valid weight');
      return;
    }

    updateProductionRound(selectedRound, {
      outputWeight: weightInput,
      status: 'weighed',
    });
    showToast('success', `Weight recorded: ${weightInput} kg`);
    setShowWeightModal(false);
    setWeightInput(0);
  };

  const getActionButtons = (round: any) => {
    const buttons = [];

    if (round.status === 'scheduled') {
      buttons.push(
        <button
          key="cacl2"
          onClick={() => handleStatusChange(round.id, 'cacl2_added')}
          className="px-3 py-1.5 bg-blue-500 text-white rounded text-xs font-medium hover:bg-blue-600"
        >
          <Beaker className="w-3 h-3 inline mr-1" />
          Add CaCl2
        </button>
      );
    } else if (round.status === 'cacl2_added') {
      buttons.push(
        <button
          key="heat"
          onClick={() => handleStatusChange(round.id, 'heating_34c')}
          className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700"
        >
          <Thermometer className="w-3 h-3 inline mr-1" />
          Heat to 34°C
        </button>
      );
    } else if (round.status === 'heating_34c') {
      buttons.push(
        <button
          key="rennet"
          onClick={() => handleStatusChange(round.id, 'rennet_added')}
          className="px-3 py-1.5 bg-indigo-500 text-white rounded text-xs font-medium hover:bg-indigo-600"
        >
          <Beaker className="w-3 h-3 inline mr-1" />
          Add Rennet
        </button>
      );
    } else if (round.status === 'rennet_added') {
      buttons.push(
        <button
          key="curd_set"
          onClick={() => handleStatusChange(round.id, 'curd_setting')}
          className="px-3 py-1.5 bg-indigo-600 text-white rounded text-xs font-medium hover:bg-indigo-700"
        >
          Start Curd Setting (30 min)
        </button>
      );
    } else if (round.status === 'curd_setting') {
      const timer = timers[round.id] || 0;
      buttons.push(
        <div key="curd_timer" className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-indigo-500" />
          <span className="text-xs font-mono font-bold text-indigo-700">{formatTime(timer)}</span>
          {timer === 0 && (
            <button
              onClick={() => handleStatusChange(round.id, 'curd_cut')}
              className="px-3 py-1.5 bg-purple-400 text-white rounded text-xs font-medium hover:bg-purple-500"
            >
              <Scissors className="w-3 h-3 inline mr-1" />
              Cut Curd
            </button>
          )}
        </div>
      );
    } else if (round.status === 'curd_cut') {
      buttons.push(
        <button
          key="start_heating"
          onClick={() => handleStatusChange(round.id, 'heating_42c')}
          className="px-3 py-1.5 bg-purple-500 text-white rounded text-xs font-medium hover:bg-purple-600"
        >
          <Thermometer className="w-3 h-3 inline mr-1" />
          Start Heating to 42°C (40 min)
        </button>
      );
    } else if (round.status === 'heating_42c') {
      const timer = timers[round.id] || 0;
      buttons.push(
        <div key="heating_timer" className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-purple-600" />
          <span className="text-xs font-mono font-bold text-purple-700">{formatTime(timer)}</span>
          {timer === 0 && (
            <button
              onClick={() => handleStatusChange(round.id, 'presses')}
              className="px-3 py-1.5 bg-purple-700 text-white rounded text-xs font-medium hover:bg-purple-800"
            >
              To Presses
            </button>
          )}
        </div>
      );
    } else if (round.status === 'presses') {
      buttons.push(
        <button
          key="whey"
          onClick={() => handleStatusChange(round.id, 'whey_heating')}
          className="px-3 py-1.5 bg-orange-500 text-white rounded text-xs font-medium hover:bg-orange-600"
        >
          <Thermometer className="w-3 h-3 inline mr-1" />
          Heat Whey to 90°C
        </button>
      );
    } else if (round.status === 'whey_heating') {
      buttons.push(
        <button
          key="boil"
          onClick={() => handleStatusChange(round.id, 'boiling')}
          className="px-3 py-1.5 bg-orange-600 text-white rounded text-xs font-medium hover:bg-orange-700"
        >
          Start Boiling
        </button>
      );
    } else if (round.status === 'boiling') {
      buttons.push(
        <button
          key="salt"
          onClick={() => handleStatusChange(round.id, 'salted')}
          className="px-3 py-1.5 bg-teal-500 text-white rounded text-xs font-medium hover:bg-teal-600"
        >
          Salt
        </button>
      );
    } else if (round.status === 'salted') {
      buttons.push(
        <button
          key="chiller"
          onClick={() => handleStatusChange(round.id, 'chiller_storage')}
          className="px-3 py-1.5 bg-cyan-500 text-white rounded text-xs font-medium hover:bg-cyan-600"
        >
          Store in Chiller
        </button>
      );
    } else if (round.status === 'chiller_storage') {
      buttons.push(
        <button
          key="weigh"
          onClick={() => {
            setSelectedRound(round.id);
            setShowWeightModal(true);
          }}
          className="px-3 py-1.5 bg-emerald-400 text-white rounded text-xs font-medium hover:bg-emerald-500"
        >
          Record Weight
        </button>
      );
    } else if (round.status === 'weighed') {
      buttons.push(
        <div key="final" className="flex gap-2">
          <button
            onClick={() => handleStatusChange(round.id, 'vacuum_packed')}
            className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white rounded text-xs font-medium hover:bg-emerald-700"
          >
            <Package className="w-3 h-3" /> Vacuum Pack
          </button>
          <button
            onClick={() => handleStatusChange(round.id, 'sent_to_hcp')}
            className="flex items-center gap-1 px-3 py-1.5 bg-pink-500 text-white rounded text-xs font-medium hover:bg-pink-600"
          >
            <Scissors className="w-3 h-3" /> Send to HCP
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

    return buttons;
  };

  const getStageRecipe = (status: string) => {
    return stageRecipes[status];
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-900">Halloumi Production</h3>
          <p className="text-sm text-slate-500">
            Milk Lot: <span className="font-medium text-slate-700">{activeMilkLot?.lotCode}</span> • Input: 240L
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
                      <th className="px-4 py-2 text-left font-medium text-slate-500 text-xs uppercase tracking-wide">Recipe / Instructions</th>
                      <th className="px-4 py-2 text-left font-medium text-slate-500 text-xs uppercase tracking-wide w-20">Output</th>
                      <th className="px-4 py-2 text-left font-medium text-slate-500 text-xs uppercase tracking-wide">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {rounds.map((round) => {
                      const recipe = getStageRecipe(round.status);
                      return (
                        <tr key={round.id} className="hover:bg-slate-50/50">
                          <td className="px-4 py-3">
                            <div className="font-mono text-xs font-bold text-slate-900">
                              {round.milkLotCode}/S{round.shiftNumber}/R{round.roundNumber}
                            </div>
                            <div className="text-xs text-slate-500">{round.plannedInput}L input</div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-white ${halloumiStatusColors[round.status]}`}>
                              {halloumiStatusLabels[round.status]}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {recipe ? (
                              <div className="bg-blue-50 border border-blue-200 rounded p-2">
                                <p className="text-xs font-medium text-blue-900">{recipe.title}</p>
                                <ul className="text-xs text-blue-700 mt-1 space-y-0.5">
                                  {recipe.details.map((detail, i) => (
                                    <li key={i}>• {detail}</li>
                                  ))}
                                </ul>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-600 text-xs">
                            {round.outputWeight > 0 ? `${round.outputWeight} kg` : '—'}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1 flex-wrap">
                              {getActionButtons(round)}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
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
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-xs text-blue-800">
              <strong>Note:</strong> Halloumi rounds default to 240L milk. Adjust the input quantity when needed.
            </p>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Shift</label>
            <select
              value={newRound.shiftId}
              onChange={(e) => {
                const shiftId = e.target.value;
                const existingRounds = halloumiRounds.filter(r => r.shiftId === shiftId).length;
                setNewRound({ ...newRound, shiftId, roundNumber: existingRounds + 1 });
              }}
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
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Input Quantity (L)</label>
            <input type="number" value={newRound.plannedInput} onChange={(e) => setNewRound({ ...newRound, plannedInput: parseInt(e.target.value) || 0 })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" min="0" />
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
          {newRound.shiftId && (
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-xs text-slate-500">Batch ID will be:</p>
              <p className="font-mono text-sm font-bold text-slate-900 mt-1">
                {productionShifts.find(s => s.id === newRound.shiftId)?.milkLotCode}/S{productionShifts.find(s => s.id === newRound.shiftId)?.shiftNumber}/R{newRound.roundNumber}/Halloumi
              </p>
              <p className="text-xs text-slate-500 mt-1">Input: {newRound.plannedInput}L milk</p>
            </div>
          )}
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

      {/* Weight Recording Modal */}
      <Modal isOpen={showWeightModal} onClose={() => setShowWeightModal(false)} title="Record Final Weight">
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Final Product Weight (kg)</label>
            <input
              type="number"
              value={weightInput}
              onChange={(e) => setWeightInput(parseFloat(e.target.value) || 0)}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              step="0.1"
              min="0"
              placeholder="e.g., 26.5"
            />
          </div>
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
            <p className="text-xs text-emerald-800">
              <strong>Expected yield:</strong> 24-28 kg from 240L milk
            </p>
          </div>
          <div className="flex gap-2 pt-2">
            <button
              onClick={handleRecordWeight}
              className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700"
            >
              Record Weight
            </button>
            <button
              onClick={() => setShowWeightModal(false)}
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
