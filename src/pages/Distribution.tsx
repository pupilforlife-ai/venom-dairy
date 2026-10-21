import { useMemo, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  GitBranch,
  Package,
  Plus,
  Snowflake,
  Truck,
} from 'lucide-react';
import { Modal } from '../components/Modal';
import { DistributionRecords, DistributionRecordGroups } from '../components/DistributionRecords';
import { useToast } from '../components/Toast';
import { useSupabaseState } from '../hooks/useSupabaseState';
import { hasDistributionPackingRecord } from '../lib/crumbingPacking';
import { CreamLot, DistributionHandover, DistributionHandoverSource, MilkLot, ProductionRound } from '../data/mockData';
import {
  FinishedGoodsBatchCodeMode,
  buildFinishedGoodsBatchCode,
  getAllowedPaneerSkus,
  getDefaultPaneerCaseWeightKg,
  getFinishedGoodsBatchCodeDefinition,
  getPaneerPackWeight,
  paneerSkuByCode,
} from '../data/skuConfig';
import { getProductionPackingEntries, reconcileFinishedStock, ReconciledFinishedStockLine } from '../lib/finishedStock';
import { getPaneerRoundRemainingBalance } from '../lib/paneerBalance';
import { getLatestRemainderReview, getMilkLotLabel, getMilkLotSortTime, getPreviouslyAccountedTransfer } from '../lib/distributionAccounting';
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
  caseWeightKg?: number;
  looseWeightKg?: number;
  storageLocation?: string;
  detail: string;
  sku?: string;
  stockLines?: ReconciledFinishedStockLine[];
  sourceBatchCodes?: string[];
  finishedGoodsBatchCode?: string;
  finishedGoodsBatchCodeMode?: FinishedGoodsBatchCodeMode;
  receiptDates?: string[];
  milkLotCodes?: string[];
  milkLotLabel: string;
  isProductionRemainder?: boolean;
  remainderReviewedAt?: string;
  remainderReviewedBy?: string;
}

interface DistributionCrumbingBatch {
  id: string;
  batchCode: string;
  type: 'SPP' | 'JP' | 'HCP';
  status: string;
  traysPacked: number;
  packedSkus?: Array<{ sku: string; cases: number; loose: number; sourceBatchCodes?: string[]; packingRunId?: string }>;
  combinedPackingAllocations?: Array<{ primaryBatchId: string }>;
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
  verifiedLooseWeightKg: number;
  quantityVerified: boolean;
  extraSourceRoundId: string;
  notes: string;
  partialTransferDisposition: '' | 'still_in_production' | 'incorrectly_recorded';
  partialDispositionReason: string;
  partialStorageLocation: string;
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
  verifiedLooseWeightKg: 0,
  quantityVerified: false,
  extraSourceRoundId: '',
  notes: '',
  partialTransferDisposition: '',
  partialDispositionReason: '',
  partialStorageLocation: '',
};

const roundProductNames: Record<string, string> = {
  Butter: 'Butter',
  Ghee: 'Ghee',
  Amassi: 'Amassi',
};

function formatQuantity(quantity: number, unit: CandidateUnit) {
  return `${quantity.toFixed(unit === 'kg' ? 2 : 0)} ${unit}`;
}

