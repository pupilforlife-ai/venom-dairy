import { Fragment, useState } from 'react';
import { Plus, Package, CheckCircle2, Clock } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { useToast } from '../components/Toast';
import { Modal } from '../components/Modal';
import { useSupabaseState } from '../hooks/useSupabaseState';
import { crumbingSkuDefinitions, crumbingSkuByCode, getCrumbingPackWeight } from '../data/skuConfig';

type CrumbingStatus = 
  | 'scheduled'
  | 'crumbing'
  | 'frozen'
  | 'frying'
  | 'packed'
  | 'handed_over';

type CrumbingType = 'SPP' | 'JP' | 'HCP';

const crumbingStatusLabels: Record<CrumbingStatus, string> = {
  scheduled: 'Scheduled',
  crumbing: 'Crumbing',
  frozen: 'Frozen',
  frying: 'Frying',
  packed: 'Packed',
  handed_over: 'Handed Over',
};

const crumbingStatusColors: Record<CrumbingStatus, string> = {
  scheduled: 'bg-slate-400',
  crumbing: 'bg-orange-500',
  frozen: 'bg-blue-500',
  frying: 'bg-red-500',
  packed: 'bg-emerald-500',
  handed_over: 'bg-emerald-700',
};

interface CrumbingBatch {
  id: string;
  batchCode: string;
  type: CrumbingType;
  sourceBatchId: string;
  sourceBatchCode: string;
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
  const { productionRounds, milkLots, intermediateLots } = useApp();
  const { showToast } = useToast();

  const [crumbingBatches, setCrumbingBatches] = useSupabaseState<CrumbingBatch[]>('vejoy_crumbingBatches', []);

  const [showNewBatchModal, setShowNewBatchModal] = useState(false);
  const [showTrayModal, setShowTrayModal] = useState(false);
  const [showPackModal, setShowPackModal] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<CrumbingType>('SPP');

