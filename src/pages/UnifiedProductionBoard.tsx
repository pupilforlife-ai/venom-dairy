import { useState, useEffect } from 'react';
import { useApp } from '../store/AppContext';
import { statusFlow, statusLabels, statusColors } from '../data/mockData';
import { Plus, Scissors, Package, Clock, CheckCircle, AlertTriangle } from 'lucide-react';

export default function UnifiedProductionBoard() {
  const { productionRounds, milkLots, updateProductionRound, addProductionRound } = useApp();
  const [selectedRound, setSelectedRound] = useState<string | null>(null);
  const [showCutForm, setShowCutForm] = useState(false);
  const [showPackForm, setShowPackForm] = useState(false);
  const [showNewRoundForm, setShowNewRoundForm] = useState(false);
  
  // Timer state
  const [timers, setTimers] = useState<Record<string, number>>({});
  
  // Cut form state
  const [cutForm, setCutForm] = useState({
    cutBy: '',
    cuttingType: '',
    numberOfBlocks: 0,
    blockWeights: [] as number[],
  });
  
  // Pack form state
  const [packForm, setPackForm] = useState({
    sku: '',
    cases: 0,
    loose: 0,
  });
  
  // New round form state
  const [newRoundForm, setNewRoundForm] = useState({
    milkLotId: '',
    shiftId: '',
    roundNumber: 1,
    type: 'D' as 'D' | 'C/S',
    plannedInput: 500,
    team: '',
  });

  // Update timers every second
  useEffect(() => {
    const interval = setInterval(() => {
      setTimers(prev => {
        const updated = { ...prev };
        productionRounds.forEach(round => {
          if (round.status === 'pressing' && round.pressingStartedAt) {
            const elapsed = Math.floor((Date.now() - new Date(round.pressingStartedAt).getTime()) / 1000);
            updated[round.id] = Math.max(0, 1800 - elapsed); // 30 minutes
          } else if (round.status === 'cooling' && round.coolingStartedAt) {
            const elapsed = Math.floor((Date.now() - new Date(round.coolingStartedAt).getTime()) / 1000);
            const duration = round.coolingLocation === 'tank' ? 5400 : 7200; // 90min or 120min
            updated[round.id] = Math.max(0, duration - elapsed);
          } else if (round.status === 'resting' && round.restingStartedAt) {
            const elapsed = Math.floor((Date.now() - new Date(round.restingStartedAt).getTime()) / 1000);
            updated[round.id] = Math.max(0, 5400 - elapsed); // 90 minutes
          }
        });
        return updated;
      });
    }, 1000);
    
    return () => clearInterval(interval);
  }, [productionRounds]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleStatusChange = (roundId: string, newStatus: string) => {
    const round = productionRounds.find(r => r.id === roundId);
    if (!round) return;

    const updates: any = { status: newStatus };
    
    // Set timestamps for timer-based statuses
    if (newStatus === 'pressing') {
      updates.pressingStartedAt = new Date().toISOString();
    } else if (newStatus === 'cooling') {
      updates.coolingStartedAt = new Date().toISOString();
    } else if (newStatus === 'resting') {
      updates.restingStartedAt = new Date().toISOString();
    }

    updateProductionRound(roundId, updates);
  };

  const handleVatSelection = (roundId: string, vat: 'vat2' | 'vat3') => {
    updateProductionRound(roundId, { vat });
    handleStatusChange(roundId, 'pressing');
  };

  const handleCoolingLocation = (roundId: string, location: 'tank' | 'chiller') => {
    updateProductionRound(roundId, { coolingLocation: location });
    handleStatusChange(roundId, 'cooling');
  };

  const handleCut = (roundId: string) => {
    const round = productionRounds.find(r => r.id === roundId);
    if (!round) return;

    const totalWeight = cutForm.blockWeights.reduce((sum, w) => sum + w, 0);
    
    updateProductionRound(roundId, {
      status: 'cut',
      cutBy: cutForm.cutBy,
      cuttingType: cutForm.cuttingType,
      numberOfBlocks: cutForm.numberOfBlocks,
      blockWeights: cutForm.blockWeights,
      outputWeight: totalWeight,
    });

    setShowCutForm(false);
    setCutForm({ cutBy: '', cuttingType: '', numberOfBlocks: 0, blockWeights: [] });
  };

  const handlePack = (roundId: string) => {
    const round = productionRounds.find(r => r.id === roundId);
    if (!round) return;

    const existingPacked = round.packedSkus || [];
    const newPackedSkus = [...existingPacked, { sku: packForm.sku, cases: packForm.cases, loose: packForm.loose }];

    updateProductionRound(roundId, {
      status: 'packed',
      packedSkus: newPackedSkus,
    });

    setShowPackForm(false);
    setPackForm({ sku: '', cases: 0, loose: 0 });
  };

  const handleCreateRound = () => {
    const milkLot = milkLots.find(m => m.id === newRoundForm.milkLotId);
    const shift = milkLot ? milkLots.find(m => m.id === newRoundForm.milkLotId) : null;
    
    if (!milkLot) return;

    addProductionRound({
      milkLotId: newRoundForm.milkLotId,
      milkLotCode: milkLot.lotCode,
      shiftId: newRoundForm.shiftId,
      shiftNumber: parseInt(newRoundForm.shiftId.split('-')[1]) || 1,
      roundNumber: newRoundForm.roundNumber,
      type: newRoundForm.type,
      status: 'scheduled',
      team: newRoundForm.team.split(',').map(t => t.trim()),
      plannedInput: newRoundForm.plannedInput,
      actualInput: 0,
      outputWeight: 0,
      startTime: new Date().toISOString(),
      locked: false,
    });

    setShowNewRoundForm(false);
    setNewRoundForm({
      milkLotId: '',
      shiftId: '',
      roundNumber: 1,
      type: 'D',
      plannedInput: 500,
      team: '',
    });
  };

  const getActionButtons = (round: any) => {
    const buttons = [];
    
    if (round.status === 'scheduled') {
      buttons.push(
        <button
          key="start"
          onClick={() => handleStatusChange(round.id, 'in_production')}
          className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
        >
          Start Production
        </button>
      );
    } else if (round.status === 'in_production' && !round.vat) {
      buttons.push(
        <button
          key="vat2"
          onClick={() => handleVatSelection(round.id, 'vat2')}
          className="px-3 py-1 bg-purple-500 text-white rounded text-sm hover:bg-purple-600"
        >
          Vat 2
        </button>,
        <button
          key="vat3"
          onClick={() => handleVatSelection(round.id, 'vat3')}
          className="px-3 py-1 bg-purple-500 text-white rounded text-sm hover:bg-purple-600"
        >
          Vat 3
        </button>
      );
    } else if (round.status === 'pressing') {
      const timer = timers[round.id] || 0;
      buttons.push(
        <div key="timer" className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-purple-500" />
          <span className="text-sm font-mono">{formatTime(timer)}</span>
          {timer === 0 && (
            <button
              onClick={() => handleStatusChange(round.id, 'cooling')}
              className="px-3 py-1 bg-cyan-500 text-white rounded text-sm hover:bg-cyan-600"
            >
              Start Cooling
            </button>
          )}
        </div>
      );
    } else if (round.status === 'cooling') {
      const timer = timers[round.id] || 0;
      buttons.push(
        <div key="timer" className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-cyan-500" />
          <span className="text-sm font-mono">{formatTime(timer)}</span>
          {timer === 0 && (
            <button
              onClick={() => handleStatusChange(round.id, 'resting')}
              className="px-3 py-1 bg-teal-500 text-white rounded text-sm hover:bg-teal-600"
            >
              Start Resting
            </button>
          )}
        </div>
      );
    } else if (round.status === 'resting') {
      const timer = timers[round.id] || 0;
      buttons.push(
        <div key="timer" className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-teal-500" />
          <span className="text-sm font-mono">{formatTime(timer)}</span>
          {timer === 0 && (
            <button
              onClick={() => handleStatusChange(round.id, 'ready_cutting')}
              className="px-3 py-1 bg-amber-500 text-white rounded text-sm hover:bg-amber-600"
            >
              Ready for Cutting
            </button>
          )}
        </div>
      );
    } else if (round.status === 'ready_cutting') {
      buttons.push(
        <button
          key="cut"
          onClick={() => {
            setSelectedRound(round.id);
            setShowCutForm(true);
          }}
          className="px-3 py-1 bg-orange-500 text-white rounded text-sm hover:bg-orange-600 flex items-center gap-1"
        >
          <Scissors className="w-4 h-4" />
          Cut
        </button>
      );
    } else if (round.status === 'cut') {
      buttons.push(
        <button
          key="clingwrap"
          onClick={() => handleStatusChange(round.id, 'clingwrapped')}
          className="px-3 py-1 bg-pink-400 text-white rounded text-sm hover:bg-pink-500"
        >
          Clingwrap
        </button>,
        <button
          key="freeze"
          onClick={() => handleStatusChange(round.id, 'frozen')}
          className="px-3 py-1 bg-indigo-500 text-white rounded text-sm hover:bg-indigo-600"
        >
          Freeze
        </button>,
        <button
          key="pack"
          onClick={() => {
            setSelectedRound(round.id);
            setShowPackForm(true);
          }}
          className="px-3 py-1 bg-emerald-500 text-white rounded text-sm hover:bg-emerald-600 flex items-center gap-1"
        >
          <Package className="w-4 h-4" />
          Pack
        </button>
      );
    } else if (round.status === 'clingwrapped') {
      buttons.push(
        <button
          key="freeze"
          onClick={() => handleStatusChange(round.id, 'frozen')}
          className="px-3 py-1 bg-indigo-500 text-white rounded text-sm hover:bg-indigo-600"
        >
          Freeze
        </button>,
        <button
          key="cut-final"
          onClick={() => {
            setSelectedRound(round.id);
            setShowCutForm(true);
          }}
          className="px-3 py-1 bg-orange-500 text-white rounded text-sm hover:bg-orange-600 flex items-center gap-1"
        >
          <Scissors className="w-4 h-4" />
          Final Cut
        </button>
      );
    } else if (round.status === 'frozen') {
      buttons.push(
        <button
          key="pack"
          onClick={() => {
            setSelectedRound(round.id);
            setShowPackForm(true);
          }}
          className="px-3 py-1 bg-emerald-500 text-white rounded text-sm hover:bg-emerald-600 flex items-center gap-1"
        >
          <Package className="w-4 h-4" />
          Pack
        </button>
      );
    } else if (round.status === 'packed') {
      buttons.push(
        <button
          key="handover"
          onClick={() => handleStatusChange(round.id, 'handed_over')}
          className="px-3 py-1 bg-emerald-700 text-white rounded text-sm hover:bg-emerald-800 flex items-center gap-1"
        >
          <CheckCircle className="w-4 h-4" />
          Hand Over
        </button>
      );
    }

    return buttons;
  };

  // Group rounds by shift
  const roundsByShift = productionRounds.reduce((acc, round) => {
    if (!acc[round.shiftNumber]) {
      acc[round.shiftNumber] = [];
    }
    acc[round.shiftNumber].push(round);
    return acc;
  }, {} as Record<number, any[]>);

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Unified Production Board</h1>
        <button
          onClick={() => setShowNewRoundForm(true)}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          New Round
        </button>
      </div>

      {Object.entries(roundsByShift).map(([shiftNumber, rounds]) => (
        <div key={shiftNumber} className="mb-8">
          <h2 className="text-xl font-semibold mb-4">Shift {shiftNumber}</h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse bg-white rounded-lg shadow">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border p-3 text-left">Batch ID</th>
                  <th className="border p-3 text-left">Type</th>
                  <th className="border p-3 text-left">Status</th>
                  <th className="border p-3 text-left">Input (L)</th>
                  <th className="border p-3 text-left">Output (kg)</th>
                  <th className="border p-3 text-left">Blocks</th>
                  <th className="border p-3 text-left">Packed</th>
                  <th className="border p-3 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rounds.map(round => (
                  <tr key={round.id} className="hover:bg-gray-50">
                    <td className="border p-3 font-mono text-sm">
                      {round.milkLotCode}/S{round.shiftNumber}/R{round.roundNumber}
                    </td>
                    <td className="border p-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${statusColors[round.type]}`}>
                        {round.type}
                      </span>
                    </td>
                    <td className="border p-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${statusColors[round.status]}`}>
                        {statusLabels[round.status]}
                      </span>
                    </td>
                    <td className="border p-3">{round.actualInput || round.plannedInput}</td>
                    <td className="border p-3">{round.outputWeight || '-'}</td>
                    <td className="border p-3">
                      {round.numberOfBlocks ? `${round.numberOfBlocks} blocks` : '-'}
                    </td>
                    <td className="border p-3">
                      {round.packedSkus && round.packedSkus.length > 0 ? (
                        <div className="text-xs">
                          {round.packedSkus.map((p: { sku: string; cases: number; loose: number }, i: number) => (
                            <div key={i}>{p.sku}: {p.cases}c + {p.loose}l</div>
                          ))}
                        </div>
                      ) : '-'}
                    </td>
                    <td className="border p-3">
                      <div className="flex gap-2 flex-wrap">
                        {getActionButtons(round)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {/* Cut Form Modal */}
      {showCutForm && selectedRound && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-xl font-bold mb-4">Record Cutting</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Cut By</label>
                <input
                  type="text"
                  value={cutForm.cutBy}
                  onChange={(e) => setCutForm({ ...cutForm, cutBy: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                  placeholder="Worker name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Cutting Type</label>
                <select
                  value={cutForm.cuttingType}
                  onChange={(e) => setCutForm({ ...cutForm, cuttingType: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="">Select type</option>
                  <option value="400g blocks">400g blocks</option>
                  <option value="200g format">200g format</option>
                  <option value="SPP pieces">SPP pieces</option>
                  <option value="1kg blocks">1kg blocks</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Number of Blocks</label>
                <input
                  type="number"
                  value={cutForm.numberOfBlocks}
                  onChange={(e) => {
                    const num = parseInt(e.target.value);
                    setCutForm({
                      ...cutForm,
                      numberOfBlocks: num,
                      blockWeights: Array(num).fill(0),
                    });
                  }}
                  className="w-full border rounded px-3 py-2"
                  min="0"
                />
              </div>
              {cutForm.blockWeights.length > 0 && (
                <div>
                  <label className="block text-sm font-medium mb-1">Block Weights (kg)</label>
                  <div className="space-y-2">
                    {cutForm.blockWeights.map((weight, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <span className="text-sm w-20">Block {index + 1}:</span>
                        <input
                          type="number"
                          value={weight}
                          onChange={(e) => {
                            const newWeights = [...cutForm.blockWeights];
                            newWeights[index] = parseFloat(e.target.value) || 0;
                            setCutForm({ ...cutForm, blockWeights: newWeights });
                          }}
                          className="flex-1 border rounded px-3 py-1"
                          step="0.1"
                          min="0"
                        />
                      </div>
                    ))}
                    <div className="text-sm font-medium mt-2">
                      Total: {cutForm.blockWeights.reduce((sum, w) => sum + w, 0).toFixed(2)} kg
                    </div>
                  </div>
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => handleCut(selectedRound)}
                  className="flex-1 px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600"
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setShowCutForm(false);
                    setCutForm({ cutBy: '', cuttingType: '', numberOfBlocks: 0, blockWeights: [] });
                  }}
                  className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pack Form Modal */}
      {showPackForm && selectedRound && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-xl font-bold mb-4">Record Packing</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">SKU</label>
                <select
                  value={packForm.sku}
                  onChange={(e) => setPackForm({ ...packForm, sku: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="">Select SKU</option>
                  <option value="MPAN400">MPAN400 - Malai Paneer 400g</option>
                  <option value="MPAN200">MPAN200 - Malai Paneer 200g</option>
                  <option value="MPAN100">MPAN100 - Malai Paneer 1kg</option>
                  <option value="RPAN400">RPAN400 - Rozana Paneer 400g</option>
                  <option value="RPAN200">RPAN200 - Rozana Paneer 200g</option>
                  <option value="RPAN100">RPAN100 - Rozana Paneer 1kg</option>
                  <option value="SPP-200">SPP-200 - Spicy Paneer Poppers 200g</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Cases</label>
                <input
                  type="number"
                  value={packForm.cases}
                  onChange={(e) => setPackForm({ ...packForm, cases: parseInt(e.target.value) || 0 })}
                  className="w-full border rounded px-3 py-2"
                  min="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Loose Packets</label>
                <input
                  type="number"
                  value={packForm.loose}
                  onChange={(e) => setPackForm({ ...packForm, loose: parseInt(e.target.value) || 0 })}
                  className="w-full border rounded px-3 py-2"
                  min="0"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handlePack(selectedRound)}
                  className="flex-1 px-4 py-2 bg-emerald-500 text-white rounded hover:bg-emerald-600"
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setShowPackForm(false);
                    setPackForm({ sku: '', cases: 0, loose: 0 });
                  }}
                  className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New Round Form Modal */}
      {showNewRoundForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-xl font-bold mb-4">Create New Round</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Milk Lot</label>
                <select
                  value={newRoundForm.milkLotId}
                  onChange={(e) => setNewRoundForm({ ...newRoundForm, milkLotId: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="">Select milk lot</option>
                  {milkLots.map(lot => (
                    <option key={lot.id} value={lot.id}>
                      {lot.lotCode} - {lot.status}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Shift</label>
                <input
                  type="text"
                  value={newRoundForm.shiftId}
                  onChange={(e) => setNewRoundForm({ ...newRoundForm, shiftId: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                  placeholder="e.g., shift-1"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Round Number</label>
                <input
                  type="number"
                  value={newRoundForm.roundNumber}
                  onChange={(e) => setNewRoundForm({ ...newRoundForm, roundNumber: parseInt(e.target.value) || 1 })}
                  className="w-full border rounded px-3 py-2"
                  min="1"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Type</label>
                <select
                  value={newRoundForm.type}
                  onChange={(e) => setNewRoundForm({ ...newRoundForm, type: e.target.value as 'D' | 'C/S' })}
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="D">D (Malai / Full Fat)</option>
                  <option value="C/S">C/S (Rozana / Medium Fat)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Planned Input (L)</label>
                <input
                  type="number"
                  value={newRoundForm.plannedInput}
                  onChange={(e) => setNewRoundForm({ ...newRoundForm, plannedInput: parseInt(e.target.value) || 0 })}
                  className="w-full border rounded px-3 py-2"
                  min="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Team (comma-separated)</label>
                <input
                  type="text"
                  value={newRoundForm.team}
                  onChange={(e) => setNewRoundForm({ ...newRoundForm, team: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                  placeholder="e.g., Rajesh, Amit, Suresh"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleCreateRound}
                  className="flex-1 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                  Create
                </button>
                <button
                  onClick={() => setShowNewRoundForm(false)}
                  className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
