import { useMemo, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  GitBranch,
  Package,
  Plus,
  Snowflake,
  Truck,
} from 'lucide-react';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { useSupabaseState } from '../hooks/useSupabaseState';
import { CreamLot, DistributionHandover, DistributionHandoverSource, FinishedStockLot, MilkLot, ProductionRound } from '../data/mockData';
import {
  FinishedGoodsBatchCodeMode,
  buildFinishedGoodsBatchCode,
  getAllowedPaneerSkus,
  getFinishedGoodsBatchCodeDefinition,
  getPaneerPackWeight,
  paneerSkuByCode,
} from '../data/skuConfig';
import { useApp } from '../store/AppContext';

type CandidateUnit = 'kg' | 'packets' | 'bottles';

interface DistributionCandidate {
  id: string;
  sourceType: Exclude<DistributionHandoverSource, 'manual'>;
  sourceId: string;
  productName: string;
  batchCode: string;
  quantity: number;
  unit: CandidateUnit;
  cases?: number;
  looseQuantity?: number;
  storageLocation?: string;
  detail: string;
  sku?: string;
  sourceIds?: string[];
  sourceBatchCodes?: string[];
  finishedGoodsBatchCode?: string;
  finishedGoodsBatchCodeMode?: FinishedGoodsBatchCodeMode;
  receiptDates?: string[];
}

interface DistributionCrumbingBatch {
  id: string;
  batchCode: string;
  type: 'SPP' | 'JP' | 'HCP';
  status: string;
  traysPacked: number;
  packedSkus?: Array<{ sku: string; cases: number; loose: number }>;
}

interface HandoverForm {
  productName: string;
  batchCode: string;
  finishedGoodsBatchCode: string;
  quantity: number;
  unit: CandidateUnit;
  destination: string;
  handedOverBy: string;
  verifiedCases: number;
  verifiedLoose: number;
  quantityVerified: boolean;
  extraSourceRoundId: string;
  notes: string;
}

const finishedStockOrigin = 'Dairy Container (Finished Stock)';
const distributionStorageLocations = ['Distribution Coldroom', 'Rental Cold Storage'] as const;

const emptyForm: HandoverForm = {
  productName: '',
  batchCode: '',
  finishedGoodsBatchCode: '',
  quantity: 0,
  unit: 'kg',
  destination: distributionStorageLocations[0],
  handedOverBy: '',
  verifiedCases: 0,
  verifiedLoose: 0,
  quantityVerified: false,
  extraSourceRoundId: '',
  notes: '',
};

const roundProductNames: Record<string, string> = {
  Butter: 'Butter',
  Ghee: 'Ghee',
  Amassi: 'Amassi',
};

function formatQuantity(quantity: number, unit: CandidateUnit) {
  return `${quantity.toFixed(unit === 'kg' ? 2 : 0)} ${unit}`;
}

function roundMatchesBatchCode(round: ProductionRound, sourceBatchCode: string) {
  const source = sourceBatchCode.trim().toLowerCase();
  if (!source) return false;
  const candidates = [
    round.batchCode,
    round.sourceBatchCode,
    `${round.milkLotCode}/S${round.shiftNumber}/R${round.roundNumber}`,
    `${round.milkLotCode}/S${round.shiftNumber}/R${round.roundNumber}/${round.type}`,
  ].filter(Boolean).map(value => String(value).toLowerCase());
  return candidates.includes(source);
}

function getCreamReceiptDate(round: ProductionRound, milkLots: MilkLot[], creamLots: CreamLot[]) {
  const fallbackMilkLot = milkLots.find(lot => lot.id === round.milkLotId || lot.lotCode === round.milkLotCode);
  if (!round.creamLotId) return fallbackMilkLot?.receiptDate;
  const externalCream = creamLots.find(lot => lot.id === round.creamLotId);
  if (externalCream) return externalCream.dateReceived || externalCream.receivedAt?.slice(0, 10);
  const milkLot = milkLots.find(lot => lot.id === round.creamLotId || lot.lotCode === round.milkLotCode) || fallbackMilkLot;
  if (!milkLot) return undefined;
  const internalCream = milkLot.creamLots?.find(lot => lot.id === round.creamLotId);
  return internalCream?.dateReceived || internalCream?.receivedAt?.slice(0, 10) || milkLot.receiptDate;
}

function getReceiptDateForRound(
  round: ProductionRound,
  sku: string | undefined,
  milkLots: MilkLot[],
  creamLots: CreamLot[],
) {
  const definition = sku ? getFinishedGoodsBatchCodeDefinition(sku) : undefined;
  if (definition?.receiptSource === 'cream') return getCreamReceiptDate(round, milkLots, creamLots);
  const milkLot = milkLots.find(lot => lot.id === round.milkLotId || lot.lotCode === round.milkLotCode);
  return milkLot?.receiptDate;
}

