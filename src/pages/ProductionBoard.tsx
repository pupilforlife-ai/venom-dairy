import { useState } from 'react';
import {
  Filter,
  Plus,
  ChevronDown,
  CheckCircle2,
  Circle,
  Lock,
  ArrowRight,
  Edit3,
  Users,
  Clock,
  Play,
  Square,
} from 'lucide-react';
import { useApp } from '../store/AppContext';
import { useToast } from '../components/Toast';
import { Modal } from '../components/Modal';
import { milkLots, statusFlow, statusLabels, statusColors } from '../data/mockData';

function StatusPipeline({ currentStatus }: { currentStatus: string }) {
  const currentIndex = statusFlow.indexOf(currentStatus as typeof statusFlow[number]);
  return (
    <div className="flex items-center gap-0.5" title={statusLabels[currentStatus]}>
      {statusFlow.map((step, i) => (
        <div key={step} className="flex items-center">
          <div className={`w-2 h-2 rounded-full ${i <= currentIndex ? statusColors[step] : 'bg-slate-200'}`} title={statusLabels[step]} />
          {i < statusFlow.length - 1 && <div className={`w-1.5 h-0.5 ${i < currentIndex ? statusColors[step] : 'bg-slate-200'}`} />}
        </div>
      ))}
    </div>
  );
}

