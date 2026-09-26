import { Fragment, useState, useEffect } from 'react';
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
import { getCreamBatchCode, milkStorageVessels, statusFlow, statusLabels, statusColors } from '../data/mockData';
import { getAllowedPaneerSkus, getPaneerPackWeight, paneerSkuByCode } from '../data/skuConfig';
import HalloumiTab from './HalloumiTab';
import ButterTab from './ButterTab';
import GheeTab from './GheeTab';
import CrumbingTab from './CrumbingTab';

const emptyPackForm = { sku: '', cases: 0, loose: 0, looseWeightKg: 0, weightKg: 0, reason: '' };

function roundDisplayCode(round: { type: string; shiftNumber: number; roundNumber: number }) {
  const prefix = round.type === 'Halloumi' ? 'HAL' : 'PAN';
  return `${prefix} S${round.shiftNumber}/R${round.roundNumber}`;
}

function StatusPipeline({ currentStatus }: { currentStatus: string }) {
  const currentIndex = statusFlow.indexOf(currentStatus as typeof statusFlow[number]);
  return (
    <div className="flex items-center gap-1.5" title={statusLabels[currentStatus]}>
      {statusFlow.map((step, i) => (
        <div key={step} className="flex items-center">
          <div className={`w-3.5 h-3.5 rounded-full ring-1 ring-white shadow-sm ${i <= currentIndex ? statusColors[step] : 'bg-slate-200'}`} title={statusLabels[step]} />
          {i < statusFlow.length - 1 && <div className={`w-3 h-1 rounded-full ${i < currentIndex ? statusColors[step] : 'bg-slate-200'}`} />}
        </div>
      ))}
    </div>
  );
}

