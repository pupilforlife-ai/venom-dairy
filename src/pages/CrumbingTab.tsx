import { Fragment, useState } from 'react';
import { Plus, Package, CheckCircle2, Clock } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { useToast } from '../components/Toast';
import { Modal } from '../components/Modal';
import { useSupabaseState } from '../hooks/useSupabaseState';
import { crumbingSkuDefinitions, crumbingSkuByCode, getCrumbingPackWeight } from '../data/skuConfig';

type CrumbingStatus = 
  | 'scheduled'
  | 'jp_prepping'
  | 'jp_filling'
  | 'jp_filling_frozen'
  | 'crumbing'
  | 'frozen'
  | 'frying'
  | 'packed'
  | 'clubbed'
  | 'handed_over';

type CrumbingType = 'SPP' | 'JP' | 'HCP';

interface JpCreamCheeseMake {
  id: string;
  pan111InputKg: number;
  creamKg: number;
  blackPepperKg: number;
  saltKg: number;
  totalMadeKg: number;
  recordedAt: string;
}

const crumbingStatusLabels: Record<CrumbingStatus, string> = {
  scheduled: 'Scheduled',
  jp_prepping: 'JP Prepping',
  jp_filling: 'Cheese Filling',
  jp_filling_frozen: 'Filled & Frozen',
  crumbing: 'Crumbing',
  frozen: 'Frozen',
  frying: 'Frying',
  packed: 'Packed',
  clubbed: 'Clubbed into another SPP batch',
  handed_over: 'Handed Over',
};

const crumbingStatusColors: Record<CrumbingStatus, string> = {
  scheduled: 'bg-slate-400',
  jp_prepping: 'bg-lime-600',
  jp_filling: 'bg-cyan-600',
  jp_filling_frozen: 'bg-blue-600',
  crumbing: 'bg-orange-500',
  frozen: 'bg-blue-500',
  frying: 'bg-red-500',
  packed: 'bg-emerald-500',
  clubbed: 'bg-slate-500',
  handed_over: 'bg-emerald-700',
};

interface CrumbingBatch {
  id: string;
  batchCode: string;
  type: CrumbingType;
  sourceBatchId: string;
  sourceBatchCode: string;
  clubbedInto?: string;
  clubbedAt?: string;
  clubbedBatchIds?: string[];
  clubbedBatchCodes?: string[];
  // Manual SPP batches may come from paneer that is not represented by a
  // production round. Keep the origin on the batch for traceability.
  origin?: string;
  pan111SourcePending?: boolean;
  pan111SourceLinkedAt?: string;
  hcpRecipeRequired?: boolean;
  status: CrumbingStatus;
  traysCrumbed: number;
  traysFried: number;
  traysRemaining: number;
  traysPacked: number;
  // SPP recipe and source-accounting details. These are optional so batches
  // created before the recipe workflow was introduced remain readable.
  sourceWeightKg?: number;
  balanceWeightKg?: number;
  weightCrumbedKg?: number;
  wastageKg?: number;
  recipe?: {
    flavourMultiplier: number;
    batterMultiplier: number;
    breadingMultiplier: number;
    flavourIyababKg: number;
    flavourPredustKg: number;
    batterIyababaKg: number;
    batterWaterL: number;
    breadingAdajioKg: number;
  };
  recipeRecordedAt?: string;
  recipeAutosavedAt?: string;
  balanceRecordedAt?: string;
  productionCompletedAt?: string;
  jpPrepping?: {
    buckets: Array<{
      id: string;
      nominalWeightKg: 2.5 | 5;
      rawWeightKg: number;
      drainedWeightKg: number;
      totalPieces: number;
      goodPieces: number;
      damagedPieces: number;
    }>;
    totalPieces: number;
    goodPieces: number;
    damagedPieces: number;
    crumbablePieces: number;
    initialPan111InputKg?: number;
    pan111InputKg: number;
    creamKg: number;
    blackPepperKg: number;
    saltKg: number;
    newCreamCheeseMadeKg?: number;
    carriedCreamCheeseSourceBatchId?: string;
    carriedCreamCheeseSourceBatchCode?: string;
    carriedCreamCheeseKg?: number;
    totalCreamCheeseAvailableKg?: number;
    additionalCreamCheeseMakes?: JpCreamCheeseMake[];
    preparedBy: string;
    completedAt?: string;
  };
  jpFilling?: {
    damagedPieces: number;
    filledPieces: number;
    traysFilled: number;
    filledBy: string;
    creamCheeseAvailableKg?: number;
    creamCheeseUsedKg?: number;
    creamCheeseLeftoverKg?: number;
    creamCheeseDisposition?: 'none' | 'carry_forward' | 'discarded';
    creamCheeseCarriedForwardKg?: number;
    creamCheeseDiscardedKg?: number;
    completedAt?: string;
    frozenAt?: string;
  };
  jpCrumbing?: {
    damagedPieces: number;
    finalCrumbedPieces: number;
    traysCrumbed: number;
    crumbedBy: string;
    predustMultiplier: number;
    batterMultiplier: number;
    breadingMultiplier: number;
    predustKg: number;
    batterMixKg: number;
    batterWaterL: number;
    adajioKg: number;
    completedAt?: string;
  };
  crumbingTeam?: string;
  fryingTeam?: string;
  fryTemperature?: number;
  fryTime?: number;
  packedSkus?: Array<{
    sku: string;
    cases: number;
    loose: number;
    weightKg?: number;
  }>;
  notes?: string;
  createdAt: string;
}