function getFinishedStockLineWeight(stock: ReconciledFinishedStockLine, sku: string) {
  const definition = paneerSkuByCode[sku];
  if (!definition) return stock.weightKg ?? stock.looseWeightKg ?? 0;
  return getPaneerPackWeight(
    definition,
    stock.cases || 0,
    stock.loosePackets || 0,
    stock.looseWeightKg || 0,
    stock.weightKg || 0,
    stock.caseWeightKg,
  );
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

function getMilkLotCodesForSources(sourceBatchCodes: string[] | undefined, productionRounds: ProductionRound[]) {
  const codes = new Set<string>();
  (sourceBatchCodes || []).forEach(sourceCode => {
    productionRounds.forEach(round => {
      if (roundMatchesBatchCode(round, sourceCode) && round.milkLotCode) codes.add(round.milkLotCode);
    });
  });
  return [...codes].sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
}

function getCreamReceiptDate(round: ProductionRound, milkLots: MilkLot[], creamLots: CreamLot[]) {
  const fallbackMilkLot = milkLots.find(lot => lot.id === round.milkLotId || lot.lotCode === round.milkLotCode);
  const creamLotId = round.sourceCreamLotId || round.creamLotId;
  if (!creamLotId) return fallbackMilkLot?.receiptDate;
  const externalCream = creamLots.find(lot => lot.id === creamLotId);
  if (externalCream) return externalCream.dateReceived || externalCream.receivedAt?.slice(0, 10);
  const milkLot = milkLots.find(lot => lot.id === creamLotId || lot.lotCode === round.milkLotCode) || fallbackMilkLot;
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
    recordProductionRoundActivity,
  } = useApp();
  const { showToast } = useToast();
  const [handovers, setHandovers] = useSupabaseState<DistributionHandover[]>('vejoy_distributionHandovers', []);
  const [crumbingBatches, setCrumbingBatches] = useSupabaseState<DistributionCrumbingBatch[]>('vejoy_crumbingBatches', []);
  const [showHandoverModal, setShowHandoverModal] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<DistributionCandidate | null>(null);
  const [reviewOnly, setReviewOnly] = useState(false);
  const [form, setForm] = useState<HandoverForm>(emptyForm);
  const currentRole = typeof window === 'undefined' ? '' : window.localStorage.getItem('vejoy_user_role')?.toLowerCase() || '';
  const currentUsername = typeof window === 'undefined' ? '' : window.localStorage.getItem('vejoy_user_username') || '';
  const canAssignManualBatchCode = currentRole === 'admin' || currentRole === 'owner';
  const reconciledFinishedStock = useMemo(
    () => reconcileFinishedStock(productionRounds, finishedStock),
    [finishedStock, productionRounds],
  );

  const candidates = useMemo<DistributionCandidate[]>(() => {
    const finishedBySku = new Map<string, ReconciledFinishedStockLine[]>();
    reconciledFinishedStock
      .filter(stock => stock.status === 'awaiting_handover')
      .forEach(stock => {
        const definition = paneerSkuByCode[stock.sku];
        const caseWeight = definition?.packMode === 'weight_loose'
          ? stock.caseWeightKg ?? getDefaultPaneerCaseWeightKg(definition)
          : undefined;
        const milkLotCodes = getMilkLotCodesForSources(stock.sourceBatchCodes, productionRounds);
        const milkLotKey = milkLotCodes.length ? milkLotCodes.join('+') : 'unlinked';
        const groupKey = `${stock.sku}::${caseWeight === undefined ? 'standard' : caseWeight.toFixed(2)}::${milkLotKey}::${stock.storageLocation}::${stock.finishedGoodsBatchCode || ''}::${stock.productionRemainderReviewId || ''}`;
        const existing = finishedBySku.get(groupKey) || [];
        existing.push(stock);
        finishedBySku.set(groupKey, existing);
      });

    const finishedCandidates: DistributionCandidate[] = [...finishedBySku.entries()].map(([groupKey, stocks]) => {
      const sku = stocks[0].sku;
      const first = stocks[0];
      const sourceBatchCodes = [...new Set(stocks.flatMap(stock => stock.sourceBatchCodes || []).filter(Boolean))];
      const milkLotCodes = getMilkLotCodesForSources(sourceBatchCodes, productionRounds);
      const definition = getFinishedGoodsBatchCodeDefinition(sku);
      const paneerDefinition = paneerSkuByCode[sku];
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
      const isWeightStock = paneerDefinition
        ? paneerDefinition.packMode !== 'units'
        : stocks.some(stock => stock.weightKg !== undefined || stock.looseWeightKg !== undefined);
      const quantity = isWeightStock
        ? stocks.reduce((sum, stock) => sum + getFinishedStockLineWeight(stock, sku), 0)
        : stocks.reduce((sum, stock) => sum + (stock.totalPackets || 0), 0);
      const cases = stocks.reduce((sum, stock) => sum + (stock.cases || 0), 0);
      const loose = stocks.reduce((sum, stock) => sum + (stock.loosePackets || 0), 0);
      const caseWeightKg = paneerDefinition?.packMode === 'weight_loose'
        ? stocks[0].caseWeightKg ?? getDefaultPaneerCaseWeightKg(paneerDefinition)
        : undefined;
      const looseWeightKg = stocks.reduce((sum, stock) => sum + (stock.looseWeightKg || 0), 0);
      return {
        id: `finished-sku:${groupKey}`,
        sourceType: 'finished_stock',
        sourceId: first.id,
        stockLines: stocks,
        sourceBatchCodes,
        milkLotCodes,
        milkLotLabel: getMilkLotLabel(milkLotCodes),
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
        caseWeightKg,
        looseWeightKg,
        storageLocation: locations.length === 1 ? locations[0] : `${locations.length} locations`,
        detail: isWeightStock
          ? `${cases} cases${caseWeightKg !== undefined ? ` × ${caseWeightKg.toFixed(2)} kg` : ''}${looseWeightKg > 0 ? ` + ${looseWeightKg.toFixed(2)} kg loose` : ''} · ${quantity.toFixed(2)} kg · ${stocks.length} packed batches`
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
          milkLotCodes: [lot.lotCode],
          milkLotLabel: `Milk lot ${lot.lotCode}`,
        };
      });

    const crumbingCandidates: DistributionCandidate[] = crumbingBatches
      .filter(batch => {
        if (batch.status !== 'packed' || batch.traysPacked <= 0) return false;
        return hasDistributionPackingRecord(batch);
      })
      .map(batch => {
        const cases = (batch.packedSkus || []).reduce((sum, packed) => sum + packed.cases, 0);
        const loose = (batch.packedSkus || []).reduce((sum, packed) => sum + packed.loose, 0);
        const packedSkus = [...new Set((batch.packedSkus || []).map(packed => packed.sku).filter(Boolean))];
        const sku = packedSkus.length === 1 ? packedSkus[0] : undefined;
        const sourceBatchCodes = [...new Set((batch.packedSkus || []).flatMap(packed => packed.sourceBatchCodes || [batch.batchCode]))];
        const baseQuantity = cases * 12 + loose || batch.traysPacked;
        const sourceLotCodes = batch.type === 'JP' ? [] : getMilkLotCodesForSources(sourceBatchCodes, productionRounds);
        const quantity = Math.max(0, baseQuantity - getPreviouslyAccountedTransfer(handovers, 'crumbing_batch', batch.id));
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
          detail: `${batch.type} finished batch · ${cases} cases · ${loose} loose${sourceBatchCodes.length > 1 ? ` · packed from ${sourceBatchCodes.length} batches` : ''}`,
          sku,
          sourceBatchCodes,
          milkLotCodes: sourceLotCodes,
          milkLotLabel: getMilkLotLabel(sourceLotCodes, batch.type === 'JP' ? 'Standalone JP (no milk lot)' : 'No milk lot linked'),
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
        // Paneer packing creates a FinishedStock row linked by packingRunId.
        // Do not expose the same packed quantity again as a production-round
        // candidate; that would make one physical stock line transferable
        // twice. Keep the round fallback only for legacy rows with no linked
        // FinishedStock record.
        if (getProductionPackingEntries([round]).length > 0) return false;
        if (round.type === 'Amassi') return Boolean(round.amassiPacked?.length);
        return round.outputWeight > 0;
      })
      .map(round => {
        const batchCode = round.batchCode || `${round.milkLotCode}/S${round.shiftNumber}/R${round.roundNumber}/${round.type}`;
        if (round.type === 'Amassi') {
          const bottles = (round.amassiPacked || []).reduce((sum, packed) => sum + packed.bottles, 0);
          const skuSummary = (round.amassiPacked || []).map(packed => `${packed.sku}: ${packed.bottles}`).join(' · ');
          const baseQuantity = bottles;
          const quantity = Math.max(0, baseQuantity - getPreviouslyAccountedTransfer(handovers, 'production_round', round.id));
          return {
            id: `round:${round.id}`,
            sourceType: 'production_round',
            sourceId: round.id,
            productName: `${roundProductNames[round.type]} ${round.amassiType || ''}`.trim(),
            batchCode,
            quantity,
            unit: 'bottles',
            storageLocation: 'Coldroom',
            detail: skuSummary || 'Bottled Amassi output',
            finishedGoodsBatchCodeMode: 'manual',
            milkLotCodes: round.milkLotCode ? [round.milkLotCode] : [],
            milkLotLabel: round.milkLotCode ? `Milk lot ${round.milkLotCode}` : 'No milk lot linked',
          };
        }
        const productSku = round.packedSkus?.length === 1 ? round.packedSkus[0].sku : undefined;
        const packedPaneerWeight = (round.type === 'D' || round.type === 'C/S')
          ? (round.packedSkus || []).reduce((sum, pack) => {
              const definition = paneerSkuByCode[pack.sku];
              return definition
                ? sum + getPaneerPackWeight(definition, pack.cases || 0, pack.loose || 0, pack.looseWeightKg || 0, pack.weightKg || 0, pack.caseWeightKg)
                : sum;
            }, 0)
          : 0;
        const receiptDate = getReceiptDateForRound(round, productSku, milkLots, creamLots);
        const generatedFinishedCode = productSku ? buildFinishedGoodsBatchCode(productSku, receiptDate) : undefined;
        const quantity = Math.max(0, (packedPaneerWeight > 0 ? packedPaneerWeight : round.outputWeight) - getPreviouslyAccountedTransfer(handovers, 'production_round', round.id));
        const externalCreamSource = round.sourceCreamLotId
          ? creamLots.find(cream => cream.id === round.sourceCreamLotId)
          : undefined;
        return {
          id: `round:${round.id}`,
          sourceType: 'production_round',
          sourceId: round.id,
          productName: roundProductNames[round.type],
          batchCode,
          quantity,
          unit: 'kg',
          storageLocation: round.type === 'Ghee' ? 'Coldroom' : 'Chiller',
          detail: externalCreamSource
            ? `${round.type} production round · External cream ${externalCreamSource.lotCode} (${externalCreamSource.supplier})`
            : `${round.type} production round · Milk lot ${round.milkLotCode}`,
          sku: productSku,
          finishedGoodsBatchCode: generatedFinishedCode,
          finishedGoodsBatchCodeMode: getFinishedGoodsBatchCodeDefinition(productSku || '')?.mode || 'manual',
          receiptDates: receiptDate ? [receiptDate] : [],
          milkLotCodes: round.milkLotCode ? [round.milkLotCode] : [],
          milkLotLabel: round.milkLotCode ? `Milk lot ${round.milkLotCode}` : externalCreamSource ? `External cream · ${externalCreamSource.lotCode}` : 'No milk lot linked',
        };
      });

    return [...finishedCandidates, ...halloumiCandidates, ...crumbingCandidates, ...productionCandidates]
      .filter(candidate => candidate.quantity > (candidate.unit === 'kg' ? 0.005 : 0))
      .map(candidate => {
        const stockReviewId = candidate.stockLines?.find(stock => stock.productionRemainderReviewId)?.productionRemainderReviewId;
        const review = handovers.find(record => record.id === stockReviewId) || getLatestRemainderReview(handovers, candidate.sourceType, candidate.sourceId, {
          stockIds: candidate.stockLines?.map(stock => stock.id),
          sourceBatchCodes: candidate.sourceBatchCodes,
          productName: candidate.productName,
        });
        const isProductionRemainder = Boolean(stockReviewId || review?.partialTransferDisposition === 'still_in_production');
        return {
          ...candidate,
          isProductionRemainder,
          remainderReviewedAt: isProductionRemainder ? review?.handedOverAt : undefined,
          remainderReviewedBy: isProductionRemainder ? review?.partialReviewedBy || review?.handedOverBy : undefined,
          storageLocation: isProductionRemainder && candidate.sourceType !== 'finished_stock'
            ? review?.partialStorageLocation || 'Location not recorded'
            : isProductionRemainder && !review?.partialStorageLocation && !stockReviewId
              ? 'Location not recorded'
              : candidate.storageLocation,
          finishedGoodsBatchCode: candidate.finishedGoodsBatchCode || (isProductionRemainder ? review?.finishedGoodsBatchCode : undefined),
        };
      });
  }, [creamLots, crumbingBatches, handovers, milkLots, productionRounds, reconciledFinishedStock]);

  const groupCandidates = (rows: DistributionCandidate[]) => {
    const groups = new Map<string, DistributionCandidate[]>();
    rows.forEach(candidate => groups.set(candidate.milkLotLabel, [...(groups.get(candidate.milkLotLabel) || []), candidate]));
    return [...groups.entries()].sort(([left, a], [right, b]) =>
      (getMilkLotSortTime(b[0].milkLotCodes, milkLots) - getMilkLotSortTime(a[0].milkLotCodes, milkLots)) || left.localeCompare(right));
  };
  const readyCandidates = candidates.filter(candidate => !candidate.isProductionRemainder);
  const candidateGroups = groupCandidates(readyCandidates);
  const productionRemainderGroups = groupCandidates(candidates.filter(candidate => candidate.isProductionRemainder));

  const groupRecords = (rows: DistributionHandover[]): DistributionRecordGroups => {
    const groups = new Map<string, DistributionHandover[]>();
    rows.forEach(record => {
      const sourceCodes = record.milkLotCodes?.length
        ? record.milkLotCodes
        : getMilkLotCodesForSources([record.batchCode, ...(record.notes?.match(/Packed source batches: ([^·]+)/)?.[1].split(',').map(code => code.trim()) || [])], productionRounds);
      const fallbackLabel = record.sourceType === 'manual'
        ? 'Manual transfer · no milk lot linked'
        : record.sourceType === 'crumbing_batch' && record.productName.toLowerCase().includes('jalapeno')
          ? 'Standalone JP (no milk lot)'
          : 'Older transfer · milk lot not linked';
      const label = record.milkLotGroupLabel || getMilkLotLabel(sourceCodes, fallbackLabel);
      groups.set(label, [...(groups.get(label) || []), { ...record, milkLotCodes: sourceCodes }]);
    });
    return [...groups.entries()].sort(([left, a], [right, b]) =>
      (getMilkLotSortTime(b[0].milkLotCodes, milkLots) - getMilkLotSortTime(a[0].milkLotCodes, milkLots)) || left.localeCompare(right));
  };
  const actualHandovers = handovers.filter(record => record.recordKind !== 'balance_review' && record.quantity > 0);
  const handoverGroups = groupRecords(actualHandovers);
  const discrepancyGroups = groupRecords(handovers.filter(record => record.partialTransferDisposition === 'incorrectly_recorded' && (record.partialRemainderQuantity || 0) > 0));

  const extraSourceRounds = useMemo(() => {
    if (selectedCandidate?.sourceType !== 'finished_stock' || !selectedCandidate.sku) return [];
    return productionRounds
      .filter(round => {
        if (round.type !== 'D' && round.type !== 'C/S') return false;
        if (['scheduled', 'cancelled', 'spoiled', 'handed_over'].includes(round.status)) return false;
        const balance = getPaneerRoundRemainingBalance(round) ?? 0;
        if (balance <= 0) return false;
        return getAllowedPaneerSkus(round.type, round.cuttingType).some(definition => definition.sku === selectedCandidate.sku);
      })
      .sort((a, b) => b.shiftNumber - a.shiftNumber || b.roundNumber - a.roundNumber);
  }, [productionRounds, selectedCandidate]);

  const pendingKg = candidates.filter(candidate => candidate.unit === 'kg').reduce((sum, candidate) => sum + candidate.quantity, 0);
  const pendingPackets = candidates.filter(candidate => candidate.unit === 'packets').reduce((sum, candidate) => sum + candidate.quantity, 0);

  const openCandidate = (candidate: DistributionCandidate, balanceReview = false) => {
    setReviewOnly(balanceReview);
    setSelectedCandidate(candidate);
    setForm({
      productName: candidate.productName,
      batchCode: candidate.batchCode,
      finishedGoodsBatchCode: candidate.finishedGoodsBatchCode || '',
      quantity: balanceReview ? 0 : candidate.quantity,
      unit: candidate.unit,
  destination: distributionStorageLocations[0],
      handedOverBy: balanceReview ? currentUsername || currentRole : '',
      verifiedCases: balanceReview ? 0 : candidate.cases || 0,
      verifiedLoose: balanceReview ? 0 : candidate.looseQuantity || 0,
      verifiedLooseWeightKg: balanceReview ? 0 : candidate.looseWeightKg || 0,
      quantityVerified: false,
      extraSourceRoundId: '',
      notes: '',
      partialTransferDisposition: '',
      partialDispositionReason: '',
      partialStorageLocation: ['Chiller', finishedStockOrigin].includes(candidate.storageLocation || '') ? candidate.storageLocation! : '',
    });
    setShowHandoverModal(true);
  };

  const openManualHandover = () => {
    setReviewOnly(false);
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
  const selectedFinishedShortfall = selectedCandidate?.sourceType === 'finished_stock'
    ? Math.max(0, selectedCandidate.quantity - form.quantity)
    : 0;
  const partialTransferRemainder = selectedCandidate
    ? Math.max(0, selectedCandidate.quantity - form.quantity)
    : 0;

  const updateVerifiedPackedCounts = (changes: Partial<Pick<HandoverForm, 'verifiedCases' | 'verifiedLoose' | 'verifiedLooseWeightKg'>>) => {
    setForm(current => {
      const next = { ...current, ...changes };
      next.verifiedCases = Math.max(0, Math.floor(next.verifiedCases));
      next.verifiedLoose = Math.max(0, Math.floor(next.verifiedLoose));
      next.verifiedLooseWeightKg = Math.max(0, next.verifiedLooseWeightKg);
      next.quantityVerified = false;
      if (selectedFinishedDefinition?.packMode === 'units') {
        next.quantity = Math.max(0, next.verifiedCases) * (selectedFinishedDefinition.unitsPerCase || 0) + Math.max(0, next.verifiedLoose);
      } else if (selectedFinishedDefinition?.packMode === 'weight_loose') {
        const caseWeight = selectedCandidate?.caseWeightKg ?? getDefaultPaneerCaseWeightKg(selectedFinishedDefinition);
        next.quantity = Math.max(0, next.verifiedCases) * caseWeight + next.verifiedLooseWeightKg;
      }
      return next;
    });
  };

  const closeModal = () => {
    setReviewOnly(false);
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
    const now = new Date().toISOString();
    const recordId = `dist-${crypto.randomUUID()}`;
    if (!productName || !batchCode || !handedOverBy || (!reviewOnly && (!form.destination || !Number.isFinite(form.quantity) || form.quantity <= 0))) {
      showToast('error', 'Enter the product, batch, quantity, receiving location, and person handing it over');
      return;
    }
    if (!reviewOnly && !finishedGoodsBatchCode) {
      showToast('error', canAssignManualBatchCode
        ? 'Enter the finished-goods batch code before recording the handover'
        : 'An owner or admin must assign the finished-goods batch code before this handover');
      return;
    }
    if (!canAssignManualBatchCode) {
      showToast('error', 'Owner/admin review is required before a finished-goods batch can be handed over');
      return;
    }
    if (!reviewOnly && selectedBatchDefinition?.prefix && !finishedGoodsBatchCode.startsWith(`${selectedBatchDefinition.prefix}_`)) {
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
    if (selectedCandidate && partialTransferRemainder > (selectedCandidate.unit === 'kg' ? 0.01 : 0) && !form.partialTransferDisposition) {
      showToast('error', 'Choose whether the untransferred balance remains in production or was incorrectly recorded');
      return;
    }
    if (selectedCandidate && partialTransferRemainder > (selectedCandidate.unit === 'kg' ? 0.01 : 0)
      && form.partialTransferDisposition === 'incorrectly_recorded' && !form.partialDispositionReason.trim()) {
      showToast('error', 'Add a reason before marking the untransferred balance incorrectly recorded');
      return;
    }
    if (partialTransferRemainder > 0 && form.partialTransferDisposition === 'still_in_production'
      && ![finishedStockOrigin, 'Chiller'].includes(form.partialStorageLocation)) {
      showToast('error', 'Choose Dairy Container or Chiller for the quantity still in production');
      return;
    }
    if (isFinishedStockCandidate) {
      if (!reviewOnly && !form.quantityVerified) {
        showToast('error', 'Confirm that the packed SKU quantity was physically verified before handover');
        return;
      }
      if (!reviewOnly && Math.abs(form.quantity - selectedCandidate.quantity) > 0.01 && !selectedFinishedDefinition) {
        showToast('error', 'This SKU is not configured for a verified quantity adjustment');
        return;
      }
      if (selectedFinishedExtraWeight > 0) {
        const extraRound = productionRounds.find(round => round.id === form.extraSourceRoundId);
        if (!extraRound || !extraSourceRounds.some(round => round.id === form.extraSourceRoundId) || !selectedFinishedDefinition) {
          showToast('error', 'Select the production round whose balance paneer covers the extra quantity');
          return;
        }
        const currentBalance = getPaneerRoundRemainingBalance(extraRound) ?? 0;
        if (selectedFinishedExtraWeight > currentBalance + 0.01) {
          showToast('error', `The extra quantity exceeds ${extraRound.milkLotCode}/S${extraRound.shiftNumber}/R${extraRound.roundNumber}'s balance of ${currentBalance.toFixed(2)} kg`);
          return;
        }
        const sourceBatchCode = extraRound.batchCode || extraRound.sourceBatchCode || `${extraRound.milkLotCode}/S${extraRound.shiftNumber}/R${extraRound.roundNumber}/${extraRound.type}`;
        const packingRunId = `pb-${extraRound.id}-distribution-${Date.now()}`;
        const packingRecordedAt = new Date().toISOString();
        const extraEntry = {
          sku: selectedCandidate.sku!,
          cases: selectedFinishedDefinition.packMode === 'units' || selectedFinishedDefinition.packMode === 'weight_loose' ? selectedFinishedExtraCases : 0,
          loose: selectedFinishedDefinition.packMode === 'units' ? selectedFinishedExtraLoose : 0,
          ...(selectedFinishedDefinition.packMode === 'weight_loose' ? { caseWeightKg: selectedCandidate.caseWeightKg, looseWeightKg: Math.max(0, form.verifiedLooseWeightKg - (selectedCandidate.looseWeightKg || 0)) } : {}),
          packingRunId,
          recordedBy: currentUsername || currentRole || 'User',
          recordedAt: packingRecordedAt,
          reason: 'Physical distribution count adjustment',
          ...(selectedFinishedDefinition.packMode === 'weight_only'
            ? { weightKg: selectedFinishedExtraWeight }
            : selectedFinishedDefinition.packMode === 'weight_loose'
              ? { caseWeightKg: selectedCandidate.caseWeightKg, looseWeightKg: Math.max(0, form.verifiedLooseWeightKg - (selectedCandidate.looseWeightKg || 0)) }
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
          createdAt: packingRecordedAt,
          sourceBatchCodes: [sourceBatchCode],
          finishedGoodsBatchCode,
          finishedGoodsBatchCodeReviewedBy: reviewedBy,
          finishedGoodsBatchCodeReviewedAt: reviewedAt,
          finishedGoodsBatchCodeReviewMethod: reviewMethod,
          ...(selectedFinishedDefinition.packMode === 'weight_only'
            ? { weightKg: selectedFinishedExtraWeight }
            : selectedFinishedDefinition.packMode === 'weight_loose'
              ? { caseWeightKg: selectedCandidate.caseWeightKg, looseWeightKg: Math.max(0, form.verifiedLooseWeightKg - (selectedCandidate.looseWeightKg || 0)) }
              : {}),
        });
        const newBalance = currentBalance - selectedFinishedExtraWeight;
        recordProductionRoundActivity(extraRound.id, {
          status: newBalance <= 0 ? 'packed' : extraRound.status,
          packedSkus: [...(extraRound.packedSkus || []), extraEntry],
          remainingBalance: newBalance,
          intermediateBalance: newBalance,
        }, {
          type: 'packing_recorded',
          stage: 'Physical Count Packing Adjustment',
          occurredAt: packingRecordedAt,
          details: `${extraEntry.sku} · ${extraEntry.cases} cases + ${extraEntry.loose} loose · Balance ${newBalance.toFixed(2)} kg`,
          recordedBy: currentUsername || currentRole || 'User',
          source: 'correction',
        });
      }
    }

    if (selectedCandidate?.sourceType === 'finished_stock') {
      const stockLines = [...(selectedCandidate.stockLines || [])]
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
      const splitToken = Date.now();
      let casesLeftToTransfer = Math.min(form.verifiedCases, selectedCandidate.cases || 0);
      let looseLeftToTransfer = Math.min(form.verifiedLoose, selectedCandidate.looseQuantity || 0);
      let looseWeightLeftToTransfer = Math.min(form.verifiedLooseWeightKg, selectedCandidate.looseWeightKg || 0);
      let weightLeftToTransfer = Math.min(form.quantity, selectedCandidate.quantity);

      const persistNewLine = (
        stock: ReconciledFinishedStockLine,
        packingRunId: string,
        quantities: {
          cases: number;
          loosePackets: number;
          totalPackets: number;
          weightKg?: number;
          looseWeightKg?: number;
          caseWeightKg?: number;
        },
        status: 'awaiting_handover' | 'handed_over' | 'incorrectly_recorded',
      ) => {
        addFinishedStock({
          sku: stock.sku,
          productName: stock.productName,
          packingRunId,
          ...quantities,
          storageLocation: status === 'handed_over' ? form.destination : status === 'awaiting_handover' ? form.partialStorageLocation : stock.storageLocation,
          status,
          createdAt: stock.createdAt,
          sourceBatchCodes: stock.sourceBatchCodes,
          ...(status === 'awaiting_handover' ? { productionRemainderReviewId: recordId, finishedGoodsBatchCode: finishedGoodsBatchCode || stock.finishedGoodsBatchCode } : {}),
          ...(status === 'incorrectly_recorded' ? {
            incorrectlyRecordedAt: new Date().toISOString(),
            incorrectlyRecordedBy: currentUsername || currentRole || 'User',
            incorrectlyRecordedReason: form.partialDispositionReason.trim(),
          } : {}),
          ...(status === 'handed_over' ? {
            finishedGoodsBatchCode,
            finishedGoodsBatchCodeReviewedBy: reviewedBy,
            finishedGoodsBatchCodeReviewedAt: reviewedAt,
            finishedGoodsBatchCodeReviewMethod: reviewMethod,
          } : {}),
        });
      };

      const remainingStockStatus = form.partialTransferDisposition === 'incorrectly_recorded'
        ? 'incorrectly_recorded'
        : 'awaiting_handover';
      const correctionMetadata = remainingStockStatus === 'incorrectly_recorded'
        ? {
            incorrectlyRecordedAt: new Date().toISOString(),
            incorrectlyRecordedBy: currentUsername || currentRole || 'User',
            incorrectlyRecordedReason: form.partialDispositionReason.trim(),
          }
        : { productionRemainderReviewId: recordId, finishedGoodsBatchCode: finishedGoodsBatchCode || selectedCandidate.finishedGoodsBatchCode };
      const remainderLocation = remainingStockStatus === 'awaiting_handover' ? form.partialStorageLocation : undefined;
      const classifyUntouchedLine = (stock: ReconciledFinishedStockLine) => {
        const quantities = {
          cases: stock.cases || 0,
          loosePackets: stock.loosePackets || 0,
          totalPackets: stock.totalPackets || 0,
          ...(stock.weightKg !== undefined ? { weightKg: stock.weightKg } : {}),
          ...(stock.looseWeightKg !== undefined ? { looseWeightKg: stock.looseWeightKg } : {}),
          ...(stock.caseWeightKg !== undefined ? { caseWeightKg: stock.caseWeightKg } : {}),
        };
        if (stock.persisted) updateFinishedStock(stock.id, { ...quantities, status: remainingStockStatus, storageLocation: remainderLocation || stock.storageLocation, ...correctionMetadata });
        else persistNewLine(stock, stock.packingRunId, quantities, remainingStockStatus);
      };

      stockLines.forEach((stock, index) => {
        const reviewedStock = {
          status: 'handed_over',
          storageLocation: form.destination,
          finishedGoodsBatchCode,
          finishedGoodsBatchCodeReviewedBy: reviewedBy,
          finishedGoodsBatchCodeReviewedAt: reviewedAt,
          finishedGoodsBatchCodeReviewMethod: reviewMethod,
        } as const;

        if (selectedFinishedDefinition?.packMode === 'weight_loose') {
          const caseWeightKg = stock.caseWeightKg ?? selectedCandidate.caseWeightKg ?? getDefaultPaneerCaseWeightKg(selectedFinishedDefinition);
          const transferredCases = Math.min(stock.cases || 0, casesLeftToTransfer);
          const transferredLooseWeightKg = Math.min(stock.looseWeightKg || 0, looseWeightLeftToTransfer);
          casesLeftToTransfer -= transferredCases;
          looseWeightLeftToTransfer -= transferredLooseWeightKg;
          if (transferredCases <= 0 && transferredLooseWeightKg <= 0.005) { classifyUntouchedLine(stock); return; }

          const remainingCases = Math.max(0, (stock.cases || 0) - transferredCases);
          const remainingLooseWeightKg = Math.max(0, (stock.looseWeightKg || 0) - transferredLooseWeightKg);
          const transferredQuantities = {
            cases: transferredCases,
            loosePackets: 0,
            totalPackets: 0,
            caseWeightKg,
            looseWeightKg: Math.round((transferredLooseWeightKg + Number.EPSILON) * 100) / 100,
          };
          const remainingQuantities = {
            cases: remainingCases,
            loosePackets: 0,
            totalPackets: 0,
            caseWeightKg,
            looseWeightKg: Math.round((remainingLooseWeightKg + Number.EPSILON) * 100) / 100,
          };
          const hasRemaining = remainingCases > 0 || remainingLooseWeightKg > 0.005;
          if (!hasRemaining) {
            if (stock.persisted) updateFinishedStock(stock.id, { ...transferredQuantities, ...reviewedStock });
            else persistNewLine(stock, stock.packingRunId, transferredQuantities, 'handed_over');
            return;
          }
          if (stock.persisted) {
            updateFinishedStock(stock.id, { ...remainingQuantities, status: remainingStockStatus, storageLocation: remainderLocation || stock.storageLocation, ...correctionMetadata });
          } else {
            persistNewLine(stock, stock.packingRunId, remainingQuantities, remainingStockStatus);
          }
          persistNewLine(stock, `${stock.packingRunId}-handover-${splitToken}-${index}`, transferredQuantities, 'handed_over');
          return;
        }

        if (selectedFinishedDefinition?.packMode === 'units') {
          const transferredCases = Math.min(stock.cases || 0, casesLeftToTransfer);
          const transferredLoose = Math.min(stock.loosePackets || 0, looseLeftToTransfer);
          casesLeftToTransfer -= transferredCases;
          looseLeftToTransfer -= transferredLoose;
          if (transferredCases <= 0 && transferredLoose <= 0) { classifyUntouchedLine(stock); return; }

          const remainingCases = (stock.cases || 0) - transferredCases;
          const remainingLoose = (stock.loosePackets || 0) - transferredLoose;
          const transferredQuantities = {
            cases: transferredCases,
            loosePackets: transferredLoose,
            totalPackets: transferredCases * (selectedFinishedDefinition.unitsPerCase || 0) + transferredLoose,
          };
          const remainingQuantities = {
            cases: remainingCases,
            loosePackets: remainingLoose,
            totalPackets: remainingCases * (selectedFinishedDefinition.unitsPerCase || 0) + remainingLoose,
          };
          const hasRemaining = remainingCases > 0 || remainingLoose > 0;

          if (!hasRemaining) {
            if (stock.persisted) updateFinishedStock(stock.id, { ...transferredQuantities, ...reviewedStock });
            else persistNewLine(stock, stock.packingRunId, transferredQuantities, 'handed_over');
            return;
          }

          if (stock.persisted) {
            updateFinishedStock(stock.id, {
              ...remainingQuantities,
              status: remainingStockStatus,
              storageLocation: remainderLocation || stock.storageLocation,
              ...correctionMetadata,
            });
          } else {
            persistNewLine(stock, stock.packingRunId, remainingQuantities, remainingStockStatus);
          }
          persistNewLine(
            stock,
            `${stock.packingRunId}-handover-${splitToken}-${index}`,
            transferredQuantities,
            'handed_over',
          );
          return;
        }

        const lineWeight = getFinishedStockLineWeight(stock, stock.sku);
        const transferredWeight = Math.min(lineWeight, weightLeftToTransfer);
        weightLeftToTransfer -= transferredWeight;
        if (transferredWeight <= 0.005) { classifyUntouchedLine(stock); return; }
        const remainingWeight = Math.max(0, lineWeight - transferredWeight);
        const weightField = selectedFinishedDefinition?.packMode === 'weight_only' || stock.weightKg !== undefined
          ? 'weightKg'
          : 'looseWeightKg';
        const transferredQuantities = {
          cases: 0,
          loosePackets: 0,
          totalPackets: 0,
          [weightField]: Math.round((transferredWeight + Number.EPSILON) * 100) / 100,
        };
        const remainingQuantities = {
          cases: 0,
          loosePackets: 0,
          totalPackets: 0,
          [weightField]: Math.round((remainingWeight + Number.EPSILON) * 100) / 100,
        };

        if (remainingWeight <= 0.005) {
          if (stock.persisted) updateFinishedStock(stock.id, { ...transferredQuantities, ...reviewedStock });
          else persistNewLine(stock, stock.packingRunId, transferredQuantities, 'handed_over');
          return;
        }

        if (stock.persisted) {
          updateFinishedStock(stock.id, {
            ...remainingQuantities,
            status: remainingStockStatus,
            storageLocation: remainderLocation || stock.storageLocation,
            ...correctionMetadata,
          });
        } else {
          persistNewLine(stock, stock.packingRunId, remainingQuantities, remainingStockStatus);
        }
        persistNewLine(
          stock,
          `${stock.packingRunId}-handover-${splitToken}-${index}`,
          transferredQuantities,
          'handed_over',
        );
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
          availableForCrumbing: Math.max(0, available - form.quantity - (
            form.partialTransferDisposition === 'incorrectly_recorded' ? partialTransferRemainder : 0
          )),
        },
      });
    }

    if (selectedCandidate?.sourceType === 'production_round') {
      if (partialTransferRemainder <= (selectedCandidate.unit === 'kg' ? 0.01 : 0)) {
        const occurredAt = new Date().toISOString();
        recordProductionRoundActivity(selectedCandidate.sourceId, {
          status: 'handed_over',
          locked: true,
          completedAt: occurredAt,
        }, {
          type: 'handed_over',
          stage: 'Handed Over',
          occurredAt,
          details: `${form.quantity} ${form.unit} · ${form.destination}`,
          recordedBy: form.handedOverBy || currentUsername || currentRole || 'User',
          source: 'workflow',
        });
      }
    }

    if (selectedCandidate?.sourceType === 'crumbing_batch') {
      if (partialTransferRemainder <= (selectedCandidate.unit === 'kg' ? 0.01 : 0)) {
        setCrumbingBatches(current => current.map(batch => batch.id === selectedCandidate.sourceId
          ? { ...batch, status: 'handed_over' }
          : batch
        ));
      }
    }

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
    const quantityVariance = isFinishedStockCandidate && selectedCandidate
      ? form.quantity - selectedCandidate.quantity
      : undefined;
    const partialDispositionNote = partialTransferRemainder > (selectedCandidate?.unit === 'kg' ? 0.01 : 0)
      ? form.partialTransferDisposition === 'incorrectly_recorded'
        ? `${formatQuantity(partialTransferRemainder, form.unit)} remaining quantity marked incorrectly recorded: ${form.partialDispositionReason.trim()}`
        : `${formatQuantity(partialTransferRemainder, form.unit)} remains in ${form.partialStorageLocation} for a later transfer`
      : '';
    const record: DistributionHandover = {
      id: recordId,
      recordKind: reviewOnly ? 'balance_review' : 'handover',
      sku: selectedCandidate?.sku,
      sourceBatchCodes: selectedCandidate?.sourceBatchCodes,
      sourceType: selectedCandidate?.sourceType || 'manual',
      sourceId: selectedCandidate?.sourceId,
      milkLotCodes: selectedCandidate?.milkLotCodes,
      milkLotGroupLabel: selectedCandidate?.milkLotLabel || (selectedCandidate ? undefined : 'Manual transfer · no milk lot linked'),
      partialTransferDisposition: partialTransferRemainder > (selectedCandidate?.unit === 'kg' ? 0.01 : 0)
        ? form.partialTransferDisposition || undefined
        : undefined,
      partialRemainderQuantity: partialTransferRemainder > (selectedCandidate?.unit === 'kg' ? 0.01 : 0)
        ? partialTransferRemainder
        : undefined,
      partialDispositionReason: form.partialDispositionReason.trim() || undefined,
      partialReviewedBy: partialTransferRemainder > 0 ? currentUsername || currentRole : undefined,
      partialStorageLocation: form.partialTransferDisposition === 'still_in_production' && partialTransferRemainder > 0
        ? form.partialStorageLocation as DistributionHandover['partialStorageLocation'] : undefined,
      productName,
      finishedGoodsBatchCode,
      finishedGoodsBatchCodeReviewedBy: reviewedBy,
      finishedGoodsBatchCodeReviewedAt: reviewedAt,
      finishedGoodsBatchCodeReviewMethod: reviewMethod,
      batchCode,
      quantity: form.quantity,
      unit: form.unit,
      cases: isFinishedStockCandidate
        ? selectedFinishedDefinition?.packMode === 'units' || selectedFinishedDefinition?.packMode === 'weight_loose' ? form.verifiedCases : undefined
        : selectedCandidate?.cases,
      looseQuantity: isFinishedStockCandidate
        ? selectedFinishedDefinition?.packMode === 'units' ? form.verifiedLoose : undefined
        : selectedCandidate?.looseQuantity,
      caseWeightKg: isFinishedStockCandidate && selectedFinishedDefinition?.packMode === 'weight_loose' ? selectedCandidate?.caseWeightKg : undefined,
      storageLocation: form.destination,
      destination: form.destination,
      handedOverBy,
      handedOverAt: now,
      quantityVerified: isFinishedStockCandidate ? form.quantityVerified : undefined,
      quantityVerifiedBy: isFinishedStockCandidate ? handedOverBy : undefined,
      quantityVerifiedAt: isFinishedStockCandidate ? now : undefined,
      recordedQuantityBeforeVerification: isFinishedStockCandidate ? selectedCandidate?.quantity : undefined,
      quantityVariance,
      notes: [sourceNote, codeReviewNote, extraNote, partialDispositionNote, form.notes.trim()].filter(Boolean).join(' · ') || undefined,
    };
    setHandovers(current => [...current, record]);
    showToast('success', reviewOnly ? `${productName} balance review saved` : `${productName} recorded as handed over to ${record.destination}`);
    closeModal();
  };

  const renderCandidateGroups = (groups: Array<[string, DistributionCandidate[]]>) => groups.map(([milkLotLabel, group]) =>
    <section key={milkLotLabel} className="overflow-hidden rounded-lg border border-slate-200">
      <h4 className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-800">{milkLotLabel}</h4>
      <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm">
        <thead><tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
          <th className="px-3 py-2">Product / SKU</th><th className="px-3 py-2">Batch codes</th><th className="px-3 py-2">Quantity on site</th><th className="px-3 py-2">Current location</th><th className="px-3 py-2">Action</th>
        </tr></thead>
        <tbody className="divide-y divide-slate-100">{group.map(candidate => <tr key={candidate.id} className="align-top hover:bg-slate-50">
          <td className="px-3 py-3"><div className="font-medium text-slate-900">{candidate.productName}</div>{candidate.sku && <div className="mt-1 font-mono text-xs font-semibold text-indigo-700">{candidate.sku}</div>}<div className="mt-1 text-xs text-slate-500">{candidate.detail}</div></td>
          <td className="px-3 py-3"><div className="text-xs font-semibold text-emerald-700">Finished: {candidate.finishedGoodsBatchCode || 'Owner/admin code required'}</div><div className="mt-1 flex items-start gap-1 text-xs text-slate-600"><GitBranch className="h-3 w-3 shrink-0" /><span>{(candidate.sourceBatchCodes?.length ? candidate.sourceBatchCodes : [candidate.batchCode]).join(', ')}</span></div></td>
          <td className="px-3 py-3 font-semibold text-slate-900">{formatQuantity(candidate.quantity, candidate.unit)}{candidate.cases !== undefined && <div className="text-xs font-normal text-slate-500">{candidate.cases} cases{candidate.caseWeightKg ? ` × ${candidate.caseWeightKg.toFixed(2)} kg` : ''} · {candidate.looseWeightKg !== undefined && candidate.caseWeightKg ? `${candidate.looseWeightKg.toFixed(2)} kg loose` : `${candidate.looseQuantity || 0} loose`}</div>}</td>
          <td className="px-3 py-3 text-xs text-slate-600"><div className={candidate.storageLocation === 'Location not recorded' ? 'font-semibold text-amber-700' : 'font-semibold'}>{candidate.storageLocation === finishedStockOrigin ? 'Dairy Container' : candidate.storageLocation || '—'}</div>{candidate.remainderReviewedAt && <div className="mt-1">Reviewed {new Date(candidate.remainderReviewedAt).toLocaleString()}{candidate.remainderReviewedBy ? ` by ${candidate.remainderReviewedBy}` : ''}</div>}</td>
          <td className="px-3 py-3"><div className="flex flex-wrap gap-2"><button type="button" onClick={() => openCandidate(candidate)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100">Hand over <ArrowRight className="h-3 w-3" /></button>{canAssignManualBatchCode && <button type="button" onClick={() => openCandidate(candidate, true)} className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-800">Review balance / location</button>}</div></td>
        </tr>)}</tbody>
      </table></div>
    </section>);

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
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center"><CheckCircle2 className="mx-auto mb-1 h-5 w-5 text-emerald-600" /><p className="text-2xl font-bold text-emerald-700">{actualHandovers.length}</p><p className="text-xs text-emerald-700">recorded transfers</p></div>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4" aria-label="Ready for distribution">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div><h3 className="text-sm font-semibold text-slate-900">Ready for distribution</h3><p className="mt-0.5 text-xs text-slate-500">Packed products awaiting handover, grouped by milk lot with the latest first.</p></div>
          <Truck className="h-5 w-5 text-slate-400" />
        </div>
        {readyCandidates.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">No new products awaiting handover. Reviewed balances are listed below.</p> : <div className="space-y-4">{renderCandidateGroups(candidateGroups)}</div>}
      </section>

      <section className="rounded-xl border border-amber-200 bg-white p-4" aria-label="Still in production">
        <h3 className="text-sm font-semibold text-slate-900">Still in production</h3>
        <p className="mb-3 mt-0.5 text-xs text-slate-500">Current untransferred balances, including loose stock, with their batch codes and physical location. Quantities reduce as later handovers are recorded.</p>
        {productionRemainderGroups.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">No balances are currently marked still in production.</p> : <div className="space-y-4">{renderCandidateGroups(productionRemainderGroups)}</div>}
      </section>

      <DistributionRecords groups={discrepancyGroups} discrepancy />
      <DistributionRecords groups={handoverGroups} />

      <Modal isOpen={showHandoverModal} onClose={closeModal} title={selectedCandidate ? `${reviewOnly ? 'Review balance' : 'Hand over'} · ${selectedCandidate.productName}` : 'Record product handover'}>
        <div className="space-y-4">
          <p className="text-xs text-slate-500">{reviewOnly ? `Review ${formatQuantity(selectedCandidate?.quantity || 0, form.unit)} on site. This review records its location or clears it to Discrepancy. Recorded by ${currentUsername || currentRole}.` : 'Choose the cold store receiving this handover. If a balance remains on site, record where it is stored below.'}</p>
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
          {!reviewOnly && <>
          {selectedCandidate?.sourceType === 'finished_stock' && selectedFinishedDefinition?.packMode === 'weight_loose' ? <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-indigo-800">Physical packed quantity</p><p className="mt-1 text-xs text-indigo-700">Verify cases and any loose kilograms separately. Recorded case size: {selectedCandidate.caseWeightKg?.toFixed(2)} kg per case.</p><div className="mt-3 grid grid-cols-2 gap-3"><div><label className="text-xs font-medium uppercase tracking-wide text-slate-600">Verified cases</label><input type="number" min="0" step="1" value={form.verifiedCases || ''} onChange={event => updateVerifiedPackedCounts({ verifiedCases: Number(event.target.value) || 0 })} className="mt-1 w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm" /></div><div><label className="text-xs font-medium uppercase tracking-wide text-slate-600">Verified loose weight (kg)</label><input type="number" min="0" step="0.01" value={form.verifiedLooseWeightKg || ''} onChange={event => updateVerifiedPackedCounts({ verifiedLooseWeightKg: Number(event.target.value) || 0 })} className="mt-1 w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm" /></div></div><div className="mt-3 rounded-md bg-white/80 px-3 py-2 text-sm text-slate-700"><span className="font-semibold">Verified total:</span> {form.quantity.toFixed(2)} kg · {form.verifiedCases} cases × {(selectedCandidate.caseWeightKg || 0).toFixed(2)} kg + {form.verifiedLooseWeightKg.toFixed(2)} kg loose</div></div> : selectedCandidate?.sourceType === 'finished_stock' && selectedFinishedDefinition?.packMode === 'units' ? <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-indigo-800">Physical packed quantity</p><p className="mt-1 text-xs text-indigo-700">Check the actual cases and loose packets. Any surplus will be attributed to a production round balance below.</p><div className="mt-3 grid grid-cols-2 gap-3"><div><label className="text-xs font-medium uppercase tracking-wide text-slate-600">Verified cases</label><input type="number" min="0" step="1" value={form.verifiedCases || ''} onChange={event => updateVerifiedPackedCounts({ verifiedCases: Number(event.target.value) || 0 })} className="mt-1 w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm" /></div><div><label className="text-xs font-medium uppercase tracking-wide text-slate-600">Verified loose packets</label><input type="number" min="0" step="1" value={form.verifiedLoose || ''} onChange={event => updateVerifiedPackedCounts({ verifiedLoose: Number(event.target.value) || 0 })} className="mt-1 w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm" /></div></div><div className="mt-3 rounded-md bg-white/80 px-3 py-2 text-sm text-slate-700"><span className="font-semibold">Verified total:</span> {form.quantity} packets ({getPaneerPackWeight(selectedFinishedDefinition, form.verifiedCases, form.verifiedLoose, 0, 0).toFixed(2)} kg) · {form.verifiedCases} cases + {form.verifiedLoose} loose packets</div></div> : <div className="grid grid-cols-2 gap-3"><div><label className="text-xs font-medium uppercase tracking-wide text-slate-600">{selectedCandidate?.sourceType === 'finished_stock' ? 'Verified quantity' : 'Quantity'}</label><input type="number" min="0" step={form.unit === 'kg' ? '0.01' : '1'} max={selectedCandidate && selectedCandidate.sourceType !== 'finished_stock' ? selectedCandidate.quantity : undefined} value={form.quantity || ''} onChange={event => setForm({ ...form, quantity: Number(event.target.value) || 0, quantityVerified: false })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />{selectedCandidate && <p className="mt-1 text-[11px] text-slate-500">Recorded: {formatQuantity(selectedCandidate.quantity, selectedCandidate.unit)}</p>}</div><div><label className="text-xs font-medium uppercase tracking-wide text-slate-600">Unit</label><select value={form.unit} disabled={Boolean(selectedCandidate)} onChange={event => setForm({ ...form, unit: event.target.value as CandidateUnit })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm disabled:bg-slate-50"><option value="kg">kg</option><option value="packets">packets</option><option value="bottles">bottles</option></select></div></div>}
          </>}
          {selectedCandidate && partialTransferRemainder > (selectedCandidate.unit === 'kg' ? 0.01 : 0) && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3"><p className="text-xs font-semibold text-amber-900">Untransferred remainder: {formatQuantity(partialTransferRemainder, selectedCandidate.unit)}</p><label className="mt-2 block text-xs font-medium text-slate-700">Classify this remainder<select value={form.partialTransferDisposition} onChange={event => setForm({ ...form, partialTransferDisposition: event.target.value as HandoverForm['partialTransferDisposition'] })} className="mt-1 w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm"><option value="">Choose one</option><option value="still_in_production">Still in production / transfer later</option><option value="incorrectly_recorded">Incorrectly recorded — remove from active stock</option></select></label>{form.partialTransferDisposition === 'still_in_production' && <label className="mt-2 block text-xs font-medium text-slate-700">Where is this balance stored?<select value={form.partialStorageLocation} onChange={event => setForm({ ...form, partialStorageLocation: event.target.value })} className="mt-1 w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm"><option value="">Select location</option><option value={finishedStockOrigin}>Dairy Container</option><option value="Chiller">Chiller</option></select></label>}{form.partialTransferDisposition === 'incorrectly_recorded' && <label className="mt-2 block text-xs font-medium text-slate-700">Correction reason<textarea value={form.partialDispositionReason} onChange={event => setForm({ ...form, partialDispositionReason: event.target.value })} rows={2} className="mt-1 w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm" placeholder="Explain why this remaining quantity is not real stock" /></label>}<p className="mt-2 text-[11px] text-amber-800">“Still in production” keeps the quantity available for a later transfer. “Incorrectly recorded” removes it from active distribution stock and keeps the correction in the audit record.</p></div>}
          {!reviewOnly && selectedCandidate?.sourceType === 'finished_stock' && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3"><p className="text-xs font-semibold text-amber-900">Handover quantity check</p><div className="mt-1 space-y-1 text-xs text-amber-800"><p>Recorded on board: {formatQuantity(selectedCandidate.quantity, selectedCandidate.unit)}{selectedCandidate.cases !== undefined && ` · ${selectedCandidate.cases} cases${selectedCandidate.caseWeightKg ? ` × ${selectedCandidate.caseWeightKg} kg` : ''}${selectedFinishedDefinition?.packMode === 'weight_loose' ? ` + ${(selectedCandidate.looseWeightKg || 0).toFixed(2)} kg loose` : ` + ${selectedCandidate.looseQuantity || 0} loose`}`}</p><p>Physical count: {formatQuantity(form.quantity, form.unit)}{selectedFinishedDefinition?.packMode === 'units' && ` · ${form.verifiedCases} cases + ${form.verifiedLoose} loose`}{selectedFinishedDefinition?.packMode === 'weight_loose' && ` · ${form.verifiedCases} cases + ${form.verifiedLooseWeightKg.toFixed(2)} kg loose`}</p>{selectedFinishedExtraWeight > 0 && <p className="font-semibold">Extra to record against a production balance: {selectedFinishedExtraWeight.toFixed(2)} kg</p>}{selectedFinishedShortfall > 0.01 && <p className="font-semibold">Partial handover: {formatQuantity(selectedFinishedShortfall, form.unit)} is classified above.</p>}</div>{selectedFinishedExtraWeight > 0 && <div className="mt-3"><label className="text-xs font-medium uppercase tracking-wide text-slate-600">Source round for extra quantity</label><select value={form.extraSourceRoundId} onChange={event => setForm({ ...form, extraSourceRoundId: event.target.value })} className="mt-1 w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm"><option value="">Select a round with remaining balance</option>{extraSourceRounds.map(round => <option key={round.id} value={round.id}>{round.milkLotCode}/S{round.shiftNumber}/R{round.roundNumber} · {(getPaneerRoundRemainingBalance(round) ?? round.intermediateBalance ?? 0).toFixed(2)} kg balance</option>)}</select><p className="mt-1 text-[11px] text-amber-700">This adds the surplus packing entry to that round and reduces its remaining paneer balance.</p></div>}<label className="mt-3 flex items-start gap-2 text-xs text-amber-900"><input type="checkbox" checked={form.quantityVerified} onChange={event => setForm({ ...form, quantityVerified: event.target.checked })} className="mt-0.5 h-4 w-4 rounded border-amber-300 text-emerald-600" /><span>I physically verified the packed quantity and confirm it is ready for transfer.</span></label></div>}
          {!reviewOnly && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div><label className="text-xs font-medium uppercase tracking-wide text-slate-600">Receiving storage location</label><select value={form.destination} onChange={event => setForm({ ...form, destination: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"><option value="">Select receiving location</option>{distributionStorageLocations.map(location => <option key={location} value={location}>{location}</option>)}</select></div>
            <div><label className="text-xs font-medium uppercase tracking-wide text-slate-600">Handed over by</label><input value={form.handedOverBy} onChange={event => setForm({ ...form, handedOverBy: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Staff name" /></div>
          </div>}
          <div><label className="text-xs font-medium uppercase tracking-wide text-slate-600">Notes (optional)</label><textarea value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} rows={2} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Condition, recipient, or delivery note" /></div>
          <div className="flex gap-2 pt-2"><button type="button" onClick={recordHandover} disabled={!canAssignManualBatchCode} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"><CheckCircle2 className="h-4 w-4" /> {reviewOnly ? 'Save balance review' : 'Confirm handover'}</button><button type="button" onClick={closeModal} className="rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-200">Cancel</button></div>
        </div>
      </Modal>
    </div>
  );
}