export default function ProductionBoard() {
  const { 
    productionRounds, productionShifts, intermediateLots, milkLots,
    advanceRoundStatus, updateProductionRound, addProductionRound, createProductionRound,
    addProductionShift, updateProductionShift, addIntermediateLot,
    updateMilkLot
  } = useApp();
  const { showToast } = useToast();
  const currentRole = typeof window === 'undefined' ? '' : window.localStorage.getItem('vejoy_user_role')?.toLowerCase() || '';
  const canForceStage = currentRole === 'admin' || currentRole === 'owner';
  const isOwner = currentRole === 'owner';
  const editableStageOptions = [...statusFlow, 'spp_pending', 'pan111_pending'] as string[];
  
  const [activeTab, setActiveTab] = useState<'paneer' | 'halloumi' | 'butter' | 'ghee' | 'crumbing'>('paneer');
  const [filters, setFilters] = useState({ milkLot: '', status: 'all', type: 'all', shift: 'all', balance: 'all', workflow: 'all', query: '' });
  const [showFilters, setShowFilters] = useState(false);
  const [selectedRound, setSelectedRound] = useState<string | null>(null);
  const [showNewRoundModal, setShowNewRoundModal] = useState(false);
  const [showNewShiftModal, setShowNewShiftModal] = useState(false);
  const [showCutModal, setShowCutModal] = useState(false);
  const [showPackModal, setShowPackModal] = useState(false);
  const [showPan111Modal, setShowPan111Modal] = useState(false);
  const [showCreamModal, setShowCreamModal] = useState(false);
  const [showTemperatureModal, setShowTemperatureModal] = useState(false);
  const [showSppModal, setShowSppModal] = useState(false);
  const [startingTemperature, setStartingTemperature] = useState<number | null>(null);
  const [selectedVat, setSelectedVat] = useState<'vat2' | 'vat3' | null>(null);
  const [collapsedShifts, setCollapsedShifts] = useState<Set<string>>(new Set());
  const [expandedBlockRoundIds, setExpandedBlockRoundIds] = useState<Set<string>>(new Set());
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyRoundId, setHistoryRoundId] = useState<string | null>(null);
  const [blockWeightsRoundId, setBlockWeightsRoundId] = useState<string | null>(null);
  const [blockWeightsDraft, setBlockWeightsDraft] = useState<number[]>([]);
  
  // Timer state
  const [timers, setTimers] = useState<Record<string, number>>({});
  
  // Cut form state
  const [cutForm, setCutForm] = useState({
    cutBy: '',
    cuttingType: '',
    numberOfBlocks: 0,
    blockWeights: [] as number[],
  });
  const [sppForm, setSppForm] = useState({ cutBy: '', numberOfBlocks: 0, recordedWeight: 0, balanceDisposition: '', balanceWeight: 0 });
  
  // Pack form state
  const [packForm, setPackForm] = useState({
    sku: '',
    cases: 0,
    loose: 0,
    looseWeightKg: 0,
    weightKg: 0,
    reason: '',
  });
  const [editingPackIndex, setEditingPackIndex] = useState<number | null>(null);
  
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
    sourceVessel: '',
    team: '',
  });

  const newestMilkLot = [...milkLots].sort((a, b) => {
    const aDate = new Date(`${a.receiptDate}T${a.receiptTime || '00:00'}`).getTime();
    const bDate = new Date(`${b.receiptDate}T${b.receiptTime || '00:00'}`).getTime();
    return bDate - aDate;
  })[0];
  const selectedMilkLotId = filters.milkLot || newestMilkLot?.id || '';
  const activeMilkLot = milkLots.find((m) => m.id === selectedMilkLotId);

  useEffect(() => {
    if (selectedMilkLotId && filters.milkLot !== selectedMilkLotId) {
      setFilters(current => ({ ...current, milkLot: selectedMilkLotId, shift: 'all' }));
    }
  }, [filters.milkLot, selectedMilkLotId]);

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
    if (round.milkLotId !== selectedMilkLotId) return false;
    if (filters.status !== 'all' && round.status !== filters.status) return false;
    if (filters.type !== 'all' && round.type !== filters.type) return false;
    if (filters.shift !== 'all' && round.shiftId !== filters.shift) return false;
    if (filters.balance !== 'all') {
      const balance = round.remainingBalance;
      if (filters.balance === 'balance_left' && !(balance !== undefined && balance > 0.01)) return false;
      if (filters.balance === 'overpacked' && !(balance !== undefined && balance < -0.01)) return false;
      if (filters.balance === 'fully_packed' && !((balance !== undefined && Math.abs(balance) <= 0.01) || (balance === undefined && round.status === 'packed'))) return false;
      if (filters.balance === 'no_balance' && !(balance === undefined && round.status !== 'packed')) return false;
    }
    if (filters.workflow !== 'all') {
      const isSpp = round.cuttingType === 'SPP pieces' || round.status === 'spp_pending' || round.sppRecordedWeight !== undefined;
      const isPan111 = round.status === 'pan111_pending' || round.pan111ApprovalStatus !== undefined || round.packedSkus?.some((pack) => pack.sku === 'PAN111');
      const isClingwrapped = round.cuttingType === 'Clingwrapped / Stored' || round.status === 'clingwrapped';
      if (filters.workflow === 'spp' && !isSpp) return false;
      if (filters.workflow === 'pan111' && !isPan111) return false;
      if (filters.workflow === 'clingwrapped' && !isClingwrapped) return false;
    }
    const query = filters.query.trim().toLowerCase();
    if (query) {
      const searchable = `${round.milkLotCode} s${round.shiftNumber}/r${round.roundNumber} ${round.type} ${round.status} ${(round.cutBy || '')} ${(round.team || []).join(' ')}`.toLowerCase();
      if (!searchable.includes(query)) return false;
    }
    return true;
  });

  // The Paneer board is intentionally limited to its two Paneer workflows.
  // Other product types have their own dedicated tabs below.
  const paneerRounds = filteredRounds.filter((round) => round.type === 'D' || round.type === 'C/S');

  // Group rounds by shift
  const groupedByShift = paneerRounds.reduce((acc, round) => {
    if (!acc[round.shiftId]) acc[round.shiftId] = [];
    acc[round.shiftId].push(round);
    return acc;
  }, {} as Record<string, typeof productionRounds>);

  // Get active shifts (latest first)
  const hasRoundFilters = filters.status !== 'all' || filters.type !== 'all' || filters.shift !== 'all' || filters.balance !== 'all' || filters.workflow !== 'all' || filters.query.trim() !== '';
  const activeShifts = productionShifts
    .filter(s => s.milkLotId === selectedMilkLotId && (groupedByShift[s.id] || (!hasRoundFilters && s.status !== 'completed')))
    .sort((a, b) => b.shiftNumber - a.shiftNumber);
  const hasSelectedLotBoard = activeShifts.length > 0;

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

    if (!cutForm.cutBy || !cutForm.cuttingType || cutForm.numberOfBlocks <= 0 || totalWeight <= 0) {
      showToast('error', 'Enter cutter, cutting option, block count, and block weights');
      return;
    }

    if (cutForm.cuttingType === 'SPP pieces') {
      if (!cutForm.cutBy || cutForm.numberOfBlocks <= 0 || totalWeight <= 0) {
        showToast('error', 'Enter cutter, block count, and block weights for SPP');
        return;
      }
      updateProductionRound(roundId, {
        status: 'spp_pending',
        cutBy: cutForm.cutBy,
        numberOfBlocks: cutForm.numberOfBlocks,
        blockWeights: cutForm.blockWeights,
        outputWeight: totalWeight,
        cuttingType: 'SPP pieces',
      });
      setSppForm({ cutBy: cutForm.cutBy, numberOfBlocks: cutForm.numberOfBlocks, recordedWeight: 0, balanceDisposition: '', balanceWeight: 0 });
      setShowCutModal(false);
      setShowSppModal(true);
      return;
    }

    const isClingwrapStorage = cutForm.cuttingType === 'Clingwrapped / Stored';
    const isFinalCutAfterStorage = round.status === 'clingwrapped';
    if (isClingwrapStorage) {
      updateProductionRound(roundId, {
        status: 'clingwrapped',
        cutBy: cutForm.cutBy,
        cuttingType: 'Clingwrapped / Stored',
        numberOfBlocks: cutForm.numberOfBlocks,
        blockWeights: cutForm.blockWeights,
        outputWeight: totalWeight,
        remainingBalance: totalWeight,
        storedCutBy: cutForm.cutBy,
        storedNumberOfBlocks: cutForm.numberOfBlocks,
        storedBlockWeights: cutForm.blockWeights,
        storedOutputWeight: totalWeight,
        clingwrappedAt: new Date().toISOString(),
      });
      showToast('success', `Stored ${cutForm.numberOfBlocks} clingwrapped blocks (${totalWeight.toFixed(2)} kg)`);
      setShowCutModal(false);
      setCutForm({ cutBy: '', cuttingType: '', numberOfBlocks: 0, blockWeights: [] });
      return;
    }
    
    updateProductionRound(roundId, {
      status: 'cut',
      cutBy: cutForm.cutBy,
      cuttingType: cutForm.cuttingType,
      numberOfBlocks: cutForm.numberOfBlocks,
      blockWeights: cutForm.blockWeights,
      outputWeight: totalWeight,
      remainingBalance: totalWeight,
      ...(isFinalCutAfterStorage ? {
        // Keep the original large-block record for audit/review after final cutting.
        storedBlockWeights: round.storedBlockWeights || round.blockWeights,
        storedNumberOfBlocks: round.storedNumberOfBlocks || round.numberOfBlocks,
        storedCutBy: round.storedCutBy || round.cutBy,
        storedOutputWeight: round.storedOutputWeight || round.outputWeight,
      } : {}),
    });

    showToast('success', `Cut recorded: ${cutForm.numberOfBlocks} blocks, ${totalWeight.toFixed(2)} kg`);
    setShowCutModal(false);
    setCutForm({ cutBy: '', cuttingType: '', numberOfBlocks: 0, blockWeights: [] });
  };

  const handleRecordSppWeight = (roundId: string) => {
    const round = productionRounds.find(item => item.id === roundId);
    if (!round) return;
    const totalWeight = (round.blockWeights || []).reduce((sum, weight) => sum + weight, 0);
    const balance = totalWeight - sppForm.recordedWeight;
    if (!sppForm.cutBy || sppForm.numberOfBlocks <= 0 || sppForm.recordedWeight <= 0 || balance < -0.01) {
      showToast('error', 'Enter a valid SPP weight not greater than the round total');
      return;
    }
    if (balance > 0.01 && !sppForm.balanceDisposition) {
      showToast('error', 'Record how the balance Paneer was used');
      return;
    }
    updateProductionRound(roundId, {
      status: 'cut',
      cutBy: sppForm.cutBy,
      numberOfBlocks: sppForm.numberOfBlocks,
      cuttingType: 'SPP pieces',
      sppRecordedWeight: sppForm.recordedWeight,
      outputWeight: totalWeight,
      remainingBalance: Math.max(0, balance),
      balancePaneerWeight: Math.max(0, balance),
      balanceDisposition: balance > 0 ? sppForm.balanceDisposition : undefined,
      balanceDispositionWeight: balance > 0 ? balance : undefined,
    });
    setShowSppModal(false);
    showToast('success', `Recorded ${sppForm.recordedWeight.toFixed(2)} kg for SPP`);
  };

  const handleFreeze = (roundId: string) => {
    updateProductionRound(roundId, { status: 'frozen' });
    showToast('success', 'Moved to freezer');
  };

  const handlePack = (roundId: string) => {
    const round = productionRounds.find(r => r.id === roundId);
    if (!round) return;
    const definition = paneerSkuByCode[packForm.sku];
    if (!definition || !getAllowedPaneerSkus(round.type as 'D' | 'C/S', round.cuttingType).some(item => item.sku === packForm.sku)) {
      showToast('error', 'That SKU is not permitted for this paneer type or cutting option');
      return;
    }
    if (definition.packMode === 'weight_only' && packForm.reason.trim().length < 3) {
      showToast('error', 'Enter a reason before recording PAN111');
      return;
    }
    const totalWeightPacked = getPaneerPackWeight(definition, packForm.cases, packForm.loose, packForm.looseWeightKg, packForm.weightKg);
    if (totalWeightPacked <= 0) {
      showToast('error', definition.packMode === 'weight_only' ? 'Enter a PAN111 weight' : 'Enter cases, loose packets, or loose weight');
      return;
    }

    // When correcting an existing packing entry, return its old weight to the
    // balance before applying the corrected values.
    const existingPacked = round.packedSkus || [];
    const previousPack = editingPackIndex !== null ? existingPacked[editingPackIndex] : undefined;
    const previousWeight = previousPack ? getPaneerPackWeight(paneerSkuByCode[previousPack.sku], previousPack.cases, previousPack.loose, previousPack.looseWeightKg || 0, previousPack.weightKg || 0) : 0;
    const currentBalance = (round.remainingBalance ?? round.outputWeight ?? 0) + previousWeight;
    const newBalance = currentBalance - totalWeightPacked;

    if (definition.packMode === 'weight_only' && editingPackIndex === null) {
      if (totalWeightPacked > currentBalance + 0.01) {
        showToast('error', `PAN111 weight cannot exceed the available balance of ${currentBalance.toFixed(2)} kg`);
        return;
      }
      updateProductionRound(roundId, {
        status: 'pan111_pending',
        locked: false,
        pan111ApprovalStatus: 'pending',
        pan111ApprovalReason: packForm.reason.trim(),
        pan111RequestedWeight: totalWeightPacked,
        pan111PreviousStatus: round.status,
        pan111ApprovalRequestedAt: new Date().toISOString(),
      });
      setShowPackModal(false);
      setPackForm(emptyPackForm);
      showToast('success', `PAN111 request submitted: ${totalWeightPacked.toFixed(2)} kg. Awaiting owner/admin approval.`);
      return;
    }

    // Add to packed SKUs array
    const replacement = {
      sku: packForm.sku,
      cases: definition.packMode === 'weight_only' ? 0 : packForm.cases,
      loose: definition.packMode === 'weight_only' ? 0 : packForm.loose,
      ...(definition.packMode === 'weight_loose' ? { looseWeightKg: packForm.looseWeightKg } : {}),
      ...(definition.packMode === 'weight_only' ? { weightKg: totalWeightPacked, reason: packForm.reason.trim() } : {}),
    };
    const newPackedSkus = editingPackIndex !== null
      ? existingPacked.map((pack, index) => index === editingPackIndex ? replacement : pack)
      : [...existingPacked, replacement];

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
    setPackForm(emptyPackForm);
    setEditingPackIndex(null);
  };

  const handleApprovePan111 = (roundId: string) => {
    const round = productionRounds.find(item => item.id === roundId);
    const weight = round?.pan111RequestedWeight || 0;
    if (!round || round.pan111ApprovalStatus !== 'pending' || weight <= 0) return;
    const now = new Date();
    const useByDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const packedSkus = [...(round.packedSkus || []), { sku: 'PAN111', cases: 0, loose: 0, weightKg: weight, reason: round.pan111ApprovalReason }];
    addIntermediateLot({
      lotCode: `PAN111-${round.milkLotCode}-S${round.shiftNumber}-R${round.roundNumber}`,
      productId: 'pan111', productName: 'PAN111 (Round Recovered)', productClass: 'intermediate',
      sourceBatchId: round.id, sourceBatchCode: `${round.milkLotCode}/S${round.shiftNumber}/R${round.roundNumber}/${round.type}`,
      producedQuantity: weight, currentQuantity: weight, uom: 'kg', storageLocation: 'Chiller', status: 'available', producedAt: now.toISOString(),
      sourceMilkLotCode: round.milkLotCode, sourceShift: round.shiftNumber, sourceRound: round.roundNumber,
      qualityClass: 'round_recovered', shelfLifeDays: 7, useByDate: useByDate.toISOString(), priorityUse: true,
    });
    updateProductionRound(roundId, {
      status: 'packed', locked: true, packedSkus, remainingBalance: 0,
      pan111ApprovalStatus: 'approved', pan111ApprovedAt: now.toISOString(), pan111ApprovedBy: currentRole,
      pan111RequestedWeight: undefined, pan111PreviousStatus: undefined,
    });
    showToast('success', `PAN111 approved: ${weight.toFixed(2)} kg is now available for priority use`);
  };

  const handleRejectPan111 = (roundId: string) => {
    const round = productionRounds.find(item => item.id === roundId);
    if (!round || round.pan111ApprovalStatus !== 'pending') return;
    updateProductionRound(roundId, {
      status: round.pan111PreviousStatus || 'cut', locked: false, pan111ApprovalStatus: 'rejected',
      pan111RejectedAt: new Date().toISOString(), pan111RejectedBy: currentRole,
      pan111RequestedWeight: undefined, pan111PreviousStatus: undefined,
    });
    showToast('success', 'PAN111 request rejected. The balance is available for normal paneer packing or SPP routing.');
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
    
    if (pan111Form.weight <= 0) {
      showToast('error', 'Enter a PAN111 weight');
      return;
    }
    const useByDate = new Date(Date.now() + 730 * 24 * 60 * 60 * 1000);
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
      qualityClass: 'standard',
      shelfLifeDays: 730,
      useByDate: useByDate.toISOString(),
      priorityUse: false,
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

    // Update the milk lot's cream pool
    const milkLot = milkLots.find(m => m.id === round.milkLotId);
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
          roundsContributed: [...existingPool.roundsContributed, round.id],
        },
      });
    }

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

    showToast('success', `Cream recorded: ${totalWeight.toFixed(2)} kg (${creamForm.numberOfBuckets} buckets) - Added to milk lot pool`);
    setShowCreamModal(false);
    setCreamForm({ numberOfBuckets: 0, bucketWeights: [], recordedBy: '' });
  };

  const handleCreateShift = () => {
    const milkLotId = newShift.milkLotId || selectedMilkLotId;
    if (!milkLotId) {
      showToast('error', 'Select a milk lot before creating a shift');
      return;
    }
    const milkLot = milkLots.find(m => m.id === milkLotId);
    if (!milkLot) return;
    if (milkLot.productionClosed) {
      showToast('error', `Production for milk lot ${milkLot.lotCode} is closed`);
      return;
    }

    addProductionShift({
      milkLotId,
      milkLotCode: milkLot.lotCode,
      shiftNumber: newShift.shiftNumber,
      startedAt: new Date(newShift.startedAt).toISOString(),
      team: newShift.team.split(',').map(t => t.trim()).filter(Boolean),
      teamNotes: newShift.teamNotes || undefined,
      status: 'active',
    });
    showToast('success', `Shift ${newShift.shiftNumber} created`);
    setShowNewShiftModal(false);
    setNewShift({ milkLotId: selectedMilkLotId, shiftNumber: 1, team: '', startedAt: new Date().toISOString().slice(0, 16), teamNotes: '' });
  };

  const handleEndShift = (shiftId: string) => {
    updateProductionShift(shiftId, { status: 'completed', endedAt: new Date().toISOString() });
    showToast('success', 'Shift ended');
  };

  const getLatestActiveShift = () => {
    return productionShifts
      .filter(s => s.status === 'active' && s.milkLotId === selectedMilkLotId)
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())[0] || null;
  };

  const availableRoundShifts = productionShifts
    .filter(s => s.status === 'active' && s.milkLotId === selectedMilkLotId)
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

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
      sourceVessel: '',
      team: '',
    });
    setShowNewRoundModal(true);
  };

  const handleCreateRound = () => {
    if (!newRound.shiftId || !newRound.sourceVessel) {
      showToast('error', 'Please select a shift and milk vessel');
      return;
    }
    const shift = productionShifts.find(s => s.id === newRound.shiftId);
    if (!shift) return;
    const milkLot = milkLots.find(m => m.id === shift.milkLotId);
    if (milkLot?.productionClosed) {
      showToast('error', `Production for milk lot ${milkLot.lotCode} is closed`);
      return;
    }

    void createProductionRound({
      milkLotId: shift.milkLotId,
      milkLotCode: shift.milkLotCode,
      shiftId: shift.id,
      shiftNumber: shift.shiftNumber,
      type: newRound.type,
      status: 'scheduled',
      team: newRound.team ? newRound.team.split(',').map(t => t.trim()).filter(Boolean) : shift.team,
      plannedInput: newRound.plannedInput,
      actualInput: 0,
      sourceVessel: newRound.sourceVessel,
      outputWeight: 0,
      startTime: new Date().toISOString(),
      locked: false,
    }).then((createdRound) => {
      if (createdRound) {
        showToast('success', `Round created: ${roundDisplayCode(createdRound)}`);
        setShowNewRoundModal(false);
      } else showToast('error', 'The server could not create this round');
    });
  };

  const handleShiftChange = (shiftId: string) => {
    const existingRoundsInShift = productionRounds.filter(r => r.shiftId === shiftId).length;
    setNewRound({ ...newRound, shiftId, roundNumber: existingRoundsInShift + 1 });
  };

  const handleStageChange = (roundId: string, nextStatus: string) => {
    if (!canForceStage) return;
    const round = productionRounds.find(item => item.id === roundId);
    if (!round || round.status === nextStatus) return;
    if (!window.confirm(`Set ${roundDisplayCode(round)} to ${statusLabels[nextStatus] || nextStatus}?`)) return;
    const now = new Date().toISOString();
    const stageUpdates: any = { status: nextStatus, locked: nextStatus === 'handed_over' };
    if (nextStatus === 'pressing') stageUpdates.pressingStartedAt = now;
    if (nextStatus === 'cooling') stageUpdates.coolingStartedAt = now;
    if (nextStatus === 'resting') stageUpdates.restingStartedAt = now;
    updateProductionRound(roundId, stageUpdates);
    showToast('success', `Stage changed to ${statusLabels[nextStatus] || nextStatus}`);
  };

  const openBlockWeights = (roundId: string) => {
    const round = productionRounds.find(item => item.id === roundId);
    if (!round) return;
    setBlockWeightsRoundId(roundId);
    setBlockWeightsDraft([...(round.blockWeights || [])]);
  };

  const saveBlockWeights = () => {
    if (!blockWeightsRoundId || !canForceStage) return;
    const round = productionRounds.find(item => item.id === blockWeightsRoundId);
    if (!round || blockWeightsDraft.some(weight => weight < 0)) return;
    const totalWeight = blockWeightsDraft.reduce((sum, weight) => sum + weight, 0);
    const sppBalance = round.sppRecordedWeight !== undefined ? Math.max(0, totalWeight - round.sppRecordedWeight) : undefined;
    updateProductionRound(blockWeightsRoundId, {
      blockWeights: blockWeightsDraft,
      numberOfBlocks: blockWeightsDraft.length,
      outputWeight: totalWeight,
      ...(sppBalance !== undefined ? { balancePaneerWeight: sppBalance, remainingBalance: sppBalance } : {}),
    });
    setBlockWeightsRoundId(null);
    showToast('success', 'Block weights corrected');
  };

  const openCreamModal = (roundId: string) => {
    setSelectedRound(roundId);
    setCreamForm({ numberOfBuckets: 0, bucketWeights: [], recordedBy: '' });
    setShowCreamModal(true);
  };

  // Each action lives with the value it changes: process controls under
  // Current Stage, cutting controls under Cut Into, packing under Packed Into,
  // and only the owner hand-over control remains in Actions.
  const renderCreamAction = (round: any) => {
    const creamStages = ['in_production', 'coagulation', 'pressing', 'cooling', 'resting', 'ready_cutting', 'cut', 'clingwrapped', 'frozen', 'packed'];
    if (round.type !== 'C/S' || round.creamRecovered !== undefined || !creamStages.includes(round.status)) return null;
    return <button onClick={() => openCreamModal(round.id)} className="mt-1 flex w-fit items-center rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-100">+ Cream</button>;
  };

  const getStageActionButtons = (round: any) => {
    if (round.status === 'scheduled') {
      return <div className="mt-1 flex flex-wrap gap-1">
        <button onClick={() => handleVatSelection(round.id, 'vat2')} className="rounded bg-purple-500 px-2 py-1 text-xs text-white hover:bg-purple-600">Vat 2</button>
        <button onClick={() => handleVatSelection(round.id, 'vat3')} className="rounded bg-purple-500 px-2 py-1 text-xs text-white hover:bg-purple-600">Vat 3</button>
      </div>;
    }
    if (round.status === 'in_production') {
      return <div className="mt-1 flex flex-wrap gap-1"><button onClick={() => handleStartCoagulation(round.id)} className="rounded bg-violet-500 px-2 py-1 text-xs text-white hover:bg-violet-600">Start Coagulation</button></div>;
    }
    if (round.status === 'coagulation') {
      return <div className="mt-1 flex flex-wrap gap-1"><button onClick={() => handleStartPressing(round.id)} className="rounded bg-purple-500 px-2 py-1 text-xs text-white hover:bg-purple-600">Start Pressing</button></div>;
    }
    if (round.status === 'pressing') {
      const timer = timers[round.id] || 0;
      return <div className="mt-1 flex flex-wrap items-center gap-2">
        <Timer className="h-4 w-4 text-purple-500" />
        <span className="font-mono text-xs font-bold">{formatTime(timer)}</span>
        {timer === 0 && <>
          <span className="text-xs font-bold text-emerald-600">✓ Ready for Cooling</span>
          <button onClick={() => handleStartCooling(round.id, 'tank')} className="rounded bg-cyan-500 px-2 py-1 text-xs text-white hover:bg-cyan-600">Tank</button>
          <button onClick={() => handleStartCooling(round.id, 'chiller')} className="rounded bg-cyan-500 px-2 py-1 text-xs text-white hover:bg-cyan-600">Chiller</button>
        </>}
      </div>;
    }
    if (round.status === 'resting') {
      const timer = timers[round.id] || 0;
      return <div className="mt-1 flex flex-wrap items-center gap-2">
        <Timer className="h-4 w-4 text-teal-500" />
        <span className="font-mono text-xs font-bold">{formatTime(timer)}</span>
        {timer === 0 && <>
          <span className="text-xs font-bold text-emerald-600">✓ Ready for Cutting</span>
          <button onClick={() => handleReadyForCutting(round.id)} className="rounded bg-amber-500 px-2 py-1 text-xs text-white hover:bg-amber-600">Start Cutting</button>
        </>}
      </div>;
    }
    if (round.status === 'cut' && round.cuttingType !== 'SPP pieces') {
      return <div className="mt-1 flex flex-wrap gap-1"><button onClick={() => handleFreeze(round.id)} className="rounded bg-indigo-500 px-2 py-1 text-xs text-white hover:bg-indigo-600">Freeze</button></div>;
    }
    return null;
  };

  const getCutActionButtons = (round: any) => {
    if (round.status === 'ready_cutting') {
      return <button onClick={() => { setSelectedRound(round.id); setCutForm({ cutBy: '', cuttingType: '', numberOfBlocks: 0, blockWeights: [] }); setShowCutModal(true); }} className="mt-1 flex w-fit items-center gap-1 rounded bg-orange-500 px-2 py-1 text-xs text-white hover:bg-orange-600"><Scissors className="h-3 w-3" /> Cut</button>;
    }
    if (round.status === 'clingwrapped') {
      return <button onClick={() => { setSelectedRound(round.id); setCutForm({ cutBy: '', cuttingType: '', numberOfBlocks: 0, blockWeights: [] }); setShowCutModal(true); }} className="mt-1 flex w-fit items-center gap-1 rounded bg-orange-500 px-2 py-1 text-xs text-white hover:bg-orange-600"><Scissors className="h-3 w-3" /> Final Cut</button>;
    }
    if (round.status === 'spp_pending' && round.cuttingType === 'SPP pieces') {
      return <button onClick={() => { setSelectedRound(round.id); setSppForm({ cutBy: round.cutBy || '', numberOfBlocks: round.numberOfBlocks || 0, recordedWeight: 0, balanceDisposition: '', balanceWeight: 0 }); setShowSppModal(true); }} className="mt-1 flex w-fit rounded bg-pink-600 px-2 py-1 text-xs font-medium text-white hover:bg-pink-700">Record SPP Weight</button>;
    }
    return null;
  };

  const getActionButtons = (round: any) => {
    if (round.pan111ApprovalStatus === 'pending') {
      return canForceStage ? <div className="flex flex-wrap items-center gap-1"><span className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700">PAN111 {round.pan111RequestedWeight?.toFixed(2)} kg · {round.pan111ApprovalReason}</span><button onClick={() => handleApprovePan111(round.id)} className="rounded bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-700">Approve</button><button onClick={() => handleRejectPan111(round.id)} className="rounded bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-700">Reject</button></div> : <span className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700">Awaiting PAN111 approval</span>;
    }
    if (!isOwner || round.status !== 'packed') return null;
    return <button onClick={() => handleHandover(round.id)} className="flex w-fit items-center gap-1 rounded bg-emerald-700 px-2 py-1 text-xs text-white hover:bg-emerald-800"><CheckCircle2 className="h-3 w-3" /> Hand Over</button>;
  };

  const selectedPackRound = selectedRound ? productionRounds.find(r => r.id === selectedRound) : undefined;
  const allowedPackSkus = selectedPackRound && (selectedPackRound.type === 'D' || selectedPackRound.type === 'C/S')
    ? getAllowedPaneerSkus(selectedPackRound.type, selectedPackRound.cuttingType)
    : [];

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
            Milk Lot: <span className="font-medium text-slate-700">{activeMilkLot?.lotCode ?? 'No lot selected'}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedMilkLotId}
            onChange={(event) => setFilters(current => ({ ...current, milkLot: event.target.value, shift: 'all' }))}
            className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700"
            aria-label="Select production milk lot"
          >
            {milkLots.slice(0, 4).map((lot) => (
              <option key={lot.id} value={lot.id}>Lot {lot.lotCode}</option>
            ))}
            {milkLots.length > 4 && <option disabled>Older lots</option>}
            {milkLots.slice(4).map((lot) => (
              <option key={lot.id} value={lot.id}>Lot {lot.lotCode}</option>
            ))}
          </select>
          {activeTab === 'paneer' && (
            <button onClick={() => setShowPan111Modal(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-amber-600 text-white hover:bg-amber-700 transition-colors">
              <AlertTriangle className="w-4 h-4" /> Record PAN111
            </button>
          )}
          {activeTab === 'paneer' && (
            <button onClick={() => setShowFilters(!showFilters)} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${showFilters ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'}`}>
              <Filter className="w-4 h-4" /> Filters{(filters.status !== 'all' || filters.type !== 'all' || filters.shift !== 'all' || filters.balance !== 'all' || filters.workflow !== 'all' || filters.query) ? ` · ${[filters.status !== 'all', filters.type !== 'all', filters.shift !== 'all', filters.balance !== 'all', filters.workflow !== 'all', Boolean(filters.query)].filter(Boolean).length}` : ''}
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
      {!hasSelectedLotBoard && activeMilkLot && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-emerald-900">Fresh production board for lot {activeMilkLot.lotCode}</p>
            <p className="text-sm text-emerald-700 mt-1">
              {activeMilkLot.litresReceived.toLocaleString()} L received. No shifts or rounds have been created for this lot yet.
            </p>
          </div>
          <button onClick={() => setShowNewShiftModal(true)} className="shrink-0 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors">
            <Plus className="w-4 h-4" /> Create first shift
          </button>
        </div>
      )}
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
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Search rounds</label>
            <input value={filters.query} onChange={(e) => setFilters({ ...filters, query: e.target.value })} placeholder="Batch, S5/R2, cutter, team..." className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Milk Lot</label>
            <select value={selectedMilkLotId} onChange={(e) => setFilters({ ...filters, milkLot: e.target.value, shift: 'all' })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white">
              {milkLots.map((lot) => <option key={lot.id} value={lot.id}>{lot.lotCode}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Status</label>
            <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white">
              <option value="all">All Statuses</option>
              {[...statusFlow, 'spp_pending', 'pan111_pending'].map((s) => <option key={s} value={s}>{statusLabels[s] || s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Type</label>
            <select value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white">
              <option value="all">All Types</option>
              <option value="D">D (Malai)</option>
              <option value="C/S">C/S (Rozana)</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Shift</label>
            <select value={filters.shift} onChange={(e) => setFilters({ ...filters, shift: e.target.value })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white">
              <option value="all">All Shifts</option>
              {productionShifts.map(s => <option key={s.id} value={s.id}>Shift {s.shiftNumber}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Packing balance</label>
            <select value={filters.balance} onChange={(e) => setFilters({ ...filters, balance: e.target.value })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white">
              <option value="all">All balances</option>
              <option value="balance_left">Balance left</option>
              <option value="overpacked">Over-packed</option>
              <option value="fully_packed">Fully packed</option>
              <option value="no_balance">No balance recorded</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Workflow</label>
            <select value={filters.workflow} onChange={(e) => setFilters({ ...filters, workflow: e.target.value })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white">
              <option value="all">All workflows</option>
              <option value="spp">SPP pieces</option>
              <option value="pan111">PAN111</option>
              <option value="clingwrapped">Clingwrapped</option>
            </select>
          </div>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
            <p className="text-xs text-slate-500">Showing {paneerRounds.length} matching Paneer round{paneerRounds.length === 1 ? '' : 's'}.</p>
            <button onClick={() => setFilters({ milkLot: selectedMilkLotId, status: 'all', type: 'all', shift: 'all', balance: 'all', workflow: 'all', query: '' })} className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50">Clear filters</button>
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
                  <table className="production-board-table w-full text-xs">
                    <colgroup>
                      <col style={{ width: '9rem' }} />
                      <col style={{ width: '10rem' }} />
                      <col style={{ width: '7rem' }} />
                      <col style={{ width: '8rem' }} />
                      <col style={{ width: '16rem' }} />
                      <col style={{ width: '8rem' }} />
                      <col style={{ width: '16rem' }} />
                      <col style={{ width: '12rem' }} />
                      <col style={{ width: '15rem' }} />
                      <col style={{ width: '18rem' }} />
                      <col style={{ width: '29rem' }} />
                    </colgroup>
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="sticky left-0 z-20 bg-white px-2 py-2 text-left font-medium text-slate-500 text-[10px] uppercase tracking-wide shadow-[2px_0_3px_rgba(15,23,42,0.08)]">Batch ID</th>
                        <th className="px-2 py-2 text-left font-medium text-slate-500 text-[10px] uppercase tracking-wide">Milk Qty</th>
                        <th className="px-2 py-2 text-left font-medium text-slate-500 text-[10px] uppercase tracking-wide">Milk °C</th>
                        <th className="px-2 py-2 text-left font-medium text-slate-500 text-[10px] uppercase tracking-wide">Type</th>
                        <th className="px-2 py-2 text-left font-medium text-slate-500 text-[10px] uppercase tracking-wide">Current Stage</th>
                        <th className="px-2 py-2 text-left font-medium text-slate-500 text-[10px] uppercase tracking-wide">Blocks</th>
                        <th className="px-2 py-2 text-left font-medium text-slate-500 text-[10px] uppercase tracking-wide">Block Weights</th>
                        <th className="px-2 py-2 text-left font-medium text-slate-500 text-[10px] uppercase tracking-wide">Cut By</th>
                        <th className="px-2 py-2 text-left font-medium text-slate-500 text-[10px] uppercase tracking-wide">Cut Into</th>
                        <th className="px-2 py-2 text-left font-medium text-slate-500 text-[10px] uppercase tracking-wide">Packed Into</th>
                        <th className="px-2 py-2 text-left font-medium text-slate-500 text-[10px] uppercase tracking-wide">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rounds.map((round) => (
                        <Fragment key={round.id}>
                        <tr className="hover:bg-slate-50/50 transition-colors">
                          <td className="sticky left-0 z-10 bg-white px-1 py-1.5 whitespace-nowrap shadow-[2px_0_3px_rgba(15,23,42,0.08)]">
                            <button
                              onClick={() => {
                                setHistoryRoundId(round.id);
                                setShowHistoryModal(true);
                              }}
                              className="inline-flex rounded-lg border border-slate-200 bg-white px-2 py-1 font-mono text-sm font-bold text-slate-900 hover:border-indigo-300 hover:text-indigo-600 transition-colors cursor-pointer"
                              title="Click to view round history"
                            >
                              {roundDisplayCode(round)}
                            </button>
                            <button onClick={() => { setHistoryRoundId(round.id); setShowHistoryModal(true); }} className="mt-1 block text-xs font-semibold text-indigo-600 hover:text-indigo-800">History</button>
                            {round.locked && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] text-slate-400">
                                <Lock className="w-2.5 h-2.5" /> Locked
                              </span>
                            )}
                          </td>
                          <td className="px-1 py-1.5 text-slate-600 text-sm">
                            <input type="number" min="0" value={round.actualInput > 0 ? round.actualInput : round.plannedInput} onChange={(e) => { const quantity = parseInt(e.target.value) || 0; updateProductionRound(round.id, { plannedInput: quantity, actualInput: quantity }); }} className="w-20 px-2 py-1 border border-slate-200 rounded text-sm" aria-label={`Milk quantity for round ${round.roundNumber}`} />
                          </td>
                          <td className="px-1 py-1.5 text-sm">
                            {round.startingTemperature !== undefined ? (
                              <span className="inline-flex rounded-lg border border-slate-200 bg-white px-2 py-1 font-medium text-slate-700">{round.startingTemperature}°C</span>
                            ) : '—'}
                          </td>
                          <td className="px-2 py-1.5 text-sm">
                            <span className="inline-flex rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-sm font-bold text-slate-700">{round.type}</span>
                            {round.creamRecovered !== undefined && <div className="mt-1 flex w-fit whitespace-nowrap rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700">Cream {round.creamRecovered} kg{round.creamRecoveredBy ? ` · ${round.creamRecoveredBy}` : ''}</div>}
                            {renderCreamAction(round)}
                          </td>
                          <td className="px-2 py-1.5 text-sm">
                            {canForceStage ? (
                              <select value={round.status} onChange={(e) => handleStageChange(round.id, e.target.value)} className="w-36 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm font-semibold text-slate-700" aria-label={`Current stage for round ${round.roundNumber}`}>
                                {editableStageOptions.map(stage => <option key={stage} value={stage}>{statusLabels[stage] || stage}</option>)}
                              </select>
                            ) : <div className="inline-flex rounded-lg border border-slate-200 bg-white px-2 py-1 font-semibold text-slate-700">{statusLabels[round.status] || round.status}</div>}
                            {round.startTime && <div className="mt-1 text-[10px] text-slate-500">{new Date(round.startTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>}
                            {round.status === 'cooling' && <div className="mt-1 flex items-center gap-2 text-[10px]">
                              <span className="font-mono font-bold">{formatTime(timers[round.id] || 0)}</span>
                              {(timers[round.id] || 0) === 0 && <span className="font-bold text-emerald-600">✓ Ready for Resting</span>}
                              {(timers[round.id] || 0) === 0 && <button onClick={() => handleStartResting(round.id)} className="rounded bg-teal-500 px-2 py-1 text-white font-medium hover:bg-teal-600">Start Resting</button>}
                            </div>}
                            {getStageActionButtons(round)}
                          </td>
                          <td className="px-2 py-1.5 text-slate-600 text-sm">{round.blockWeights?.length ? <button onClick={() => setExpandedBlockRoundIds(current => { const next = new Set(current); if (next.has(round.id)) next.delete(round.id); else next.add(round.id); return next; })} className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1 font-medium text-indigo-700 hover:bg-indigo-100" aria-expanded={expandedBlockRoundIds.has(round.id)}>{round.blockWeights.length} blocks {expandedBlockRoundIds.has(round.id) ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}</button> : '—'}</td>
                          <td className="px-2 py-1.5 text-sm">
                            <div className="inline-flex rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 font-bold text-emerald-700">{round.outputWeight > 0 ? `${round.outputWeight.toFixed(1)} kg` : '—'}</div>
                            {round.blockWeights?.length ? <div className="mt-1 text-[10px] text-slate-500">{round.blockWeights.length}/{round.numberOfBlocks || round.blockWeights.length} blocks</div> : null}
                            {round.blockWeights?.filter(weight => weight > 13).length ? <div className="mt-1 inline-flex rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700">{round.blockWeights.filter(weight => weight > 13).length} above-capacity anomalies</div> : null}
                            {round.sppRecordedWeight !== undefined && <div className="mt-1 text-[10px] text-pink-600">SPP {round.sppRecordedWeight.toFixed(1)} kg</div>}
                          </td>
                          <td className="px-2 py-1.5 text-sm">
                            {round.cutBy ? <span className="inline-flex rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-700">{round.cutBy}</span> : '—'}
                          </td>
                          <td className="px-2 py-1.5 text-sm">
                            {round.cuttingType || round.status === 'ready_cutting' ? (
                              <select value={round.cuttingType || ''} onChange={(e) => updateProductionRound(round.id, { cuttingType: e.target.value || undefined })} className="w-32 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm" aria-label={`Cutting option for round ${round.roundNumber}`}><option value="">Select cut</option><option value="400g cubes">400g cubes</option><option value="200g cubes">200g cubes</option><option value="Restaurant blocks">Restaurant blocks</option><option value="SPP pieces">SPP pieces</option><option value="Clingwrapped / Stored">Clingwrapped / Stored</option></select>
                            ) : round.status === 'clingwrapped' ? (
                              <span className="inline-flex rounded-lg border border-pink-200 bg-pink-50 px-2 py-1 text-xs font-medium text-pink-600">Clingwrapped</span>
                            ) : '—'}
                            {getCutActionButtons(round)}
                          </td>
                          <td className="px-2 py-1.5 text-sm">
                            {round.packedSkus && round.packedSkus.length > 0 ? (
                              <div className="space-y-1">
                                {round.packedSkus.map((p, i) => <div key={i} className="inline-flex rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">{p.sku}: {p.weightKg !== undefined ? `${p.weightKg.toFixed(2)} kg` : p.looseWeightKg !== undefined ? `${p.cases}c + ${p.looseWeightKg.toFixed(2)} kg loose` : `${p.cases}c + ${p.loose} loose`}</div>)}
                              </div>
                            ) : <span className="text-slate-400">—</span>}
                            {round.pan111ApprovalStatus === 'pending' && <div className="mt-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700">PAN111 pending: {round.pan111RequestedWeight?.toFixed(2)} kg</div>}
                            {round.remainingBalance !== undefined && <div className={`mt-1 inline-flex rounded-lg border px-2 py-1 text-[10px] font-bold ${round.remainingBalance > 0 ? 'border-amber-200 bg-amber-50 text-amber-600' : round.remainingBalance < 0 ? 'border-red-200 bg-red-50 text-red-600' : 'border-slate-200 bg-slate-50 text-slate-400'}`}>Balance {round.remainingBalance.toFixed(2)} kg</div>}
                            {['cut', 'frozen', 'packed'].includes(round.status) && !round.locked && round.pan111ApprovalStatus !== 'pending' && <button onClick={() => { setSelectedRound(round.id); setEditingPackIndex(null); setPackForm(emptyPackForm); setShowPackModal(true); }} className="mt-1 inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-100"><Package className="h-3 w-3" />{round.packedSkus?.length ? '+ Add Packing' : 'Pack'}</button>}
                            {isOwner && round.packedSkus && round.packedSkus.length > 0 && <button onClick={() => { const index = round.packedSkus!.length - 1; const pack = round.packedSkus![index]; setSelectedRound(round.id); setEditingPackIndex(index); setPackForm({ sku: pack.sku, cases: pack.cases, loose: pack.loose, looseWeightKg: pack.looseWeightKg || 0, weightKg: pack.weightKg || 0, reason: pack.reason || '' }); setShowPackModal(true); }} className="mt-1 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700 hover:bg-amber-100">Correct</button>}
                          </td>
                          <td className="px-2 py-1.5 text-sm">
                            {!round.locked && (
                              <div className="flex gap-1 flex-wrap">
                                {getActionButtons(round)}
                              </div>
                            )}
                          </td>
                        </tr>
                        <tr key={`${round.id}-pipeline`} className="border-t-2 border-b border-slate-200 bg-slate-50/80">
                          <td colSpan={11} className="px-2 py-2">
                            <div className="grid min-w-[148rem] items-center" style={{ gridTemplateColumns: '9rem 8rem 7rem 10rem 16rem 8rem 16rem 12rem 15rem 18rem 29rem' }}>
                              <span className="px-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Pipeline</span>
                              <div className="col-span-4 px-2"><StatusPipeline currentStatus={round.status} /></div>
                              <span className={`inline-flex w-fit items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium ${statusColors[round.status]} text-white`}>{statusLabels[round.status]}</span>
                            </div>
                          </td>
                        </tr>
                        {expandedBlockRoundIds.has(round.id) && round.blockWeights?.length ? (
                          <tr key={`${round.id}-blocks`} className="bg-slate-50/70">
                            <td colSpan={11} className="px-3 py-3">
                              <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                                <div className="flex items-center justify-between gap-3 mb-3">
                                  <div>
                                    <div className="text-sm font-semibold text-slate-800">{roundDisplayCode(round)} block weights</div>
                                    <div className="text-xs text-slate-500">Review the recorded weight of every block. Owner/admin corrections remain available.</div>
                                  </div>
                                  {canForceStage && <button onClick={() => openBlockWeights(round.id)} className="px-2.5 py-1.5 rounded border border-indigo-200 text-indigo-700 text-xs font-medium hover:bg-indigo-50">Correct weights</button>}
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                                  {round.blockWeights!.map((weight, index) => (
                                    <div key={index} className={`rounded-lg border p-2 ${weight > 13 ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}>
                                      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Block {index + 1}</div>
                                      <div className="mt-1 text-lg font-bold text-slate-800">{weight.toFixed(2)} <span className="text-xs font-medium text-slate-500">kg</span></div>
                                      {weight > 13 && <div className="mt-1 text-[10px] font-medium text-amber-700">Above capacity</div>}
                                    </div>
                                  ))}
                                </div>
                                <div className="mt-3 flex flex-wrap gap-4 text-sm font-semibold text-emerald-700">
                                  <span>{round.blockWeights.reduce((sum, weight) => sum + weight, 0).toFixed(2)} kg total</span>
                                  <span>{(round.blockWeights.reduce((sum, weight) => sum + weight, 0) / round.blockWeights.length).toFixed(2)} kg average</span>
                                  <span>{round.blockWeights.length} of {round.blockWeights.length} blocks recorded</span>
                                </div>
                              </div>
                            </td>
                          </tr>
                        ) : null}
                        </Fragment>
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
        <HalloumiTab selectedMilkLotId={selectedMilkLotId} canForceStage={canForceStage} />
      )}

      {/* Butter Tab Content */}
      {activeTab === 'butter' && (
        <ButterTab />
      )}

      {/* Ghee Tab Content */}
      {activeTab === 'ghee' && (
        <GheeTab />
      )}

      {/* Crumbing Tab Content */}
      {activeTab === 'crumbing' && (
        <CrumbingTab />
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
              <option value="Clingwrapped / Stored">Clingwrapped / Stored</option>
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

      {/* Block weight review modal */}
      <Modal isOpen={Boolean(blockWeightsRoundId)} onClose={() => setBlockWeightsRoundId(null)} title="Recorded block weights">
        {blockWeightsRoundId && (() => {
          const round = productionRounds.find(item => item.id === blockWeightsRoundId);
          const total = blockWeightsDraft.reduce((sum, weight) => sum + weight, 0);
          return <div className="space-y-4">
            {round && <p className="text-sm text-slate-600">{roundDisplayCode(round)} · Milk lot {round.milkLotCode}</p>}
            {round?.storedBlockWeights?.length && round?.status !== 'clingwrapped' && <div className="bg-pink-50 border border-pink-200 rounded-lg p-3 text-xs text-pink-900">Stored before final cutting: {round.storedBlockWeights.length} large blocks · {round.storedOutputWeight?.toFixed(2)} kg · by {round.storedCutBy || '—'}</div>}
            <div className="space-y-2">{blockWeightsDraft.map((weight, index) => <label key={index} className="flex items-center gap-3 text-sm"><span className="w-20">Block {index + 1}</span><input type="number" min="0" step="0.01" value={weight} onChange={(e) => { if (!canForceStage) return; const next = [...blockWeightsDraft]; next[index] = parseFloat(e.target.value) || 0; setBlockWeightsDraft(next); }} disabled={!canForceStage} className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm disabled:bg-slate-50" /><span>kg</span></label>)}</div>
            <div className="bg-slate-50 rounded-lg p-3 text-sm font-medium">Total recorded: {total.toFixed(2)} kg{round?.sppRecordedWeight !== undefined && <div className="text-pink-600 mt-1">SPP: {round.sppRecordedWeight.toFixed(2)} kg · Balance: {Math.max(0, total - round.sppRecordedWeight).toFixed(2)} kg</div>}</div>
            {canForceStage ? <div className="flex gap-2"><button onClick={saveBlockWeights} className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium">Save correction</button><button onClick={() => setBlockWeightsRoundId(null)} className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-lg text-sm">Cancel</button></div> : <button onClick={() => setBlockWeightsRoundId(null)} className="w-full px-4 py-2.5 bg-slate-100 text-slate-700 rounded-lg text-sm">Close</button>}
          </div>;
        })()}
      </Modal>

      {/* SPP weight and balance modal */}
      <Modal isOpen={showSppModal} onClose={() => setShowSppModal(false)} title="Record SPP Weight">
        {selectedRound && (() => {
          const round = productionRounds.find(item => item.id === selectedRound);
          const totalWeight = (round?.blockWeights || []).reduce((sum, weight) => sum + weight, 0);
          const balance = Math.max(0, totalWeight - sppForm.recordedWeight);
          return <div className="space-y-4">
            <div className="bg-pink-50 border border-pink-200 rounded-lg p-3 text-xs text-pink-900">
              Total Paneer for this round: <strong>{totalWeight.toFixed(2)} kg</strong>
            </div>
            <label className="block"><span className="text-xs font-medium text-slate-600 uppercase tracking-wide">Name of cutter</span><input value={sppForm.cutBy} onChange={(e) => setSppForm({ ...sppForm, cutBy: e.target.value })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" /></label>
            <label className="block"><span className="text-xs font-medium text-slate-600 uppercase tracking-wide">No. of blocks cut in SPP pieces</span><input type="number" min="1" value={sppForm.numberOfBlocks} onChange={(e) => setSppForm({ ...sppForm, numberOfBlocks: parseInt(e.target.value) || 0 })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" /></label>
            <label className="block"><span className="text-xs font-medium text-slate-600 uppercase tracking-wide">Recorded Paneer weight for SPP (kg)</span><input type="number" min="0" step="0.01" value={sppForm.recordedWeight} onChange={(e) => setSppForm({ ...sppForm, recordedWeight: parseFloat(e.target.value) || 0 })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" /></label>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">Balance Paneer: <strong>{balance.toFixed(2)} kg</strong></div>
            {balance > 0.01 && <label className="block"><span className="text-xs font-medium text-slate-600 uppercase tracking-wide">Balance disposition</span><select value={sppForm.balanceDisposition} onChange={(e) => setSppForm({ ...sppForm, balanceDisposition: e.target.value })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"><option value="">Select what happened to balance</option><option value="400g cubes">Cut in 400g</option><option value="200g cubes">Cut in 200g</option><option value="Restaurant blocks">Restaurant blocks</option><option value="PAN111">Went into PAN111</option></select></label>}
            <div className="flex gap-2 pt-2"><button onClick={() => selectedRound && handleRecordSppWeight(selectedRound)} className="flex-1 px-4 py-2.5 bg-pink-600 text-white rounded-lg text-sm font-medium">Save SPP record</button><button onClick={() => setShowSppModal(false)} className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium">Cancel</button></div>
          </div>;
        })()}
      </Modal>

      {/* Pack Modal */}
      <Modal isOpen={showPackModal} onClose={() => { setShowPackModal(false); setEditingPackIndex(null); }} title={editingPackIndex !== null ? "Correct Packing" : selectedRound && productionRounds.find(r => r.id === selectedRound)?.packedSkus?.length ? "+Add Packing" : "Record Packing"}>
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
                        Session {idx + 1}: {pack.sku} - {pack.weightKg !== undefined ? `${pack.weightKg.toFixed(2)} kg` : pack.looseWeightKg !== undefined ? `${pack.cases} cases + ${pack.looseWeightKg.toFixed(2)} kg loose` : `${pack.cases} cases + ${pack.loose} loose`}
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
              {allowedPackSkus.map(definition => <option key={definition.sku} value={definition.sku}>{definition.sku} - {definition.productName}{definition.packMode === 'weight_only' ? ' (weight only)' : definition.packMode === 'weight_loose' ? ' (loose by weight)' : ` (${(definition.unitsPerCase || 0) * definition.unitWeightKg} kg/case)`}</option>)}
            </select>
          </div>
          {packForm.sku && paneerSkuByCode[packForm.sku]?.packMode !== 'weight_only' && <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Cases</label>
              <input type="number" value={packForm.cases} onChange={(e) => setPackForm({ ...packForm, cases: parseInt(e.target.value) || 0 })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" min="0" />
            </div>
            {paneerSkuByCode[packForm.sku]?.packMode === 'weight_loose' ? <div>
              <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Loose weight (kg)</label>
              <input type="number" value={packForm.looseWeightKg} onChange={(e) => setPackForm({ ...packForm, looseWeightKg: parseFloat(e.target.value) || 0 })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" min="0" step="0.01" />
            </div> : <div>
              <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Loose Packets</label>
              <input type="number" value={packForm.loose} onChange={(e) => setPackForm({ ...packForm, loose: parseInt(e.target.value) || 0 })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" min="0" />
            </div>}
          </div>}
          {packForm.sku && paneerSkuByCode[packForm.sku]?.packMode === 'weight_only' && <div className="space-y-3"><label className="block"><span className="text-xs font-medium text-slate-600 uppercase tracking-wide">PAN111 weight (kg)</span><input type="number" value={packForm.weightKg} onChange={(e) => setPackForm({ ...packForm, weightKg: parseFloat(e.target.value) || 0 })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" min="0" step="0.01" /></label><label className="block"><span className="text-xs font-medium text-slate-600 uppercase tracking-wide">Reason (required for approval)</span><textarea value={packForm.reason} onChange={(e) => setPackForm({ ...packForm, reason: e.target.value })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" rows={2} placeholder="Explain why this paneer is being recorded as PAN111" /></label></div>}
          {packForm.sku && selectedRound && (() => {
            const round = productionRounds.find(r => r.id === selectedRound);
            const balance = round?.remainingBalance ?? round?.outputWeight ?? 0;
            const totalWeightPacked = getPaneerPackWeight(paneerSkuByCode[packForm.sku], packForm.cases, packForm.loose, packForm.looseWeightKg, packForm.weightKg);
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
                <p className="text-sm font-medium text-slate-900">{roundDisplayCode(round)} • {round.type}</p>
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
              {availableRoundShifts.map((shift, index) => (
                <option key={shift.id} value={shift.id}>
                  Shift {shift.shiftNumber} - {shift.milkLotCode}{index === 0 ? ' (Latest)' : ''}
                </option>
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
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Milk taken from</label>
            <select value={newRound.sourceVessel} onChange={(e) => setNewRound({ ...newRound, sourceVessel: e.target.value })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white">
              <option value="">Select vessel</option>
              {milkStorageVessels.map((vessel) => <option key={vessel.id} value={vessel.id}>{vessel.label}{vessel.capacity ? ` (${vessel.capacity.toLocaleString()} L)` : ''}</option>)}
            </select>
            <p className="text-xs text-slate-500 mt-1">This is recorded for milk-lot vessel reconciliation.</p>
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