  // Forms
  const [newBatchForm, setNewBatchForm] = useState({
    type: 'SPP' as CrumbingType,
    sourceBatchId: '',
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
    const sourceBatches = crumbingBatches
      .filter(batch => batch.type === 'SPP' && batch.sourceBatchId === round.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const latestBatch = sourceBatches[sourceBatches.length - 1];
    if (!latestBatch) return getSppSourceWeight(round);
    return latestBatch.balanceWeightKg === undefined ? 0 : Math.max(0, latestBatch.balanceWeightKg);
  };

  const updateCrumbingBatch = (id: string, updates: Partial<CrumbingBatch>) => {
    setCrumbingBatches(current => current.map(batch => batch.id === id ? { ...batch, ...updates } : batch));
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
      updates.balanceWeightKg = balanceWeightKg;
      updates.weightCrumbedKg = Math.max(0, sourceWeightKg - balanceWeightKg);
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
    if (!newBatchForm.sourceBatchId || !newBatchForm.crumbingTeam.trim()) {
      showToast('error', 'Please fill all required fields');
      return;
    }
    if (newBatchForm.type !== 'SPP' && newBatchForm.traysCrumbed <= 0) {
      showToast('error', 'Enter the number of trays crumbed');
      return;
    }

    let sourceBatchCode = '';
    let milkLotCode = '';

    if (newBatchForm.type === 'SPP') {
      const source = productionRounds.find(r => r.id === newBatchForm.sourceBatchId);
      if (!source) {
        showToast('error', 'Select a valid SPP source round');
        return;
      }
      if (source) {
        sourceBatchCode = `${source.milkLotCode}/S${source.shiftNumber}/R${source.roundNumber}/${source.type}`;
        milkLotCode = source.milkLotCode;
        const sourceWeightKg = getSppAvailableWeight(source);
        if (sourceWeightKg <= 0.01) {
          showToast('error', 'This SPP source has no balance available for another crumbing batch');
          return;
        }
      }
    } else if (newBatchForm.type === 'JP') {
      const source = intermediateLots.find(l => l.id === newBatchForm.sourceBatchId);
      if (source) {
        sourceBatchCode = source.lotCode;
        milkLotCode = source.sourceMilkLotCode;
      }
    } else if (newBatchForm.type === 'HCP') {
      const source = milkLots.find(lot => lot.id === newBatchForm.sourceBatchId);
      if (source) {
        sourceBatchCode = source.halloumiPool?.batchId || `HAL-${source.lotCode}`;
        milkLotCode = source.lotCode;
      }
    }

    const batchCode = generateBatchCode(newBatchForm.type, milkLotCode);

    const sourceRound = newBatchForm.type === 'SPP' ? productionRounds.find(round => round.id === newBatchForm.sourceBatchId) : undefined;
    const sourceWeightKg = sourceRound ? getSppAvailableWeight(sourceRound) : undefined;
    const newBatch: CrumbingBatch = {
      id: `crumb-${Date.now()}`,
      batchCode,
      type: newBatchForm.type,
      sourceBatchId: newBatchForm.sourceBatchId,
      sourceBatchCode,
      status: newBatchForm.type === 'SPP' ? 'scheduled' : 'crumbing',
      traysCrumbed: newBatchForm.type === 'SPP' ? 0 : newBatchForm.traysCrumbed,
      traysFried: 0,
      traysRemaining: newBatchForm.type === 'SPP' ? 0 : newBatchForm.traysCrumbed,
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
    }
    setNewBatchForm({ type: 'SPP', sourceBatchId: '', traysCrumbed: 0, crumbingTeam: '' });
  };

  const handleCompleteProduction = () => {
    if (!selectedBatch) return;
    const batch = crumbingBatches.find(item => item.id === selectedBatch);
    if (!batch || batch.type !== 'SPP') return;
    const sourceWeightKg = batch.sourceWeightKg || recipeForm.sourceWeightKg;
    const balanceWeightKg = Number(recipeForm.balanceWeightKg) || 0;
    const wastageKg = Number(recipeForm.wastageKg) || 0;
    if (!recipeForm.balanceRecorded || batch.balanceWeightKg === undefined) {
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
    const normalizedWeightCrumbedKg = Math.max(0, sourceWeightKg - normalizedBalanceWeightKg);
    updateCrumbingBatch(selectedBatch, {
      status: 'crumbing',
      traysCrumbed: recipeForm.traysCrumbed,
      traysRemaining: recipeForm.traysCrumbed,
      sourceWeightKg,
      balanceWeightKg: normalizedBalanceWeightKg,
      weightCrumbedKg: normalizedWeightCrumbedKg,
      wastageKg,
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

  const handleFreeze = (batchId: string) => {
    const batch = crumbingBatches.find(item => item.id === batchId);
    if (batch?.type === 'SPP' && !batch.productionCompletedAt) {
      showToast('error', 'Complete the SPP production details, including the balance paneer, first');
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

    if (batch.status === 'crumbing' && (batch.type !== 'SPP' || Boolean(batch.productionCompletedAt))) {
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
    const weightCrumbedKg = Math.max(0, sourceWeightKg - recipeForm.balanceWeightKg);
    const canComplete = recipeForm.balanceRecorded
      && recipeForm.balanceWeightKg >= 0
      && recipeForm.balanceWeightKg <= sourceWeightKg + 0.01
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
          <div className="mt-1 text-xs text-slate-500">Weight crumbed = source weight − recorded balance. Water is excluded from dry ingredient totals. The balance returns to the source pool for the next batch.</div>
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
            <button
              onClick={() => {
                setActiveType(type);
                setNewBatchForm({ ...newBatchForm, type });
                setShowNewBatchModal(true);
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-pink-600 text-white hover:bg-pink-700"
            >
              <Plus className="w-4 h-4" /> New Batch
            </button>
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
                      {batch.type === 'SPP' && batch.sourceWeightKg !== undefined && <div className="mt-1 text-[11px] text-pink-700">{batch.sourceWeightKg.toFixed(2)} kg source</div>}
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
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-white ${crumbingStatusColors[batch.status]}`}>
                        {crumbingStatusLabels[batch.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-xs">
                      {batch.traysCrumbed} trays
                      {batch.crumbingTeam && (
                        <div className="text-slate-400">by {batch.crumbingTeam}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-xs">
                      {batch.traysFried} trays
                      {batch.fryingTeam && (
                        <div className="text-slate-400">by {batch.fryingTeam}</div>
                      )}
                      {batch.fryTemperature && (
                        <div className="text-slate-400">{batch.fryTemperature}°C / {batch.fryTime}s</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-orange-600 text-xs font-medium">
                      {batch.traysRemaining} trays
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
            const openCount = tab.batches.filter(batch => batch.status !== 'handed_over').length;
            const needsAttention = tab.batches.some(batch => batch.status !== 'handed_over');
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
              {getAvailableSources(activeType).map((source: any) => (
                <option key={source.id} value={source.id}>
                  {activeType === 'SPP' && `${source.milkLotCode}/S${source.shiftNumber}/R${source.roundNumber}/${source.type} - ${getSppAvailableWeight(source).toFixed(2)} kg SPP available`}
                  {activeType === 'JP' && `${source.lotCode} - ${source.currentQuantity} kg PAN111`}
                  {activeType === 'HCP' && `${source.halloumiPool?.batchId || `HAL-${source.lotCode}`} - ${(source.halloumiPool?.availableForCrumbing || 0).toFixed(2)} kg available`}
                </option>
              ))}
            </select>
          </div>
          {activeType !== 'SPP' && <div>
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
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Crumbing Team</label>
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
              value={packForm.traysPacked}
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
                value={packForm.cases}
                onChange={(e) => setPackForm({ ...packForm, cases: parseInt(e.target.value) })}
                className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                min="0"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Loose Packets</label>
              <input
                type="number"
                value={packForm.loose}
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
