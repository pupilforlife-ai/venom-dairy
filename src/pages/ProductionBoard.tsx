import { useState, useEffect } from 'react';
import {
  Filter,
  Plus,
  CheckCircle2,
  Circle,
  Lock,
  Users,
  Clock,
  Square,
  Scissors,
  Package,
  AlertTriangle,
  Timer,
  ChevronDown,
  ChevronUp,
  History,
} from 'lucide-react';
import { useApp } from '../store/AppContext';
import { useToast } from '../components/Toast';
import { Modal } from '../components/Modal';
import { milkLots, statusFlow, statusLabels, statusColors } from '../data/mockData';
import HalloumiTab from './HalloumiTab';
import ButterTab from './ButterTab';

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
    productionRounds, productionShifts, intermediateLots,
    advanceRoundStatus, updateProductionRound, addProductionRound,
    addProductionShift, updateProductionShift, addIntermediateLot
  } = useApp();
  const { showToast } = useToast();
  
  const [activeTab, setActiveTab] = useState<'paneer' | 'halloumi' | 'butter' | 'ghee' | 'crumbing'>('paneer');
  const [filters, setFilters] = useState({ milkLot: 'all', status: 'all', type: 'all', shift: 'all' });
  const [showFilters, setShowFilters] = useState(false);
  const [selectedRound, setSelectedRound] = useState<string | null>(null);
  const [showNewRoundModal, setShowNewRoundModal] = useState(false);
  const [showNewShiftModal, setShowNewShiftModal] = useState(false);
  const [showCutModal, setShowCutModal] = useState(false);
  const [showPackModal, setShowPackModal] = useState(false);
  const [showPan111Modal, setShowPan111Modal] = useState(false);
  const [showCreamModal, setShowCreamModal] = useState(false);
  const [showTemperatureModal, setShowTemperatureModal] = useState(false);
  const [startingTemperature, setStartingTemperature] = useState<number | null>(null);
  const [selectedVat, setSelectedVat] = useState<'vat2' | 'vat3' | null>(null);
  const [collapsedShifts, setCollapsedShifts] = useState<Set<string>>(new Set());
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyRoundId, setHistoryRoundId] = useState<string | null>(null);
  
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
  
  // PAN111 form state
  const [pan111Form, setPan111Form] = useState({
    weight: 0,
    recordedBy: '',
  });
  
  // Cream form state
  const [creamForm, setCreamForm] = useState({
    numberOfBuckets: 0,
    bucketWeights: [] as number[],
    recordedBy: '',
  });
  
  // New shift form
  const [newShift, setNewShift] = useState({
    milkLotId: '',
    shiftNumber: 1,
    team: '',
    startedAt: new Date().toISOString().slice(0, 16),
    teamNotes: '',
  });
  
  // New round form
  const [newRound, setNewRound] = useState({
    shiftId: '',
    roundNumber: 1,
    type: 'D' as const,
    plannedInput: 500,
    team: '',
  });

  const activeMilkLot = milkLots.find((m) => m.status === 'active');

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

  // Get active shifts (latest first)
  const activeShifts = productionShifts
    .filter(s => groupedByShift[s.id] || s.status !== 'completed')
    .sort((a, b) => b.shiftNumber - a.shiftNumber);

  // Check for FIFO violations
  const frozenLots = intermediateLots
    .filter(lot => lot.storageLocation.includes('Freezer') && lot.status === 'available')
    .sort((a, b) => new Date(a.producedAt).getTime() - new Date(b.producedAt).getTime());
  
  const hasFifoViolation = frozenLots.length > 1;

  // ---- Actions ----
  const handleVatSelection = (roundId: string, vat: 'vat2' | 'vat3') => {
    setSelectedRound(roundId);
    setSelectedVat(vat);
    setShowTemperatureModal(true);
  };

  const handleRecordTemperature = () => {
    if (!selectedRound || startingTemperature === null || !selectedVat) {
      showToast('error', 'Please enter the starting temperature');
      return;
    }

    const round = productionRounds.find(r => r.id === selectedRound);
    if (!round) return;

    updateProductionRound(selectedRound, { 
      vat: selectedVat,
      status: 'in_production',
      actualInput: round.plannedInput,
      startingTemperature: startingTemperature
    });
    showToast('success', `Started production in ${selectedVat === 'vat2' ? 'Vat 2' : 'Vat 3'} at ${startingTemperature}°C`);
    setShowTemperatureModal(false);
    setStartingTemperature(null);
    setSelectedVat(null);
  };

  const handleStartCoagulation = (roundId: string) => {
    updateProductionRound(roundId, { status: 'coagulation' });
    showToast('success', 'Started coagulation');
  };

  const handleStartPressing = (roundId: string) => {
    updateProductionRound(roundId, { 
      status: 'pressing',
      pressingStartedAt: new Date().toISOString()
    });
    showToast('success', 'Started pressing (30 min)');
  };

  const handleStartCooling = (roundId: string, location: 'tank' | 'chiller') => {
    updateProductionRound(roundId, { 
      coolingLocation: location,
      status: 'cooling',
      coolingStartedAt: new Date().toISOString()
    });
    showToast('success', `Started cooling in ${location === 'tank' ? 'Cooling Tank (90min)' : 'Chiller (120min)'}`);
  };

  const handleStartResting = (roundId: string) => {
    updateProductionRound(roundId, { 
      status: 'resting',
      restingStartedAt: new Date().toISOString()
    });
    showToast('success', 'Started resting (90min)');
  };

  const handleReadyForCutting = (roundId: string) => {
    updateProductionRound(roundId, { status: 'ready_cutting' });
    showToast('success', 'Ready for cutting');
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
      remainingBalance: totalWeight,
    });

    showToast('success', `Cut recorded: ${cutForm.numberOfBlocks} blocks, ${totalWeight.toFixed(2)} kg`);
    setShowCutModal(false);
    setCutForm({ cutBy: '', cuttingType: '', numberOfBlocks: 0, blockWeights: [] });
  };

  const handleClingwrap = (roundId: string) => {
    updateProductionRound(roundId, { status: 'clingwrapped' });
    showToast('success', 'Clingwrapped and stored in chiller');
  };

  const handleFreeze = (roundId: string) => {
    updateProductionRound(roundId, { status: 'frozen' });
    showToast('success', 'Moved to freezer');
  };

  // SKU weight configurations (kg per case)
  const skuWeightPerCase: Record<string, number> = {
    'MPAN100': 15,    // 1kg × 15 packets/case
    'MPAN400': 9.6,   // 400g × 24 packets/case
    'MPAN200': 4.8,   // 200g × 24 packets/case
    'RPAN100': 15,    // 1kg × 15 packets/case
    'RPAN400': 9.6,   // 400g × 24 packets/case
    'RPAN200': 4.8,   // 200g × 24 packets/case
    'SPP-200': 1.32,  // 8 pieces × ~165g per 8 pieces × 12 packets/case
  };

  const handlePack = (roundId: string) => {
    const round = productionRounds.find(r => r.id === roundId);
    if (!round) return;

    // Calculate weight packed
    const weightPerCase = skuWeightPerCase[packForm.sku] || 0;
    const weightPerPacket = weightPerCase / 24; // Assuming 24 packets per case for most SKUs
    const totalWeightPacked = (packForm.cases * weightPerCase) + (packForm.loose * weightPerPacket);

    // Calculate new balance (can go negative for over-packing)
    const currentBalance = round.remainingBalance ?? round.outputWeight ?? 0;
    const newBalance = currentBalance - totalWeightPacked;

    // Add to packed SKUs array
    const existingPacked = round.packedSkus || [];
    const newPackedSkus = [...existingPacked, { sku: packForm.sku, cases: packForm.cases, loose: packForm.loose }];

    // Determine new status - mark as packed if balance is 0 or negative
    const newStatus = newBalance <= 0 ? 'packed' : round.status;

    updateProductionRound(roundId, {
      status: newStatus,
      packedSkus: newPackedSkus,
      remainingBalance: newBalance,
    });

    if (newBalance < 0) {
      showToast('info', `⚠️ Packed ${packForm.cases} cases + ${packForm.loose} loose of ${packForm.sku}. Balance: ${newBalance.toFixed(2)} kg (over-packed)`);
    } else if (newBalance === 0) {
      showToast('success', `Packed ${packForm.cases} cases + ${packForm.loose} loose of ${packForm.sku}. Round fully packed!`);
    } else {
      showToast('success', `Packed ${packForm.cases} cases + ${packForm.loose} loose of ${packForm.sku}. Remaining: ${newBalance.toFixed(2)} kg`);
    }
    
    setShowPackModal(false);
    setPackForm({ sku: '', cases: 0, loose: 0 });
  };

  const handleHandover = (roundId: string) => {
    updateProductionRound(roundId, { 
      status: 'handed_over',
      locked: true,
      completedAt: new Date().toISOString()
    });
    showToast('success', 'Handed over to distribution');
  };

  const handleRecordPan111 = () => {
    if (!activeMilkLot) return;
    
    addIntermediateLot({
      lotCode: `PAN111-${activeMilkLot.lotCode}`,
      productId: 'pan111',
      productName: 'PAN111 (Recovered Paneer)',
      productClass: 'intermediate',
      sourceBatchId: 'milk-lot',
      sourceBatchCode: activeMilkLot.lotCode,
      producedQuantity: pan111Form.weight,
      currentQuantity: pan111Form.weight,
      uom: 'kg',
      storageLocation: 'Chiller',
      status: 'available',
      producedAt: new Date().toISOString(),
      sourceMilkLotCode: activeMilkLot.lotCode,
      sourceShift: 0,
      sourceRound: 0,
    });

    showToast('success', `PAN111 recorded: ${pan111Form.weight} kg`);
    setShowPan111Modal(false);
    setPan111Form({ weight: 0, recordedBy: '' });
  };

  const handleRecordCream = () => {
    if (!selectedRound) return;
    
    const round = productionRounds.find(r => r.id === selectedRound);
    if (!round || round.type !== 'C/S') {
      showToast('error', 'Cream can only be recorded for C/S rounds');
      return;
    }

    const totalWeight = creamForm.bucketWeights.reduce((sum, w) => sum + w, 0);
    
    if (totalWeight <= 0) {
      showToast('error', 'Please enter valid bucket weights');
      return;
    }

    updateProductionRound(selectedRound, {
      creamRecovered: totalWeight,
      creamRecoveredAt: new Date().toISOString(),
      creamRecoveredBy: creamForm.recordedBy,
    });

    // Also create an intermediate lot for the cream
    addIntermediateLot({
      lotCode: `CREAM-${round.milkLotCode}-S${round.shiftNumber}-R${round.roundNumber}`,
      productId: 'cream',
      productName: 'Recovered Cream (from C/S)',
      productClass: 'intermediate',
      sourceBatchId: round.id,
      sourceBatchCode: `${round.milkLotCode}/S${round.shiftNumber}/R${round.roundNumber}/C/S`,
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

    showToast('success', `Cream recorded: ${totalWeight.toFixed(2)} kg (${creamForm.numberOfBuckets} buckets)`);
    setShowCreamModal(false);
    setCreamForm({ numberOfBuckets: 0, bucketWeights: [], recordedBy: '' });
  };

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
    showToast('success', `Shift ${newShift.shiftNumber} created`);
    setShowNewShiftModal(false);
    setNewShift({ milkLotId: '', shiftNumber: 1, team: '', startedAt: new Date().toISOString().slice(0, 16), teamNotes: '' });
  };

  const handleEndShift = (shiftId: string) => {
    updateProductionShift(shiftId, { status: 'completed', endedAt: new Date().toISOString() });
    showToast('success', 'Shift ended');
  };

  const getLatestActiveShift = () => {
    return productionShifts
      .filter(s => s.status === 'active')
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())[0] || null;
  };

  const openNewRoundModal = () => {
    const latestShift = getLatestActiveShift();
    if (!latestShift) {
      showToast('error', 'No active shift. Create a shift first.');
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
    showToast('success', `Round created: ${shift.milkLotCode}/S${shift.shiftNumber}/R${newRound.roundNumber}/${newRound.type}`);
    setShowNewRoundModal(false);
  };

  const handleShiftChange = (shiftId: string) => {
    const existingRoundsInShift = productionRounds.filter(r => r.shiftId === shiftId).length;
    setNewRound({ ...newRound, shiftId, roundNumber: existingRoundsInShift + 1 });
  };

  // Get action buttons for each round
  const getActionButtons = (round: any) => {
    const buttons = [];
    
    if (round.status === 'scheduled') {
      buttons.push(
        <div key="vat" className="flex gap-1">
          <button onClick={() => handleVatSelection(round.id, 'vat2')} className="px-2 py-1 bg-purple-500 text-white rounded text-xs hover:bg-purple-600">Vat 2</button>
          <button onClick={() => handleVatSelection(round.id, 'vat3')} className="px-2 py-1 bg-purple-500 text-white rounded text-xs hover:bg-purple-600">Vat 3</button>
        </div>
      );
    } else if (round.status === 'in_production') {
      buttons.push(
        <div key="in-production-actions" className="flex gap-1 flex-wrap">
          <button onClick={() => handleStartCoagulation(round.id)} className="px-2 py-1 bg-violet-500 text-white rounded text-xs hover:bg-violet-600">
            Start Coagulation
          </button>
          {round.type === 'C/S' && !round.creamRecovered && (
            <button onClick={() => { setSelectedRound(round.id); setCreamForm({ numberOfBuckets: 0, bucketWeights: [], recordedBy: '' }); setShowCreamModal(true); }} className="px-2 py-1 bg-amber-500 text-white rounded text-xs hover:bg-amber-600">
              +Cream
            </button>
          )}
        </div>
      );
    } else if (round.status === 'coagulation') {
      buttons.push(
        <div key="coagulation-actions" className="flex gap-1 flex-wrap">
          <button onClick={() => handleStartPressing(round.id)} className="px-2 py-1 bg-purple-500 text-white rounded text-xs hover:bg-purple-600">
            Start Pressing
          </button>
          {round.type === 'C/S' && !round.creamRecovered && (
            <button onClick={() => { setSelectedRound(round.id); setCreamForm({ numberOfBuckets: 0, bucketWeights: [], recordedBy: '' }); setShowCreamModal(true); }} className="px-2 py-1 bg-amber-500 text-white rounded text-xs hover:bg-amber-600">
              +Cream
            </button>
          )}
        </div>
      );
    } else if (round.status === 'pressing') {
      const timer = timers[round.id] || 0;
      buttons.push(
        <div key="pressing" className="flex items-center gap-2 flex-wrap">
          <Timer className="w-4 h-4 text-purple-500" />
          <span className="text-xs font-mono font-bold">{formatTime(timer)}</span>
          {timer === 0 && (
            <>
              <span className="text-xs font-bold text-emerald-600 animate-pulse">✓ Ready for Cooling</span>
              <div className="flex gap-1">
                <button onClick={() => handleStartCooling(round.id, 'tank')} className="px-2 py-1 bg-cyan-500 text-white rounded text-xs hover:bg-cyan-600">Tank</button>
                <button onClick={() => handleStartCooling(round.id, 'chiller')} className="px-2 py-1 bg-cyan-500 text-white rounded text-xs hover:bg-cyan-600">Chiller</button>
              </div>
            </>
          )}
          {round.type === 'C/S' && !round.creamRecovered && (
            <button onClick={() => { setSelectedRound(round.id); setCreamForm({ numberOfBuckets: 0, bucketWeights: [], recordedBy: '' }); setShowCreamModal(true); }} className="px-2 py-1 bg-amber-500 text-white rounded text-xs hover:bg-amber-600">
              +Cream
            </button>
          )}
        </div>
      );
    } else if (round.status === 'cooling') {
      const timer = timers[round.id] || 0;
      buttons.push(
        <div key="cooling" className="flex items-center gap-2 flex-wrap">
          <Timer className="w-4 h-4 text-cyan-500" />
          <span className="text-xs font-mono font-bold">{formatTime(timer)}</span>
          {timer === 0 && (
            <>
              <span className="text-xs font-bold text-emerald-600 animate-pulse">✓ Ready to Take Out for Resting</span>
              <button onClick={() => handleStartResting(round.id)} className="px-2 py-1 bg-teal-500 text-white rounded text-xs hover:bg-teal-600">Start Resting</button>
            </>
          )}
          {round.type === 'C/S' && !round.creamRecovered && (
            <button onClick={() => { setSelectedRound(round.id); setCreamForm({ numberOfBuckets: 0, bucketWeights: [], recordedBy: '' }); setShowCreamModal(true); }} className="px-2 py-1 bg-amber-500 text-white rounded text-xs hover:bg-amber-600">
              +Cream
            </button>
          )}
        </div>
      );
    } else if (round.status === 'resting') {
      const timer = timers[round.id] || 0;
      buttons.push(
        <div key="resting" className="flex items-center gap-2 flex-wrap">
          <Timer className="w-4 h-4 text-teal-500" />
          <span className="text-xs font-mono font-bold">{formatTime(timer)}</span>
          {timer === 0 && (
            <>
              <span className="text-xs font-bold text-emerald-600 animate-pulse">✓ Ready for Cutting</span>
              <button onClick={() => handleReadyForCutting(round.id)} className="px-2 py-1 bg-amber-500 text-white rounded text-xs hover:bg-amber-600">Start Cutting</button>
            </>
          )}
          {round.type === 'C/S' && !round.creamRecovered && (
            <button onClick={() => { setSelectedRound(round.id); setCreamForm({ numberOfBuckets: 0, bucketWeights: [], recordedBy: '' }); setShowCreamModal(true); }} className="px-2 py-1 bg-amber-500 text-white rounded text-xs hover:bg-amber-600">
              +Cream
            </button>
          )}
        </div>
      );
    } else if (round.status === 'ready_cutting') {
      buttons.push(
        <div key="ready-cutting-actions" className="flex gap-1 flex-wrap">
          <button onClick={() => { setSelectedRound(round.id); setCutForm({ cutBy: '', cuttingType: '', numberOfBlocks: 0, blockWeights: [] }); setShowCutModal(true); }} className="flex items-center gap-1 px-2 py-1 bg-orange-500 text-white rounded text-xs hover:bg-orange-600">
            <Scissors className="w-3 h-3" /> Cut
          </button>
          {round.type === 'C/S' && !round.creamRecovered && (
            <button onClick={() => { setSelectedRound(round.id); setCreamForm({ numberOfBuckets: 0, bucketWeights: [], recordedBy: '' }); setShowCreamModal(true); }} className="px-2 py-1 bg-amber-500 text-white rounded text-xs hover:bg-amber-600">
              +Cream
            </button>
          )}
        </div>
      );
    } else if (round.status === 'cut') {
      buttons.push(
        <div key="cut-actions" className="flex gap-1 flex-wrap">
          <button onClick={() => handleClingwrap(round.id)} className="px-2 py-1 bg-pink-400 text-white rounded text-xs hover:bg-pink-500">Clingwrap</button>
          <button onClick={() => handleFreeze(round.id)} className="px-2 py-1 bg-indigo-500 text-white rounded text-xs hover:bg-indigo-600">Freeze</button>
          <button onClick={() => { setSelectedRound(round.id); setPackForm({ sku: '', cases: 0, loose: 0 }); setShowPackModal(true); }} className="flex items-center gap-1 px-2 py-1 bg-emerald-500 text-white rounded text-xs hover:bg-emerald-600">
            <Package className="w-3 h-3" /> {round.packedSkus && round.packedSkus.length > 0 ? '+Add Packing' : 'Pack'}
          </button>
          {round.type === 'C/S' && !round.creamRecovered && (
            <button onClick={() => { setSelectedRound(round.id); setCreamForm({ numberOfBuckets: 0, bucketWeights: [], recordedBy: '' }); setShowCreamModal(true); }} className="px-2 py-1 bg-amber-500 text-white rounded text-xs hover:bg-amber-600">
              +Cream
            </button>
          )}
        </div>
      );
    } else if (round.status === 'clingwrapped') {
      buttons.push(
        <div key="clingwrap-actions" className="flex gap-1 flex-wrap">
          <button onClick={() => { setSelectedRound(round.id); setCutForm({ cutBy: '', cuttingType: '', numberOfBlocks: 0, blockWeights: [] }); setShowCutModal(true); }} className="flex items-center gap-1 px-2 py-1 bg-orange-500 text-white rounded text-xs hover:bg-orange-600">
            <Scissors className="w-3 h-3" /> Final Cut
          </button>
          <button onClick={() => handleFreeze(round.id)} className="px-2 py-1 bg-indigo-500 text-white rounded text-xs hover:bg-indigo-600">Freeze</button>
          <button onClick={() => { setSelectedRound(round.id); setPackForm({ sku: '', cases: 0, loose: 0 }); setShowPackModal(true); }} className="flex items-center gap-1 px-2 py-1 bg-emerald-500 text-white rounded text-xs hover:bg-emerald-600">
            <Package className="w-3 h-3" /> {round.packedSkus && round.packedSkus.length > 0 ? '+Add Packing' : 'Pack'}
          </button>
          {round.type === 'C/S' && !round.creamRecovered && (
            <button onClick={() => { setSelectedRound(round.id); setCreamForm({ numberOfBuckets: 0, bucketWeights: [], recordedBy: '' }); setShowCreamModal(true); }} className="px-2 py-1 bg-amber-500 text-white rounded text-xs hover:bg-amber-600">
              +Cream
            </button>
          )}
        </div>
      );
    } else if (round.status === 'frozen') {
      buttons.push(
        <div key="frozen-actions" className="flex gap-1 flex-wrap">
          <button key="pack" onClick={() => { setSelectedRound(round.id); setPackForm({ sku: '', cases: 0, loose: 0 }); setShowPackModal(true); }} className="flex items-center gap-1 px-2 py-1 bg-emerald-500 text-white rounded text-xs hover:bg-emerald-600">
            <Package className="w-3 h-3" /> {round.packedSkus && round.packedSkus.length > 0 ? '+Add Packing' : 'Pack'}
          </button>
          {round.type === 'C/S' && !round.creamRecovered && (
            <button onClick={() => { setSelectedRound(round.id); setCreamForm({ numberOfBuckets: 0, bucketWeights: [], recordedBy: '' }); setShowCreamModal(true); }} className="px-2 py-1 bg-amber-500 text-white rounded text-xs hover:bg-amber-600">
              +Cream
            </button>
          )}
        </div>
      );
    } else if (round.status === 'packed') {
      buttons.push(
        <div key="packed-actions" className="flex gap-1 flex-wrap">
          <button key="handover" onClick={() => handleHandover(round.id)} className="flex items-center gap-1 px-2 py-1 bg-emerald-700 text-white rounded text-xs hover:bg-emerald-800">
            <CheckCircle2 className="w-3 h-3" /> Hand Over
          </button>
          <button onClick={() => { setSelectedRound(round.id); setPackForm({ sku: '', cases: 0, loose: 0 }); setShowPackModal(true); }} className="flex items-center gap-1 px-2 py-1 bg-emerald-500 text-white rounded text-xs hover:bg-emerald-600">
            <Package className="w-3 h-3" /> +Add Packing
          </button>
          {round.type === 'C/S' && !round.creamRecovered && (
            <button onClick={() => { setSelectedRound(round.id); setCreamForm({ numberOfBuckets: 0, bucketWeights: [], recordedBy: '' }); setShowCreamModal(true); }} className="px-2 py-1 bg-amber-500 text-white rounded text-xs hover:bg-amber-600">
              +Cream
            </button>
          )}
        </div>
      );
    }

    return buttons;
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
            Milk Lot: <span className="font-medium text-slate-700">{activeMilkLot?.lotCode}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === 'paneer' && (
            <button onClick={() => setShowPan111Modal(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-amber-600 text-white hover:bg-amber-700 transition-colors">
              <AlertTriangle className="w-4 h-4" /> Record PAN111
            </button>
          )}
          {activeTab === 'paneer' && (
            <button onClick={() => setShowFilters(!showFilters)} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${showFilters ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'}`}>
              <Filter className="w-4 h-4" /> Filters
            </button>
          )}
          {activeTab === 'paneer' && (
            <button onClick={() => setShowNewShiftModal(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors">
              <Plus className="w-4 h-4" /> New Shift
            </button>
          )}
          {activeTab === 'paneer' && (
            <button onClick={openNewRoundModal} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors">
              <Plus className="w-4 h-4" /> New Round
            </button>
          )}
        </div>
      </div>

      {/* Master Product Tabs */}
      <div className="bg-white rounded-xl border border-slate-200 p-2">
        <div className="flex gap-1">
          <button
            onClick={() => setActiveTab('paneer')}
            className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'paneer'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
            }`}
          >
            🧀 Paneer
          </button>
          <button
            onClick={() => setActiveTab('halloumi')}
            className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'halloumi'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
            }`}
          >
            🥙 Halloumi
          </button>
          <button
            onClick={() => setActiveTab('butter')}
            className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'butter'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
            }`}
          >
            🧈 Butter
          </button>
          <button
            onClick={() => setActiveTab('ghee')}
            className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'ghee'
                ? 'bg-orange-600 text-white shadow-sm'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
            }`}
          >
            🫙 Ghee
          </button>
          <button
            onClick={() => setActiveTab('crumbing')}
            className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'crumbing'
                ? 'bg-pink-600 text-white shadow-sm'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
            }`}
          >
            🍗 Crumbing
          </button>
        </div>
      </div>

      {/* Paneer Tab Content */}
      {activeTab === 'paneer' && (
        <>
      {/* FIFO Warning Banner */}
      {hasFifoViolation && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800">FIFO Notice</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Older frozen stock exists. Consider packing oldest batches first.
            </p>
          </div>
        </div>
      )}

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
              {productionShifts.map(s => <option key={s.id} value={s.id}>Shift {s.shiftNumber}</option>)}
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
          
          const isCollapsed = collapsedShifts.has(shift.id);
          
          return (
            <div key={shift.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              {/* Shift header */}
              <div className={`px-4 py-3 border-b flex items-center justify-between ${
                shift.status === 'active' ? 'bg-indigo-50 border-indigo-200' :
                shift.status === 'completed' ? 'bg-slate-50 border-slate-200' :
                'bg-amber-50 border-amber-200'
              }`}>
                <div className="flex items-center gap-3 flex-1">
                  <span className={`w-8 h-8 rounded-full text-white text-sm font-bold flex items-center justify-center ${
                    shift.status === 'active' ? 'bg-indigo-600' :
                    shift.status === 'completed' ? 'bg-slate-500' :
                    'bg-amber-500'
                  }`}>
                    {shift.shiftNumber}
                  </span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-900">Shift {shift.shiftNumber}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase ${
                        shift.status === 'active' ? 'bg-indigo-100 text-indigo-700' :
                        shift.status === 'completed' ? 'bg-slate-200 text-slate-600' :
                        'bg-amber-100 text-amber-700'
                      }`}>
                        {shift.status === 'active' ? 'Open' : shift.status === 'completed' ? 'Closed' : 'Scheduled'}
                      </span>
                      <span className="text-xs text-slate-600 font-medium">Batch: {shift.milkLotCode}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" /> {shift.team.join(', ')}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {new Date(shift.startedAt).toLocaleString('en-GB', { 
                          day: '2-digit', 
                          month: 'short',
                          hour: '2-digit', 
                          minute: '2-digit' 
                        })}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">{rounds.length} round{rounds.length !== 1 ? 's' : ''}</span>
                  {shift.status === 'active' && (
                    <button onClick={() => handleEndShift(shift.id)} className="flex items-center gap-1 px-2 py-1 bg-slate-100 text-slate-700 rounded text-xs font-medium hover:bg-slate-200 transition-colors">
                      <Square className="w-3 h-3" /> End Shift
                    </button>
                  )}
                  <button 
                    onClick={() => {
                      const newCollapsed = new Set(collapsedShifts);
                      if (isCollapsed) {
                        newCollapsed.delete(shift.id);
                      } else {
                        newCollapsed.add(shift.id);
                      }
                      setCollapsedShifts(newCollapsed);
                    }}
                    className="flex items-center gap-1 px-2 py-1 bg-slate-100 text-slate-700 rounded text-xs font-medium hover:bg-slate-200 transition-colors"
                  >
                    {isCollapsed ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
                    {isCollapsed ? 'Expand' : 'Collapse'}
                  </button>
                </div>
              </div>

              {/* Rounds table */}
              {!isCollapsed && rounds.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="px-4 py-2 text-left font-medium text-slate-500 text-xs uppercase tracking-wide w-36">Batch ID</th>
                        <th className="px-4 py-2 text-left font-medium text-slate-500 text-xs uppercase tracking-wide">Temp (°C)</th>
                        <th className="px-4 py-2 text-left font-medium text-slate-500 text-xs uppercase tracking-wide w-20">Milk (L)</th>
                        <th className="px-4 py-2 text-left font-medium text-slate-500 text-xs uppercase tracking-wide w-16">Type</th>
                        <th className="px-4 py-2 text-left font-medium text-slate-500 text-xs uppercase tracking-wide">Pipeline</th>
                        <th className="px-4 py-2 text-left font-medium text-slate-500 text-xs uppercase tracking-wide w-24">Status</th>
                        <th className="px-4 py-2 text-left font-medium text-slate-500 text-xs uppercase tracking-wide w-16">Output</th>
                        <th className="px-4 py-2 text-left font-medium text-slate-500 text-xs uppercase tracking-wide w-20">Blocks</th>
                        <th className="px-4 py-2 text-left font-medium text-slate-500 text-xs uppercase tracking-wide w-32">Cutting Status</th>
                        <th className="px-4 py-2 text-left font-medium text-slate-500 text-xs uppercase tracking-wide w-24">Cut By</th>
                        <th className="px-4 py-2 text-left font-medium text-slate-500 text-xs uppercase tracking-wide w-20">Balance</th>
                        <th className="px-4 py-2 text-left font-medium text-slate-500 text-xs uppercase tracking-wide w-28">Packed</th>
                        <th className="px-4 py-2 text-left font-medium text-slate-500 text-xs uppercase tracking-wide w-24">Cream (kg)</th>
                      <th className="px-4 py-2 text-left font-medium text-slate-500 text-xs uppercase tracking-wide">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {rounds.map((round) => (
                        <tr key={round.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-4 py-3">
                            <button
                              onClick={() => {
                                setHistoryRoundId(round.id);
                                setShowHistoryModal(true);
                              }}
                              className="font-mono text-xs font-bold text-slate-900 hover:text-indigo-600 transition-colors cursor-pointer"
                              title="Click to view round history"
                            >
                              S{round.shiftNumber}/R{round.roundNumber}
                            </button>
                            {round.locked && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] text-slate-400">
                                <Lock className="w-2.5 h-2.5" /> Locked
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {round.startingTemperature !== undefined ? (
                              <span className="text-xs font-medium text-slate-700">{round.startingTemperature}°C</span>
                            ) : '—'}
                          </td>
                          <td className="px-4 py-3 text-slate-600 text-xs">
                            {round.actualInput > 0 ? round.actualInput : round.plannedInput}
                          </td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-xs font-bold">{round.type}</span>
                          </td>
                          <td className="px-4 py-3"><StatusPipeline currentStatus={round.status} /></td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[round.status]} text-white`}>
                              {statusLabels[round.status]}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-600 text-xs">{round.outputWeight > 0 ? `${round.outputWeight.toFixed(1)} kg` : '—'}</td>
                          <td className="px-4 py-3 text-slate-600 text-xs">{round.numberOfBlocks ? `${round.numberOfBlocks} blocks` : '—'}</td>
                          <td className="px-4 py-3">
                            {round.cuttingType ? (
                              <span className="text-xs font-medium text-slate-700">{round.cuttingType}</span>
                            ) : round.status === 'clingwrapped' ? (
                              <span className="text-xs font-medium text-pink-600">Clingwrapped</span>
                            ) : '—'}
                          </td>
                          <td className="px-4 py-3 text-xs">
                            {round.cutBy || '—'}
                          </td>
                          <td className="px-4 py-3">
                            {round.remainingBalance !== undefined ? (
                              <span className={`text-xs font-bold ${
                                round.remainingBalance > 0 ? 'text-amber-600' : 
                                round.remainingBalance < 0 ? 'text-red-600' : 
                                'text-slate-400'
                              }`}>
                                {round.remainingBalance.toFixed(2)} kg
                              </span>
                            ) : '—'}
                          </td>
                          <td className="px-4 py-3">
                            {round.packedSkus && round.packedSkus.length > 0 ? (
                              <div className="text-xs">
                                {round.packedSkus.map((p, i) => (
                                  <div key={i}>{p.sku}: {p.cases}c + {p.loose}l</div>
                                ))}
                              </div>
                            ) : '—'}
                          </td>
                          <td className="px-4 py-3">
                            {round.type === 'C/S' && round.creamRecovered ? (
                              <div className="text-xs">
                                <div className="font-medium text-amber-700">{round.creamRecovered} kg</div>
                                {round.creamRecoveredBy && (
                                  <div className="text-slate-500">by {round.creamRecoveredBy}</div>
                                )}
                              </div>
                            ) : '—'}
                          </td>
                          <td className="px-4 py-3">
                            {!round.locked && (
                              <div className="flex gap-1 flex-wrap">
                                {getActionButtons(round)}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-6 text-center text-slate-400 text-sm">
                  No rounds in this shift yet. <button onClick={openNewRoundModal} className="text-emerald-600 hover:text-emerald-700 font-medium">Add a round →</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
        </>
      )}

      {/* Halloumi Tab Content */}
      {activeTab === 'halloumi' && (
        <HalloumiTab />
      )}

      {/* Butter Tab Content */}
      {activeTab === 'butter' && (
        <ButterTab />
      )}

      {/* Ghee Tab Content */}
      {activeTab === 'ghee' && (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
          <div className="text-6xl mb-4">🫙</div>
          <h3 className="text-xl font-bold text-slate-900 mb-2">Ghee Production</h3>
          <p className="text-slate-600 mb-4">Ghee workflow coming soon...</p>
          <p className="text-sm text-slate-500">This tab will include:</p>
          <ul className="text-sm text-slate-500 text-left max-w-md mx-auto mt-2 space-y-1">
            <li>• Shift + Round structure</li>
            <li>• Auto AF oil calculation</li>
            <li>• Dual SKU packing (400g + 1.5kg)</li>
            <li>• Auto-subtract from butter balance</li>
            <li>• Close production button</li>
          </ul>
        </div>
      )}

      {/* Crumbing Tab Content */}
      {activeTab === 'crumbing' && (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
          <div className="text-6xl mb-4">🍗</div>
          <h3 className="text-xl font-bold text-slate-900 mb-2">Crumbing (SPP / JP / HCP)</h3>
          <p className="text-slate-600 mb-4">Crumbing workflow coming soon...</p>
          <p className="text-sm text-slate-500">This tab will include:</p>
          <ul className="text-sm text-slate-500 text-left max-w-md mx-auto mt-2 space-y-1">
            <li>• SPP (Spicy Paneer Poppers)</li>
            <li>• JP (Jalapeño Poppers)</li>
            <li>• HCP (Halloumi Poppers)</li>
            <li>• Tray tracking (crumbed, fried, packed)</li>
            <li>• Batch codes with date-type-sequence</li>
          </ul>
        </div>
      )}

      {/* Modals - only show for paneer tab */}
      {activeTab === 'paneer' && (
      <>
      {/* Cut Modal */}
      <Modal isOpen={showCutModal} onClose={() => setShowCutModal(false)} title="Record Cutting" size="lg">
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Cut By</label>
            <input type="text" value={cutForm.cutBy} onChange={(e) => setCutForm({ ...cutForm, cutBy: e.target.value })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" placeholder="Worker name" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Cutting Type</label>
            <select value={cutForm.cuttingType} onChange={(e) => setCutForm({ ...cutForm, cuttingType: e.target.value })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white">
              <option value="">Select type</option>
              <option value="400g cubes">400g cubes</option>
              <option value="200g cubes">200g cubes</option>
              <option value="Restaurant blocks">Restaurant blocks</option>
              <option value="SPP pieces">SPP pieces</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Number of Blocks</label>
            <input type="number" value={cutForm.numberOfBlocks} onChange={(e) => {
              const num = parseInt(e.target.value);
              setCutForm({ ...cutForm, numberOfBlocks: num, blockWeights: Array(num).fill(0) });
            }} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" min="0" />
          </div>
          {cutForm.blockWeights.length > 0 && (
            <div>
              <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Block Weights (kg)</label>
              <div className="space-y-2 mt-1">
                {cutForm.blockWeights.map((weight, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <span className="text-sm w-20">Block {index + 1}:</span>
                    <input type="number" value={weight} onChange={(e) => {
                      const newWeights = [...cutForm.blockWeights];
                      newWeights[index] = parseFloat(e.target.value) || 0;
                      setCutForm({ ...cutForm, blockWeights: newWeights });
                    }} className="flex-1 px-3 py-1 border border-slate-200 rounded text-sm" step="0.1" min="0" />
                  </div>
                ))}
                <div className="text-sm font-medium mt-2 p-2 bg-slate-50 rounded">
                  Total: {cutForm.blockWeights.reduce((sum, w) => sum + w, 0).toFixed(2)} kg
                </div>
              </div>
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <button onClick={() => selectedRound && handleCut(selectedRound)} className="flex-1 px-4 py-2.5 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600">Save</button>
            <button onClick={() => setShowCutModal(false)} className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200">Cancel</button>
          </div>
        </div>
      </Modal>

      {/* Pack Modal */}
      <Modal isOpen={showPackModal} onClose={() => setShowPackModal(false)} title={selectedRound && productionRounds.find(r => r.id === selectedRound)?.packedSkus?.length ? "+Add Packing" : "Record Packing"}>
        <div className="space-y-4">
          {selectedRound && (() => {
            const round = productionRounds.find(r => r.id === selectedRound);
            const balance = round?.remainingBalance ?? round?.outputWeight ?? 0;
            const existingPacking = round?.packedSkus || [];
            return (
              <>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <p className="text-xs text-amber-800">
                    <strong>Available Balance:</strong> {balance.toFixed(2)} kg
                  </p>
                </div>
                {existingPacking.length > 0 && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <p className="text-xs text-blue-800 font-medium mb-2">Previous Packing Sessions:</p>
                    <div className="space-y-1">
                      {existingPacking.map((pack, idx) => (
                        <div key={idx} className="text-xs text-blue-700">
                          Session {idx + 1}: {pack.sku} - {pack.cases} cases + {pack.loose} loose
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            );
          })()}
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">SKU</label>
            <select value={packForm.sku} onChange={(e) => setPackForm({ ...packForm, sku: e.target.value })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white">
              <option value="">Select SKU</option>
              <option value="MPAN100">MPAN100 - Malai Paneer 1kg (15 kg/case)</option>
              <option value="MPAN400">MPAN400 - Malai Paneer 400g (9.6 kg/case)</option>
              <option value="MPAN200">MPAN200 - Malai Paneer 200g (4.8 kg/case)</option>
              <option value="RPAN100">RPAN100 - Rozana Paneer 1kg (15 kg/case)</option>
              <option value="RPAN400">RPAN400 - Rozana Paneer 400g (9.6 kg/case)</option>
              <option value="RPAN200">RPAN200 - Rozana Paneer 200g (4.8 kg/case)</option>
              <option value="SPP-200">SPP-200 - Spicy Paneer Poppers (1.32 kg/case)</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Cases</label>
              <input type="number" value={packForm.cases} onChange={(e) => setPackForm({ ...packForm, cases: parseInt(e.target.value) || 0 })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" min="0" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Loose Packets</label>
              <input type="number" value={packForm.loose} onChange={(e) => setPackForm({ ...packForm, loose: parseInt(e.target.value) || 0 })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" min="0" />
            </div>
          </div>
          {packForm.sku && selectedRound && (() => {
            const round = productionRounds.find(r => r.id === selectedRound);
            const balance = round?.remainingBalance ?? round?.outputWeight ?? 0;
            const weightPerCase = skuWeightPerCase[packForm.sku] || 0;
            const weightPerPacket = weightPerCase / 24;
            const totalWeightPacked = (packForm.cases * weightPerCase) + (packForm.loose * weightPerPacket);
            const newBalance = balance - totalWeightPacked;
            
            return (
              <div className={`rounded-lg p-3 ${newBalance < 0 ? 'bg-red-50 border border-red-200' : 'bg-slate-50'}`}>
                <p className="text-xs text-slate-600">
                  <strong>Packing Preview:</strong>{' '}
                  {totalWeightPacked.toFixed(2)} kg will be packed
                </p>
                <p className={`text-xs mt-1 ${newBalance < 0 ? 'text-red-700 font-medium' : 'text-slate-500'}`}>
                  New balance: {newBalance.toFixed(2)} kg
                  {newBalance < 0 && ' (over-packing)'}
                </p>
              </div>
            );
          })()}
          <div className="flex gap-2 pt-2">
            <button onClick={() => selectedRound && handlePack(selectedRound)} className="flex-1 px-4 py-2.5 bg-emerald-500 text-white rounded-lg text-sm font-medium hover:bg-emerald-600">Save Packing</button>
            <button onClick={() => setShowPackModal(false)} className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200">Cancel</button>
          </div>
        </div>
      </Modal>

      {/* PAN111 Modal */}
      <Modal isOpen={showPan111Modal} onClose={() => setShowPan111Modal(false)} title="Record PAN111 (Once per Milk Lot)">
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-xs text-amber-700">
              <strong>Note:</strong> PAN111 is recorded once per milk lot by the supervisor after all production is complete.
            </p>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Weight (kg)</label>
            <input type="number" value={pan111Form.weight} onChange={(e) => setPan111Form({ ...pan111Form, weight: parseFloat(e.target.value) || 0 })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" step="0.1" min="0" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Recorded By (Supervisor)</label>
            <input type="text" value={pan111Form.recordedBy} onChange={(e) => setPan111Form({ ...pan111Form, recordedBy: e.target.value })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" placeholder="Supervisor name" />
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={handleRecordPan111} className="flex-1 px-4 py-2.5 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700">Record PAN111</button>
            <button onClick={() => setShowPan111Modal(false)} className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200">Cancel</button>
          </div>
        </div>
      </Modal>

      {/* Cream Modal */}
      <Modal isOpen={showCreamModal} onClose={() => setShowCreamModal(false)} title="Record Cream Recovery (C/S Rounds Only)">
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-xs text-amber-700">
              <strong>Note:</strong> Cream is recovered from C/S (Rozana) rounds only. Record the weight of each bucket.
            </p>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Number of Buckets</label>
            <input 
              type="number" 
              value={creamForm.numberOfBuckets} 
              onChange={(e) => {
                const num = parseInt(e.target.value) || 0;
                setCreamForm({ ...creamForm, numberOfBuckets: num, bucketWeights: Array(num).fill(0) });
              }} 
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" 
              min="0" 
              placeholder="e.g., 3"
            />
          </div>
          {creamForm.numberOfBuckets > 0 && (
            <div>
              <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Bucket Weights (kg)</label>
              <div className="space-y-2 mt-1">
                {creamForm.bucketWeights.map((weight, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <span className="text-sm w-24">Bucket {index + 1}:</span>
                    <input 
                      type="number" 
                      value={weight} 
                      onChange={(e) => {
                        const newWeights = [...creamForm.bucketWeights];
                        newWeights[index] = parseFloat(e.target.value) || 0;
                        setCreamForm({ ...creamForm, bucketWeights: newWeights });
                      }} 
                      className="flex-1 px-3 py-1 border border-slate-200 rounded text-sm" 
                      step="0.1" 
                      min="0"
                      placeholder="Weight in kg"
                    />
                  </div>
                ))}
                <div className="text-sm font-medium mt-2 p-2 bg-slate-50 rounded">
                  Total: {creamForm.bucketWeights.reduce((sum, w) => sum + w, 0).toFixed(2)} kg
                </div>
              </div>
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Recorded By</label>
            <input 
              type="text" 
              value={creamForm.recordedBy} 
              onChange={(e) => setCreamForm({ ...creamForm, recordedBy: e.target.value })} 
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" 
              placeholder="Worker name" 
            />
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={handleRecordCream} className="flex-1 px-4 py-2.5 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700">Record Cream</button>
            <button onClick={() => setShowCreamModal(false)} className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200">Cancel</button>
          </div>
        </div>
      </Modal>

      {/* Temperature Modal */}
      <Modal isOpen={showTemperatureModal} onClose={() => { setShowTemperatureModal(false); setStartingTemperature(null); setSelectedVat(null); }} title="Record Starting Temperature">
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-blue-800">
              <strong>Vat:</strong> {selectedVat === 'vat2' ? 'Vat 2' : 'Vat 3'}
            </p>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Starting Temperature (°C)</label>
            <input 
              type="number" 
              value={startingTemperature || ''} 
              onChange={(e) => setStartingTemperature(parseFloat(e.target.value) || null)} 
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" 
              step="0.1"
              placeholder="e.g., 4.5"
              autoFocus
            />
            <p className="text-xs text-slate-500 mt-1">Enter the milk temperature when production starts</p>
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={handleRecordTemperature} className="flex-1 px-4 py-2.5 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700">Start Production</button>
            <button onClick={() => { setShowTemperatureModal(false); setStartingTemperature(null); setSelectedVat(null); }} className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200">Cancel</button>
          </div>
        </div>
      </Modal>

      {/* Round History Modal */}
      <Modal isOpen={showHistoryModal} onClose={() => { setShowHistoryModal(false); setHistoryRoundId(null); }} title="Round History">
        {historyRoundId && (() => {
          const round = productionRounds.find(r => r.id === historyRoundId);
          if (!round) return <div className="text-slate-500">Round not found</div>;
          
          const history: { stage: string; time: string; details: string }[] = [];
          
          // Build history based on round data
          history.push({
            stage: 'Scheduled',
            time: new Date(round.startTime).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
            details: `Round created for ${round.plannedInput}L`
          });
          
          if (round.vat) {
            history.push({
              stage: 'In Production',
              time: round.startingTemperature ? 'Recorded' : '',
              details: `${round.vat === 'vat2' ? 'Vat 2' : 'Vat 3'} • Starting temp: ${round.startingTemperature || 'N/A'}°C`
            });
          }
          
          if (round.pressingStartedAt) {
            history.push({
              stage: 'Pressing',
              time: new Date(round.pressingStartedAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
              details: '30 min timer'
            });
          }
          
          if (round.coolingStartedAt) {
            history.push({
              stage: 'Cooling',
              time: new Date(round.coolingStartedAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
              details: round.coolingLocation === 'tank' ? 'Cooling Tank (90 min)' : 'Chiller (120 min)'
            });
          }
          
          if (round.restingStartedAt) {
            history.push({
              stage: 'Resting',
              time: new Date(round.restingStartedAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
              details: '90 min timer'
            });
          }
          
          if (round.status === 'ready_cutting' || ['cut', 'clingwrapped', 'frozen', 'packed', 'handed_over'].includes(round.status)) {
            history.push({
              stage: 'Ready for Cutting',
              time: '',
              details: 'Paneer ready to cut'
            });
          }
          
          if (round.cutBy) {
            history.push({
              stage: 'Cut',
              time: '',
              details: `By ${round.cutBy} • ${round.cuttingType || 'N/A'} • ${round.numberOfBlocks || 0} blocks • ${round.outputWeight || 0} kg`
            });
          }
          
          if (round.status === 'clingwrapped') {
            history.push({
              stage: 'Clingwrapped',
              time: '',
              details: 'Stored in chiller'
            });
          }
          
          if (round.status === 'frozen' || ['packed', 'handed_over'].includes(round.status)) {
            history.push({
              stage: 'Frozen',
              time: '',
              details: 'Moved to freezer'
            });
          }
          
          if (round.packedSkus && round.packedSkus.length > 0) {
            round.packedSkus.forEach((pack, idx) => {
              history.push({
                stage: `Packing ${idx + 1}`,
                time: '',
                details: `${pack.sku} • ${pack.cases} cases + ${pack.loose} loose`
              });
            });
          }
          
          if (round.creamRecovered) {
            history.push({
              stage: 'Cream Recovered',
              time: round.creamRecoveredAt ? new Date(round.creamRecoveredAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '',
              details: `${round.creamRecovered} kg ${round.creamRecoveredBy ? `by ${round.creamRecoveredBy}` : ''}`
            });
          }
          
          if (round.status === 'handed_over') {
            history.push({
              stage: 'Handed Over',
              time: round.completedAt ? new Date(round.completedAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '',
              details: 'Distribution pickup'
            });
          }
          
          return (
            <div className="space-y-3">
              <div className="bg-slate-50 rounded-lg p-3 mb-4">
                <p className="text-sm font-medium text-slate-900">S{round.shiftNumber}/R{round.roundNumber} • {round.type}</p>
                <p className="text-xs text-slate-500 mt-1">Team: {round.team.join(', ')}</p>
              </div>
              <div className="space-y-2">
                {history.map((item, idx) => (
                  <div key={idx} className="flex gap-3 pb-3 border-b border-slate-100 last:border-0">
                    <div className="flex-shrink-0 w-2 h-2 rounded-full bg-indigo-500 mt-1.5"></div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-slate-900">{item.stage}</p>
                        {item.time && <p className="text-xs text-slate-500">{item.time}</p>}
                      </div>
                      <p className="text-xs text-slate-600 mt-0.5">{item.details}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* New Shift Modal */}
      <Modal isOpen={showNewShiftModal} onClose={() => setShowNewShiftModal(false)} title="Create New Shift">
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Milk Lot</label>
            <select value={newShift.milkLotId} onChange={(e) => setNewShift({ ...newShift, milkLotId: e.target.value })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white">
              <option value="">Select milk lot</option>
              {milkLots.map(lot => <option key={lot.id} value={lot.id}>{lot.lotCode}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Shift Number</label>
            <input type="number" value={newShift.shiftNumber} onChange={(e) => setNewShift({ ...newShift, shiftNumber: parseInt(e.target.value) })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" min="1" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Team (comma-separated)</label>
            <input type="text" value={newShift.team} onChange={(e) => setNewShift({ ...newShift, team: e.target.value })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" placeholder="e.g. Rajesh, Amit, Suresh" />
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={handleCreateShift} className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">Create Shift</button>
            <button onClick={() => setShowNewShiftModal(false)} className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200">Cancel</button>
          </div>
        </div>
      </Modal>

      {/* New Round Modal */}
      <Modal isOpen={showNewRoundModal} onClose={() => setShowNewRoundModal(false)} title="Create New Round">
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Shift</label>
            <select value={newRound.shiftId} onChange={(e) => handleShiftChange(e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white">
              <option value="">Select shift</option>
              {productionShifts.filter(s => s.status === 'active').map(s => (
                <option key={s.id} value={s.id}>Shift {s.shiftNumber} - {s.milkLotCode}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Round #</label>
              <input type="number" value={newRound.roundNumber} onChange={(e) => setNewRound({ ...newRound, roundNumber: parseInt(e.target.value) })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" min="1" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Type</label>
              <select value={newRound.type} onChange={(e) => setNewRound({ ...newRound, type: e.target.value as any })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white">
                <option value="D">D (Malai)</option>
                <option value="C/S">C/S (Rozana)</option>
                <option value="Halloumi">Halloumi</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Planned Input (L)</label>
            <input type="number" value={newRound.plannedInput} onChange={(e) => setNewRound({ ...newRound, plannedInput: parseInt(e.target.value) })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" min="0" />
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={handleCreateRound} className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700">Create Round</button>
            <button onClick={() => setShowNewRoundModal(false)} className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200">Cancel</button>
          </div>
        </div>
      </Modal>
      </>
      )}
    </div>
  );
}
