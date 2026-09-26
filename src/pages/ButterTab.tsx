import { useState } from 'react';
import { Plus, Package, CheckCircle2 } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { useToast } from '../components/Toast';
import { Modal } from '../components/Modal';
import { getButterBatchCode, getCreamBatchCode, getDateBatchCode, ProductionRound } from '../data/mockData';

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

type ButterPoolView = {
  id: string;
  kind: 'direct' | 'blended';
  origin: 'internal' | 'external' | 'mixed';
  batchId: string;
  sourceLabel: string;
  poolSku: 'PUBB' | 'PUBBB' | 'PSBBB' | 'BB05';
  rounds: ProductionRound[];
  totalProduced: number;
  availableBalance: number;
};

const directButterStatuses = ['churned', 'packed_as_pubb'];
const blendedButterStatuses = ['pubbb_pool', 'psbbb_pool', 'bb05_pool'];

export default function ButterTab() {
  const { productionRounds, milkLots, creamLots, updateProductionRound, addProductionRound, updateMilkLot, updateCreamLot } = useApp();
  const { showToast } = useToast();

  const [showNewRoundModal, setShowNewRoundModal] = useState(false);
  const [showOutputModal, setShowOutputModal] = useState(false);
  const [showBlendingModal, setShowBlendingModal] = useState(false);
  const [showPackingModal, setShowPackingModal] = useState(false);
  const [selectedRound, setSelectedRound] = useState<string | null>(null);
  const [selectedPoolId, setSelectedPoolId] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<'cream' | 'blending' | 'packing'>('cream');
  const [creamSourceTab, setCreamSourceTab] = useState<'internal' | 'external'>('internal');
  const [blendingSourceTab, setBlendingSourceTab] = useState<'internal' | 'external'>('internal');
  const [packingSourceTab, setPackingSourceTab] = useState<'internal' | 'external'>('internal');

  // Forms
  const [newRound, setNewRound] = useState({
    roundDate: new Date().toISOString().slice(0, 10),
    milkLotId: '',
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
    internalButterPoolId: '',
    externalButterPoolId: '',
    internalButterQuantity: 0,
    externalButterQuantity: 0,
    saltQuantity: 0.145,
    isSalted: false,
  });

  const [packingForm, setPackingForm] = useState({
    sku: '',
    quantity: 0,
    unit: 'balls' as 'balls' | 'bricks',
  });

  // Filter butter rounds
  const butterRounds = productionRounds.filter(r => r.type === 'Butter');
  const churningRounds = butterRounds.filter(round => !round.blendedPoolId);
  const getRoundDate = (round: typeof butterRounds[number]) => round.roundDate || round.startTime.slice(0, 10);
  const formatRoundDate = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString();
  const groupedByDate = churningRounds.reduce((acc, round) => {
    const date = getRoundDate(round);
    if (!acc[date]) acc[date] = [];
    acc[date].push(round);
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

  // Butter is reconciled at pool level. The cream → butter table remains the
  // audit trail for individual churning rounds, but blending and packing only
  // consume aggregated pools for a milk lot / purchased-cream lot.
  const directPoolMap = new Map<string, ProductionRound[]>();
  butterRounds
    .filter(round => directButterStatuses.includes(round.status) && (round.butterOutput || 0) > 0)
    .forEach(round => {
      const sourceKey = round.creamSource === 'internal'
        ? `direct:internal:${round.milkLotId}`
        : `direct:external:${round.sourceBatchCode || round.creamLotId || round.id}`;
      directPoolMap.set(sourceKey, [...(directPoolMap.get(sourceKey) || []), round]);
    });

  const directButterPools: ButterPoolView[] = Array.from(directPoolMap.entries()).map(([id, rounds]) => {
    const first = rounds[0];
    const isInternal = first.creamSource === 'internal';
    const milkLot = milkLots.find(lot => lot.id === first.milkLotId);
    const sourceLabel = isInternal
      ? (milkLot?.creamPool?.batchId || getCreamBatchCode(first.milkLotCode))
      : (first.sourceBatchCode || first.creamLotId || 'Purchased cream');
    return {
      id,
      kind: 'direct',
      origin: isInternal ? 'internal' : 'external',
      batchId: isInternal
        ? (milkLot?.butterPool?.batchId || getButterBatchCode(first.milkLotCode))
        : `BUT-${(first.sourceBatchCode || first.creamLotId || 'EXTERNAL').replace(/^BUT-/, '')}`,
      sourceLabel,
      poolSku: 'PUBB',
      rounds,
      totalProduced: rounds.reduce((sum, round) => sum + (round.butterOutput || 0), 0),
      availableBalance: rounds.reduce((sum, round) => sum + Math.max(0, round.remainingBalance ?? round.butterOutput ?? 0), 0),
    };
  });

  const blendedPoolMap = new Map<string, ProductionRound[]>();
  butterRounds
    .filter(round => blendedButterStatuses.includes(round.status) && (round.remainingBalance || 0) > 0)
    .forEach(round => {
      const poolId = round.blendedPoolId || `blended:${round.id}`;
      blendedPoolMap.set(poolId, [...(blendedPoolMap.get(poolId) || []), round]);
    });

  const blendedButterPools: ButterPoolView[] = Array.from(blendedPoolMap.entries()).map(([id, rounds]) => {
    const first = rounds[0];
    const hasInternal = rounds.some(round => (round.blendingInternalButterQuantity || 0) > 0);
    const hasExternal = rounds.some(round => (round.blendingExternalButterQuantity || 0) > 0);
    const poolSku = first.pool || (first.status === 'psbbb_pool' ? 'PSBBB' : first.status === 'bb05_pool' ? 'BB05' : 'PUBBB');
    return {
      id,
      kind: 'blended',
      origin: hasInternal && hasExternal ? 'mixed' : hasInternal ? 'internal' : 'external',
      batchId: first.batchCode || `${poolSku}-${getRoundDate(first)}`,
      sourceLabel: first.sourceBatchCode || 'Butter blend',
      poolSku,
      rounds,
      totalProduced: rounds.reduce((sum, round) => sum + (round.blendingInput || round.outputWeight || round.butterOutput || 0), 0),
      availableBalance: rounds.reduce((sum, round) => sum + Math.max(0, round.remainingBalance || 0), 0),
    };
  });

  const availableDirectPools = directButterPools.filter(pool => pool.availableBalance > 0);
  const availableBlendedPools = blendedButterPools.filter(pool => pool.availableBalance > 0);
  const visibleBlendingPools = (blendingSourceTab === 'internal'
    ? availableDirectPools.filter(pool => pool.origin === 'internal')
    : availableDirectPools.filter(pool => pool.origin === 'external'));
  const visiblePackingPools = [...availableDirectPools, ...availableBlendedPools].filter(pool =>
    packingSourceTab === 'internal' ? pool.origin === 'internal' || pool.origin === 'mixed' : pool.origin === 'external' || pool.origin === 'mixed',
  );

  // Handlers
  const openNewButterRound = (source: 'internal' | 'external' = creamSourceTab, creamLotId = '') => {
    setCreamSourceTab(source);
    setNewRound(current => ({ ...current, creamSource: source, creamLotId: creamLotId || (source === 'internal' ? current.milkLotId : '') }));
    setShowNewRoundModal(true);
  };

  const handleCreateRound = () => {
    if (!newRound.roundDate || !newRound.milkLotId || !newRound.creamLotId || newRound.inputQuantity <= 0) {
      showToast('error', 'Please fill all required fields');
      return;
    }
    const sourceMilkLot = milkLots.find(milkLot => milkLot.id === newRound.milkLotId);
    if (!sourceMilkLot) {
      showToast('error', 'Milk lot not found');
      return;
    }
    if (sourceMilkLot?.productionClosed) {
      showToast('error', `Production for milk lot ${sourceMilkLot.lotCode} is closed`);
      return;
    }

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

    const sourceCream = newRound.creamSource === 'internal'
      ? getCreamBatchCode(sourceMilkLot.lotCode)
      : externalCreamLots.find(cream => cream.id === newRound.creamLotId)?.lotCode || newRound.creamLotId;
    const roundNumber = butterRounds
      .filter(round => getRoundDate(round) === newRound.roundDate)
      .reduce((max, round) => Math.max(max, round.roundNumber), 0) + 1;
    const batchCode = getDateBatchCode('BUT', newRound.roundDate);
    const dateRoundId = `butter-${newRound.roundDate}`;
    addProductionRound({
      milkLotId: sourceMilkLot.id,
      milkLotCode: sourceMilkLot.lotCode,
      roundDate: newRound.roundDate,
      shiftId: dateRoundId,
      shiftNumber: 0,
      roundNumber,
      type: 'Butter',
      status: 'scheduled',
      team: newRound.team ? newRound.team.split(',').map(t => t.trim()).filter(Boolean) : [],
      plannedInput: newRound.inputQuantity,
      actualInput: newRound.inputQuantity,
      outputWeight: 0,
      startTime: new Date(`${newRound.roundDate}T12:00:00`).toISOString(),
      locked: false,
      batchCode,
      sourceBatchCode: sourceCream,
      creamSource: newRound.creamSource,
      creamLotId: newRound.creamLotId,
    });
    
    const creamMessage = newRound.creamSource === 'internal' 
      ? ` (cream pool: -${newRound.inputQuantity} kg)` 
      : '';
    showToast('success', `Butter round created: ${batchCode}/R${roundNumber}${creamMessage}`);
    setShowNewRoundModal(false);
    setNewRound({ roundDate: new Date().toISOString().slice(0, 10), milkLotId: '', roundNumber: 1, creamSource: 'internal', creamLotId: '', inputQuantity: 0, team: '' });
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

    const round = butterRounds.find(r => r.id === selectedRound);
    const milkLot = round ? milkLots.find(lot => lot.id === round.milkLotId) : undefined;
    if (!round || !milkLot) return;
    const outputDelta = outputForm.butterOutput - (round.butterOutput || 0);

    updateProductionRound(selectedRound, {
      butterOutput: outputForm.butterOutput,
      buttermilkOutput: outputForm.buttermilkOutput,
      remainingBalance: outputForm.butterOutput,
      status: 'churned',
      butterPoolId: round.creamSource === 'internal'
        ? `direct:internal:${round.milkLotId}`
        : `direct:external:${round.sourceBatchCode || round.creamLotId || round.id}`,
    });

    const existingPool = milkLot.butterPool || {
      batchId: getButterBatchCode(milkLot.lotCode),
      sourceCreamBatchId: getCreamBatchCode(milkLot.lotCode),
      milkLotId: milkLot.id,
      totalButterProduced: 0,
      usedInGhee: 0,
      usedInBlending: 0,
      packedAsPubb: 0,
      availableBalance: 0,
      roundsContributed: [],
    };
    updateMilkLot(milkLot.id, {
      butterPool: {
        ...existingPool,
        batchId: existingPool.batchId || getButterBatchCode(milkLot.lotCode),
        sourceCreamBatchId: existingPool.sourceCreamBatchId || getCreamBatchCode(milkLot.lotCode),
        totalButterProduced: Math.max(0, existingPool.totalButterProduced + outputDelta),
        availableBalance: Math.max(0, existingPool.availableBalance + outputDelta),
        roundsContributed: existingPool.roundsContributed.includes(round.id)
          ? existingPool.roundsContributed
          : [...existingPool.roundsContributed, round.id],
      },
    });
    showToast('success', `Output recorded: ${outputForm.butterOutput} kg butter, ${outputForm.buttermilkOutput} kg buttermilk`);
    setShowOutputModal(false);
    setOutputForm({ butterOutput: 0, buttermilkOutput: 0 });
  };

  const openBlending = (pool: ButterPoolView) => {
    setSelectedPoolId(pool.id);
    setBlendingForm({
      internalButterPoolId: pool.origin === 'internal' ? pool.id : '',
      externalButterPoolId: pool.origin === 'external' ? pool.id : '',
      internalButterQuantity: pool.origin === 'internal' ? pool.availableBalance : 0,
      externalButterQuantity: pool.origin === 'external' ? pool.availableBalance : 0,
      saltQuantity: 0.145,
      isSalted: false,
    });
    setShowBlendingModal(true);
  };

  const handleBlending = () => {
    const internalQuantity = blendingForm.internalButterQuantity || 0;
    const externalQuantity = blendingForm.externalButterQuantity || 0;
    const totalButter = internalQuantity + externalQuantity;
    if (totalButter <= 0) {
      showToast('error', 'Select an internal or external butter pool and enter its quantity');
      return;
    }
    if (blendingForm.isSalted && blendingForm.saltQuantity <= 0) {
      showToast('error', 'Enter a salt quantity greater than 0 g');
      return;
    }

    const internalPool = internalQuantity > 0 ? availableDirectPools.find(pool => pool.id === blendingForm.internalButterPoolId && pool.origin === 'internal') : undefined;
    const externalPool = externalQuantity > 0 ? availableDirectPools.find(pool => pool.id === blendingForm.externalButterPoolId && pool.origin === 'external') : undefined;
    if (internalQuantity > 0 && !internalPool) {
      showToast('error', 'Select a valid internal butter pool');
      return;
    }
    if (externalQuantity > 0 && !externalPool) {
      showToast('error', 'Select a valid external butter pool');
      return;
    }
    if (internalPool && internalQuantity > internalPool.availableBalance + 0.0001) {
      showToast('error', `Only ${internalPool.availableBalance.toFixed(2)} kg remains in the selected internal butter pool`);
      return;
    }
    if (externalPool && externalQuantity > externalPool.availableBalance + 0.0001) {
      showToast('error', `Only ${externalPool.availableBalance.toFixed(2)} kg remains in the selected external butter pool`);
      return;
    }

    const calculatedReplacer = totalButter / 3.3;
    const poolStatus = blendingForm.isSalted ? 'psbbb_pool' : 'pubbb_pool';

    const consumePool = (pool: ButterPoolView | undefined, quantity: number) => {
      if (!pool || quantity <= 0) return;
      let remainingToConsume = quantity;
      pool.rounds.forEach(round => {
        if (remainingToConsume <= 0) return;
        const available = Math.max(0, round.remainingBalance ?? round.butterOutput ?? 0);
        const consumed = Math.min(available, remainingToConsume);
        if (consumed <= 0) return;
        const nextRemaining = Math.max(0, available - consumed);
        updateProductionRound(round.id, {
          destination: 'blending',
          status: nextRemaining > 0 ? round.status : 'blending',
          remainingBalance: nextRemaining,
        });
        remainingToConsume -= consumed;
      });
    };
    consumePool(internalPool, internalQuantity);
    consumePool(externalPool, externalQuantity);

    const internalSource = internalPool?.rounds[0];
    const externalSource = externalPool?.rounds[0];
    const sourceRound = internalSource || externalSource;
    if (!sourceRound) return;
    const blendDate = new Date().toISOString().slice(0, 10);
    const blendPoolId = `blended:${poolStatus}:${Date.now()}`;
    const blendRoundNumber = butterRounds
      .filter(round => getRoundDate(round) === blendDate)
      .reduce((max, round) => Math.max(max, round.roundNumber), 0) + 1;
    addProductionRound({
      milkLotId: sourceRound.milkLotId,
      milkLotCode: sourceRound.milkLotCode,
      roundDate: blendDate,
      shiftId: `butter-pool-${blendPoolId}`,
      shiftNumber: 0,
      roundNumber: blendRoundNumber,
      type: 'Butter',
      status: poolStatus,
      team: [],
      plannedInput: totalButter,
      actualInput: totalButter,
      outputWeight: totalButter,
      startTime: new Date().toISOString(),
      locked: false,
      batchCode: getDateBatchCode(blendingForm.isSalted ? 'PSBBB' : 'PUBBB', blendDate),
      sourceBatchCode: [internalPool?.batchId, externalPool?.batchId].filter(Boolean).join(' + '),
      creamSource: internalPool && externalPool ? undefined : internalPool ? 'internal' : 'external',
      butterOutput: totalButter,
      remainingBalance: totalButter,
      replacerQuantity: calculatedReplacer,
      blendingInput: totalButter,
      blendingInternalButterQuantity: internalQuantity || undefined,
      blendingExternalButterQuantity: externalQuantity || undefined,
      saltQuantity: blendingForm.isSalted ? blendingForm.saltQuantity : undefined,
      isSalted: blendingForm.isSalted,
      pool: blendingForm.isSalted ? 'PSBBB' : 'PUBBB',
      blendedPoolId: blendPoolId,
      destination: 'blending',
    });

    if (internalSource) {
      const milkLot = milkLots.find(lot => lot.id === internalSource.milkLotId);
      if (milkLot?.butterPool) {
        updateMilkLot(milkLot.id, {
          butterPool: {
            ...milkLot.butterPool,
            usedInBlending: (milkLot.butterPool.usedInBlending || 0) + internalQuantity,
            availableBalance: Math.max(0, milkLot.butterPool.availableBalance - internalQuantity),
          },
        });
      }
    }

    const sourceSummary = [
      internalQuantity > 0 ? `${internalQuantity.toFixed(2)} kg internal butter` : '',
      externalQuantity > 0 ? `${externalQuantity.toFixed(2)} kg external butter` : '',
    ].filter(Boolean).join(' + ');
    const saltSummary = blendingForm.isSalted ? ` + ${(blendingForm.saltQuantity * 1000).toFixed(0)} g salt` : '';
    showToast('success', `Blended ${sourceSummary}${saltSummary} · ${poolStatus === 'psbbb_pool' ? 'PSBBB' : 'PUBBB'} pool created`);
    setShowBlendingModal(false);
    setSelectedPoolId(null);
    setBlendingForm({ internalButterPoolId: '', externalButterPoolId: '', internalButterQuantity: 0, externalButterQuantity: 0, saltQuantity: 0.145, isSalted: false });
  };

  const openPacking = (pool: ButterPoolView, sku: 'PUBB' | 'PUBBB' | 'PSBBB' | 'BB05') => {
    setSelectedPoolId(pool.id);
    setPackingForm({ sku, quantity: 0, unit: sku === 'BB05' ? 'bricks' : 'balls' });
    setShowPackingModal(true);
  };

  const handlePack = () => {
    if (!selectedPoolId || packingForm.quantity <= 0) {
      showToast('error', 'Please enter valid quantity');
      return;
    }

    const pool = [...availableDirectPools, ...availableBlendedPools].find(candidate => candidate.id === selectedPoolId);
    if (!pool) return;
    const directButterOutput = pool.kind === 'direct';
    const blendedButterPool = pool.kind === 'blended';
    if (directButterOutput && packingForm.sku !== 'PUBB') {
      showToast('error', 'Direct butter output can only be packed into PUBB');
      return;
    }
    if (blendedButterPool && packingForm.sku !== pool.poolSku && !(pool.poolSku === 'PSBBB' && packingForm.sku === 'BB05')) {
      showToast('error', 'Blended butter must be packed from its blended pool SKU');
      return;
    }
    if (pool.availableBalance <= 0) {
      showToast('error', 'This butter pool has no remaining balance to pack');
      return;
    }

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
    if (totalWeight > pool.availableBalance + 0.0001) {
      showToast('error', `Only ${pool.availableBalance.toFixed(2)} kg remains available to pack from this pool`);
      return;
    }
    const packets = Math.floor(packingForm.quantity / unitsPerPacket);
    const cases = Math.floor(packets / packetsPerCase);
    const looseUnits = packingForm.quantity % unitsPerPacket;

    const packingDelta = totalWeight;
    let remainingToPack = packingDelta;
    pool.rounds.forEach((round, index) => {
      if (remainingToPack <= 0) return;
      const available = Math.max(0, round.remainingBalance ?? round.butterOutput ?? 0);
      const consumed = Math.min(available, remainingToPack);
      if (consumed <= 0) return;
      const nextRemaining = Math.max(0, available - consumed);
      const isBlendedRound = pool.kind === 'blended';
      const isRepresentative = index === 0;
      updateProductionRound(round.id, {
        ...(isRepresentative ? {
          packedSkus: [...(round.packedSkus || []), { sku: packingForm.sku, cases, loose: looseUnits }],
          packedButterWeight: (round.packedButterWeight || 0) + packingDelta,
        } : {}),
        remainingBalance: nextRemaining,
        status: nextRemaining > 0 ? (isBlendedRound ? round.status : 'packed_as_pubb') : 'packed',
      });
      remainingToPack -= consumed;
    });

    const internalSource = pool.origin === 'internal' ? pool.rounds[0] : undefined;
    const milkLot = internalSource ? milkLots.find(lot => lot.id === internalSource.milkLotId) : undefined;
    if (directButterOutput && milkLot?.butterPool) {
      updateMilkLot(milkLot.id, {
        butterPool: {
          ...milkLot.butterPool,
          packedAsPubb: Math.max(0, milkLot.butterPool.packedAsPubb + packingDelta),
          availableBalance: Math.max(0, milkLot.butterPool.availableBalance - packingDelta),
        },
      });
    }

    showToast('success', `Packed: ${cases} cases + ${looseUnits} loose ${packingForm.unit}`);
    setShowPackingModal(false);
    setSelectedPoolId(null);
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
            onClick={() => openNewButterRound()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700"
          >
            <Plus className="w-4 h-4" /> New Round
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 rounded-xl border border-slate-200 bg-white p-2">
        {([['cream', '🥛 Cream → Butter'], ['blending', '🧈 Blending'], ['packing', '📦 Packing']] as const).map(([section, label]) => (
          <button key={section} onClick={() => setActiveSection(section)} className={`rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${activeSection === section ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Cream Pool Summary */}
      {activeSection === 'cream' && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div><h4 className="text-sm font-semibold text-blue-950">Cream → Butter</h4><p className="text-xs text-blue-700">Choose the cream origin before opening a butter round.</p></div>
            <div className="flex gap-1 rounded-lg bg-white p-1 border border-blue-100">
              {([['internal', 'Internal cream'], ['external', 'Purchased cream']] as const).map(([source, label]) => <button key={source} onClick={() => setCreamSourceTab(source)} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${creamSourceTab === source ? 'bg-blue-600 text-white' : 'text-blue-700 hover:bg-blue-50'}`}>{label}</button>)}
            </div>
          </div>
          <button onClick={() => openNewButterRound(creamSourceTab)} className="mt-3 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"><Plus className="mr-1 inline h-3 w-3" />Record {creamSourceTab === 'internal' ? 'internal' : 'external'} cream to butter</button>
        </div>
      )}
      {activeSection === 'cream' && creamSourceTab === 'internal' && internalCreamPools.length > 0 && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4">
          <h4 className="text-sm font-semibold text-blue-900 mb-3 flex items-center gap-2">
            <span>🥛</span> Internal Cream Pools
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {internalCreamPools.map(lot => (
              <div key={lot.id} className="bg-white rounded-lg p-3 border border-blue-100">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="text-sm font-bold text-slate-900">{lot.creamPool?.batchId || getCreamBatchCode(lot.lotCode)}</span>
                    <span className="block text-[11px] text-slate-500">Milk lot {lot.lotCode}</span>
                  </div>
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

      {activeSection === 'cream' && creamSourceTab === 'external' && (
        <div className="bg-gradient-to-r from-violet-50 to-purple-50 border border-violet-200 rounded-xl p-4">
          <h4 className="text-sm font-semibold text-violet-900 mb-3 flex items-center gap-2"><span>🧴</span> Purchased Cream Lots</h4>
          {externalCreamLots.filter(cream => cream.remaining > 0).length > 0 ? <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">{externalCreamLots.filter(cream => cream.remaining > 0).map(cream => <div key={cream.id} className="bg-white rounded-lg p-3 border border-violet-100"><div className="flex items-center justify-between"><span className="text-sm font-bold text-slate-900">{cream.lotCode}</span><span className="text-xs text-violet-700">{cream.remaining.toFixed(2)} kg available</span></div><p className="mt-1 text-xs text-slate-500">{cream.supplier}</p><button onClick={() => openNewButterRound('external', cream.id)} className="mt-2 rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-100">Use in butter round</button></div>)}</div> : <p className="text-sm text-violet-700">No purchased cream is currently available.</p>}
        </div>
      )}

      {/* Blending subsection */}
      {activeSection === 'blending' && <section className="rounded-xl border border-purple-200 bg-purple-50/60 overflow-hidden">
        <div className="px-4 py-3 border-b border-purple-200 bg-purple-100/70">
          <h4 className="text-sm font-semibold text-purple-900">Blending</h4>
          <p className="mt-1 text-xs text-purple-700">Select a butter origin to review. The blending form can still combine internal and purchased-cream butter when required.</p>
          <div className="mt-3 flex gap-1 rounded-lg bg-white/70 p-1 w-fit border border-purple-200">
            {([['internal', 'Internal butter'], ['external', 'From purchased cream']] as const).map(([source, label]) => <button key={source} onClick={() => setBlendingSourceTab(source)} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${blendingSourceTab === source ? 'bg-purple-600 text-white' : 'text-purple-700 hover:bg-purple-50'}`}>{label}</button>)}
          </div>
        </div>
        <div className="p-4">
          {visibleBlendingPools.length > 0 ? (
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {visibleBlendingPools.map(pool => (
                <div key={pool.id} className="flex items-center justify-between gap-3 rounded-lg border border-purple-200 bg-white p-3">
                  <div>
                    <div className="font-mono text-xs font-bold text-slate-900">{pool.batchId}</div>
                    <div className="mt-1 text-xs text-slate-500">{pool.sourceLabel} · <span className="font-semibold text-slate-700">{pool.availableBalance.toFixed(2)} kg available</span></div>
                    <div className="mt-1 text-[11px] text-purple-700">Common pool from {pool.rounds.length} churning round{pool.rounds.length !== 1 ? 's' : ''}</div>
                  </div>
                  <button onClick={() => openBlending(pool)} className="rounded-lg bg-purple-600 px-3 py-2 text-xs font-medium text-white hover:bg-purple-700">Record blending</button>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-purple-700">No unallocated {blendingSourceTab === 'internal' ? 'internal' : 'purchased-cream'} butter pool is waiting for blending.</p>}
        </div>
      </section>}

      {/* Packing subsection */}
      {activeSection === 'packing' && <section className="rounded-xl border border-emerald-200 bg-emerald-50/60 overflow-hidden">
        <div className="px-4 py-3 border-b border-emerald-200 bg-emerald-100/70">
          <h4 className="text-sm font-semibold text-emerald-900">Packing</h4>
          <p className="mt-1 text-xs text-emerald-700">Review the butter origin before packing. Mixed pools appear in both origin tabs so their genealogy is not hidden.</p>
          <div className="mt-3 flex gap-1 rounded-lg bg-white/70 p-1 w-fit border border-emerald-200">
            {([['internal', 'Internal butter'], ['external', 'Purchased-cream butter']] as const).map(([source, label]) => <button key={source} onClick={() => setPackingSourceTab(source)} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${packingSourceTab === source ? 'bg-emerald-600 text-white' : 'text-emerald-700 hover:bg-emerald-50'}`}>{label}</button>)}
          </div>
        </div>
        <div className="p-4">
          {visiblePackingPools.length > 0 ? (
            <div className="space-y-2">
              {visiblePackingPools.map(pool => {
                const poolSku = pool.poolSku;
                const isDirect = poolSku === 'PUBB';
                return (
                  <div key={pool.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-white p-3">
                    <div>
                      <div className="font-mono text-xs font-bold text-slate-900">{pool.batchId}</div>
                      <div className="mt-1 text-xs text-slate-500">{isDirect ? 'Butter pool' : `${poolSku} blended pool`} · <span className="font-semibold text-slate-700">{pool.availableBalance.toFixed(2)} kg available</span></div>
                      <div className="mt-1 text-[11px] text-emerald-700">{pool.origin === 'mixed' ? 'Mixed internal + purchased-cream butter' : pool.origin === 'internal' ? 'Internal cream → butter' : 'Purchased cream → butter'} · {pool.rounds.length} source round{pool.rounds.length !== 1 ? 's' : ''}</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => openPacking(pool, poolSku)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700"><Package className="h-3 w-3" />Pack as {poolSku}</button>
                      {poolSku === 'PSBBB' && <button onClick={() => { pool.rounds.forEach(round => updateProductionRound(round.id, { pool: 'BB05', status: 'bb05_pool' })); showToast('success', 'Converted to BB05 bricks'); }} className="rounded-lg bg-rose-500 px-3 py-2 text-xs font-medium text-white hover:bg-rose-600">Make Bricks → BB05</button>}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : <p className="text-sm text-emerald-700">No {packingSourceTab === 'internal' ? 'internal' : 'purchased-cream'} butter pools are waiting for packing.</p>}
        </div>
      </section>}

      {/* Production Board: individual churning rounds belong only to Cream → Butter. */}
      {activeSection === 'cream' && <div className="space-y-4">
        {Object.entries(groupedByDate).map(([roundDate, rounds]) => {
          return (
            <div key={roundDate} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              {/* Date Header */}
              <div className="px-4 py-3 bg-indigo-50 border-b border-indigo-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-full bg-indigo-600 text-white text-sm font-bold flex items-center justify-center">
                      {rounds.length}
                    </span>
                    <div>
                      <div className="text-sm font-semibold text-slate-900">Butter rounds · {formatRoundDate(roundDate)}</div>
                      <div className="text-xs text-slate-500">Date-based production record</div>
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
                            {round.batchCode || getButterBatchCode(round.milkLotCode)}/R{round.roundNumber}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                            round.creamSource === 'internal' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                          }`}>
                            {round.creamSource === 'internal' ? 'Internal' : 'External'}
                          </span>
                          <div className="mt-1 text-[10px] text-slate-500">{round.sourceBatchCode || round.creamLotId || 'Source lot not recorded'}</div>
                          {(round.blendingInternalButterQuantity || round.blendingExternalButterQuantity) && <div className="mt-1 text-[10px] text-purple-700">Blend butter: {[round.blendingInternalButterQuantity ? `${round.blendingInternalButterQuantity.toFixed(2)} kg internal` : '', round.blendingExternalButterQuantity ? `${round.blendingExternalButterQuantity.toFixed(2)} kg external` : ''].filter(Boolean).join(' + ')}</div>}
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

        {churningRounds.length === 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
            <p className="text-slate-500">No butter rounds yet. Create a date-based round to begin.</p>
          </div>
        )}
      </div>}

      {/* Modals */}
      {/* New Round Modal */}
      <Modal isOpen={showNewRoundModal} onClose={() => setShowNewRoundModal(false)} title="Create New Butter Round">
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Production date</label>
            <input
              type="date"
              value={newRound.roundDate}
              onChange={(e) => {
                const roundDate = e.target.value;
                const existingRounds = butterRounds.filter(r => getRoundDate(r) === roundDate);
                const nextRoundNumber = existingRounds.reduce((max, round) => Math.max(max, round.roundNumber), 0) + 1;
                setNewRound({ ...newRound, roundDate, roundNumber: nextRoundNumber });
              }}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Round number for this date</label>
            <input
              type="number"
              value={newRound.roundNumber}
              readOnly
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Milk lot context</label>
            <select
              value={newRound.milkLotId}
              onChange={(e) => setNewRound({ ...newRound, milkLotId: e.target.value, creamLotId: newRound.creamSource === 'internal' ? e.target.value : newRound.creamLotId })}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
            >
              <option value="">Select milk lot</option>
              {milkLots.filter(l => l.status === 'active').map(lot => (
                <option key={lot.id} value={lot.id}>{lot.lotCode}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Cream Source</label>
            <div className="mt-1 flex gap-2">
              <button
                onClick={() => setNewRound({ ...newRound, creamSource: 'internal', creamLotId: newRound.milkLotId })}
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
              {newRound.creamSource === 'internal' ? 'Internal cream pool' : 'External cream lot'}
            </label>
            <select
              value={newRound.creamLotId}
              onChange={(e) => setNewRound({ ...newRound, creamLotId: e.target.value, milkLotId: newRound.creamSource === 'internal' ? e.target.value : newRound.milkLotId })}
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
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Total butter selected (kg)</label>
            <input
              type="number"
              value={(blendingForm.internalButterQuantity + blendingForm.externalButterQuantity).toFixed(2)}
              readOnly
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-3">
              <label className="text-xs font-medium uppercase tracking-wide text-blue-800">Internal butter pool</label>
              <select
                value={blendingForm.internalButterPoolId}
                onChange={(e) => setBlendingForm({ ...blendingForm, internalButterPoolId: e.target.value })}
                className="mt-1 w-full rounded-lg border border-blue-200 bg-white px-2 py-2 text-sm"
              >
                <option value="">Not used</option>
                {availableDirectPools.filter(pool => pool.origin === 'internal').map(pool => <option key={pool.id} value={pool.id}>{pool.batchId} · {pool.availableBalance.toFixed(2)} kg available</option>)}
              </select>
              <input type="number" min="0" step="0.01" value={blendingForm.internalButterQuantity || ''} onChange={(e) => setBlendingForm({ ...blendingForm, internalButterQuantity: Number(e.target.value) || 0 })} className="mt-2 w-full rounded-lg border border-blue-200 bg-white px-2 py-2 text-sm" placeholder="Quantity (kg)" />
            </div>
            <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-3">
              <label className="text-xs font-medium uppercase tracking-wide text-violet-800">External butter pool</label>
              <select
                value={blendingForm.externalButterPoolId}
                onChange={(e) => setBlendingForm({ ...blendingForm, externalButterPoolId: e.target.value })}
                className="mt-1 w-full rounded-lg border border-violet-200 bg-white px-2 py-2 text-sm"
              >
                <option value="">Not used</option>
                {availableDirectPools.filter(pool => pool.origin === 'external').map(pool => <option key={pool.id} value={pool.id}>{pool.batchId} · {pool.availableBalance.toFixed(2)} kg available</option>)}
              </select>
              <input type="number" min="0" step="0.01" value={blendingForm.externalButterQuantity || ''} onChange={(e) => setBlendingForm({ ...blendingForm, externalButterQuantity: Number(e.target.value) || 0 })} className="mt-2 w-full rounded-lg border border-violet-200 bg-white px-2 py-2 text-sm" placeholder="Quantity (kg)" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">
              Replacer Quantity (kg) - Auto-calculated
            </label>
            <input
              type="number"
              value={((blendingForm.internalButterQuantity + blendingForm.externalButterQuantity) / 3.3).toFixed(2)}
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
            {blendingForm.isSalted && <div className="mt-3"><label className="text-xs font-medium uppercase tracking-wide text-slate-600">Salt quantity (g)</label><input type="number" min="0" step="1" value={(blendingForm.saltQuantity * 1000).toFixed(0)} onChange={(e) => setBlendingForm({ ...blendingForm, saltQuantity: (Number(e.target.value) || 0) / 1000 })} className="mt-1 w-full rounded-lg border border-pink-200 bg-pink-50 px-3 py-2 text-sm" /><p className="mt-1 text-xs text-pink-700">Default: 145 g</p></div>}
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