export default function Distribution() {
  const {
    finishedStock,
    milkLots,
    creamLots,
    productionRounds,
    addFinishedStock,
    updateFinishedStock,
    updateMilkLot,
    updateProductionRound,
  } = useApp();
  const { showToast } = useToast();
  const [handovers, setHandovers] = useSupabaseState<DistributionHandover[]>('vejoy_distributionHandovers', []);
  const [crumbingBatches, setCrumbingBatches] = useSupabaseState<DistributionCrumbingBatch[]>('vejoy_crumbingBatches', []);
  const [showHandoverModal, setShowHandoverModal] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<DistributionCandidate | null>(null);
  const [form, setForm] = useState<HandoverForm>(emptyForm);
  const currentRole = typeof window === 'undefined' ? '' : window.localStorage.getItem('vejoy_user_role')?.toLowerCase() || '';
  const currentUsername = typeof window === 'undefined' ? '' : window.localStorage.getItem('vejoy_user_username') || '';
  const canAssignManualBatchCode = currentRole === 'admin' || currentRole === 'owner';

  const candidates = useMemo<DistributionCandidate[]>(() => {
    const finishedBySku = new Map<string, FinishedStockLot[]>();
    finishedStock
      .filter(stock => stock.status === 'awaiting_handover')
      .forEach(stock => {
        const existing = finishedBySku.get(stock.sku) || [];
        existing.push(stock);
        finishedBySku.set(stock.sku, existing);
      });

    const finishedCandidates: DistributionCandidate[] = [...finishedBySku.entries()].map(([sku, stocks]) => {
      const first = stocks[0];
      const sourceBatchCodes = [...new Set(stocks.flatMap(stock => stock.sourceBatchCodes || []).filter(Boolean))];
      const definition = getFinishedGoodsBatchCodeDefinition(sku);
      const sourceRounds = productionRounds.filter(round => sourceBatchCodes.some(code => roundMatchesBatchCode(round, code)));
      const receiptDates = [...new Set(sourceRounds
        .map(round => getReceiptDateForRound(round, sku, milkLots, creamLots))
        .filter((date): date is string => Boolean(date)))];
      const existingFinishedCodes = [...new Set(stocks.map(stock => stock.finishedGoodsBatchCode).filter(Boolean))] as string[];
      const generatedFinishedCode = existingFinishedCodes.length === 1
        ? existingFinishedCodes[0]
        : receiptDates.length === 1
          ? buildFinishedGoodsBatchCode(sku, receiptDates[0])
          : undefined;
      const locations = [...new Set(stocks.map(stock => stock.storageLocation === 'Finished Production Stock' ? finishedStockOrigin : stock.storageLocation).filter(Boolean))];
      const isWeightStock = stocks.some(stock => stock.weightKg !== undefined || stock.looseWeightKg !== undefined);
      const quantity = isWeightStock
        ? stocks.reduce((sum, stock) => sum + (stock.weightKg ?? stock.looseWeightKg ?? 0), 0)
        : stocks.reduce((sum, stock) => sum + (stock.totalPackets || 0), 0);
      const cases = stocks.reduce((sum, stock) => sum + (stock.cases || 0), 0);
      const loose = stocks.reduce((sum, stock) => sum + (stock.loosePackets || 0), 0);
      return {
        id: `finished-sku:${sku}`,
        sourceType: 'finished_stock',
        sourceId: first.id,
        sourceIds: stocks.map(stock => stock.id),
        sourceBatchCodes,
        sku,
        productName: first.productName,
        batchCode: sourceBatchCodes.length === 1 ? sourceBatchCodes[0] : `${sku} · ${stocks.length} packed batches`,
        finishedGoodsBatchCode: generatedFinishedCode,
        finishedGoodsBatchCodeMode: definition?.mode || 'manual',
        receiptDates,
        quantity,
        unit: isWeightStock ? 'kg' : 'packets',
        cases,
        looseQuantity: loose,
        storageLocation: locations.length === 1 ? locations[0] : `${locations.length} locations`,
        detail: isWeightStock
          ? `${cases} cases · ${quantity.toFixed(2)} kg · ${stocks.length} packed batches`
          : `${cases} cases · ${loose} loose · ${quantity} packets · ${stocks.length} packed batches`,
      };
    });

    const halloumiCandidates: DistributionCandidate[] = milkLots
      .filter(lot => {
        const pool = lot.halloumiPool;
        return Boolean(pool && pool.vacuumPacked > 0 && pool.availableForCrumbing > 0);
      })
      .map(lot => {
        const pool = lot.halloumiPool!;
        return {
          id: `halloumi:${lot.id}`,
          sourceType: 'halloumi_pool',
          sourceId: lot.id,
          productName: 'Halloumi (vacuumed chilled stock)',
          batchCode: pool.batchId,
          quantity: Math.max(0, pool.availableForCrumbing),
          unit: 'kg',
          storageLocation: 'Chiller',
          detail: `Milk lot ${lot.lotCode} · ${pool.vacuumPacked.toFixed(2)} kg vacuumed`,
          finishedGoodsBatchCodeMode: 'manual',
        };
      });

    const crumbingCandidates: DistributionCandidate[] = crumbingBatches
      .filter(batch => batch.status === 'packed' && batch.traysPacked > 0)
      .map(batch => {
        const cases = (batch.packedSkus || []).reduce((sum, packed) => sum + packed.cases, 0);
        const loose = (batch.packedSkus || []).reduce((sum, packed) => sum + packed.loose, 0);
        const packedSkus = [...new Set((batch.packedSkus || []).map(packed => packed.sku).filter(Boolean))];
        const sku = packedSkus.length === 1 ? packedSkus[0] : undefined;
        const quantity = cases * 12 + loose || batch.traysPacked;
        const productName = batch.type === 'SPP'
          ? 'Spicy Paneer Poppers'
          : batch.type === 'JP'
            ? 'Jalapeno Poppers'
            : 'Halloumi Cheese Poppers';
        return {
          id: `crumbing:${batch.id}`,
          sourceType: 'crumbing_batch',
          sourceId: batch.id,
          productName,
          batchCode: batch.batchCode,
          quantity,
          unit: 'packets',
          cases,
          looseQuantity: loose,
          storageLocation: 'Coldroom',
          detail: `${batch.type} finished batch · ${cases} cases · ${loose} loose`,
          sku,
          finishedGoodsBatchCodeMode: 'manual',
        };
      });

    // Butter, Ghee, and Amassi are produced in their own tabs and do not all
    // create a FinishedStock row. Their final output remains handover-ready
    // here, while Paneer is represented by packed FinishedStock and Halloumi
    // by its vacuumed common pool above.
    const productionCandidates: DistributionCandidate[] = productionRounds
      .filter(round => {
        if (!roundProductNames[round.type] || round.status === 'handed_over') return false;
        if (!['packed', 'stored_in_chiller'].includes(round.status)) return false;
        if (round.type === 'Amassi') return Boolean(round.amassiPacked?.length);
        return round.outputWeight > 0;
      })
      .map(round => {
        const batchCode = round.batchCode || `${round.milkLotCode}/S${round.shiftNumber}/R${round.roundNumber}/${round.type}`;
        if (round.type === 'Amassi') {
          const bottles = (round.amassiPacked || []).reduce((sum, packed) => sum + packed.bottles, 0);
          const skuSummary = (round.amassiPacked || []).map(packed => `${packed.sku}: ${packed.bottles}`).join(' · ');
          return {
            id: `round:${round.id}`,
            sourceType: 'production_round',
            sourceId: round.id,
            productName: `${roundProductNames[round.type]} ${round.amassiType || ''}`.trim(),
            batchCode,
            quantity: bottles,
            unit: 'bottles',
            storageLocation: 'Coldroom',
            detail: skuSummary || 'Bottled Amassi output',
            finishedGoodsBatchCodeMode: 'manual',
          };
        }
        const productSku = round.packedSkus?.length === 1 ? round.packedSkus[0].sku : undefined;
        const receiptDate = getReceiptDateForRound(round, productSku, milkLots, creamLots);
        const generatedFinishedCode = productSku ? buildFinishedGoodsBatchCode(productSku, receiptDate) : undefined;
        return {
          id: `round:${round.id}`,
          sourceType: 'production_round',
          sourceId: round.id,
          productName: roundProductNames[round.type],
          batchCode,
          quantity: round.outputWeight,
          unit: 'kg',
          storageLocation: round.type === 'Ghee' ? 'Coldroom' : 'Chiller',
          detail: `${round.type} production round · Milk lot ${round.milkLotCode}`,
          sku: productSku,
          finishedGoodsBatchCode: generatedFinishedCode,
          finishedGoodsBatchCodeMode: getFinishedGoodsBatchCodeDefinition(productSku || '')?.mode || 'manual',
          receiptDates: receiptDate ? [receiptDate] : [],
        };
      });

    return [...finishedCandidates, ...halloumiCandidates, ...crumbingCandidates, ...productionCandidates];
  }, [creamLots, crumbingBatches, finishedStock, milkLots, productionRounds]);

  const extraSourceRounds = useMemo(() => {
    if (selectedCandidate?.sourceType !== 'finished_stock' || !selectedCandidate.sku) return [];
    return productionRounds
      .filter(round => {
        if (round.type !== 'D' && round.type !== 'C/S') return false;
        if (['scheduled', 'cancelled', 'spoiled', 'handed_over'].includes(round.status)) return false;
        const balance = round.remainingBalance ?? round.intermediateBalance ?? 0;
        if (balance <= 0) return false;
        return getAllowedPaneerSkus(round.type, round.cuttingType).some(definition => definition.sku === selectedCandidate.sku);
      })
      .sort((a, b) => b.shiftNumber - a.shiftNumber || b.roundNumber - a.roundNumber);
  }, [productionRounds, selectedCandidate]);

  const pendingKg = candidates.filter(candidate => candidate.unit === 'kg').reduce((sum, candidate) => sum + candidate.quantity, 0);
  const pendingPackets = candidates.filter(candidate => candidate.unit === 'packets').reduce((sum, candidate) => sum + candidate.quantity, 0);

  const openCandidate = (candidate: DistributionCandidate) => {
    setSelectedCandidate(candidate);
    setForm({
      productName: candidate.productName,
      batchCode: candidate.batchCode,
      finishedGoodsBatchCode: candidate.finishedGoodsBatchCode || '',
      quantity: candidate.quantity,
      unit: candidate.unit,
  destination: distributionStorageLocations[0],
      handedOverBy: '',
      verifiedCases: candidate.cases || 0,
      verifiedLoose: candidate.looseQuantity || 0,
      quantityVerified: false,
      extraSourceRoundId: '',
      notes: '',
    });
    setShowHandoverModal(true);
  };

  const openManualHandover = () => {
    setSelectedCandidate(null);
    setForm(emptyForm);
    setShowHandoverModal(true);
  };

  const selectedFinishedDefinition = selectedCandidate?.sku ? paneerSkuByCode[selectedCandidate.sku] : undefined;
  const selectedBatchDefinition = selectedCandidate?.sku
    ? getFinishedGoodsBatchCodeDefinition(selectedCandidate.sku)
    : undefined;
  // Automatic codes are suggestions. Only an owner/admin can review or edit
  // the final code that is committed to the handover and stock audit trail.
  const finishedGoodsBatchCodeEditable = canAssignManualBatchCode;
  const selectedFinishedExtraCases = selectedCandidate?.sourceType === 'finished_stock'
    ? Math.max(0, form.verifiedCases - (selectedCandidate.cases || 0))
    : 0;
  const selectedFinishedExtraLoose = selectedCandidate?.sourceType === 'finished_stock'
    ? Math.max(0, form.verifiedLoose - (selectedCandidate.looseQuantity || 0))
    : 0;
  const selectedFinishedExtraWeight = selectedCandidate?.sourceType !== 'finished_stock'
    ? 0
    : !selectedFinishedDefinition
      ? 0
      : selectedFinishedDefinition.packMode === 'units'
        ? getPaneerPackWeight(selectedFinishedDefinition, selectedFinishedExtraCases, selectedFinishedExtraLoose, 0, 0)
        : Math.max(0, form.quantity - selectedCandidate.quantity);

  const updateVerifiedPackedCounts = (changes: Partial<Pick<HandoverForm, 'verifiedCases' | 'verifiedLoose'>>) => {
    setForm(current => {
      const next = { ...current, ...changes };
      next.quantityVerified = false;
      if (selectedFinishedDefinition?.packMode === 'units') {
        next.quantity = Math.max(0, next.verifiedCases) * (selectedFinishedDefinition.unitsPerCase || 0) + Math.max(0, next.verifiedLoose);
      }
      return next;
    });
  };

  const closeModal = () => {
    setShowHandoverModal(false);
    setSelectedCandidate(null);
    setForm(emptyForm);
  };

  const recordHandover = () => {
    const productName = form.productName.trim();
    const batchCode = form.batchCode.trim();
    const finishedGoodsBatchCode = form.finishedGoodsBatchCode.trim();
    const handedOverBy = form.handedOverBy.trim();
    const isFinishedStockCandidate = selectedCandidate?.sourceType === 'finished_stock';
    if (!productName || !batchCode || !handedOverBy || !form.destination || form.quantity <= 0) {
      showToast('error', 'Enter the product, batch, quantity, receiving location, and person handing it over');
      return;
    }
    if (!finishedGoodsBatchCode) {
      showToast('error', canAssignManualBatchCode
        ? 'Enter the finished-goods batch code before recording the handover'
        : 'An owner or admin must assign the finished-goods batch code before this handover');
      return;
    }
    if (!canAssignManualBatchCode) {
      showToast('error', 'Owner/admin review is required before a finished-goods batch can be handed over');
      return;
    }
    if (selectedBatchDefinition?.prefix && !finishedGoodsBatchCode.startsWith(`${selectedBatchDefinition.prefix}_`)) {
      showToast('error', `The finished-goods code for ${selectedCandidate?.sku} must start with ${selectedBatchDefinition.prefix}_`);
      return;
    }
    const reviewMethod: DistributionHandover['finishedGoodsBatchCodeReviewMethod'] = selectedCandidate?.finishedGoodsBatchCode
      ? finishedGoodsBatchCode === selectedCandidate.finishedGoodsBatchCode
        ? 'automatic_suggestion'
        : 'owner_admin_override'
      : 'manual_entry';
    const reviewedBy = currentUsername || currentRole;
    const reviewedAt = new Date().toISOString();
    if (selectedCandidate && !isFinishedStockCandidate && form.quantity > selectedCandidate.quantity + 0.01) {
      showToast('error', `Only ${formatQuantity(selectedCandidate.quantity, selectedCandidate.unit)} is available`);
      return;
    }
    if (isFinishedStockCandidate) {
      if (!form.quantityVerified) {
        showToast('error', 'Confirm that the packed SKU quantity was physically verified before handover');
        return;
      }
      if (form.quantity < selectedCandidate.quantity - 0.01) {
        showToast('error', 'The verified quantity cannot be below the recorded packed SKU total');
        return;
      }
      if (form.quantity > selectedCandidate.quantity + 0.01 && !selectedFinishedDefinition) {
        showToast('error', 'This SKU is not configured for balance allocation; add its pack definition before recording a surplus');
        return;
      }
      if (selectedFinishedExtraWeight > 0) {
        const extraRound = productionRounds.find(round => round.id === form.extraSourceRoundId);
        if (!extraRound || !extraSourceRounds.some(round => round.id === form.extraSourceRoundId) || !selectedFinishedDefinition) {
          showToast('error', 'Select the production round whose balance paneer covers the extra quantity');
          return;
        }
        const currentBalance = extraRound.remainingBalance ?? extraRound.intermediateBalance ?? 0;
        if (selectedFinishedExtraWeight > currentBalance + 0.01) {
          showToast('error', `The extra quantity exceeds ${extraRound.milkLotCode}/S${extraRound.shiftNumber}/R${extraRound.roundNumber}'s balance of ${currentBalance.toFixed(2)} kg`);
          return;
        }
        const sourceBatchCode = extraRound.batchCode || extraRound.sourceBatchCode || `${extraRound.milkLotCode}/S${extraRound.shiftNumber}/R${extraRound.roundNumber}/${extraRound.type}`;
        const packingRunId = `pb-${extraRound.id}-distribution-${Date.now()}`;
        const extraEntry = {
          sku: selectedCandidate.sku!,
          cases: selectedFinishedDefinition.packMode === 'units' ? selectedFinishedExtraCases : 0,
          loose: selectedFinishedDefinition.packMode === 'units' ? selectedFinishedExtraLoose : 0,
          packingRunId,
          reason: 'Physical distribution count adjustment',
          ...(selectedFinishedDefinition.packMode === 'weight_only'
            ? { weightKg: selectedFinishedExtraWeight }
            : selectedFinishedDefinition.packMode === 'weight_loose'
              ? { looseWeightKg: selectedFinishedExtraWeight }
              : {}),
        };
        addFinishedStock({
          sku: selectedCandidate.sku!,
          productName: selectedCandidate.productName,
          packingRunId,
          cases: extraEntry.cases,
          loosePackets: extraEntry.loose,
          totalPackets: selectedFinishedDefinition.packMode === 'units'
            ? selectedFinishedExtraCases * (selectedFinishedDefinition.unitsPerCase || 0) + selectedFinishedExtraLoose
            : 0,
          storageLocation: form.destination,
          status: 'handed_over',
          createdAt: new Date().toISOString(),
          sourceBatchCodes: [sourceBatchCode],
          finishedGoodsBatchCode,
          finishedGoodsBatchCodeReviewedBy: reviewedBy,
          finishedGoodsBatchCodeReviewedAt: reviewedAt,
          finishedGoodsBatchCodeReviewMethod: reviewMethod,
          ...(selectedFinishedDefinition.packMode === 'weight_only'
            ? { weightKg: selectedFinishedExtraWeight }
            : selectedFinishedDefinition.packMode === 'weight_loose'
              ? { looseWeightKg: selectedFinishedExtraWeight }
              : {}),
        });
        const newBalance = currentBalance - selectedFinishedExtraWeight;
        updateProductionRound(extraRound.id, {
          status: newBalance <= 0 ? 'packed' : extraRound.status,
          packedSkus: [...(extraRound.packedSkus || []), extraEntry],
          remainingBalance: newBalance,
          intermediateBalance: newBalance,
        });
      }
    }

    if (selectedCandidate?.sourceType === 'finished_stock') {
      (selectedCandidate.sourceIds || [selectedCandidate.sourceId]).forEach(sourceId => {
        updateFinishedStock(sourceId, {
          status: 'handed_over',
          storageLocation: form.destination,
          finishedGoodsBatchCode,
          finishedGoodsBatchCodeReviewedBy: reviewedBy,
          finishedGoodsBatchCodeReviewedAt: reviewedAt,
          finishedGoodsBatchCodeReviewMethod: reviewMethod,
        });
      });
    }

    if (selectedCandidate?.sourceType === 'halloumi_pool') {
      const milkLot = milkLots.find(lot => lot.id === selectedCandidate.sourceId);
      const pool = milkLot?.halloumiPool;
      const available = Math.max(0, pool?.availableForCrumbing || 0);
      if (!milkLot || !pool || form.quantity > available + 0.01) {
        showToast('error', 'The Halloumi pool changed. Refresh the page and try again');
        return;
      }
      updateMilkLot(milkLot.id, {
        halloumiPool: {
          ...pool,
          handedOverWeight: (pool.handedOverWeight || 0) + form.quantity,
          availableForCrumbing: Math.max(0, available - form.quantity),
        },
      });
    }

    if (selectedCandidate?.sourceType === 'production_round') {
      updateProductionRound(selectedCandidate.sourceId, {
        status: 'handed_over',
        locked: true,
        completedAt: new Date().toISOString(),
      });
    }

    if (selectedCandidate?.sourceType === 'crumbing_batch') {
      setCrumbingBatches(current => current.map(batch => batch.id === selectedCandidate.sourceId
        ? { ...batch, status: 'handed_over' }
        : batch
      ));
    }

    const now = new Date().toISOString();
    const sourceNote = isFinishedStockCandidate && selectedCandidate?.sourceBatchCodes?.length
      ? `Packed source batches: ${selectedCandidate.sourceBatchCodes.join(', ')}`
      : '';
    const extraRound = isFinishedStockCandidate && selectedFinishedExtraWeight > 0
      ? productionRounds.find(round => round.id === form.extraSourceRoundId)
      : undefined;
    const extraNote = extraRound
      ? `Extra quantity recorded against ${extraRound.milkLotCode}/S${extraRound.shiftNumber}/R${extraRound.roundNumber} balance`
      : '';
    const codeReviewNote = reviewMethod === 'owner_admin_override' && selectedCandidate?.finishedGoodsBatchCode
      ? `Automatic suggestion ${selectedCandidate.finishedGoodsBatchCode} changed to ${finishedGoodsBatchCode}`
      : '';
    const record: DistributionHandover = {
      id: `dist-${Date.now()}`,
      sourceType: selectedCandidate?.sourceType || 'manual',
      sourceId: selectedCandidate?.sourceId,
      productName,
      finishedGoodsBatchCode,
      finishedGoodsBatchCodeReviewedBy: reviewedBy,
      finishedGoodsBatchCodeReviewedAt: reviewedAt,
      finishedGoodsBatchCodeReviewMethod: reviewMethod,
      batchCode,
      quantity: form.quantity,
      unit: form.unit,
      cases: isFinishedStockCandidate ? form.verifiedCases : selectedCandidate?.cases,
      looseQuantity: isFinishedStockCandidate ? form.verifiedLoose : selectedCandidate?.looseQuantity,
      storageLocation: form.destination,
      destination: form.destination,
      handedOverBy,
      handedOverAt: now,
      quantityVerified: isFinishedStockCandidate ? form.quantityVerified : undefined,
      quantityVerifiedBy: isFinishedStockCandidate ? handedOverBy : undefined,
      quantityVerifiedAt: isFinishedStockCandidate ? now : undefined,
      notes: [sourceNote, codeReviewNote, extraNote, form.notes.trim()].filter(Boolean).join(' · ') || undefined,
    };
    setHandovers(current => [...current, record]);
    showToast('success', `${productName} recorded as handed over to ${record.destination}`);
    closeModal();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Distribution</h2>
          <p className="mt-0.5 text-sm text-slate-500">Packed stock is staged in the dairy container. Record its handover to the Distribution coldroom or rental cold storage.</p>
        </div>
        <button type="button" onClick={openManualHandover} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700">
          <Plus className="h-4 w-4" /> Record product handover
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center"><Clock className="mx-auto mb-1 h-5 w-5 text-amber-600" /><p className="text-2xl font-bold text-amber-700">{candidates.length}</p><p className="text-xs text-amber-700">Ready to transfer</p></div>
        <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4 text-center"><Snowflake className="mx-auto mb-1 h-5 w-5 text-cyan-600" /><p className="text-2xl font-bold text-cyan-700">{pendingKg.toFixed(1)}</p><p className="text-xs text-cyan-700">kg ready</p></div>
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-center"><Package className="mx-auto mb-1 h-5 w-5 text-indigo-600" /><p className="text-2xl font-bold text-indigo-700">{pendingPackets}</p><p className="text-xs text-indigo-700">packed units</p></div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center"><CheckCircle2 className="mx-auto mb-1 h-5 w-5 text-emerald-600" /><p className="text-2xl font-bold text-emerald-700">{handovers.length}</p><p className="text-xs text-emerald-700">recorded transfers</p></div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div><h3 className="text-sm font-semibold text-slate-900">Ready for distribution</h3><p className="mt-0.5 text-xs text-slate-500">Select a manufactured output to record its handover. Halloumi is taken from the vacuumed chilled common pool.</p></div>
          <Truck className="h-5 w-5 text-slate-400" />
        </div>
        {candidates.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">No products are awaiting distribution handover.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead><tr className="border-b border-slate-100 text-left"><th className="px-3 py-2 text-xs uppercase tracking-wide text-slate-500">Product / SKU</th><th className="px-3 py-2 text-xs uppercase tracking-wide text-slate-500">Packed sources</th><th className="px-3 py-2 text-xs uppercase tracking-wide text-slate-500">Quantity</th><th className="px-3 py-2 text-xs uppercase tracking-wide text-slate-500">Current location</th><th className="px-3 py-2 text-xs uppercase tracking-wide text-slate-500">Action</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {candidates.map(candidate => (
                  <tr key={candidate.id} className="hover:bg-slate-50">
                    <td className="px-3 py-3"><div className="font-medium text-slate-900">{candidate.productName}</div>{candidate.sku && <div className="mt-1 inline-flex rounded bg-indigo-50 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-indigo-700">{candidate.sku}</div>}<div className="mt-1 text-xs text-slate-500">{candidate.detail}</div></td>
                    <td className="px-3 py-3"><div className="text-xs font-semibold text-emerald-700">Finished: {candidate.finishedGoodsBatchCode || 'Owner/admin code required'}</div><div className="mt-1 inline-flex items-center gap-1 text-xs text-slate-600"><GitBranch className="h-3 w-3" /><code>{candidate.batchCode}</code></div>{candidate.sourceBatchCodes && candidate.sourceBatchCodes.length > 1 && <div className="mt-1 text-[11px] text-slate-500">{candidate.sourceBatchCodes.length} source batches grouped</div>}{candidate.receiptDates && candidate.receiptDates.length > 1 && <div className="mt-1 text-[11px] text-amber-700">Multiple receipt dates — manual code required</div>}</td>
                    <td className="px-3 py-3 font-semibold text-slate-900">{formatQuantity(candidate.quantity, candidate.unit)}{candidate.cases !== undefined && <div className="text-xs font-normal text-slate-500">{candidate.cases} cases · {candidate.looseQuantity || 0} loose</div>}</td>
                    <td className="px-3 py-3 text-xs text-slate-600">{candidate.storageLocation || '—'}</td>
                    <td className="px-3 py-3"><button type="button" onClick={() => openCandidate(candidate)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100">Hand over <ArrowRight className="h-3 w-3" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3"><div><h3 className="text-sm font-semibold text-slate-900">Distribution handover history</h3><p className="mt-0.5 text-xs text-slate-500">Every new transfer is stored as a traceable record.</p></div><ClipboardCheck className="h-5 w-5 text-slate-400" /></div>
        {handovers.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">No new distribution handovers recorded yet.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-sm"><thead><tr className="border-b border-slate-100 text-left"><th className="px-4 py-2.5 text-xs uppercase tracking-wide text-slate-500">Product</th><th className="px-4 py-2.5 text-xs uppercase tracking-wide text-slate-500">Finished batch / source</th><th className="px-4 py-2.5 text-xs uppercase tracking-wide text-slate-500">Quantity</th><th className="px-4 py-2.5 text-xs uppercase tracking-wide text-slate-500">Physical check</th><th className="px-4 py-2.5 text-xs uppercase tracking-wide text-slate-500">Receiving location</th><th className="px-4 py-2.5 text-xs uppercase tracking-wide text-slate-500">Recorded by</th><th className="px-4 py-2.5 text-xs uppercase tracking-wide text-slate-500">Date</th></tr></thead><tbody className="divide-y divide-slate-100">{[...handovers].reverse().map(record => <tr key={record.id} className="hover:bg-slate-50"><td className="px-4 py-3 font-medium text-slate-900">{record.productName}</td><td className="px-4 py-3 text-xs"><div className="font-mono font-semibold text-emerald-700">{record.finishedGoodsBatchCode || '—'}</div><div className="mt-1 font-mono text-slate-500">Source: {record.batchCode}</div>{record.finishedGoodsBatchCodeReviewedBy && <div className="mt-1 text-[10px] text-indigo-700">Reviewed by {record.finishedGoodsBatchCodeReviewedBy}{record.finishedGoodsBatchCodeReviewMethod === 'owner_admin_override' ? ' · changed' : ''}</div>}</td><td className="px-4 py-3 font-semibold text-slate-900">{formatQuantity(record.quantity, record.unit)}{record.cases !== undefined && <div className="text-xs font-normal text-slate-500">{record.cases} cases · {record.looseQuantity || 0} loose</div>}</td><td className="px-4 py-3 text-xs text-slate-600">{record.quantityVerified ? <span className="font-semibold text-emerald-700">Verified{record.quantityVerifiedBy ? ` · ${record.quantityVerifiedBy}` : ''}</span> : '—'}</td><td className="px-4 py-3 text-slate-700">{record.storageLocation || record.destination}</td><td className="px-4 py-3 text-slate-600">{record.handedOverBy}</td><td className="px-4 py-3 text-xs text-slate-500">{new Date(record.handedOverAt).toLocaleString()}</td></tr>)}</tbody></table></div>}
      </div>

      <Modal isOpen={showHandoverModal} onClose={closeModal} title={selectedCandidate ? `Hand over ${selectedCandidate.productName}` : 'Record product handover'}>
        <div className="space-y-4">
          <p className="text-xs text-slate-500">Packed stock is held in the dairy container before handover. Choose the cold store that physically receives it; this location is saved on the stock line and handover history.</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div><label className="text-xs font-medium uppercase tracking-wide text-slate-600">Product</label><input value={form.productName} disabled={Boolean(selectedCandidate)} onChange={event => setForm({ ...form, productName: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50" placeholder="e.g. Halloumi" /></div>
            <div><label className="text-xs font-medium uppercase tracking-wide text-slate-600">Source batch / lot</label><input value={form.batchCode} disabled={Boolean(selectedCandidate)} onChange={event => setForm({ ...form, batchCode: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm disabled:bg-slate-50" placeholder="Production/source code" /></div>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
            <label className="text-xs font-semibold uppercase tracking-wide text-emerald-900">Finished-goods batch code</label>
            <input value={form.finishedGoodsBatchCode} disabled={!finishedGoodsBatchCodeEditable} onChange={event => setForm({ ...form, finishedGoodsBatchCode: event.target.value })} className="mt-1 w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 font-mono text-sm disabled:bg-emerald-50" placeholder="e.g. 11_011026" />
            <p className="mt-1 text-[11px] text-emerald-800">{selectedBatchDefinition?.mode === 'receipt_date' && selectedCandidate?.finishedGoodsBatchCode ? `Generated from the receipt date: ${selectedCandidate.receiptDates?.join(', ') || 'recorded source date'}.` : selectedCandidate?.receiptDates && selectedCandidate.receiptDates.length > 1 ? 'This SKU combines multiple receipt dates; an owner/admin must assign one finished-goods code.' : selectedBatchDefinition?.prefix ? `Owner/admin must assign this code using prefix ${selectedBatchDefinition.prefix}.` : 'Owner/admin assigns this code for products without one source receipt date.'}{!canAssignManualBatchCode && ' You can view it, but only an owner or admin can enter a manual code.'}</p>
            {!canAssignManualBatchCode && <p className="mt-2 text-xs font-semibold text-amber-800">Owner/admin review is required before this handover can be confirmed.</p>}
          </div>
          {selectedCandidate?.sourceType === 'finished_stock' && selectedFinishedDefinition?.packMode === 'units' ? <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-indigo-800">Physical packed quantity</p><p className="mt-1 text-xs text-indigo-700">Check the actual cases and loose packets. Any surplus will be attributed to a production round balance below.</p><div className="mt-3 grid grid-cols-2 gap-3"><div><label className="text-xs font-medium uppercase tracking-wide text-slate-600">Verified cases</label><input type="number" min="0" step="1" value={form.verifiedCases || ''} onChange={event => updateVerifiedPackedCounts({ verifiedCases: Number(event.target.value) || 0 })} className="mt-1 w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm" /></div><div><label className="text-xs font-medium uppercase tracking-wide text-slate-600">Verified loose packets</label><input type="number" min="0" step="1" value={form.verifiedLoose || ''} onChange={event => updateVerifiedPackedCounts({ verifiedLoose: Number(event.target.value) || 0 })} className="mt-1 w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm" /></div></div><div className="mt-3 rounded-md bg-white/80 px-3 py-2 text-sm text-slate-700"><span className="font-semibold">Verified total:</span> {form.quantity} packets ({getPaneerPackWeight(selectedFinishedDefinition, form.verifiedCases, form.verifiedLoose, 0, 0).toFixed(2)} kg) · {form.verifiedCases} cases + {form.verifiedLoose} loose packets</div></div> : <div className="grid grid-cols-2 gap-3"><div><label className="text-xs font-medium uppercase tracking-wide text-slate-600">{selectedCandidate?.sourceType === 'finished_stock' ? 'Verified quantity' : 'Quantity'}</label><input type="number" min="0" step={form.unit === 'kg' ? '0.01' : '1'} max={selectedCandidate && selectedCandidate.sourceType !== 'finished_stock' ? selectedCandidate.quantity : undefined} value={form.quantity || ''} onChange={event => setForm({ ...form, quantity: Number(event.target.value) || 0, quantityVerified: false })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />{selectedCandidate && <p className="mt-1 text-[11px] text-slate-500">Recorded: {formatQuantity(selectedCandidate.quantity, selectedCandidate.unit)}</p>}</div><div><label className="text-xs font-medium uppercase tracking-wide text-slate-600">Unit</label><select value={form.unit} disabled={Boolean(selectedCandidate)} onChange={event => setForm({ ...form, unit: event.target.value as CandidateUnit })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm disabled:bg-slate-50"><option value="kg">kg</option><option value="packets">packets</option><option value="bottles">bottles</option></select></div></div>}
          {selectedCandidate?.sourceType === 'finished_stock' && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3"><p className="text-xs font-semibold text-amber-900">Handover quantity check</p><div className="mt-1 space-y-1 text-xs text-amber-800"><p>Recorded on board: {formatQuantity(selectedCandidate.quantity, selectedCandidate.unit)}{selectedCandidate.cases !== undefined && ` · ${selectedCandidate.cases} cases + ${selectedCandidate.looseQuantity || 0} loose`}</p><p>Physical count: {formatQuantity(form.quantity, form.unit)}{selectedFinishedDefinition?.packMode === 'units' && ` · ${form.verifiedCases} cases + ${form.verifiedLoose} loose`}</p>{selectedFinishedExtraWeight > 0 && <p className="font-semibold">Extra to record against a production balance: {selectedFinishedExtraWeight.toFixed(2)} kg</p>}</div>{selectedFinishedExtraWeight > 0 && <div className="mt-3"><label className="text-xs font-medium uppercase tracking-wide text-slate-600">Source round for extra quantity</label><select value={form.extraSourceRoundId} onChange={event => setForm({ ...form, extraSourceRoundId: event.target.value })} className="mt-1 w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm"><option value="">Select a round with remaining balance</option>{extraSourceRounds.map(round => <option key={round.id} value={round.id}>{round.milkLotCode}/S{round.shiftNumber}/R{round.roundNumber} · {(round.remainingBalance ?? round.intermediateBalance ?? 0).toFixed(2)} kg balance</option>)}</select><p className="mt-1 text-[11px] text-amber-700">This adds the surplus packing entry to that round and reduces its remaining paneer balance.</p></div>}<label className="mt-3 flex items-start gap-2 text-xs text-amber-900"><input type="checkbox" checked={form.quantityVerified} onChange={event => setForm({ ...form, quantityVerified: event.target.checked })} className="mt-0.5 h-4 w-4 rounded border-amber-300 text-emerald-600" /><span>I physically verified the packed quantity and confirm it is ready for transfer.</span></label></div>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div><label className="text-xs font-medium uppercase tracking-wide text-slate-600">Receiving storage location</label><select value={form.destination} onChange={event => setForm({ ...form, destination: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"><option value="">Select receiving location</option>{distributionStorageLocations.map(location => <option key={location} value={location}>{location}</option>)}</select></div>
            <div><label className="text-xs font-medium uppercase tracking-wide text-slate-600">Handed over by</label><input value={form.handedOverBy} onChange={event => setForm({ ...form, handedOverBy: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Staff name" /></div>
          </div>
          <div><label className="text-xs font-medium uppercase tracking-wide text-slate-600">Notes (optional)</label><textarea value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} rows={2} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Condition, recipient, or delivery note" /></div>
          <div className="flex gap-2 pt-2"><button type="button" onClick={recordHandover} disabled={!canAssignManualBatchCode} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"><CheckCircle2 className="h-4 w-4" /> Confirm handover</button><button type="button" onClick={closeModal} className="rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-200">Cancel</button></div>
        </div>
      </Modal>
    </div>
  );
}