export default function ProductionBoard() {
  const { 
    productionRounds, productionShifts,
    advanceRoundStatus, updateProductionRound, addProductionRound,
    addProductionShift, updateProductionShift
  } = useApp();
  const { showToast } = useToast();
  
  const [filters, setFilters] = useState({ milkLot: 'all', status: 'all', type: 'all', shift: 'all' });
  const [showFilters, setShowFilters] = useState(false);
  const [selectedRound, setSelectedRound] = useState<string | null>(null);
  const [showNewRoundModal, setShowNewRoundModal] = useState(false);
  const [showNewShiftModal, setShowNewShiftModal] = useState(false);
  const [editingOutput, setEditingOutput] = useState(false);
  const [outputValue, setOutputValue] = useState('');
  const [notesValue, setNotesValue] = useState('');

  // Filter rounds
  const filteredRounds = productionRounds.filter((round) => {
    if (filters.milkLot !== 'all' && round.milkLotId !== filters.milkLot) return false;
    if (filters.status !== 'all' && round.status !== filters.status) return false;
    if (filters.type !== 'all' && round.type !== filters.type) return false;
    if (filters.shift !== 'all' && round.shiftId !== filters.shift) return false;
    return true;
  });

  // Group rounds by shift
  const groupedByShift = filteredRounds.reduce((acc, round) => {
    if (!acc[round.shiftId]) acc[round.shiftId] = [];
    acc[round.shiftId].push(round);
    return acc;
  }, {} as Record<string, typeof productionRounds>);

  // Get active shifts (sorted by shift number)
  const activeShifts = productionShifts
    .filter(s => groupedByShift[s.id] || s.status !== 'completed')
    .sort((a, b) => a.shiftNumber - b.shiftNumber);

  const activeMilkLot = milkLots.find((m) => m.status === 'active');
  const selectedRoundData = productionRounds.find(r => r.id === selectedRound);

  // ---- Actions ----
  const handleAdvanceStatus = (id: string) => {
    const round = productionRounds.find(r => r.id === id);
    if (!round) return;
    const currentIndex = statusFlow.indexOf(round.status as any);
    if (currentIndex >= statusFlow.length - 1) {
      showToast('error', 'Round is already at final status');
      return;
    }
    advanceRoundStatus(id);
    const nextStatus = statusFlow[currentIndex + 1];
    showToast('success', `Status changed to "${statusLabels[nextStatus]}"`);
  };

  const handleRecordOutput = () => {
    if (!selectedRound || !outputValue) return;
    const weight = parseFloat(outputValue);
    if (isNaN(weight) || weight < 0) {
      showToast('error', 'Please enter a valid weight');
      return;
    }
    updateProductionRound(selectedRound, { outputWeight: weight, notes: notesValue });
    showToast('success', `Output recorded: ${weight} kg`);
    setEditingOutput(false);
    setOutputValue('');
    setNotesValue('');
  };

  // ---- New Shift Form ----
  const [newShift, setNewShift] = useState({
    milkLotId: activeMilkLot?.id || '',
    shiftNumber: 1,
    team: '',
    startedAt: new Date().toISOString().slice(0, 16),
    teamNotes: '',
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
      teamNotes: newShift.teamNotes || undefined,
      status: 'active',
    });
    showToast('success', `Shift ${newShift.shiftNumber} created for lot ${milkLot.lotCode}`);
    setShowNewShiftModal(false);
    setNewShift({ milkLotId: activeMilkLot?.id || '', shiftNumber: 1, team: '', startedAt: new Date().toISOString().slice(0, 16), teamNotes: '' });
  };

  const handleEndShift = (shiftId: string) => {
    updateProductionShift(shiftId, { status: 'completed', endedAt: new Date().toISOString() });
    showToast('success', 'Shift ended');
  };

  // ---- New Round Form ----
  const [newRound, setNewRound] = useState({
    shiftId: '',
    roundNumber: 1,
    type: 'D' as const,
    plannedInput: 500,
    team: '',
  });

  // Get the latest active shift (most recently started)
  const getLatestActiveShift = () => {
    const activeShifts = productionShifts
      .filter(s => s.status === 'active')
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
    return activeShifts[0] || null;
  };

  // Open new round modal with latest shift pre-selected
  const openNewRoundModal = () => {
    const latestShift = getLatestActiveShift();
    if (!latestShift) {
      showToast('error', 'No active shift found. Please create a shift first.');
      setShowNewShiftModal(true);
      return;
    }
    const existingRoundsInShift = productionRounds.filter(r => r.shiftId === latestShift.id).length;
    setNewRound({
      shiftId: latestShift.id,
      roundNumber: existingRoundsInShift + 1,
      type: 'D',
      plannedInput: 500,
      team: '',
    });
    setShowNewRoundModal(true);
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
      type: newRound.type,
      status: 'scheduled',
      team: newRound.team ? newRound.team.split(',').map(t => t.trim()).filter(Boolean) : shift.team,
      plannedInput: newRound.plannedInput,
      actualInput: 0,
      outputWeight: 0,
      startTime: new Date().toISOString(),
      locked: false,
    });
    showToast('success', `New round created: ${shift.milkLotCode}/S${shift.shiftNumber}/R${newRound.roundNumber}/${newRound.type}`);
    setShowNewRoundModal(false);
    setNewRound({ shiftId: '', roundNumber: 1, type: 'D', plannedInput: 500, team: '' });
  };

  // When shift changes in new round form, auto-set round number
  const handleShiftChange = (shiftId: string) => {
    const existingRoundsInShift = productionRounds.filter(r => r.shiftId === shiftId).length;
    setNewRound({ ...newRound, shiftId, roundNumber: existingRoundsInShift + 1 });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-slate-900">Digital Production Board</h2>
            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-medium rounded-full">LIVE</span>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            Click any round to update • Milk Lot: <span className="font-medium text-slate-700">{activeMilkLot?.lotCode}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowFilters(!showFilters)} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${showFilters ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'}`}>
            <Filter className="w-4 h-4" /> Filters
          </button>
          <button onClick={() => setShowNewShiftModal(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors">
            <Plus className="w-4 h-4" /> New Shift
          </button>
          <button onClick={openNewRoundModal} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors">
            <Plus className="w-4 h-4" /> New Round
          </button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Milk Lot</label>
            <select value={filters.milkLot} onChange={(e) => setFilters({ ...filters, milkLot: e.target.value })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white">
              <option value="all">All Lots</option>
              {milkLots.map((lot) => <option key={lot.id} value={lot.id}>{lot.lotCode}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Status</label>
            <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white">
              <option value="all">All Statuses</option>
              {statusFlow.map((s) => <option key={s} value={s}>{statusLabels[s]}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Type</label>
            <select value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white">
              <option value="all">All Types</option>
              <option value="D">D (Malai)</option>
              <option value="C/S">C/S (Rozana)</option>
              <option value="Halloumi">Halloumi</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Shift</label>
            <select value={filters.shift} onChange={(e) => setFilters({ ...filters, shift: e.target.value })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white">
              <option value="all">All Shifts</option>
              {productionShifts.map(s => <option key={s.id} value={s.id}>Shift {s.shiftNumber} ({s.milkLotCode})</option>)}
            </select>
          </div>
        </div>
      )}

      {/* Status legend */}
      <div className="bg-white rounded-xl border border-slate-200 p-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span className="font-medium text-slate-500 mr-2">Status Flow:</span>
          {statusFlow.map((step) => (
            <span key={step} className="flex items-center gap-1">
              <span className={`w-2 h-2 rounded-full ${statusColors[step]}`} />
              <span className="text-slate-600">{statusLabels[step]}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Production board grouped by shift */}
      <div className="space-y-4">
        {activeShifts.map((shift) => {
          const rounds = groupedByShift[shift.id] || [];
          if (rounds.length === 0 && filters.shift === 'all' && filters.status === 'all') return null;
          
          return (
            <div key={shift.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              {/* Shift header */}
              <div className={`px-4 py-3 border-b flex items-center justify-between ${
                shift.status === 'active' ? 'bg-indigo-50 border-indigo-200' :
                shift.status === 'completed' ? 'bg-slate-50 border-slate-200' :
                'bg-amber-50 border-amber-200'
              }`}>
                <div className="flex items-center gap-3">
                  <span className={`w-8 h-8 rounded-full text-white text-sm font-bold flex items-center justify-center ${
                    shift.status === 'active' ? 'bg-indigo-600' :
                    shift.status === 'completed' ? 'bg-slate-500' :
                    'bg-amber-500'
                  }`}>
                    {shift.shiftNumber}
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900">Shift {shift.shiftNumber}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase ${
                        shift.status === 'active' ? 'bg-indigo-100 text-indigo-700' :
                        shift.status === 'completed' ? 'bg-slate-200 text-slate-600' :
                        'bg-amber-100 text-amber-700'
                      }`}>
                        {shift.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" /> {shift.team.join(', ')}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" /> Started: {new Date(shift.startedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                      </span>
                      {shift.endedAt && (
                        <span className="flex items-center gap-1">
                          <Square className="w-3 h-3" /> Ended: {new Date(shift.endedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                        </span>
                      )}
                    </div>
                    {shift.teamNotes && (
                      <p className="text-xs text-slate-400 italic mt-0.5">Note: {shift.teamNotes}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">{rounds.length} round{rounds.length !== 1 ? 's' : ''}</span>
                  {shift.status === 'active' && (
                    <button
                      onClick={() => handleEndShift(shift.id)}
                      className="flex items-center gap-1 px-2 py-1 bg-slate-100 text-slate-700 rounded text-xs font-medium hover:bg-slate-200 transition-colors"
                    >
                      <Square className="w-3 h-3" /> End Shift
                    </button>
                  )}
                </div>
              </div>

              {/* Rounds table */}
              {rounds.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="px-4 py-2 text-left font-medium text-slate-500 text-xs uppercase tracking-wide w-40">Batch ID</th>
                        <th className="px-4 py-2 text-left font-medium text-slate-500 text-xs uppercase tracking-wide w-16">Type</th>
                        <th className="px-4 py-2 text-left font-medium text-slate-500 text-xs uppercase tracking-wide">Pipeline</th>
                        <th className="px-4 py-2 text-left font-medium text-slate-500 text-xs uppercase tracking-wide w-28">Status</th>
                        <th className="px-4 py-2 text-left font-medium text-slate-500 text-xs uppercase tracking-wide w-16">Input</th>
                        <th className="px-4 py-2 text-left font-medium text-slate-500 text-xs uppercase tracking-wide w-16">Output</th>
                        <th className="px-4 py-2 text-left font-medium text-slate-500 text-xs uppercase tracking-wide w-20">Balance</th>
                        <th className="px-4 py-2 text-left font-medium text-slate-500 text-xs uppercase tracking-wide w-28">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {rounds.map((round) => (
                        <tr key={round.id} className="hover:bg-slate-50/50 transition-colors cursor-pointer" onClick={() => setSelectedRound(round.id)}>
                          <td className="px-4 py-3">
                            <div className="font-mono text-xs font-bold text-slate-900">
                              {round.milkLotCode}/S{round.shiftNumber}/R{round.roundNumber}
                            </div>
                            {round.locked && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] text-slate-400">
                                <Lock className="w-2.5 h-2.5" /> Locked
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-xs font-bold">{round.type}</span>
                          </td>
                          <td className="px-4 py-3"><StatusPipeline currentStatus={round.status} /></td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                              round.status === 'handed_over' ? 'bg-emerald-100 text-emerald-700' :
                              round.status === 'in_production' ? 'bg-blue-100 text-blue-700' :
                              round.status === 'pressing' ? 'bg-purple-100 text-purple-700' :
                              round.status === 'frozen' ? 'bg-indigo-100 text-indigo-700' :
                              round.status === 'packed' ? 'bg-teal-100 text-teal-700' :
                              'bg-slate-100 text-slate-600'
                            }`}>
                              {round.status === 'handed_over' || round.status === 'packed' ? <CheckCircle2 className="w-3 h-3" /> : <Circle className="w-3 h-3" />}
                              {statusLabels[round.status]}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-600 text-xs">{round.actualInput > 0 ? `${round.actualInput}L` : '—'}</td>
                          <td className="px-4 py-3 text-slate-600 text-xs">{round.outputWeight > 0 ? `${round.outputWeight} kg` : '—'}</td>
                          <td className="px-4 py-3">
                            {round.intermediateBalance !== undefined && round.intermediateBalance > 0 ? (
                              <span className="text-amber-700 font-medium text-xs">{round.intermediateBalance} kg</span>
                            ) : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            {!round.locked && round.status !== 'handed_over' && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleAdvanceStatus(round.id); }}
                                className="flex items-center gap-1 px-2 py-1 bg-emerald-50 text-emerald-700 rounded text-xs font-medium hover:bg-emerald-100 transition-colors"
                              >
                                Advance <ArrowRight className="w-3 h-3" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-6 text-center text-slate-400 text-sm">
                  No rounds in this shift yet. <button onClick={() => {
                    const existingRoundsInShift = productionRounds.filter(r => r.shiftId === shift.id).length;
                    setNewRound({ shiftId: shift.id, roundNumber: existingRoundsInShift + 1, type: 'D', plannedInput: 500, team: '' });
                    setShowNewRoundModal(true);
                  }} className="text-emerald-600 hover:text-emerald-700 font-medium">Add a round →</button>
                </div>
              )}
            </div>
          );
        })}

        {activeShifts.length === 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
            <p className="text-slate-500 mb-3">No shifts found. Create your first shift to begin.</p>
            <button onClick={() => setShowNewShiftModal(true)} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors">
              Create First Shift
            </button>
          </div>
        )}
      </div>

      {/* Round Detail Modal */}
      <Modal isOpen={!!selectedRound} onClose={() => { setSelectedRound(null); setEditingOutput(false); }} title="Production Round Details" size="lg">
        {selectedRoundData && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">Batch ID</p>
                <p className="text-sm font-mono font-bold text-slate-900 mt-1">
                  {selectedRoundData.milkLotCode}/S{selectedRoundData.shiftNumber}/R{selectedRoundData.roundNumber}/{selectedRoundData.type}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">Status</p>
                <div className="mt-1">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                    selectedRoundData.status === 'handed_over' ? 'bg-emerald-100 text-emerald-700' :
                    selectedRoundData.status === 'in_production' ? 'bg-blue-100 text-blue-700' :
                    'bg-slate-100 text-slate-600'
                  }`}>
                    {statusLabels[selectedRoundData.status]}
                  </span>
                </div>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">Shift</p>
                <p className="text-sm text-slate-700 mt-1">Shift {selectedRoundData.shiftNumber}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">Team</p>
                <p className="text-sm text-slate-700 mt-1">{selectedRoundData.team.join(', ')}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">Planned Input</p>
                <p className="text-sm text-slate-700 mt-1">{selectedRoundData.plannedInput} L</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">Actual Input</p>
                <p className="text-sm text-slate-700 mt-1">{selectedRoundData.actualInput} L</p>
              </div>
            </div>

            <div className="border-t border-slate-200 pt-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-slate-500 uppercase tracking-wide">Output Weight</p>
                {!selectedRoundData.locked && !editingOutput && (
                  <button onClick={() => { setEditingOutput(true); setOutputValue(selectedRoundData.outputWeight.toString()); setNotesValue(selectedRoundData.notes || ''); }} className="text-xs text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1">
                    <Edit3 className="w-3 h-3" /> Edit
                  </button>
                )}
              </div>
              {editingOutput ? (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-slate-600">Weight (kg)</label>
                    <input type="number" value={outputValue} onChange={(e) => setOutputValue(e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" step="0.1" min="0" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-600">Notes</label>
                    <textarea value={notesValue} onChange={(e) => setNotesValue(e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" rows={2} placeholder="Optional notes..." />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleRecordOutput} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700">Save</button>
                    <button onClick={() => setEditingOutput(false)} className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200">Cancel</button>
                  </div>
                </div>
              ) : (
                <p className="text-lg font-bold text-slate-900">{selectedRoundData.outputWeight > 0 ? `${selectedRoundData.outputWeight} kg` : 'Not recorded'}</p>
              )}
              {selectedRoundData.notes && !editingOutput && (
                <p className="text-xs text-slate-500 mt-2 italic">"{selectedRoundData.notes}"</p>
              )}
            </div>

            {!selectedRoundData.locked && selectedRoundData.status !== 'handed_over' && (
              <div className="border-t border-slate-200 pt-4">
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Advance Status</p>
                <button onClick={() => handleAdvanceStatus(selectedRoundData.id)} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors">
                  Move to: {statusLabels[statusFlow[statusFlow.indexOf(selectedRoundData.status as any) + 1]]}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {selectedRoundData.locked && (
              <div className="border-t border-slate-200 pt-4">
                <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg">
                  <Lock className="w-4 h-4 text-slate-500" />
                  <p className="text-xs text-slate-600">This round is locked. Owner correction required for changes.</p>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* New Shift Modal */}
      <Modal isOpen={showNewShiftModal} onClose={() => setShowNewShiftModal(false)} title="Create New Shift">
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Milk Lot</label>
            <select value={newShift.milkLotId} onChange={(e) => setNewShift({ ...newShift, milkLotId: e.target.value })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white">
              {milkLots.map(lot => <option key={lot.id} value={lot.id}>{lot.lotCode} ({lot.status})</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Shift Number</label>
            <input type="number" value={newShift.shiftNumber} onChange={(e) => setNewShift({ ...newShift, shiftNumber: parseInt(e.target.value) })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" min="1" />
            <p className="text-xs text-slate-400 mt-1">Sunday night is Shift 1. Each subsequent shift increments.</p>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Start Time</label>
            <input type="datetime-local" value={newShift.startedAt} onChange={(e) => setNewShift({ ...newShift, startedAt: e.target.value })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Team Members (comma-separated)</label>
            <input type="text" value={newShift.team} onChange={(e) => setNewShift({ ...newShift, team: e.target.value })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" placeholder="e.g. Rajesh, Amit, Suresh" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Notes (optional)</label>
            <textarea value={newShift.teamNotes} onChange={(e) => setNewShift({ ...newShift, teamNotes: e.target.value })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" rows={2} placeholder="Any notes about this shift..." />
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={handleCreateShift} className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors">Create Shift</button>
            <button onClick={() => setShowNewShiftModal(false)} className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200 transition-colors">Cancel</button>
          </div>
        </div>
      </Modal>

      {/* New Round Modal */}
      <Modal isOpen={showNewRoundModal} onClose={() => setShowNewRoundModal(false)} title="Create New Production Round">
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">
              Shift 
              {newRound.shiftId && productionShifts.find(s => s.id === newRound.shiftId)?.status === 'active' && (
                <span className="ml-2 px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-medium rounded uppercase">Current</span>
              )}
            </label>
            <select value={newRound.shiftId} onChange={(e) => handleShiftChange(e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white">
              <option value="">Select a shift...</option>
              {productionShifts
                .filter(s => s.status !== 'completed')
                .sort((a, b) => {
                  // Active shifts first, then by start time descending
                  if (a.status === 'active' && b.status !== 'active') return -1;
                  if (a.status !== 'active' && b.status === 'active') return 1;
                  return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime();
                })
                .map(s => (
                  <option key={s.id} value={s.id}>
                    Shift {s.shiftNumber} — {s.milkLotCode} ({s.status})
                  </option>
                ))}
            </select>
            {productionShifts.filter(s => s.status === 'active').length === 0 && (
              <p className="text-xs text-amber-600 mt-1">No active shifts. <button onClick={() => { setShowNewRoundModal(false); setShowNewShiftModal(true); }} className="underline font-medium">Create a shift first →</button></p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Round #</label>
              <input type="number" value={newRound.roundNumber} onChange={(e) => setNewRound({ ...newRound, roundNumber: parseInt(e.target.value) })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" min="1" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Product Type</label>
              <select value={newRound.type} onChange={(e) => setNewRound({ ...newRound, type: e.target.value as any })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white">
                <option value="D">D (Malai / Full Fat)</option>
                <option value="C/S">C/S (Rozana / Medium Fat)</option>
                <option value="Halloumi">Halloumi</option>
                <option value="Butter">Butter</option>
                <option value="Ghee">Ghee</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Planned Input (L)</label>
            <input type="number" value={newRound.plannedInput} onChange={(e) => setNewRound({ ...newRound, plannedInput: parseInt(e.target.value) })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" min="0" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Team (optional — inherits from shift if empty)</label>
            <input type="text" value={newRound.team} onChange={(e) => setNewRound({ ...newRound, team: e.target.value })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" placeholder="Leave empty to use shift team" />
          </div>
          {newRound.shiftId && (
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-xs text-slate-500">Batch ID will be:</p>
              <p className="font-mono text-sm font-bold text-slate-900 mt-1">
                {productionShifts.find(s => s.id === newRound.shiftId)?.milkLotCode}/S{productionShifts.find(s => s.id === newRound.shiftId)?.shiftNumber}/R{newRound.roundNumber}/{newRound.type}
              </p>
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <button onClick={handleCreateRound} className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors">Create Round</button>
            <button onClick={() => setShowNewRoundModal(false)} className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200 transition-colors">Cancel</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