export default function CrumbingTab() {
  const { productionRounds, milkLots, intermediateLots, updateMilkLot, updateIntermediateLot } = useApp();
  const { showToast } = useToast();

  const [crumbingBatches, setCrumbingBatches] = useSupabaseState<CrumbingBatch[]>('vejoy_crumbingBatches', []);

  const [showNewBatchModal, setShowNewBatchModal] = useState(false);
  const [showTrayModal, setShowTrayModal] = useState(false);
  const [showPackModal, setShowPackModal] = useState(false);
  const [showClubSppModal, setShowClubSppModal] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<string | null>(null);
  const [clubSppBatchIds, setClubSppBatchIds] = useState<string[]>([]);
  const [activeType, setActiveType] = useState<CrumbingType>('SPP');

  // Forms
  const [newBatchForm, setNewBatchForm] = useState({
    type: 'SPP' as CrumbingType,
    sourceBatchId: '',
    manualPaneerWeightKg: 0,
    manualOrigin: '',
    halloumiWeightKg: 0,
    traysCrumbed: 0,
    crumbingTeam: '',
  });

  const [trayForm, setTrayForm] = useState({
    traysFried: 0,
    fryingTeam: '',
    fryTemperature: 185,
    fryTime: 20,
  });

  const [packForm, setPackForm] = useState({
    traysPacked: 0,
    sku: '',
    cases: 0,
    loose: 0,
  });

  const emptyJpPrepForm = () => ({
    buckets: [] as Array<{
      id: string;
      nominalWeightKg: 2.5 | 5;
      rawWeightKg: number;
      drainedWeightKg: number;
      totalPieces: number;
      goodPieces: number;
      damagedPieces: number;
    }>,
    totalPieces: 0,
    goodPieces: 0,
    damagedPieces: 0,
    pan111InputKg: 0,
    carriedCreamCheeseSourceBatchId: '',
    carriedCreamCheeseKg: 0,
    preparedBy: '',
  });
  const [jpPrepForm, setJpPrepForm] = useState(emptyJpPrepForm);
  const [jpFillingForm, setJpFillingForm] = useState({
    damagedPieces: 0,
    traysFilled: 0,
    filledBy: '',
    creamCheeseLeftoverKg: 0,
    creamCheeseDisposition: 'none' as 'none' | 'carry_forward' | 'discarded',
  });
  const [additionalCreamCheesePan111Kg, setAdditionalCreamCheesePan111Kg] = useState(0);
  const [jpSourceLinkSelection, setJpSourceLinkSelection] = useState('');
  const [jpCrumbingForm, setJpCrumbingForm] = useState({
    damagedPieces: 0,
    traysCrumbed: 0,
    crumbedBy: '',
    predustMultiplier: 0,
    batterMultiplier: 0,
    breadingMultiplier: 0,
  });
  const [hcpCrumbingForm, setHcpCrumbingForm] = useState({
    traysCrumbed: 0,
    crumbedBy: '',
    predustMultiplier: 0,
    batterMultiplier: 0,
    breadingMultiplier: 0,
  });

  const [recipeForm, setRecipeForm] = useState({
    sourceWeightKg: 0,
    balanceWeightKg: 0,
    balanceRecorded: false,
    wastageKg: 0,
    traysCrumbed: 0,
    flavourMultiplier: 0,
    batterMultiplier: 0,
    breadingMultiplier: 0,
  });

  const getSppSourceWeight = (round: typeof productionRounds[number] | undefined) => Math.max(0, round?.sppRecordedWeight || 0);

  // A source round can feed several SPP batches. The latest recorded physical
  // balance is the only weight available to the next batch. An unfinished
  // recipe deliberately locks the source until its balance is recorded.
  const getSppAvailableWeight = (round: typeof productionRounds[number] | undefined) => {
    if (!round) return 0;
    const allSourceBatches = crumbingBatches
      .filter(batch => batch.type === 'SPP' && batch.sourceBatchId === round.id);
    const sourceBatches = crumbingBatches
      .filter(batch => batch.type === 'SPP' && batch.sourceBatchId === round.id && !batch.clubbedInto && !batch.clubbedBatchIds?.length)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const latestBatch = sourceBatches[sourceBatches.length - 1];
    if (!latestBatch) return allSourceBatches.length > 0 ? 0 : getSppSourceWeight(round);
    return latestBatch.balanceWeightKg === undefined ? 0 : Math.max(0, latestBatch.balanceWeightKg);
  };

  const updateCrumbingBatch = (id: string, updates: Partial<CrumbingBatch>) => {
    setCrumbingBatches(current => current.map(batch => batch.id === id ? { ...batch, ...updates } : batch));
  };

  const openJpWorkflow = (batch: CrumbingBatch) => {
    if (batch.type !== 'JP') return;
    setSelectedBatch(batch.id);
    if (batch.status === 'jp_prepping') {
      setJpPrepForm(batch.jpPrepping ? {
        buckets: batch.jpPrepping.buckets.map(bucket => ({
          ...bucket,
          totalPieces: (bucket.goodPieces || 0) + (bucket.damagedPieces || 0),
          goodPieces: bucket.goodPieces || 0,
          damagedPieces: bucket.damagedPieces || 0,
        })),
        totalPieces: batch.jpPrepping.totalPieces,
        goodPieces: batch.jpPrepping.goodPieces,
        damagedPieces: batch.jpPrepping.damagedPieces,
        pan111InputKg: batch.jpPrepping.initialPan111InputKg ?? batch.jpPrepping.pan111InputKg,
        carriedCreamCheeseSourceBatchId: batch.jpPrepping.carriedCreamCheeseSourceBatchId || '',
        carriedCreamCheeseKg: batch.jpPrepping.carriedCreamCheeseKg || 0,
        preparedBy: batch.jpPrepping.preparedBy,
      } : { ...emptyJpPrepForm(), preparedBy: batch.crumbingTeam || '' });
    } else if (batch.status === 'jp_filling') {
      setJpFillingForm({
        damagedPieces: batch.jpFilling?.damagedPieces || 0,
        traysFilled: batch.jpFilling?.traysFilled || 0,
        filledBy: batch.jpFilling?.filledBy || batch.crumbingTeam || '',
        creamCheeseLeftoverKg: batch.jpFilling?.creamCheeseLeftoverKg || 0,
        creamCheeseDisposition: batch.jpFilling?.creamCheeseDisposition || 'none',
      });
    } else if (batch.status === 'jp_filling_frozen' || batch.status === 'crumbing') {
      setJpCrumbingForm({
        damagedPieces: batch.jpCrumbing?.damagedPieces || 0,
        traysCrumbed: batch.jpCrumbing?.traysCrumbed || 0,
        crumbedBy: batch.jpCrumbing?.crumbedBy || batch.crumbingTeam || '',
        predustMultiplier: batch.jpCrumbing?.predustMultiplier || 0,
        batterMultiplier: batch.jpCrumbing?.batterMultiplier || 0,
        breadingMultiplier: batch.jpCrumbing?.breadingMultiplier || 0,
      });
    }
  };

  const openHcpCrumbingWorkflow = (batch: CrumbingBatch) => {
    if (batch.type !== 'HCP') return;
    setSelectedBatch(batch.id);
    setHcpCrumbingForm({
      traysCrumbed: batch.traysCrumbed || 0,
      crumbedBy: batch.crumbingTeam || '',
      predustMultiplier: batch.recipe?.flavourMultiplier || 0,
      batterMultiplier: batch.recipe?.batterMultiplier || 0,
      breadingMultiplier: batch.recipe?.breadingMultiplier || 0,
    });
  };

  const getJpCreamCheeseCarryoverAvailable = (sourceBatch: CrumbingBatch, forBatchId?: string) => {
    const carriedForwardKg = sourceBatch.jpFilling?.creamCheeseCarriedForwardKg || 0;
    const allocatedKg = crumbingBatches.reduce((total, candidate) => {
      if (candidate.id === forBatchId || candidate.jpPrepping?.carriedCreamCheeseSourceBatchId !== sourceBatch.id) return total;
      return total + (candidate.jpPrepping.carriedCreamCheeseKg || 0);
    }, 0);
    return Math.max(0, carriedForwardKg - allocatedKg);
  };

  const getJpCreamCheeseCarryoverSources = (forBatchId?: string) => crumbingBatches.filter(candidate =>
    candidate.type === 'JP'
    && candidate.id !== forBatchId
    && getJpCreamCheeseCarryoverAvailable(candidate, forBatchId) > 0.001
  );

  const saveJpPrepDraft = (batch: CrumbingBatch, nextForm: typeof jpPrepForm) => {
    const pan111InputKg = Math.max(0, Number(nextForm.pan111InputKg) || 0);
    const carriedCreamCheeseKg = Math.max(0, Number(nextForm.carriedCreamCheeseKg) || 0);
    const carriedSource = crumbingBatches.find(candidate => candidate.id === nextForm.carriedCreamCheeseSourceBatchId);
    const totalPieces = nextForm.buckets.reduce((total, bucket) => total + (Number(bucket.totalPieces) || 0), 0);
    const goodPieces = nextForm.buckets.reduce((total, bucket) => total + (Number(bucket.goodPieces) || 0), 0);
    const damagedPieces = nextForm.buckets.reduce((total, bucket) => total + (Number(bucket.damagedPieces) || 0), 0);
    const calculatedForm = { ...nextForm, totalPieces, goodPieces, damagedPieces, pan111InputKg, carriedCreamCheeseKg };
    const creamKg = pan111InputKg * (0.75 / 15);
    const blackPepperKg = pan111InputKg * (0.018 / 15);
    const saltKg = pan111InputKg * (0.2 / 15);
    const newCreamCheeseMadeKg = pan111InputKg + creamKg + blackPepperKg + saltKg;
    setJpPrepForm(calculatedForm);
    updateCrumbingBatch(batch.id, {
      jpPrepping: {
        ...calculatedForm,
        crumbablePieces: Math.max(0, goodPieces) * 2,
        initialPan111InputKg: pan111InputKg,
        creamKg,
        blackPepperKg,
        saltKg,
        newCreamCheeseMadeKg,
        carriedCreamCheeseSourceBatchCode: carriedSource?.batchCode,
        totalCreamCheeseAvailableKg: newCreamCheeseMadeKg + carriedCreamCheeseKg,
        additionalCreamCheeseMakes: batch.jpPrepping?.additionalCreamCheeseMakes || [],
        completedAt: batch.jpPrepping?.completedAt,
      },
    });
  };

  const updateJpPrepBucket = (batch: CrumbingBatch, bucketId: string, updates: Partial<(typeof jpPrepForm.buckets)[number]>) => {
    saveJpPrepDraft(batch, {
      ...jpPrepForm,
      buckets: jpPrepForm.buckets.map(bucket => {
        if (bucket.id !== bucketId) return bucket;
        const updated = { ...bucket, ...updates };
        return { ...updated, totalPieces: (Number(updated.goodPieces) || 0) + (Number(updated.damagedPieces) || 0) };
      }),
    });
  };

  const addJpPrepBucket = (batch: CrumbingBatch, nominalWeightKg: 2.5 | 5) => {
    saveJpPrepDraft(batch, {
      ...jpPrepForm,
      buckets: [...jpPrepForm.buckets, {
        id: `jp-bucket-${Date.now()}-${jpPrepForm.buckets.length}`,
        nominalWeightKg,
        rawWeightKg: 0,
        drainedWeightKg: 0,
        totalPieces: 0,
        goodPieces: 0,
        damagedPieces: 0,
      }],
    });
  };

  const updateJpFillingDraft = (batch: CrumbingBatch, changes: Partial<typeof jpFillingForm>) => {
    const nextForm = { ...jpFillingForm, ...changes };
    setJpFillingForm(nextForm);
    const crumbablePieces = batch.jpPrepping?.crumbablePieces || 0;
    const damagedPieces = Math.min(crumbablePieces, Math.max(0, Math.trunc(nextForm.damagedPieces || 0)));
    const creamCheeseAvailableKg = batch.jpPrepping?.totalCreamCheeseAvailableKg
      ?? (batch.jpPrepping ? batch.jpPrepping.pan111InputKg + batch.jpPrepping.creamKg + batch.jpPrepping.blackPepperKg + batch.jpPrepping.saltKg : 0);
    const creamCheeseLeftoverKg = Math.max(0, Number(nextForm.creamCheeseLeftoverKg) || 0);
    updateCrumbingBatch(batch.id, {
      jpFilling: {
        damagedPieces,
        filledPieces: Math.max(0, crumbablePieces - damagedPieces),
        traysFilled: Math.max(0, Math.trunc(nextForm.traysFilled || 0)),
        filledBy: nextForm.filledBy,
        creamCheeseAvailableKg,
        creamCheeseUsedKg: Math.max(0, creamCheeseAvailableKg - creamCheeseLeftoverKg),
        creamCheeseLeftoverKg,
        creamCheeseDisposition: nextForm.creamCheeseDisposition,
        creamCheeseCarriedForwardKg: nextForm.creamCheeseDisposition === 'carry_forward' ? creamCheeseLeftoverKg : 0,
        creamCheeseDiscardedKg: nextForm.creamCheeseDisposition === 'discarded' ? creamCheeseLeftoverKg : 0,
        completedAt: batch.jpFilling?.completedAt,
        frozenAt: batch.jpFilling?.frozenAt,
      },
    });
  };

  const openRecipeDetails = (batch: CrumbingBatch) => {
    if (batch.type !== 'SPP') return;
    const sourceBatches = crumbingBatches
      .filter(item => item.type === 'SPP' && item.sourceBatchId === batch.sourceBatchId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    if (sourceBatches[sourceBatches.length - 1]?.id !== batch.id) {
      showToast('error', 'Only the latest SPP batch can change the source balance');
      return;
    }
    const sourceRound = productionRounds.find(round => round.id === batch.sourceBatchId);
    const sourceWeightKg = batch.sourceWeightKg || getSppAvailableWeight(sourceRound);
    setSelectedBatch(batch.id);
    setRecipeForm({
      sourceWeightKg,
      balanceWeightKg: batch.balanceWeightKg ?? sourceWeightKg,
      balanceRecorded: batch.balanceWeightKg !== undefined,
      wastageKg: batch.wastageKg || 0,
      traysCrumbed: batch.traysCrumbed || 0,
      flavourMultiplier: batch.recipe?.flavourMultiplier || 0,
      batterMultiplier: batch.recipe?.batterMultiplier || 0,
      breadingMultiplier: batch.recipe?.breadingMultiplier || 0,
    });
  };

  const buildRecipeDraftUpdates = (batch: CrumbingBatch, nextForm: typeof recipeForm): Partial<CrumbingBatch> => {
    const sourceWeightKg = batch.sourceWeightKg || nextForm.sourceWeightKg;
    const updates: Partial<CrumbingBatch> = {
      status: 'crumbing',
      sourceWeightKg,
      traysCrumbed: nextForm.traysCrumbed,
      traysRemaining: Math.max(0, nextForm.traysCrumbed - batch.traysFried),
      wastageKg: Math.max(0, Number(nextForm.wastageKg) || 0),
      recipe: {
        flavourMultiplier: nextForm.flavourMultiplier,
        batterMultiplier: nextForm.batterMultiplier,
        breadingMultiplier: nextForm.breadingMultiplier,
        flavourIyababKg: nextForm.flavourMultiplier * 0.8,
        flavourPredustKg: nextForm.flavourMultiplier * 0.2,
        batterIyababaKg: nextForm.batterMultiplier,
        batterWaterL: nextForm.batterMultiplier * 2.5,
        breadingAdajioKg: nextForm.breadingMultiplier,
      },
      recipeRecordedAt: new Date().toISOString(),
      recipeAutosavedAt: new Date().toISOString(),
    };
    if (nextForm.balanceRecorded) {
      const balanceWeightKg = Math.min(sourceWeightKg, Math.max(0, Number(nextForm.balanceWeightKg) || 0));
      const wastageKg = Math.max(0, Number(nextForm.wastageKg) || 0);
      updates.balanceWeightKg = balanceWeightKg;
      // Dry paneer has three mutually exclusive destinations.  Wastage must
      // be removed from the source before calculating the crumbed output.
      updates.weightCrumbedKg = Math.max(0, sourceWeightKg - balanceWeightKg - wastageKg);
      updates.balanceRecordedAt = batch.balanceRecordedAt || new Date().toISOString();
    }
    return updates;
  };

  const updateRecipeDraft = (changes: Partial<typeof recipeForm>) => {
    const nextForm = { ...recipeForm, ...changes };
    setRecipeForm(nextForm);
    if (!selectedBatch) return;
    const batch = crumbingBatches.find(item => item.id === selectedBatch);
    if (!batch || batch.type !== 'SPP') return;
    updateCrumbingBatch(selectedBatch, buildRecipeDraftUpdates(batch, nextForm));
  };

  // Get available sources
  const getAvailableSources = (type: CrumbingType) => {
    if (type === 'SPP') {
      // Paneer rounds cut as SPP pieces
      return productionRounds.filter(r => 
        (r.type === 'C/S' || r.type === 'D') &&
        r.cuttingType === 'SPP pieces' &&
        r.status === 'cut' &&
        getSppAvailableWeight(r) > 0.01
      );
    } else if (type === 'JP') {
      // PAN111 from intermediate lots
      return [...intermediateLots.filter(lot =>
        lot.productId === 'pan111' &&
        lot.status === 'available'
      )].sort((a, b) => {
        if (Boolean(a.priorityUse) !== Boolean(b.priorityUse)) return a.priorityUse ? -1 : 1;
        return new Date(a.useByDate || a.producedAt).getTime() - new Date(b.useByDate || b.producedAt).getTime();
      });
    } else if (type === 'HCP') {
      // All weighed Halloumi from a milk lot is pooled as HAL-<lot>. The
      // remaining pool, rather than an individual round, is the crumbing source.
      return milkLots.filter(lot => (lot.halloumiPool?.availableForCrumbing || 0) > 0);
    }
    return [];
  };

  // Generate batch code
  const generateBatchCode = (type: CrumbingType, milkLotCode: string) => {
    const typeLower = type.toLowerCase();
    const existingBatches = crumbingBatches.filter(b => 
      b.batchCode.startsWith(`${milkLotCode}-${typeLower}-`)
    );
    const nextNumber = existingBatches.length + 1;
    return `${milkLotCode}-${typeLower}-${String(nextNumber).padStart(3, '0')}`;
  };

  // Handlers
  const handleCreateBatch = () => {
    const isManualSpp = newBatchForm.type === 'SPP' && newBatchForm.sourceBatchId === 'manual';
    const isPendingJp = newBatchForm.type === 'JP' && newBatchForm.sourceBatchId === 'pending';
    if ((!newBatchForm.sourceBatchId || ((isManualSpp || isPendingJp) && !newBatchForm.manualOrigin.trim())) || !newBatchForm.crumbingTeam.trim()) {
      showToast('error', 'Please fill all required fields');
      return;
    }
    if (isManualSpp && newBatchForm.manualPaneerWeightKg <= 0) {
      showToast('error', 'Enter the paneer weight available for SPP');
      return;
    }
    if (newBatchForm.type === 'HCP' && newBatchForm.halloumiWeightKg <= 0) {
      showToast('error', 'Enter the Halloumi weight being allocated to HCP crumbing');
      return;
    }
    if (newBatchForm.type === 'HCP' && newBatchForm.traysCrumbed <= 0) {
      showToast('error', 'Enter the number of trays crumbed');
      return;
    }

    let sourceBatchCode = '';
    let milkLotCode = '';
    let origin: string | undefined;
    let sourceWeightKg: number | undefined;

    if (newBatchForm.type === 'SPP') {
      if (isManualSpp) {
        origin = newBatchForm.manualOrigin.trim();
        sourceBatchCode = `Manual entry · ${origin}`;
        milkLotCode = 'MANUAL';
        sourceWeightKg = Math.max(0, Number(newBatchForm.manualPaneerWeightKg) || 0);
      } else {
        const source = productionRounds.find(r => r.id === newBatchForm.sourceBatchId);
        if (!source) {
          showToast('error', 'Select a valid SPP source round or choose Manual entry');
          return;
        }
        sourceBatchCode = `${source.milkLotCode}/S${source.shiftNumber}/R${source.roundNumber}/${source.type}`;
        milkLotCode = source.milkLotCode;
        sourceWeightKg = getSppAvailableWeight(source);
        if (sourceWeightKg <= 0.01) {
          showToast('error', 'This SPP source has no balance available for another crumbing batch');
          return;
        }
      }
    } else if (newBatchForm.type === 'JP') {
      if (isPendingJp) {
        origin = newBatchForm.manualOrigin.trim();
        sourceBatchCode = `Pending PAN111 source · ${origin}`;
        milkLotCode = 'PENDING';
      } else {
        const source = intermediateLots.find(l => l.id === newBatchForm.sourceBatchId);
        if (!source || source.productId !== 'pan111' || source.status !== 'available') {
          showToast('error', 'Select an available PAN111 source or choose pending production');
          return;
        }
        sourceBatchCode = source.lotCode;
        milkLotCode = source.sourceMilkLotCode;
      }
    } else if (newBatchForm.type === 'HCP') {
      const source = milkLots.find(lot => lot.id === newBatchForm.sourceBatchId);
      const pool = source?.halloumiPool;
      const availableForCrumbing = Math.max(0, pool?.availableForCrumbing || 0);
      if (!source || !pool) {
        showToast('error', 'Select a Halloumi common pool');
        return;
      }
      if (newBatchForm.halloumiWeightKg > availableForCrumbing + 0.01) {
        showToast('error', `Only ${availableForCrumbing.toFixed(2)} kg is unallocated in this Halloumi pool`);
        return;
      }
      sourceBatchCode = pool.batchId || `HAL-${source.lotCode}`;
      milkLotCode = source.lotCode;
      sourceWeightKg = Math.min(availableForCrumbing, Math.max(0, Number(newBatchForm.halloumiWeightKg) || 0));
      updateMilkLot(source.id, {
        halloumiPool: {
          ...pool,
          usedInCrumbing: (pool.usedInCrumbing || 0) + sourceWeightKg,
          availableForCrumbing: Math.max(0, availableForCrumbing - sourceWeightKg),
        },
      });
    }

    const batchCode = generateBatchCode(newBatchForm.type, milkLotCode);

    const sourceRound = newBatchForm.type === 'SPP' && !isManualSpp
      ? productionRounds.find(round => round.id === newBatchForm.sourceBatchId)
      : undefined;
    if (newBatchForm.type === 'SPP' && sourceWeightKg === undefined && sourceRound) {
      sourceWeightKg = getSppAvailableWeight(sourceRound);
    }
    const newBatch: CrumbingBatch = {
      id: `crumb-${Date.now()}`,
      batchCode,
      type: newBatchForm.type,
      sourceBatchId: isManualSpp ? `manual-spp-${Date.now()}` : isPendingJp ? `pending-pan111-${Date.now()}` : newBatchForm.sourceBatchId,
      sourceBatchCode,
      origin,
      pan111SourcePending: isPendingJp,
      hcpRecipeRequired: newBatchForm.type === 'HCP',
      status: newBatchForm.type === 'SPP' ? 'scheduled' : newBatchForm.type === 'JP' ? 'jp_prepping' : 'crumbing',
      traysCrumbed: newBatchForm.type === 'HCP' ? newBatchForm.traysCrumbed : 0,
      traysFried: 0,
      traysRemaining: newBatchForm.type === 'HCP' ? newBatchForm.traysCrumbed : 0,
      traysPacked: 0,
      sourceWeightKg,
      crumbingTeam: newBatchForm.crumbingTeam,
      createdAt: new Date().toISOString(),
    };

    setCrumbingBatches(current => [...current, newBatch]);
    showToast('success', `Crumbing batch created: ${batchCode}`);
    setShowNewBatchModal(false);
    if (newBatchForm.type === 'SPP') {
      setSelectedBatch(newBatch.id);
      setRecipeForm({
        sourceWeightKg: sourceWeightKg || 0,
        balanceWeightKg: sourceWeightKg || 0,
        balanceRecorded: false,
        wastageKg: 0,
        traysCrumbed: 0,
        flavourMultiplier: 0,
        batterMultiplier: 0,
        breadingMultiplier: 0,
      });
    } else if (newBatchForm.type === 'JP') {
      setSelectedBatch(newBatch.id);
      setJpPrepForm({ ...emptyJpPrepForm(), preparedBy: newBatchForm.crumbingTeam.trim() });
    } else if (newBatchForm.type === 'HCP') {
      setSelectedBatch(newBatch.id);
      setHcpCrumbingForm({
        traysCrumbed: newBatchForm.traysCrumbed,
        crumbedBy: newBatchForm.crumbingTeam.trim(),
        predustMultiplier: 0,
        batterMultiplier: 0,
        breadingMultiplier: 0,
      });
    }
    setNewBatchForm({ type: 'SPP', sourceBatchId: '', manualPaneerWeightKg: 0, manualOrigin: '', halloumiWeightKg: 0, traysCrumbed: 0, crumbingTeam: '' });
  };

  const getClubEligibleSppBatches = () => crumbingBatches
    .filter(batch =>
      batch.type === 'SPP' &&
      batch.status === 'crumbing' &&
      !batch.clubbedInto &&
      !batch.clubbedBatchIds?.length &&
      Boolean(batch.productionCompletedAt) &&
      Boolean(batch.recipe) &&
      batch.traysFried === 0 &&
      batch.traysPacked === 0
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const handleClubSppBatches = () => {
    const selected = getClubEligibleSppBatches().filter(batch => clubSppBatchIds.includes(batch.id));
    if (selected.length < 2) {
      showToast('error', 'Select at least two completed SPP batches to club');
      return;
    }

    const primary = selected[0];
    const now = new Date().toISOString();
    const sum = (read: (batch: CrumbingBatch) => number) => selected.reduce((total, batch) => total + (read(batch) || 0), 0);
    const flavourMultiplier = sum(batch => batch.recipe?.flavourMultiplier || 0);
    const batterMultiplier = sum(batch => batch.recipe?.batterMultiplier || 0);
    const breadingMultiplier = sum(batch => batch.recipe?.breadingMultiplier || 0);
    const sourceWeightKg = sum(batch => batch.sourceWeightKg || 0);
    const balanceWeightKg = sum(batch => batch.balanceWeightKg || 0);
    const weightCrumbedKg = sum(batch => batch.weightCrumbedKg || 0);
    const wastageKg = sum(batch => batch.wastageKg || 0);
    const traysCrumbed = sum(batch => batch.traysCrumbed);
    const clubbedBatchIds = selected.map(batch => batch.id);
    const clubbedBatchCodes = selected.map(batch => batch.batchCode);

    setCrumbingBatches(current => current.map(batch => {
      if (batch.id === primary.id) {
        return {
          ...batch,
          status: 'crumbing',
          sourceBatchCode: clubbedBatchCodes.join(' + '),
          sourceWeightKg,
          balanceWeightKg,
          weightCrumbedKg,
          wastageKg,
          traysCrumbed,
          traysRemaining: traysCrumbed,
          traysFried: 0,
          traysPacked: 0,
          packedSkus: undefined,
          recipe: {
            flavourMultiplier,
            batterMultiplier,
            breadingMultiplier,
            flavourIyababKg: sum(batch => batch.recipe?.flavourIyababKg || 0),
            flavourPredustKg: sum(batch => batch.recipe?.flavourPredustKg || 0),
            batterIyababaKg: sum(batch => batch.recipe?.batterIyababaKg || 0),
            batterWaterL: sum(batch => batch.recipe?.batterWaterL || 0),
            breadingAdajioKg: sum(batch => batch.recipe?.breadingAdajioKg || 0),
          },
          recipeRecordedAt: now,
          recipeAutosavedAt: now,
          balanceRecordedAt: now,
          productionCompletedAt: now,
          clubbedAt: now,
          clubbedBatchIds,
          clubbedBatchCodes,
          notes: `${batch.notes ? `${batch.notes}\n` : ''}Clubbed SPP batches: ${clubbedBatchCodes.join(', ')}`,
        };
      }
      if (clubbedBatchIds.includes(batch.id)) {
        return {
          ...batch,
          status: 'clubbed',
          clubbedInto: primary.id,
          clubbedAt: now,
        };
      }
      return batch;
    }));

    setSelectedBatch(primary.id);
    setRecipeForm({
      sourceWeightKg,
      balanceWeightKg,
      balanceRecorded: true,
      wastageKg,
      traysCrumbed,
      flavourMultiplier,
      batterMultiplier,
      breadingMultiplier,
    });
    setClubSppBatchIds([]);
    setShowClubSppModal(false);
    showToast('success', `Clubbed ${selected.length} SPP batches · ${traysCrumbed} trays ready for combined packing`);
  };

  const handleCompleteProduction = () => {
    if (!selectedBatch) return;
    const batch = crumbingBatches.find(item => item.id === selectedBatch);
    if (!batch || batch.type !== 'SPP') return;
    const sourceWeightKg = batch.sourceWeightKg || recipeForm.sourceWeightKg;
    const balanceWeightKg = Number(recipeForm.balanceWeightKg) || 0;
    const wastageKg = Number(recipeForm.wastageKg) || 0;
    // Zero is a valid balance when all paneer has been consumed. Use the
    // current form flag as the source of truth so completion does not race
    // the autosave update that writes balanceWeightKg onto the batch object.
    if (!recipeForm.balanceRecorded) {
      showToast('error', 'Record the physically weighed balance paneer before completing production');
      return;
    }
    if (sourceWeightKg <= 0 || balanceWeightKg < 0 || balanceWeightKg > sourceWeightKg + 0.01) {
      showToast('error', 'Enter a balance weight from 0 up to the available source weight');
      return;
    }
    if (recipeForm.traysCrumbed <= 0 || wastageKg < 0) {
      showToast('error', 'Enter the number of trays and a valid wastage weight');
      return;
    }
    if (recipeForm.flavourMultiplier <= 0 || recipeForm.batterMultiplier <= 0 || recipeForm.breadingMultiplier <= 0) {
      showToast('error', 'Record at least one addition for each coat');
      return;
    }

    const normalizedBalanceWeightKg = Math.min(sourceWeightKg, Math.max(0, balanceWeightKg));
    const normalizedWastageKg = Math.max(0, wastageKg);
    if (normalizedBalanceWeightKg + normalizedWastageKg > sourceWeightKg + 0.01) {
      showToast('error', 'Balance plus wastage cannot exceed the source paneer weight');
      return;
    }
    const normalizedWeightCrumbedKg = Math.max(0, sourceWeightKg - normalizedBalanceWeightKg - normalizedWastageKg);
    updateCrumbingBatch(selectedBatch, {
      status: 'crumbing',
      traysCrumbed: recipeForm.traysCrumbed,
      traysRemaining: recipeForm.traysCrumbed,
      sourceWeightKg,
      balanceWeightKg: normalizedBalanceWeightKg,
      weightCrumbedKg: normalizedWeightCrumbedKg,
      wastageKg: normalizedWastageKg,
      recipe: {
        flavourMultiplier: recipeForm.flavourMultiplier,
        batterMultiplier: recipeForm.batterMultiplier,
        breadingMultiplier: recipeForm.breadingMultiplier,
        flavourIyababKg: recipeForm.flavourMultiplier * 0.8,
        flavourPredustKg: recipeForm.flavourMultiplier * 0.2,
        batterIyababaKg: recipeForm.batterMultiplier * 1,
        batterWaterL: recipeForm.batterMultiplier * 2.5,
        breadingAdajioKg: recipeForm.breadingMultiplier * 1,
      },
      recipeRecordedAt: new Date().toISOString(),
      recipeAutosavedAt: new Date().toISOString(),
      productionCompletedAt: new Date().toISOString(),
    });
    showToast('success', `Production completed · ${normalizedWeightCrumbedKg.toFixed(2)} kg crumbed · ${normalizedBalanceWeightKg.toFixed(2)} kg returned to source`);
  };

  const handleCompleteJpPrepping = (batch: CrumbingBatch) => {
    if (batch.type !== 'JP') return;
    const source = intermediateLots.find(lot => lot.id === batch.sourceBatchId);
    if ((!source || source.productId !== 'pan111') && !batch.pan111SourcePending) {
      showToast('error', 'The PAN111 source for this JP batch is no longer available');
      return;
    }
    if (jpPrepForm.buckets.length === 0) {
      showToast('error', 'Add at least one 2.5 kg or 5 kg jalapeño bucket');
      return;
    }
    const invalidBucket = jpPrepForm.buckets.some(bucket =>
      bucket.rawWeightKg <= 0 || bucket.drainedWeightKg <= 0 || bucket.drainedWeightKg > bucket.rawWeightKg
    );
    if (invalidBucket) {
      showToast('error', 'Record valid raw and drained weights for every bucket; drained weight cannot exceed raw weight');
      return;
    }
    const invalidBucketCounts = jpPrepForm.buckets.some(bucket =>
      ![bucket.totalPieces, bucket.goodPieces, bucket.damagedPieces].every(Number.isInteger)
      || bucket.totalPieces <= 0
      || bucket.goodPieces < 0
      || bucket.damagedPieces < 0
      || bucket.goodPieces + bucket.damagedPieces !== bucket.totalPieces
    );
    if (invalidBucketCounts) {
      showToast('error', 'For every bucket, enter whole-number counts where good plus damaged equals total jalapeños');
      return;
    }
    const { totalPieces, goodPieces, damagedPieces, pan111InputKg } = jpPrepForm;
    if (pan111InputKg <= 0 || (source && pan111InputKg > source.currentQuantity + 0.001)) {
      showToast('error', source ? `Enter PAN111 from 0.01 kg up to the available ${source.currentQuantity.toFixed(2)} kg` : 'Enter the PAN111 quantity used');
      return;
    }
    const carryoverSource = crumbingBatches.find(candidate => candidate.id === jpPrepForm.carriedCreamCheeseSourceBatchId);
    const carryoverAvailableKg = carryoverSource ? getJpCreamCheeseCarryoverAvailable(carryoverSource, batch.id) : 0;
    if (jpPrepForm.carriedCreamCheeseKg > 0 && (!carryoverSource || jpPrepForm.carriedCreamCheeseKg > carryoverAvailableKg + 0.001)) {
      showToast('error', `Select a valid cream-cheese carryover and use no more than ${carryoverAvailableKg.toFixed(2)} kg`);
      return;
    }
    if (!jpPrepForm.preparedBy.trim()) {
      showToast('error', 'Enter the staff responsible for JP preparation');
      return;
    }

    const now = new Date().toISOString();
    const creamKg = pan111InputKg * (0.75 / 15);
    const blackPepperKg = pan111InputKg * (0.018 / 15);
    const saltKg = pan111InputKg * (0.2 / 15);
    const newCreamCheeseMadeKg = pan111InputKg + creamKg + blackPepperKg + saltKg;
    updateCrumbingBatch(batch.id, {
      status: 'jp_filling',
      sourceWeightKg: pan111InputKg,
      jpPrepping: {
        buckets: jpPrepForm.buckets,
        totalPieces,
        goodPieces,
        damagedPieces,
        crumbablePieces: goodPieces * 2,
        initialPan111InputKg: pan111InputKg,
        pan111InputKg,
        creamKg,
        blackPepperKg,
        saltKg,
        newCreamCheeseMadeKg,
        carriedCreamCheeseSourceBatchId: carryoverSource?.id,
        carriedCreamCheeseSourceBatchCode: carryoverSource?.batchCode,
        carriedCreamCheeseKg: jpPrepForm.carriedCreamCheeseKg,
        totalCreamCheeseAvailableKg: newCreamCheeseMadeKg + jpPrepForm.carriedCreamCheeseKg,
        additionalCreamCheeseMakes: [],
        preparedBy: jpPrepForm.preparedBy.trim(),
        completedAt: now,
      },
    });
    if (source) {
      const remainingPan111 = Math.max(0, source.currentQuantity - pan111InputKg);
      updateIntermediateLot(source.id, {
        currentQuantity: remainingPan111,
        status: remainingPan111 > 0.001 ? 'available' : 'consumed',
      });
    }
    setJpFillingForm({ damagedPieces: 0, traysFilled: 0, filledBy: jpPrepForm.preparedBy.trim(), creamCheeseLeftoverKg: 0, creamCheeseDisposition: 'none' });
    showToast('success', `JP preparation completed · ${goodPieces * 2} crumbable jalapeño halves · ${pan111InputKg.toFixed(2)} kg PAN111 used`);
  };

  const handleAddJpCreamCheeseMake = (batch: CrumbingBatch) => {
    const prep = batch.jpPrepping;
    const pan111InputKg = Math.max(0, Number(additionalCreamCheesePan111Kg) || 0);
    if (!prep?.completedAt || batch.status !== 'jp_filling' || pan111InputKg <= 0) {
      showToast('error', 'Enter the additional PAN111 quantity used for cream cheese');
      return;
    }
    const source = intermediateLots.find(lot => lot.id === batch.sourceBatchId && lot.productId === 'pan111');
    if (!source && !batch.pan111SourcePending) {
      showToast('error', 'Link a valid PAN111 source before recording more cream cheese');
      return;
    }
    if (source && pan111InputKg > source.currentQuantity + 0.001) {
      showToast('error', `Only ${source.currentQuantity.toFixed(2)} kg remains in the linked PAN111 source`);
      return;
    }

    const creamKg = pan111InputKg * (0.75 / 15);
    const blackPepperKg = pan111InputKg * (0.018 / 15);
    const saltKg = pan111InputKg * (0.2 / 15);
    const totalMadeKg = pan111InputKg + creamKg + blackPepperKg + saltKg;
    const make: JpCreamCheeseMake = {
      id: `jp-cream-cheese-${Date.now()}`,
      pan111InputKg,
      creamKg,
      blackPepperKg,
      saltKg,
      totalMadeKg,
      recordedAt: new Date().toISOString(),
    };
    const nextPan111InputKg = prep.pan111InputKg + pan111InputKg;
    const nextCreamKg = prep.creamKg + creamKg;
    const nextBlackPepperKg = prep.blackPepperKg + blackPepperKg;
    const nextSaltKg = prep.saltKg + saltKg;
    const nextNewCreamCheeseMadeKg = (prep.newCreamCheeseMadeKg ?? (prep.pan111InputKg + prep.creamKg + prep.blackPepperKg + prep.saltKg)) + totalMadeKg;
    updateCrumbingBatch(batch.id, {
      sourceWeightKg: nextPan111InputKg,
      jpPrepping: {
        ...prep,
        pan111InputKg: nextPan111InputKg,
        creamKg: nextCreamKg,
        blackPepperKg: nextBlackPepperKg,
        saltKg: nextSaltKg,
        newCreamCheeseMadeKg: nextNewCreamCheeseMadeKg,
        totalCreamCheeseAvailableKg: nextNewCreamCheeseMadeKg + (prep.carriedCreamCheeseKg || 0),
        additionalCreamCheeseMakes: [...(prep.additionalCreamCheeseMakes || []), make],
      },
    });
    if (source) {
      const remainingPan111 = Math.max(0, source.currentQuantity - pan111InputKg);
      updateIntermediateLot(source.id, { currentQuantity: remainingPan111, status: remainingPan111 > 0.001 ? 'available' : 'consumed' });
    }
    setAdditionalCreamCheesePan111Kg(0);
    showToast('success', `Additional cream cheese recorded · ${pan111InputKg.toFixed(2)} kg PAN111 produced ${totalMadeKg.toFixed(2)} kg`);
  };

  const handleLinkJpPan111Source = (batch: CrumbingBatch) => {
    const source = intermediateLots.find(lot => lot.id === jpSourceLinkSelection && lot.productId === 'pan111');
    if (!batch.pan111SourcePending || !source) {
      showToast('error', 'Select an available PAN111 source lot');
      return;
    }
    const pan111RecordedKg = batch.jpPrepping?.pan111InputKg || 0;
    const shouldDeductNow = Boolean(batch.jpPrepping?.completedAt);
    if (shouldDeductNow && pan111RecordedKg > source.currentQuantity + 0.001) {
      showToast('error', `The selected source has ${source.currentQuantity.toFixed(2)} kg but this batch recorded ${pan111RecordedKg.toFixed(2)} kg`);
      return;
    }
    if (shouldDeductNow && pan111RecordedKg > 0) {
      const remainingPan111 = Math.max(0, source.currentQuantity - pan111RecordedKg);
      updateIntermediateLot(source.id, { currentQuantity: remainingPan111, status: remainingPan111 > 0.001 ? 'available' : 'consumed' });
    }
    updateCrumbingBatch(batch.id, {
      sourceBatchId: source.id,
      sourceBatchCode: source.lotCode,
      pan111SourcePending: false,
      pan111SourceLinkedAt: new Date().toISOString(),
    });
    setJpSourceLinkSelection('');
    showToast('success', `PAN111 source linked to ${source.lotCode}${shouldDeductNow ? ` and ${pan111RecordedKg.toFixed(2)} kg reconciled` : ''}`);
  };

  const handleCompleteJpFilling = (batch: CrumbingBatch) => {
    const crumbablePieces = batch.jpPrepping?.crumbablePieces || 0;
    if (batch.type !== 'JP' || crumbablePieces <= 0) return;
    if (!Number.isInteger(jpFillingForm.damagedPieces) || jpFillingForm.damagedPieces < 0 || jpFillingForm.damagedPieces > crumbablePieces) {
      showToast('error', `Filling damage must be a whole number from 0 to ${crumbablePieces}`);
      return;
    }
    if (!Number.isInteger(jpFillingForm.traysFilled) || jpFillingForm.traysFilled <= 0 || !jpFillingForm.filledBy.trim()) {
      showToast('error', 'Enter the filled tray count and responsible staff');
      return;
    }
    const creamCheeseAvailableKg = batch.jpPrepping?.totalCreamCheeseAvailableKg
      ?? (batch.jpPrepping ? batch.jpPrepping.pan111InputKg + batch.jpPrepping.creamKg + batch.jpPrepping.blackPepperKg + batch.jpPrepping.saltKg : 0);
    const creamCheeseLeftoverKg = Math.max(0, Number(jpFillingForm.creamCheeseLeftoverKg) || 0);
    if (creamCheeseLeftoverKg > creamCheeseAvailableKg + 0.001) {
      showToast('error', `Cream-cheese leftover cannot exceed the ${creamCheeseAvailableKg.toFixed(2)} kg available`);
      return;
    }
    if (creamCheeseLeftoverKg > 0 && jpFillingForm.creamCheeseDisposition === 'none') {
      showToast('error', 'Choose whether the leftover cream cheese will be carried forward or discarded');
      return;
    }
    const now = new Date().toISOString();
    const filledPieces = crumbablePieces - jpFillingForm.damagedPieces;
    updateCrumbingBatch(batch.id, {
      status: 'jp_filling_frozen',
      jpFilling: {
        damagedPieces: jpFillingForm.damagedPieces,
        filledPieces,
        traysFilled: jpFillingForm.traysFilled,
        filledBy: jpFillingForm.filledBy.trim(),
        creamCheeseAvailableKg,
        creamCheeseUsedKg: Math.max(0, creamCheeseAvailableKg - creamCheeseLeftoverKg),
        creamCheeseLeftoverKg,
        creamCheeseDisposition: creamCheeseLeftoverKg > 0 ? jpFillingForm.creamCheeseDisposition : 'none',
        creamCheeseCarriedForwardKg: jpFillingForm.creamCheeseDisposition === 'carry_forward' ? creamCheeseLeftoverKg : 0,
        creamCheeseDiscardedKg: jpFillingForm.creamCheeseDisposition === 'discarded' ? creamCheeseLeftoverKg : 0,
        completedAt: now,
        frozenAt: now,
      },
    });
    setJpCrumbingForm({
      damagedPieces: 0,
      traysCrumbed: 0,
      crumbedBy: jpFillingForm.filledBy.trim(),
      predustMultiplier: 0,
      batterMultiplier: 0,
      breadingMultiplier: 0,
    });
    showToast('success', `Cheese filling completed and frozen · ${filledPieces} filled pieces in ${jpFillingForm.traysFilled} trays`);
  };

  const updateJpCrumbingDraft = (batch: CrumbingBatch, changes: Partial<typeof jpCrumbingForm>) => {
    const nextForm = { ...jpCrumbingForm, ...changes };
    setJpCrumbingForm(nextForm);
    const filledPieces = batch.jpFilling?.filledPieces || 0;
    const damagedPieces = Math.min(filledPieces, Math.max(0, Math.trunc(nextForm.damagedPieces || 0)));
    updateCrumbingBatch(batch.id, {
      recipe: {
        flavourMultiplier: nextForm.predustMultiplier,
        batterMultiplier: nextForm.batterMultiplier,
        breadingMultiplier: nextForm.breadingMultiplier,
        flavourIyababKg: 0,
        flavourPredustKg: nextForm.predustMultiplier,
        batterIyababaKg: nextForm.batterMultiplier,
        batterWaterL: nextForm.batterMultiplier * 2.5,
        breadingAdajioKg: nextForm.breadingMultiplier,
      },
      recipeAutosavedAt: new Date().toISOString(),
      jpCrumbing: {
        damagedPieces,
        finalCrumbedPieces: Math.max(0, filledPieces - damagedPieces),
        traysCrumbed: Math.max(0, Math.trunc(nextForm.traysCrumbed || 0)),
        crumbedBy: nextForm.crumbedBy,
        predustMultiplier: nextForm.predustMultiplier,
        batterMultiplier: nextForm.batterMultiplier,
        breadingMultiplier: nextForm.breadingMultiplier,
        predustKg: nextForm.predustMultiplier,
        batterMixKg: nextForm.batterMultiplier,
        batterWaterL: nextForm.batterMultiplier * 2.5,
        adajioKg: nextForm.breadingMultiplier,
        completedAt: batch.jpCrumbing?.completedAt,
      },
    });
  };

  const handleCompleteJpCrumbing = (batch: CrumbingBatch) => {
    const filledPieces = batch.jpFilling?.filledPieces || 0;
    const { damagedPieces, traysCrumbed, crumbedBy, predustMultiplier, batterMultiplier, breadingMultiplier } = jpCrumbingForm;
    if (!Number.isInteger(damagedPieces) || damagedPieces < 0 || damagedPieces > filledPieces) {
      showToast('error', `Crumbing damage must be a whole number from 0 to ${filledPieces}`);
      return;
    }
    if (!Number.isInteger(traysCrumbed) || traysCrumbed <= 0 || !crumbedBy.trim()) {
      showToast('error', 'Enter the crumbed tray count and responsible staff');
      return;
    }
    if (predustMultiplier <= 0 || batterMultiplier <= 0 || breadingMultiplier <= 0) {
      showToast('error', 'Record at least one addition for Predust, batter, and Adajio');
      return;
    }
    const finalCrumbedPieces = Math.max(0, filledPieces - damagedPieces);
    const now = new Date().toISOString();
    updateCrumbingBatch(batch.id, {
      status: 'crumbing',
      traysCrumbed,
      traysRemaining: traysCrumbed,
      crumbingTeam: crumbedBy.trim(),
      recipe: {
        flavourMultiplier: predustMultiplier,
        batterMultiplier,
        breadingMultiplier,
        flavourIyababKg: 0,
        flavourPredustKg: predustMultiplier,
        batterIyababaKg: batterMultiplier,
        batterWaterL: batterMultiplier * 2.5,
        breadingAdajioKg: breadingMultiplier,
      },
      recipeRecordedAt: now,
      recipeAutosavedAt: now,
      productionCompletedAt: now,
      jpCrumbing: {
        damagedPieces,
        finalCrumbedPieces,
        traysCrumbed,
        crumbedBy: crumbedBy.trim(),
        predustMultiplier,
        batterMultiplier,
        breadingMultiplier,
        predustKg: predustMultiplier,
        batterMixKg: batterMultiplier,
        batterWaterL: batterMultiplier * 2.5,
        adajioKg: breadingMultiplier,
        completedAt: now,
      },
    });
    showToast('success', `JP crumbing completed · ${finalCrumbedPieces} pieces in ${traysCrumbed} trays. Freeze before frying.`);
  };

  const updateHcpCrumbingDraft = (batch: CrumbingBatch, changes: Partial<typeof hcpCrumbingForm>) => {
    const nextForm = { ...hcpCrumbingForm, ...changes };
    setHcpCrumbingForm(nextForm);
    const traysCrumbed = Math.max(0, Math.trunc(nextForm.traysCrumbed || 0));
    updateCrumbingBatch(batch.id, {
      traysCrumbed,
      traysRemaining: Math.max(0, traysCrumbed - batch.traysFried),
      crumbingTeam: nextForm.crumbedBy,
      recipe: {
        flavourMultiplier: nextForm.predustMultiplier,
        batterMultiplier: nextForm.batterMultiplier,
        breadingMultiplier: nextForm.breadingMultiplier,
        flavourIyababKg: 0,
        flavourPredustKg: nextForm.predustMultiplier,
        batterIyababaKg: nextForm.batterMultiplier,
        batterWaterL: nextForm.batterMultiplier * 2.5,
        breadingAdajioKg: nextForm.breadingMultiplier,
      },
      recipeAutosavedAt: new Date().toISOString(),
    });
  };

  const handleCompleteHcpCrumbing = (batch: CrumbingBatch) => {
    const { traysCrumbed, crumbedBy, predustMultiplier, batterMultiplier, breadingMultiplier } = hcpCrumbingForm;
    if (!Number.isInteger(traysCrumbed) || traysCrumbed <= 0 || !crumbedBy.trim()) {
      showToast('error', 'Enter the HCP crumbed tray count and responsible staff');
      return;
    }
    if (predustMultiplier <= 0 || batterMultiplier <= 0 || breadingMultiplier <= 0) {
      showToast('error', 'Record at least one addition for Predust, batter, and Adajio');
      return;
    }
    const now = new Date().toISOString();
    updateCrumbingBatch(batch.id, {
      status: 'crumbing',
      traysCrumbed,
      traysRemaining: traysCrumbed,
      crumbingTeam: crumbedBy.trim(),
      recipe: {
        flavourMultiplier: predustMultiplier,
        batterMultiplier,
        breadingMultiplier,
        flavourIyababKg: 0,
        flavourPredustKg: predustMultiplier,
        batterIyababaKg: batterMultiplier,
        batterWaterL: batterMultiplier * 2.5,
        breadingAdajioKg: breadingMultiplier,
      },
      recipeRecordedAt: now,
      recipeAutosavedAt: now,
      productionCompletedAt: now,
    });
    showToast('success', `HCP crumbing completed · ${traysCrumbed} trays ready to freeze`);
  };

  const handleFreeze = (batchId: string) => {
    const batch = crumbingBatches.find(item => item.id === batchId);
    if (batch?.type === 'SPP' && !batch.productionCompletedAt) {
      showToast('error', 'Complete the SPP production details, including the balance paneer, first');
      return;
    }
    if (batch?.type === 'HCP' && batch.hcpRecipeRequired && !batch.productionCompletedAt) {
      showToast('error', 'Complete the HCP Predust, batter, and Adajio record before freezing');
      return;
    }
    setCrumbingBatches(crumbingBatches.map(b => 
      b.id === batchId ? { ...b, status: 'frozen' } : b
    ));
    showToast('success', 'Batch frozen');
  };

  const handleStartFrying = () => {
    if (!selectedBatch || trayForm.traysFried <= 0) {
      showToast('error', 'Please enter valid tray count');
      return;
    }

    const batch = crumbingBatches.find(item => item.id === selectedBatch);
    if (!batch) return;
    if (trayForm.traysFried > batch.traysRemaining) {
      showToast('error', `Only ${batch.traysRemaining} tray${batch.traysRemaining === 1 ? '' : 's'} remain to fry`);
      return;
    }

    setCrumbingBatches(crumbingBatches.map(b => {
      if (b.id === selectedBatch) {
        return {
          ...b,
          status: 'frying',
          traysFried: b.traysFried + trayForm.traysFried,
          traysRemaining: b.traysCrumbed - (b.traysFried + trayForm.traysFried),
          fryingTeam: trayForm.fryingTeam,
          fryTemperature: trayForm.fryTemperature,
          fryTime: trayForm.fryTime,
        };
      }
      return b;
    }));

    showToast('success', `Fried ${trayForm.traysFried} trays at ${trayForm.fryTemperature}°C for ${trayForm.fryTime}s`);
    setShowTrayModal(false);
    setTrayForm({ traysFried: 0, fryingTeam: '', fryTemperature: 185, fryTime: 20 });
  };

  const handlePack = () => {
    if (!selectedBatch || packForm.traysPacked <= 0 || !packForm.sku || packForm.cases < 0 || packForm.loose < 0) {
      showToast('error', 'Select a SKU and enter valid tray and pack quantities');
      return;
    }

    const batch = crumbingBatches.find(b => b.id === selectedBatch);
    if (!batch) return;
    const unfriedPackedTrays = Math.max(0, batch.traysFried - batch.traysPacked);
    if (packForm.traysPacked > unfriedPackedTrays) {
      showToast('error', `Only ${unfriedPackedTrays} fried tray${unfriedPackedTrays === 1 ? '' : 's'} are available to pack`);
      return;
    }
    const definition = crumbingSkuByCode[packForm.sku];
    if (!definition || definition.crumbingType !== batch.type) {
      showToast('error', 'That SKU is not valid for this crumbing section');
      return;
    }
    const weightKg = getCrumbingPackWeight(definition, packForm.cases, packForm.loose);

    setCrumbingBatches(crumbingBatches.map(b => {
      if (b.id === selectedBatch) {
        const existingPacked = b.packedSkus || [];
        const nextTraysPacked = b.traysPacked + packForm.traysPacked;
        const nextStatus = b.traysRemaining <= 0 && nextTraysPacked >= b.traysFried ? 'packed' : 'frying';
        return {
          ...b,
          status: nextStatus,
          traysPacked: nextTraysPacked,
          packedSkus: [...existingPacked, {
            sku: packForm.sku,
            cases: packForm.cases,
            loose: packForm.loose,
            weightKg,
          }],
        };
      }
      return b;
    }));

    showToast('success', `Packed ${packForm.traysPacked} trays (${packForm.cases} cases + ${packForm.loose} loose)`);
    setShowPackModal(false);
    setPackForm({ traysPacked: 0, sku: '', cases: 0, loose: 0 });
  };

  const handleHandOver = (batchId: string) => {
    setCrumbingBatches(crumbingBatches.map(b => 
      b.id === batchId ? { ...b, status: 'handed_over' } : b
    ));
    showToast('success', 'Batch handed over');
  };

  const getActionButtons = (batch: CrumbingBatch) => {
    const buttons = [];

    if (batch.type === 'JP' && ['jp_prepping', 'jp_filling', 'jp_filling_frozen'].includes(batch.status)) {
      const label = batch.status === 'jp_prepping'
        ? 'Record prepping'
        : batch.status === 'jp_filling'
          ? 'Record cheese filling'
          : 'Record crumbing';
      buttons.push(
        <button
          key="jp-workflow"
          onClick={() => openJpWorkflow(batch)}
          className="px-3 py-1.5 bg-lime-600 text-white rounded text-xs font-medium hover:bg-lime-700"
        >
          {label}
        </button>
      );
    }

    if (batch.type === 'HCP' && batch.hcpRecipeRequired && !batch.productionCompletedAt) {
      buttons.push(
        <button
          key="hcp-recipe"
          onClick={() => openHcpCrumbingWorkflow(batch)}
          className="px-3 py-1.5 bg-orange-600 text-white rounded text-xs font-medium hover:bg-orange-700"
        >
          Record crumbing recipe
        </button>
      );
    }

    if (batch.type === 'SPP' && !batch.recipe) {
      buttons.push(
        <button
          key="recipe"
          onClick={() => openRecipeDetails(batch)}
          className="px-3 py-1.5 bg-pink-600 text-white rounded text-xs font-medium hover:bg-pink-700"
        >
          Open recipe details
        </button>
      );
    } else if (batch.type === 'SPP' && !batch.productionCompletedAt && batch.status !== 'handed_over') {
      buttons.push(
        <button
          key="recipe"
          onClick={() => openRecipeDetails(batch)}
          className="px-3 py-1.5 bg-pink-100 text-pink-700 rounded text-xs font-medium hover:bg-pink-200"
        >
          Continue recipe details
        </button>
      );
    }

    const recipeGateSatisfied = batch.type === 'SPP'
      ? Boolean(batch.productionCompletedAt)
      : batch.type === 'HCP'
        ? !batch.hcpRecipeRequired || Boolean(batch.productionCompletedAt)
        : true;
    if (batch.status === 'crumbing' && recipeGateSatisfied) {
      buttons.push(
        <button
          key="freeze"
          onClick={() => handleFreeze(batch.id)}
          className="px-3 py-1.5 bg-blue-500 text-white rounded text-xs font-medium hover:bg-blue-600"
        >
          Freeze
        </button>
      );
    }

    const canFryMore = batch.traysRemaining > 0;
    const canPack = batch.traysFried > batch.traysPacked;

    if (batch.status === 'frozen' || ((batch.status === 'frying' || batch.status === 'packed') && canFryMore)) {
      buttons.push(
        <button
          key="fry"
          onClick={() => {
            setSelectedBatch(batch.id);
            setShowTrayModal(true);
          }}
          className="px-3 py-1.5 bg-red-500 text-white rounded text-xs font-medium hover:bg-red-600"
        >
          {batch.status === 'frozen' ? 'Fry Trays' : 'Fry remaining'}
        </button>
      );
    }

    if ((batch.status === 'frying' || batch.status === 'packed') && canPack) {
      buttons.push(
        <button
          key="pack"
          onClick={() => {
            setSelectedBatch(batch.id);
            setPackForm({ traysPacked: 0, sku: '', cases: 0, loose: 0 });
            setShowPackModal(true);
          }}
          className="flex items-center gap-1 px-3 py-1.5 bg-emerald-500 text-white rounded text-xs font-medium hover:bg-emerald-600"
        >
          <Package className="w-3 h-3" /> Pack
        </button>
      );
    }

    if (batch.status === 'packed' && !canFryMore && !canPack) {
      buttons.push(
        <button
          key="handover"
          onClick={() => handleHandOver(batch.id)}
          className="flex items-center gap-1 px-3 py-1.5 bg-emerald-700 text-white rounded text-xs font-medium hover:bg-emerald-800"
        >
          <CheckCircle2 className="w-3 h-3" /> Hand Over
        </button>
      );
    }

    return buttons;
  };

  // Filter batches by type
  const sppBatches = crumbingBatches.filter(b => b.type === 'SPP');
  const jpBatches = crumbingBatches.filter(b => b.type === 'JP');
  const hcpBatches = crumbingBatches.filter(b => b.type === 'HCP');

  const renderSppRecipeDetails = (batch: CrumbingBatch) => {
    const sourceWeightKg = batch.sourceWeightKg || recipeForm.sourceWeightKg;
    const weightCrumbedKg = Math.max(0, sourceWeightKg - recipeForm.balanceWeightKg - recipeForm.wastageKg);
    const canComplete = recipeForm.balanceRecorded
      && recipeForm.balanceWeightKg >= 0
      && recipeForm.balanceWeightKg <= sourceWeightKg + 0.01
      && recipeForm.balanceWeightKg + recipeForm.wastageKg <= sourceWeightKg + 0.01
      && recipeForm.traysCrumbed > 0
      && recipeForm.wastageKg >= 0
      && recipeForm.flavourMultiplier > 0
      && recipeForm.batterMultiplier > 0
      && recipeForm.breadingMultiplier > 0;

    return (
      <div className="rounded-xl border border-pink-200 bg-pink-50/50 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h4 className="text-sm font-bold text-pink-950">SPP recipe details · {batch.batchCode}</h4>
            <p className="mt-1 text-xs text-pink-800">Source: {batch.sourceBatchCode} · {sourceWeightKg.toFixed(2)} kg available at the start of this batch.</p>
          </div>
          <div className="rounded-full bg-white px-3 py-1 text-[11px] font-medium text-emerald-700">
            {batch.recipeAutosavedAt ? `Autosaved ${new Date(batch.recipeAutosavedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Changes autosave'}
          </div>
        </div>

        <p className="mt-3 text-xs text-slate-600">The form stays open under this batch so staff can leave the app and return without losing progress. Each coat has an independent +1 counter.</p>

        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-amber-900">Flavour coat</div>
            <div className="mt-1 text-sm text-amber-950">800 g Iyabab + 200 g Predust</div>
            <div className="mt-3 flex items-center justify-between gap-2"><span className="text-xs text-amber-800">× {recipeForm.flavourMultiplier}</span><button type="button" onClick={() => updateRecipeDraft({ flavourMultiplier: recipeForm.flavourMultiplier + 1 })} className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700">+1</button></div>
            <div className="mt-2 text-xs text-amber-900">Total: {(recipeForm.flavourMultiplier * 0.8).toFixed(2)} kg Iyabab + {(recipeForm.flavourMultiplier * 0.2).toFixed(2)} kg Predust</div>
          </div>

          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-blue-900">Batter coat</div>
            <div className="mt-1 text-sm text-blue-950">1 kg Iyababa + 2.5 L water</div>
            <div className="mt-3 flex items-center justify-between gap-2"><span className="text-xs text-blue-800">× {recipeForm.batterMultiplier}</span><button type="button" onClick={() => updateRecipeDraft({ batterMultiplier: recipeForm.batterMultiplier + 1 })} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">+1</button></div>
            <div className="mt-2 text-xs text-blue-900">Total: {recipeForm.batterMultiplier.toFixed(2)} kg Iyababa · {(recipeForm.batterMultiplier * 2.5).toFixed(2)} L water</div>
          </div>

          <div className="rounded-lg border border-purple-200 bg-purple-50 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-purple-900">Breading coat</div>
            <div className="mt-1 text-sm text-purple-950">1 kg Adajio</div>
            <div className="mt-3 flex items-center justify-between gap-2"><span className="text-xs text-purple-800">× {recipeForm.breadingMultiplier}</span><button type="button" onClick={() => updateRecipeDraft({ breadingMultiplier: recipeForm.breadingMultiplier + 1 })} className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-700">+1</button></div>
            <div className="mt-2 text-xs text-purple-900">Total: {recipeForm.breadingMultiplier.toFixed(2)} kg Adajio</div>
          </div>
        </div>

        <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block"><span className="text-xs font-medium uppercase tracking-wide text-slate-600">Balance paneer recorded (kg)</span><input type="number" min="0" step="0.01" value={recipeForm.balanceWeightKg} onChange={(event) => updateRecipeDraft({ balanceWeightKg: Number(event.target.value) || 0, balanceRecorded: true })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" /></label>
            <label className="block"><span className="text-xs font-medium uppercase tracking-wide text-slate-600">Wastage (kg)</span><input type="number" min="0" step="0.01" value={recipeForm.wastageKg} onChange={(event) => updateRecipeDraft({ wastageKg: Number(event.target.value) || 0 })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" /></label>
            <label className="block"><span className="text-xs font-medium uppercase tracking-wide text-slate-600">No. of trays</span><input type="number" min="1" step="1" value={recipeForm.traysCrumbed} onChange={(event) => updateRecipeDraft({ traysCrumbed: Number(event.target.value) || 0 })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" /></label>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm"><span className="text-slate-600">Weight crumbed (auto)</span><strong className="text-emerald-700">{weightCrumbedKg.toFixed(2)} kg</strong></div>
          <div className="mt-1 text-xs text-slate-500">Mass balance: source weight = crumbed weight + recorded balance + wastage. Water is excluded from dry ingredient totals. The balance returns to the source pool for the next batch.</div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-pink-200 bg-white p-3">
          <div className="text-xs text-slate-600">
            {batch.productionCompletedAt ? <span className="font-semibold text-emerald-700">Production completed {new Date(batch.productionCompletedAt).toLocaleString()}</span> : <span>Complete only after the physical balance has been weighed and entered.</span>}
          </div>
          <button type="button" onClick={handleCompleteProduction} disabled={Boolean(batch.productionCompletedAt) || !canComplete} className="rounded-lg bg-pink-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-pink-700 disabled:cursor-not-allowed disabled:bg-slate-300">
            {batch.productionCompletedAt ? 'Production complete' : 'Complete production'}
          </button>
        </div>
      </div>
    );
  };

  const renderJpWorkflowDetails = (batch: CrumbingBatch) => {
    const prep = batch.jpPrepping;
    const filling = batch.jpFilling;
    const crumbing = batch.jpCrumbing;
    const source = intermediateLots.find(lot => lot.id === batch.sourceBatchId);
    const formRawWeightKg = jpPrepForm.buckets.reduce((total, bucket) => total + (Number(bucket.rawWeightKg) || 0), 0);
    const formDrainedWeightKg = jpPrepForm.buckets.reduce((total, bucket) => total + (Number(bucket.drainedWeightKg) || 0), 0);
    const storedRawWeightKg = prep?.buckets.reduce((total, bucket) => total + (Number(bucket.rawWeightKg) || 0), 0) || 0;
    const storedDrainedWeightKg = prep?.buckets.reduce((total, bucket) => total + (Number(bucket.drainedWeightKg) || 0), 0) || 0;
    const carryoverSources = getJpCreamCheeseCarryoverSources(batch.id);
    const selectedCarryoverSource = crumbingBatches.find(candidate => candidate.id === jpPrepForm.carriedCreamCheeseSourceBatchId);
    const selectedCarryoverAvailableKg = selectedCarryoverSource ? getJpCreamCheeseCarryoverAvailable(selectedCarryoverSource, batch.id) : 0;
    const crumbablePieces = prep?.crumbablePieces || 0;
    const creamCheeseAvailableKg = prep?.totalCreamCheeseAvailableKg
      ?? (prep ? prep.pan111InputKg + prep.creamKg + prep.blackPepperKg + prep.saltKg : 0);
    const filledPieces = filling?.filledPieces ?? Math.max(0, crumbablePieces - jpFillingForm.damagedPieces);
    const finalCrumbedPieces = crumbing?.finalCrumbedPieces ?? Math.max(0, filledPieces - jpCrumbingForm.damagedPieces);

    return (
      <div className="rounded-xl border border-lime-200 bg-lime-50/40 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h4 className="text-sm font-bold text-lime-950">JP production record · {batch.batchCode}</h4>
            <p className="mt-1 text-xs text-lime-800">PAN111 source: {batch.sourceBatchCode}. Entries in the active phase autosave.</p>
          </div>
          <button type="button" onClick={() => setSelectedBatch(null)} className="rounded-lg border border-lime-200 bg-white px-3 py-1.5 text-xs font-semibold text-lime-800 hover:bg-lime-100">Close details</button>
        </div>

        {batch.pan111SourcePending && (
          <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
            <div className="text-sm font-bold text-amber-950">PAN111 source is pending</div>
            <div className="mt-1 text-xs text-amber-800">Production may continue. Once the PAN111 lot is recorded, link it here so the total PAN111 used by this batch is deducted and reconciled once.</div>
            <div className="mt-2 flex flex-wrap gap-2">
              <select value={jpSourceLinkSelection} onChange={(event) => setJpSourceLinkSelection(event.target.value)} className="min-w-64 flex-1 rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm">
                <option value="">Select the PAN111 source lot...</option>
                {intermediateLots.filter(lot => lot.productId === 'pan111' && lot.status === 'available').map(lot => <option key={lot.id} value={lot.id}>{lot.lotCode} · {lot.currentQuantity.toFixed(2)} kg available</option>)}
              </select>
              <button type="button" onClick={() => handleLinkJpPan111Source(batch)} className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800">Link and reconcile source</button>
            </div>
          </div>
        )}

        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {[
            ['1', 'Prepping', Boolean(prep?.completedAt)],
            ['2', 'Cheese filling + first freeze', Boolean(filling?.completedAt)],
            ['3', 'Crumbing + second freeze', Boolean(crumbing?.completedAt)],
          ].map(([number, label, complete]) => (
            <div key={String(number)} className={`rounded-lg border p-2 text-xs font-semibold ${complete ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-600'}`}>
              Phase {number}: {label}{complete ? ' ✓' : ''}
            </div>
          ))}
        </div>

        {prep?.completedAt && (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-white p-3 text-xs text-slate-700">
            <div className="font-bold text-emerald-800">Phase 1 completed · {new Date(prep.completedAt).toLocaleString()}</div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <div>{prep.buckets.length} buckets · raw {storedRawWeightKg.toFixed(2)} kg · drained {storedDrainedWeightKg.toFixed(2)} kg</div>
              <div>Total {prep.totalPieces} · good {prep.goodPieces} · damaged {prep.damagedPieces}</div>
              <div className="font-semibold">Crumbable: {prep.goodPieces} × 2 = {prep.crumbablePieces} pieces</div>
              <div>PAN111 {prep.pan111InputKg.toFixed(2)} kg · by {prep.preparedBy}</div>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {prep.buckets.map((bucket, index) => (
                <div key={bucket.id} className="rounded-lg bg-slate-50 p-2">
                  <strong>Bucket {index + 1} · {bucket.nominalWeightKg} kg:</strong> raw {bucket.rawWeightKg.toFixed(2)} kg, drained {bucket.drainedWeightKg.toFixed(2)} kg · total {bucket.totalPieces || 0}, good {bucket.goodPieces || 0}, damaged {bucket.damagedPieces || 0}
                </div>
              ))}
            </div>
            <div className="mt-2 text-slate-500">Cream {(prep.creamKg * 1000).toFixed(0)} g · black pepper {(prep.blackPepperKg * 1000).toFixed(1)} g · salt {(prep.saltKg * 1000).toFixed(1)} g</div>
            <div className="mt-2 rounded-lg bg-cyan-50 p-2 text-cyan-900">New cream cheese made: <strong>{(prep.newCreamCheeseMadeKg ?? (prep.pan111InputKg + prep.creamKg + prep.blackPepperKg + prep.saltKg)).toFixed(2)} kg</strong>{(prep.carriedCreamCheeseKg || 0) > 0 ? <> · carried in <strong>{prep.carriedCreamCheeseKg?.toFixed(2)} kg</strong> from {prep.carriedCreamCheeseSourceBatchCode}</> : null} · total available: <strong>{(prep.totalCreamCheeseAvailableKg ?? (prep.pan111InputKg + prep.creamKg + prep.blackPepperKg + prep.saltKg)).toFixed(2)} kg</strong></div>
            {(prep.additionalCreamCheeseMakes || []).length > 0 && <div className="mt-2 text-slate-600">Additional makes: {prep.additionalCreamCheeseMakes?.map((make, index) => <span key={make.id} className="mr-2 inline-block rounded bg-slate-100 px-2 py-1">#{index + 1}: {make.pan111InputKg.toFixed(2)} kg PAN111 → {make.totalMadeKg.toFixed(2)} kg</span>)}</div>}
          </div>
        )}

        {batch.status === 'jp_prepping' && (
          <div className="mt-3 space-y-3 rounded-lg border border-lime-200 bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><div className="text-sm font-bold text-slate-900">Phase 1 · Jalapeño and cream-cheese preparation</div><div className="text-xs text-slate-500">Weigh every bucket before and after draining its brine.</div></div>
              <div className="flex gap-2">
                <button type="button" onClick={() => addJpPrepBucket(batch, 2.5)} className="rounded-lg bg-lime-600 px-3 py-2 text-xs font-semibold text-white hover:bg-lime-700">+ 2.5 kg bucket</button>
                <button type="button" onClick={() => addJpPrepBucket(batch, 5)} className="rounded-lg bg-lime-700 px-3 py-2 text-xs font-semibold text-white hover:bg-lime-800">+ 5 kg bucket</button>
              </div>
            </div>

            {jpPrepForm.buckets.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500">Add each raw jalapeño bucket to begin.</div>
            ) : (
              <div className="space-y-2">
                {jpPrepForm.buckets.map((bucket, index) => (
                  <div key={bucket.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-2"><div><div className="text-xs font-bold text-slate-800">Bucket {index + 1} · {bucket.nominalWeightKg} kg size</div><div className="mt-1 text-[11px] text-slate-500">Brine removed: {Math.max(0, bucket.rawWeightKg - bucket.drainedWeightKg).toFixed(2)} kg</div></div><button type="button" onClick={() => saveJpPrepDraft(batch, { ...jpPrepForm, buckets: jpPrepForm.buckets.filter(item => item.id !== bucket.id) })} className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50">Remove</button></div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <label className="text-xs text-slate-600">Raw weight (kg)<input type="number" min="0" step="0.01" value={bucket.rawWeightKg || ''} onChange={(event) => updateJpPrepBucket(batch, bucket.id, { rawWeightKg: Number(event.target.value) || 0 })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" /></label>
                      <label className="text-xs text-slate-600">Drained weight (kg)<input type="number" min="0" step="0.01" value={bucket.drainedWeightKg || ''} onChange={(event) => updateJpPrepBucket(batch, bucket.id, { drainedWeightKg: Number(event.target.value) || 0 })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" /></label>
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-3">
                      <label className="text-xs font-medium text-slate-600">Good jalapeños<input type="number" min="0" step="1" value={bucket.goodPieces || ''} onChange={(event) => updateJpPrepBucket(batch, bucket.id, { goodPieces: Number(event.target.value) || 0 })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" /></label>
                      <label className="text-xs font-medium text-slate-600">Damaged jalapeños<input type="number" min="0" step="1" value={bucket.damagedPieces || ''} onChange={(event) => updateJpPrepBucket(batch, bucket.id, { damagedPieces: Number(event.target.value) || 0 })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" /></label>
                      <label className="text-xs font-medium text-slate-600">Total jalapeños (auto)<input type="number" readOnly value={bucket.totalPieces} className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700" /></label>
                    </div>
                    <div className={`mt-2 rounded-lg px-3 py-2 text-xs ${bucket.totalPieces > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>Bucket total: {bucket.goodPieces || 0} good + {bucket.damagedPieces || 0} damaged = <strong>{bucket.totalPieces || 0}</strong> · crumbable pieces: <strong>{Math.max(0, bucket.goodPieces) * 2}</strong></div>
                  </div>
                ))}
                <div className="grid gap-2 rounded-lg border border-lime-200 bg-lime-50 p-3 text-xs sm:grid-cols-2 lg:grid-cols-3"><div>Raw total <strong>{formRawWeightKg.toFixed(2)} kg</strong></div><div>Drained total <strong>{formDrainedWeightKg.toFixed(2)} kg</strong></div><div>Brine removed <strong>{Math.max(0, formRawWeightKg - formDrainedWeightKg).toFixed(2)} kg</strong></div><div>All buckets: <strong>{jpPrepForm.totalPieces} total</strong></div><div><strong>{jpPrepForm.goodPieces} good</strong> · {jpPrepForm.damagedPieces} damaged</div><div>Crumbable: <strong>{jpPrepForm.goodPieces * 2} pieces</strong></div></div>
              </div>
            )}

            <div className="rounded-lg border border-violet-200 bg-violet-50 p-3">
              <div className="text-sm font-bold text-violet-950">Old cream-cheese carryover (optional)</div>
              <div className="mt-1 text-xs text-violet-800">Use cream cheese carried forward from an earlier JP batch before making more.</div>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-medium text-violet-900">Previous JP batch<select value={jpPrepForm.carriedCreamCheeseSourceBatchId} onChange={(event) => saveJpPrepDraft(batch, { ...jpPrepForm, carriedCreamCheeseSourceBatchId: event.target.value, carriedCreamCheeseKg: 0 })} className="mt-1 w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm"><option value="">No old cream cheese</option>{carryoverSources.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.batchCode} · {getJpCreamCheeseCarryoverAvailable(candidate, batch.id).toFixed(2)} kg available</option>)}</select></label>
                <label className="text-xs font-medium text-violet-900">Old cream cheese used (kg)<input type="number" min="0" step="0.01" disabled={!selectedCarryoverSource} value={jpPrepForm.carriedCreamCheeseKg || ''} onChange={(event) => saveJpPrepDraft(batch, { ...jpPrepForm, carriedCreamCheeseKg: Number(event.target.value) || 0 })} className="mt-1 w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm disabled:bg-slate-100" /><span className="mt-1 block font-normal">Available from selected batch: {selectedCarryoverAvailableKg.toFixed(2)} kg</span></label>
              </div>
            </div>

            <div className="rounded-lg border border-cyan-200 bg-cyan-50 p-3">
              <div className="text-sm font-bold text-cyan-950">Cream-cheese recipe</div>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-medium text-cyan-900">PAN111 used (kg)<input type="number" min="0" step="0.01" value={jpPrepForm.pan111InputKg || ''} onChange={(event) => saveJpPrepDraft(batch, { ...jpPrepForm, pan111InputKg: Number(event.target.value) || 0 })} className="mt-1 w-full rounded-lg border border-cyan-200 bg-white px-3 py-2 text-sm" /><span className="mt-1 block font-normal text-cyan-700">{batch.pan111SourcePending ? 'Source quantity will be reconciled when the pending lot is linked.' : `Available in source: ${(source?.currentQuantity || 0).toFixed(2)} kg`}</span></label>
                <div className="grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded-lg bg-white p-2">Cream<strong className="mt-1 block text-sm">{(jpPrepForm.pan111InputKg * 50).toFixed(0)} g</strong></div><div className="rounded-lg bg-white p-2">Black pepper<strong className="mt-1 block text-sm">{(jpPrepForm.pan111InputKg * 1.2).toFixed(1)} g</strong></div><div className="rounded-lg bg-white p-2">Salt<strong className="mt-1 block text-sm">{(jpPrepForm.pan111InputKg * (200 / 15)).toFixed(1)} g</strong></div></div>
              </div>
              <div className="mt-2 text-[11px] text-cyan-800">Automatically scaled from 15 kg PAN111 + 750 g cream + 18 g black pepper + 200 g salt.</div>
              <div className="mt-2 rounded-lg bg-white p-2 text-xs text-cyan-900">New cream cheese: <strong>{(jpPrepForm.pan111InputKg + (jpPrepForm.pan111InputKg * 0.05) + (jpPrepForm.pan111InputKg * 0.0012) + (jpPrepForm.pan111InputKg * (0.2 / 15))).toFixed(2)} kg</strong> · old carryover: <strong>{jpPrepForm.carriedCreamCheeseKg.toFixed(2)} kg</strong> · total available: <strong>{(jpPrepForm.pan111InputKg + (jpPrepForm.pan111InputKg * 0.05) + (jpPrepForm.pan111InputKg * 0.0012) + (jpPrepForm.pan111InputKg * (0.2 / 15)) + jpPrepForm.carriedCreamCheeseKg).toFixed(2)} kg</strong></div>
            </div>

            <div className="flex flex-wrap items-end justify-between gap-3">
              <label className="min-w-64 flex-1 text-xs font-medium text-slate-600">Prepared by<input type="text" value={jpPrepForm.preparedBy} onChange={(event) => saveJpPrepDraft(batch, { ...jpPrepForm, preparedBy: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
              <button type="button" onClick={() => handleCompleteJpPrepping(batch)} className="rounded-lg bg-lime-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-lime-800">Complete prepping → cheese filling</button>
            </div>
          </div>
        )}

        {filling?.completedAt && (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-white p-3 text-xs text-slate-700">
            <div className="font-bold text-emerald-800">Phase 2 completed and first freeze recorded · {new Date(filling.completedAt).toLocaleString()}</div>
            <div className="mt-2">{crumbablePieces} crumbable − {filling.damagedPieces} damaged during filling = <strong>{filling.filledPieces} frozen filled pieces</strong> · {filling.traysFilled} trays · by {filling.filledBy}</div>
            <div className="mt-1">Cream cheese: {(filling.creamCheeseAvailableKg || 0).toFixed(2)} kg available · {(filling.creamCheeseUsedKg || 0).toFixed(2)} kg used · {(filling.creamCheeseLeftoverKg || 0).toFixed(2)} kg leftover {filling.creamCheeseDisposition === 'carry_forward' ? 'carried forward' : filling.creamCheeseDisposition === 'discarded' ? 'discarded' : ''}.</div>
          </div>
        )}

        {batch.status === 'jp_filling' && (
          <div className="mt-3 rounded-lg border border-cyan-200 bg-white p-3">
            <div className="text-sm font-bold text-cyan-950">Phase 2 · Cheese filling and first freeze</div>
            <div className="mt-1 text-xs text-slate-500">Start with {crumbablePieces} crumbable jalapeño halves from Phase 1.</div>
            <div className="mt-3 rounded-lg border border-cyan-200 bg-cyan-50 p-3">
              <div className="text-xs font-bold uppercase tracking-wide text-cyan-900">Cream cheese available: {creamCheeseAvailableKg.toFixed(2)} kg</div>
              <div className="mt-1 text-xs text-cyan-800">If more is needed during filling, enter more PAN111 here. Its cream, pepper, and salt recipe is calculated and added to this batch.</div>
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <label className="min-w-56 flex-1 text-xs font-medium text-cyan-900">Additional PAN111 (kg)<input type="number" min="0" step="0.01" value={additionalCreamCheesePan111Kg || ''} onChange={(event) => setAdditionalCreamCheesePan111Kg(Number(event.target.value) || 0)} className="mt-1 w-full rounded-lg border border-cyan-200 bg-white px-3 py-2 text-sm" /></label>
                <div className="flex-1 text-xs text-cyan-900">Adds: cream {(additionalCreamCheesePan111Kg * 50).toFixed(0)} g · pepper {(additionalCreamCheesePan111Kg * 1.2).toFixed(1)} g · salt {(additionalCreamCheesePan111Kg * (200 / 15)).toFixed(1)} g</div>
                <button type="button" onClick={() => handleAddJpCreamCheeseMake(batch)} className="rounded-lg bg-cyan-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-cyan-800">Record more cream cheese</button>
              </div>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <label className="text-xs font-medium text-slate-600">Damaged during filling<input type="number" min="0" step="1" value={jpFillingForm.damagedPieces || ''} onChange={(event) => updateJpFillingDraft(batch, { damagedPieces: Number(event.target.value) || 0 })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
              <label className="text-xs font-medium text-slate-600">Filled trays<input type="number" min="0" step="1" value={jpFillingForm.traysFilled || ''} onChange={(event) => updateJpFillingDraft(batch, { traysFilled: Number(event.target.value) || 0 })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
              <label className="text-xs font-medium text-slate-600">Filled by<input type="text" value={jpFillingForm.filledBy} onChange={(event) => updateJpFillingDraft(batch, { filledBy: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
            </div>
            <div className="mt-3 grid gap-3 rounded-lg border border-violet-200 bg-violet-50 p-3 sm:grid-cols-2">
              <label className="text-xs font-medium text-violet-900">Cream cheese left after filling (kg)<input type="number" min="0" step="0.01" value={jpFillingForm.creamCheeseLeftoverKg || ''} onChange={(event) => updateJpFillingDraft(batch, { creamCheeseLeftoverKg: Number(event.target.value) || 0 })} className="mt-1 w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm" /><span className="mt-1 block font-normal">Used automatically: {Math.max(0, creamCheeseAvailableKg - jpFillingForm.creamCheeseLeftoverKg).toFixed(2)} kg</span></label>
              <label className="text-xs font-medium text-violet-900">Leftover action<select value={jpFillingForm.creamCheeseDisposition} disabled={jpFillingForm.creamCheeseLeftoverKg <= 0} onChange={(event) => updateJpFillingDraft(batch, { creamCheeseDisposition: event.target.value as typeof jpFillingForm.creamCheeseDisposition })} className="mt-1 w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm disabled:bg-slate-100"><option value="none">No leftover</option><option value="carry_forward">Carry forward to another JP batch</option><option value="discarded">Discard leftover</option></select></label>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-cyan-50 p-3 text-sm text-cyan-900"><span>Filled pieces: <strong>{crumbablePieces} − {jpFillingForm.damagedPieces || 0} = {Math.max(0, crumbablePieces - (jpFillingForm.damagedPieces || 0))}</strong></span><button type="button" onClick={() => handleCompleteJpFilling(batch)} className="rounded-lg bg-cyan-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-cyan-800">Complete filling & record first freeze</button></div>
          </div>
        )}

        {crumbing?.completedAt && (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-white p-3 text-xs text-slate-700">
            <div className="font-bold text-emerald-800">Phase 3 completed · {new Date(crumbing.completedAt).toLocaleString()}</div>
            <div className="mt-2">({prep?.goodPieces || 0} good × 2) − {filling?.damagedPieces || 0} filling damage − {crumbing.damagedPieces} crumbing damage = <strong>{crumbing.finalCrumbedPieces} final crumbed pieces</strong> · {crumbing.traysCrumbed} trays</div>
            <div className="mt-1 text-slate-500">Predust {crumbing.predustKg.toFixed(2)} kg · batter {crumbing.batterMixKg.toFixed(2)} kg + {crumbing.batterWaterL.toFixed(2)} L water · Adajio {crumbing.adajioKg.toFixed(2)} kg · by {crumbing.crumbedBy}</div>
          </div>
        )}

        {batch.status === 'jp_filling_frozen' && (
          <div className="mt-3 rounded-lg border border-orange-200 bg-white p-3">
            <div className="text-sm font-bold text-orange-950">Phase 3 · Crumbing</div>
            <div className="mt-1 text-xs text-slate-500">Crumb the {filledPieces} frozen, cream-cheese-filled pieces. Record every ingredient addition as it is taken.</div>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3"><div className="text-xs font-semibold uppercase text-amber-900">Flavour coat · Predust</div><div className="mt-1 text-sm">1 kg per +1</div><div className="mt-3 flex items-center justify-between"><strong>× {jpCrumbingForm.predustMultiplier}</strong><button type="button" onClick={() => updateJpCrumbingDraft(batch, { predustMultiplier: jpCrumbingForm.predustMultiplier + 1 })} className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white">+1</button></div><div className="mt-2 text-xs">Total {jpCrumbingForm.predustMultiplier.toFixed(2)} kg</div></div>
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3"><div className="text-xs font-semibold uppercase text-blue-900">Batter coat</div><div className="mt-1 text-sm">1 kg batter + 2.5 L water per +1</div><div className="mt-3 flex items-center justify-between"><strong>× {jpCrumbingForm.batterMultiplier}</strong><button type="button" onClick={() => updateJpCrumbingDraft(batch, { batterMultiplier: jpCrumbingForm.batterMultiplier + 1 })} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white">+1</button></div><div className="mt-2 text-xs">{jpCrumbingForm.batterMultiplier.toFixed(2)} kg + {(jpCrumbingForm.batterMultiplier * 2.5).toFixed(2)} L water</div></div>
              <div className="rounded-lg border border-purple-200 bg-purple-50 p-3"><div className="text-xs font-semibold uppercase text-purple-900">Breading coat · Adajio</div><div className="mt-1 text-sm">1 kg per +1</div><div className="mt-3 flex items-center justify-between"><strong>× {jpCrumbingForm.breadingMultiplier}</strong><button type="button" onClick={() => updateJpCrumbingDraft(batch, { breadingMultiplier: jpCrumbingForm.breadingMultiplier + 1 })} className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-bold text-white">+1</button></div><div className="mt-2 text-xs">Total {jpCrumbingForm.breadingMultiplier.toFixed(2)} kg</div></div>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <label className="text-xs font-medium text-slate-600">Damaged during crumbing<input type="number" min="0" step="1" value={jpCrumbingForm.damagedPieces || ''} onChange={(event) => updateJpCrumbingDraft(batch, { damagedPieces: Number(event.target.value) || 0 })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
              <label className="text-xs font-medium text-slate-600">Crumbed trays<input type="number" min="0" step="1" value={jpCrumbingForm.traysCrumbed || ''} onChange={(event) => updateJpCrumbingDraft(batch, { traysCrumbed: Number(event.target.value) || 0 })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
              <label className="text-xs font-medium text-slate-600">Crumbed by<input type="text" value={jpCrumbingForm.crumbedBy} onChange={(event) => updateJpCrumbingDraft(batch, { crumbedBy: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-orange-50 p-3 text-sm text-orange-950"><span>Final tally: <strong>({prep?.goodPieces || 0} × 2) − {filling?.damagedPieces || 0} − {jpCrumbingForm.damagedPieces || 0} = {finalCrumbedPieces} pieces</strong></span><button type="button" onClick={() => handleCompleteJpCrumbing(batch)} className="rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-700">Complete crumbing → ready for second freeze</button></div>
          </div>
        )}

        {crumbing?.completedAt && ['crumbing', 'frozen', 'frying', 'packed', 'handed_over'].includes(batch.status) && (
          <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">Post-crumb workflow: <strong>{batch.status === 'crumbing' ? 'Awaiting second freeze' : crumbingStatusLabels[batch.status]}</strong> → Fry → Pack → Hand Over.</div>
        )}
      </div>
    );
  };

  const renderHcpCrumbingDetails = (batch: CrumbingBatch) => {
    const complete = Boolean(batch.productionCompletedAt);
    const recipe = batch.recipe;
    return (
      <div className="rounded-xl border border-orange-200 bg-orange-50/40 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h4 className="text-sm font-bold text-orange-950">HCP crumbing recipe · {batch.batchCode}</h4><p className="mt-1 text-xs text-orange-800">Halloumi source: {batch.sourceBatchCode} · {(batch.sourceWeightKg || 0).toFixed(2)} kg. Each ingredient addition autosaves.</p></div>
          <button type="button" onClick={() => setSelectedBatch(null)} className="rounded-lg border border-orange-200 bg-white px-3 py-1.5 text-xs font-semibold text-orange-800 hover:bg-orange-100">Close details</button>
        </div>

        {complete ? (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-white p-3 text-sm text-slate-700">
            <div className="font-bold text-emerald-800">Crumbing completed · {new Date(batch.productionCompletedAt as string).toLocaleString()}</div>
            <div className="mt-2">{batch.traysCrumbed} trays · Predust {(recipe?.flavourPredustKg || 0).toFixed(2)} kg · batter {(recipe?.batterIyababaKg || 0).toFixed(2)} kg + {(recipe?.batterWaterL || 0).toFixed(2)} L water · Adajio {(recipe?.breadingAdajioKg || 0).toFixed(2)} kg · by {batch.crumbingTeam}</div>
            <div className="mt-2 text-xs text-blue-800">Next: Freeze → Fry → Pack → Hand Over.</div>
          </div>
        ) : (
          <>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3"><div className="text-xs font-semibold uppercase text-amber-900">Flavour coat · Predust</div><div className="mt-1 text-sm">1 kg per +1</div><div className="mt-3 flex items-center justify-between"><strong>× {hcpCrumbingForm.predustMultiplier}</strong><button type="button" onClick={() => updateHcpCrumbingDraft(batch, { predustMultiplier: hcpCrumbingForm.predustMultiplier + 1 })} className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white">+1</button></div><div className="mt-2 text-xs">Total {hcpCrumbingForm.predustMultiplier.toFixed(2)} kg</div></div>
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3"><div className="text-xs font-semibold uppercase text-blue-900">Batter coat</div><div className="mt-1 text-sm">1 kg batter + 2.5 L water per +1</div><div className="mt-3 flex items-center justify-between"><strong>× {hcpCrumbingForm.batterMultiplier}</strong><button type="button" onClick={() => updateHcpCrumbingDraft(batch, { batterMultiplier: hcpCrumbingForm.batterMultiplier + 1 })} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white">+1</button></div><div className="mt-2 text-xs">{hcpCrumbingForm.batterMultiplier.toFixed(2)} kg + {(hcpCrumbingForm.batterMultiplier * 2.5).toFixed(2)} L water</div></div>
              <div className="rounded-lg border border-purple-200 bg-purple-50 p-3"><div className="text-xs font-semibold uppercase text-purple-900">Breader coat · Adajio</div><div className="mt-1 text-sm">1 kg per +1</div><div className="mt-3 flex items-center justify-between"><strong>× {hcpCrumbingForm.breadingMultiplier}</strong><button type="button" onClick={() => updateHcpCrumbingDraft(batch, { breadingMultiplier: hcpCrumbingForm.breadingMultiplier + 1 })} className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-bold text-white">+1</button></div><div className="mt-2 text-xs">Total {hcpCrumbingForm.breadingMultiplier.toFixed(2)} kg</div></div>
            </div>
            <div className="mt-3 grid gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-2">
              <label className="text-xs font-medium text-slate-600">Crumbed trays<input type="number" min="1" step="1" value={hcpCrumbingForm.traysCrumbed || ''} onChange={(event) => updateHcpCrumbingDraft(batch, { traysCrumbed: Number(event.target.value) || 0 })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
              <label className="text-xs font-medium text-slate-600">Crumbed by<input type="text" value={hcpCrumbingForm.crumbedBy} onChange={(event) => updateHcpCrumbingDraft(batch, { crumbedBy: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
            </div>
            <div className="mt-3 flex justify-end"><button type="button" onClick={() => handleCompleteHcpCrumbing(batch)} className="rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-700">Complete HCP crumbing → Freeze</button></div>
          </>
        )}
      </div>
    );
  };

  const renderBatchSection = (title: string, batches: CrumbingBatch[], type: CrumbingType) => {
    const sources = getAvailableSources(type);

    return (
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {/* Section Header */}
        <div className="px-4 py-3 bg-gradient-to-r from-pink-50 to-orange-50 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-slate-900">{title}</h3>
              <p className="text-sm text-slate-600">
                {type === 'SPP' && 'Spicy Paneer Poppers - 250g packets, 12 packets/case'}
                {type === 'JP' && 'Jalapeño Poppers - 250g packets, 12 packets/case'}
                {type === 'HCP' && 'Halloumi Cheese Poppers - 250g packets, 12 packets/case'}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {type === 'SPP' && (
                <button
                  type="button"
                  disabled={getClubEligibleSppBatches().length < 2}
                  onClick={() => { setClubSppBatchIds([]); setShowClubSppModal(true); }}
                  className="rounded-lg border border-pink-300 bg-white px-3 py-2 text-sm font-medium text-pink-700 hover:bg-pink-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Club completed batches
                </button>
              )}
              <button
                onClick={() => {
                  setActiveType(type);
                  setNewBatchForm({
                    ...newBatchForm,
                    type,
                    sourceBatchId: '',
                    manualPaneerWeightKg: 0,
                    manualOrigin: '',
                    halloumiWeightKg: 0,
                    traysCrumbed: 0,
                  });
                  setShowNewBatchModal(true);
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-pink-600 text-white hover:bg-pink-700"
              >
                <Plus className="w-4 h-4" /> New Batch
              </button>
            </div>
          </div>
        </div>

        {/* Batches Table */}
        {batches.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-4 py-2 text-left font-medium text-slate-500 text-xs uppercase tracking-wide">Batch ID</th>
                  <th className="px-4 py-2 text-left font-medium text-slate-500 text-xs uppercase tracking-wide">Source</th>
                  <th className="px-4 py-2 text-left font-medium text-slate-500 text-xs uppercase tracking-wide">Recipe / balance</th>
                  <th className="px-4 py-2 text-left font-medium text-slate-500 text-xs uppercase tracking-wide">Status</th>
                  <th className="px-4 py-2 text-left font-medium text-slate-500 text-xs uppercase tracking-wide">Crumbed</th>
                  <th className="px-4 py-2 text-left font-medium text-slate-500 text-xs uppercase tracking-wide">Fried</th>
                  <th className="px-4 py-2 text-left font-medium text-slate-500 text-xs uppercase tracking-wide">Remaining</th>
                  <th className="px-4 py-2 text-left font-medium text-slate-500 text-xs uppercase tracking-wide">Packed</th>
                  <th className="px-4 py-2 text-left font-medium text-slate-500 text-xs uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {batches.map((batch) => (
                  <Fragment key={batch.id}>
                  <tr className="hover:bg-slate-50/50">
                    <td className="px-4 py-3">
                      <div className="font-mono text-xs font-bold text-slate-900">{batch.batchCode}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-xs text-slate-600">{batch.sourceBatchCode}</div>
                      {batch.origin && <div className="mt-1 text-[11px] text-slate-500">Origin: {batch.origin}</div>}
                      {batch.clubbedBatchCodes && <div className="mt-1 text-[11px] font-medium text-pink-700">Clubbed from {batch.clubbedBatchCodes.length} SPP batches</div>}
                      {(batch.type === 'SPP' || batch.type === 'JP' || batch.type === 'HCP') && batch.sourceWeightKg !== undefined && <div className="mt-1 text-[11px] text-pink-700">{batch.sourceWeightKg.toFixed(2)} kg source</div>}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {batch.type === 'SPP' ? (
                        batch.recipe ? (
                          <div className="space-y-1">
                            <div className="font-medium text-slate-800">F {batch.recipe.flavourMultiplier} · B {batch.recipe.batterMultiplier} · A {batch.recipe.breadingMultiplier} additions</div>
                            <div>Crumbed: <span className="font-semibold text-slate-800">{(batch.weightCrumbedKg || 0).toFixed(2)} kg</span></div>
                            <div>Balance: <span className="font-semibold text-emerald-700">{(batch.balanceWeightKg || 0).toFixed(2)} kg</span> · Wastage: {(batch.wastageKg || 0).toFixed(2)} kg</div>
                            {!batch.productionCompletedAt && <button onClick={() => openRecipeDetails(batch)} className="mt-1 rounded border border-pink-200 bg-pink-50 px-2 py-1 text-[11px] font-semibold text-pink-700 hover:bg-pink-100">Continue details</button>}
                          </div>
                        ) : <button onClick={() => openRecipeDetails(batch)} className="rounded border border-pink-200 bg-pink-50 px-2 py-1 text-[11px] font-semibold text-pink-700 hover:bg-pink-100">Recipe details required</button>
                      ) : batch.type === 'JP' ? (
                        <div className="space-y-1">
                          {batch.jpPrepping ? <div>Crumbable: <strong>{batch.jpPrepping.crumbablePieces} pieces</strong></div> : <div>Prepping details required</div>}
                          {batch.jpFilling?.completedAt && <div>Filling damage: {batch.jpFilling.damagedPieces} · filled: {batch.jpFilling.filledPieces}</div>}
                          {batch.jpCrumbing?.completedAt && <div>Crumbing damage: {batch.jpCrumbing.damagedPieces} · final: <strong>{batch.jpCrumbing.finalCrumbedPieces}</strong></div>}
                          <button onClick={() => openJpWorkflow(batch)} className="mt-1 rounded border border-lime-200 bg-lime-50 px-2 py-1 text-[11px] font-semibold text-lime-700 hover:bg-lime-100">{selectedBatch === batch.id ? 'Refresh details' : 'View process record'}</button>
                        </div>
                      ) : batch.type === 'HCP' && batch.hcpRecipeRequired ? (
                        <div className="space-y-1">
                          {batch.recipe ? <><div className="font-medium text-slate-800">Predust {batch.recipe.flavourMultiplier} · Batter {batch.recipe.batterMultiplier} · Adajio {batch.recipe.breadingMultiplier}</div><div>{batch.productionCompletedAt ? 'Recipe completed' : 'Recipe in progress'}</div></> : <div>Crumbing recipe required</div>}
                          <button onClick={() => openHcpCrumbingWorkflow(batch)} className="mt-1 rounded border border-orange-200 bg-orange-50 px-2 py-1 text-[11px] font-semibold text-orange-700 hover:bg-orange-100">View crumbing record</button>
                        </div>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-white ${crumbingStatusColors[batch.status]}`}>
                        {crumbingStatusLabels[batch.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-xs">
                      {batch.status === 'clubbed' ? '—' : `${batch.traysCrumbed} trays`}
                      {batch.crumbingTeam && (
                        <div className="text-slate-400">by {batch.crumbingTeam}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-xs">
                      {batch.status === 'clubbed' ? '—' : `${batch.traysFried} trays`}
                      {batch.fryingTeam && (
                        <div className="text-slate-400">by {batch.fryingTeam}</div>
                      )}
                      {batch.fryTemperature && (
                        <div className="text-slate-400">{batch.fryTemperature}°C / {batch.fryTime}s</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-orange-600 text-xs font-medium">
                      {batch.status === 'clubbed' ? '—' : `${batch.traysRemaining} trays`}
                    </td>
                    <td className="px-4 py-3">
                      {batch.packedSkus && batch.packedSkus.length > 0 ? (
                        <div className="text-xs">
                          {batch.packedSkus.map((p, i) => (
                            <div key={i}>{p.sku}: {p.cases} cases + {p.loose} loose{p.weightKg !== undefined ? ` (${p.weightKg.toFixed(2)} kg)` : ''}</div>
                          ))}
                        </div>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 flex-wrap">
                        {getActionButtons(batch)}
                      </div>
                    </td>
                  </tr>
                  {batch.type === 'SPP' && selectedBatch === batch.id && (
                    <tr>
                      <td colSpan={9} className="border-t border-pink-100 bg-pink-50/30 p-3">
                        {renderSppRecipeDetails(batch)}
                      </td>
                    </tr>
                  )}
                  {batch.type === 'JP' && selectedBatch === batch.id && (
                    <tr>
                      <td colSpan={9} className="border-t border-lime-100 bg-lime-50/30 p-3">
                        {renderJpWorkflowDetails(batch)}
                      </td>
                    </tr>
                  )}
                  {batch.type === 'HCP' && batch.hcpRecipeRequired && selectedBatch === batch.id && (
                    <tr>
                      <td colSpan={9} className="border-t border-orange-100 bg-orange-50/30 p-3">
                        {renderHcpCrumbingDetails(batch)}
                      </td>
                    </tr>
                  )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-slate-400">
            <p>No {title} batches yet.</p>
            {sources.length === 0 && (
              <p className="text-xs mt-2 text-amber-600">
                No available sources. {type === 'SPP' && 'Create paneer rounds with SPP pieces cutting type first.'}
                {type === 'JP' && 'Record PAN111 from paneer rounds first.'}
                {type === 'HCP' && 'Send halloumi rounds to HCP first.'}
              </p>
            )}
          </div>
        )}
      </div>
    );
  };

  const productTabs: Array<{ type: CrumbingType; label: string; icon: string; batches: CrumbingBatch[] }> = [
    { type: 'SPP', label: 'SPP', icon: '🌶️', batches: sppBatches },
    { type: 'JP', label: 'JP', icon: '🌶️', batches: jpBatches },
    { type: 'HCP', label: 'HCP', icon: '🧀', batches: hcpBatches },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-900">Crumbing & Frying</h3>
          <p className="text-sm text-slate-500">
            SPP / JP / HCP Production - Tray Tracking
          </p>
        </div>
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-blue-900 mb-2">Flash Fry Parameters</h4>
        <div className="grid grid-cols-2 gap-4 text-xs text-blue-800">
          <div>
            <strong>Temperature:</strong> 185°C
          </div>
          <div>
            <strong>Time:</strong> ~20 seconds per tray
          </div>
        </div>
      </div>

      {/* Product tabs keep each crumbing workflow focused, especially on small screens. */}
      <div className="rounded-xl border border-slate-200 bg-white p-2">
        <div className="grid grid-cols-3 gap-2" role="tablist" aria-label="Crumbing product">
          {productTabs.map(tab => {
            const isActive = activeType === tab.type;
            const openCount = tab.batches.filter(batch => !['handed_over', 'clubbed'].includes(batch.status)).length;
            const needsAttention = tab.batches.some(batch => !['handed_over', 'clubbed'].includes(batch.status));
            return (
              <button
                key={tab.type}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveType(tab.type)}
                className={`flex items-center justify-center gap-2 rounded-lg px-3 py-3 text-sm font-semibold transition-colors ${isActive ? 'bg-pink-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
                <span className={`rounded-full px-1.5 py-0.5 text-[11px] ${isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}>{openCount}</span>
                {needsAttention && <span className={`h-2 w-2 rounded-full ${isActive ? 'bg-amber-200' : 'bg-amber-500'}`} aria-label="Needs attention" />}
              </button>
            );
          })}
        </div>
      </div>

      {activeType === 'SPP' && renderBatchSection('SPP - Spicy Paneer Poppers', sppBatches, 'SPP')}
      {activeType === 'JP' && renderBatchSection('JP - Jalapeño Poppers', jpBatches, 'JP')}
      {activeType === 'HCP' && renderBatchSection('HCP - Halloumi Cheese Poppers', hcpBatches, 'HCP')}

      <Modal isOpen={showClubSppModal} onClose={() => setShowClubSppModal(false)} title="Club SPP batches">
        <div className="space-y-4">
          <div className="rounded-lg border border-pink-200 bg-pink-50 p-3 text-sm text-pink-950">
            Select two or more completed SPP batches that have not been fried or packed. Their source weights, recipe additions, wastage, and tray counts will be added into one combined batch for frying and packing.
          </div>
          <div className="space-y-2">
            {getClubEligibleSppBatches().map(batch => {
              const checked = clubSppBatchIds.includes(batch.id);
              return (
                <label key={batch.id} className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer ${checked ? 'border-pink-300 bg-pink-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => setClubSppBatchIds(current => event.target.checked ? [...current, batch.id] : current.filter(id => id !== batch.id))}
                    className="mt-1"
                  />
                  <span className="min-w-0 flex-1 text-sm text-slate-700">
                    <span className="font-semibold text-slate-900">{batch.batchCode}</span>
                    <span className="block text-xs text-slate-500">{(batch.sourceWeightKg || 0).toFixed(2)} kg source · {batch.traysCrumbed} trays · F {batch.recipe?.flavourMultiplier || 0} · B {batch.recipe?.batterMultiplier || 0} · A {batch.recipe?.breadingMultiplier || 0}</span>
                  </span>
                </label>
              );
            })}
          </div>
          {clubSppBatchIds.length >= 2 && (() => {
            const selected = getClubEligibleSppBatches().filter(batch => clubSppBatchIds.includes(batch.id));
            const sum = (read: (batch: CrumbingBatch) => number) => selected.reduce((total, batch) => total + (read(batch) || 0), 0);
            return (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                Combined: <strong>{sum(batch => batch.sourceWeightKg || 0).toFixed(2)} kg source</strong> · <strong>{sum(batch => batch.traysCrumbed)} trays</strong> · F {sum(batch => batch.recipe?.flavourMultiplier || 0)} · B {sum(batch => batch.recipe?.batterMultiplier || 0)} · A {sum(batch => batch.recipe?.breadingMultiplier || 0)}
              </div>
            );
          })()}
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={handleClubSppBatches} disabled={clubSppBatchIds.length < 2} className="flex-1 rounded-lg bg-pink-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-pink-700 disabled:cursor-not-allowed disabled:bg-slate-300">Club selected batches</button>
            <button type="button" onClick={() => setShowClubSppModal(false)} className="rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-200">Cancel</button>
          </div>
        </div>
      </Modal>

      {/* New Batch Modal */}
      <Modal isOpen={showNewBatchModal} onClose={() => setShowNewBatchModal(false)} title={`Create New ${activeType} Batch`}>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Source</label>
            <select
              value={newBatchForm.sourceBatchId}
              onChange={(e) => setNewBatchForm({ ...newBatchForm, sourceBatchId: e.target.value })}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
            >
              <option value="">Select source...</option>
              {activeType === 'SPP' && <option value="manual">Manual entry — no source round</option>}
              {activeType === 'JP' && <option value="pending">Current production — PAN111 lot pending</option>}
              {getAvailableSources(activeType).map((source: any) => (
                <option key={source.id} value={source.id}>
                  {activeType === 'SPP' && `${source.milkLotCode}/S${source.shiftNumber}/R${source.roundNumber}/${source.type} - ${getSppAvailableWeight(source).toFixed(2)} kg SPP available`}
                  {activeType === 'JP' && `${source.lotCode} - ${source.currentQuantity} kg PAN111`}
                  {activeType === 'HCP' && `${source.halloumiPool?.batchId || `HAL-${source.lotCode}`} - ${(source.halloumiPool?.availableForCrumbing || 0).toFixed(2)} kg available`}
                </option>
              ))}
            </select>
          </div>
          {activeType === 'HCP' && <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Halloumi weight for crumbing (kg)</label>
            <input
              type="number"
              value={newBatchForm.halloumiWeightKg || ''}
              onChange={(e) => setNewBatchForm({ ...newBatchForm, halloumiWeightKg: parseFloat(e.target.value) || 0 })}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              min="0"
              step="0.01"
              placeholder="Enter the quantity allocated from the pool"
            />
            {newBatchForm.sourceBatchId && newBatchForm.sourceBatchId !== 'manual' && <p className="mt-1 text-xs text-slate-500">This quantity is deducted from the milk lot's unallocated Halloumi pool when the HCP batch is created.</p>}
          </div>}
          {activeType === 'SPP' && newBatchForm.sourceBatchId === 'manual' && <>
            <div>
              <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Paneer weight for SPP (kg)</label>
              <input
                type="number"
                value={newBatchForm.manualPaneerWeightKg || ''}
                onChange={(e) => setNewBatchForm({ ...newBatchForm, manualPaneerWeightKg: parseFloat(e.target.value) || 0 })}
                className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                min="0"
                step="0.01"
                placeholder="e.g., 25"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Origin</label>
              <input
                type="text"
                value={newBatchForm.manualOrigin}
                onChange={(e) => setNewBatchForm({ ...newBatchForm, manualOrigin: e.target.value })}
                className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                placeholder="e.g., external paneer / trial batch"
              />
            </div>
          </>}
          {activeType === 'JP' && newBatchForm.sourceBatchId === 'pending' && <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Pending PAN111 origin</label>
            <input
              type="text"
              value={newBatchForm.manualOrigin}
              onChange={(e) => setNewBatchForm({ ...newBatchForm, manualOrigin: e.target.value })}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              placeholder="e.g., current production — lot will be linked later"
            />
            <p className="mt-1 text-xs text-amber-700">Production can continue now. Link the actual PAN111 lot from the JP batch record once it has been entered.</p>
          </div>}
          {activeType === 'HCP' && <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Trays Crumbed</label>
            <input
              type="number"
              value={newBatchForm.traysCrumbed}
              onChange={(e) => setNewBatchForm({ ...newBatchForm, traysCrumbed: parseInt(e.target.value) })}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              min="0"
            />
          </div>}
          {activeType === 'SPP' && <div className="rounded-lg border border-pink-200 bg-pink-50 p-3 text-xs text-pink-900">After the batch is created, the recipe details open directly under the batch and autosave as they are entered.</div>}
          {activeType === 'JP' && <div className="rounded-lg border border-lime-200 bg-lime-50 p-3 text-xs text-lime-900">This creates the JP record and opens Phase 1. Jalapeño bucket weights, piece inspection, PAN111 input, proportional cream-cheese recipe, filling, both freezes, and crumbing are recorded in sequence.</div>}
          {activeType === 'HCP' && <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-xs text-orange-900">After creation, record each Predust, batter, and Adajio addition. HCP cannot move to Freeze until the crumbing recipe is completed.</div>}
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">{activeType === 'JP' ? 'Prepping Team' : 'Crumbing Team'}</label>
            <input
              type="text"
              value={newBatchForm.crumbingTeam}
              onChange={(e) => setNewBatchForm({ ...newBatchForm, crumbingTeam: e.target.value })}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              placeholder="e.g., Rajesh, Amit"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <button
              onClick={handleCreateBatch}
              className="flex-1 px-4 py-2.5 bg-pink-600 text-white rounded-lg text-sm font-medium hover:bg-pink-700"
            >
              Create Batch
            </button>
            <button
              onClick={() => setShowNewBatchModal(false)}
              className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {/* Fry Trays Modal */}
      <Modal isOpen={showTrayModal} onClose={() => setShowTrayModal(false)} title="Fry Trays">
        <div className="space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-xs text-red-800">
              <strong>Flash Fry Parameters:</strong> 185°C for 20 seconds per tray
            </p>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Trays to Fry</label>
            <input
              type="number"
              value={trayForm.traysFried}
              onChange={(e) => setTrayForm({ ...trayForm, traysFried: parseInt(e.target.value) })}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              min="0"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Frying Team</label>
            <input
              type="text"
              value={trayForm.fryingTeam}
              onChange={(e) => setTrayForm({ ...trayForm, fryingTeam: e.target.value })}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              placeholder="e.g., Suresh, Deepak"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Temperature (°C)</label>
              <input
                type="number"
                value={trayForm.fryTemperature}
                onChange={(e) => setTrayForm({ ...trayForm, fryTemperature: parseInt(e.target.value) })}
                className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                min="0"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Time (seconds)</label>
              <input
                type="number"
                value={trayForm.fryTime}
                onChange={(e) => setTrayForm({ ...trayForm, fryTime: parseInt(e.target.value) })}
                className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                min="0"
              />
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button
              onClick={handleStartFrying}
              className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700"
            >
              Start Frying
            </button>
            <button
              onClick={() => setShowTrayModal(false)}
              className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {/* Pack Modal */}
      <Modal isOpen={showPackModal} onClose={() => setShowPackModal(false)} title="Pack Fried Trays">
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Final SKU</label>
            <select value={packForm.sku} onChange={(e) => setPackForm({ ...packForm, sku: e.target.value })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white">
              <option value="">Select SKU...</option>
              {crumbingSkuDefinitions.filter(definition => definition.crumbingType === (selectedBatch ? crumbingBatches.find(batch => batch.id === selectedBatch)?.type : activeType)).map(definition => <option key={definition.sku} value={definition.sku}>{definition.sku} - {definition.productName} (250g, 12/case)</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Trays to Pack</label>
            <input
              type="number"
              value={packForm.traysPacked || ''}
              onChange={(e) => setPackForm({ ...packForm, traysPacked: parseInt(e.target.value) })}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              min="0"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Cases</label>
              <input
                type="number"
                value={packForm.cases || ''}
                onChange={(e) => setPackForm({ ...packForm, cases: parseInt(e.target.value) })}
                className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                min="0"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Loose Packets</label>
              <input
                type="number"
                value={packForm.loose || ''}
                onChange={(e) => setPackForm({ ...packForm, loose: parseInt(e.target.value) })}
                className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                min="0"
              />
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button
              onClick={handlePack}
              className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700"
            >
              Pack
            </button>
            <button
              onClick={() => setShowPackModal(false)}
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
