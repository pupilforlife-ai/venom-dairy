import {
  CipRecord,
  getGheeRoundInput,
  getMilkLotAccounting,
  getMilkLotProductionReconciliation,
  getRoundMilkInput,
  FinishedStockLot,
  isMilkProductionRound,
  MilkLot,
  milkStorageVessels,
  ProductionRound,
  ProductionShift,
  WasteEvent,
} from '../data/mockData';
import {
  crumbingSkuByCode,
  getCrumbingPackWeight,
  getDefaultPaneerCaseWeightKg,
  getGheePackWeight,
  getPaneerPackWeight,
  gheeSkuByCode,
  normalizeFinishedGoodsSku,
  paneerSkuByCode,
} from '../data/skuConfig';
import { getProductionPackingEntries } from './finishedStock';
import { excelDate, ExcelCellValue, ExcelSheet, ExcelWorkbookExport, exportDateStamp, exportExcelWorkbook } from './excelExport';
import { getMilkLotVesselBalances, getMilkSaleVesselSource } from './milkVesselAllocation';
import { comparePaneerBlockToPackedWeight } from './paneerWeightReconciliation';

interface CrumbingBatchExportRecord {
  id: string;
  batchCode: string;
  type: string;
  sourceBatchId: string;
  sourceBatchCode: string;
  origin?: string;
  status: string;
  sourceWeightKg?: number;
  balanceWeightKg?: number;
  weightCrumbedKg?: number;
  wastageKg?: number;
  traysCrumbed: number;
  traysFried: number;
  traysRemaining: number;
  traysPacked: number;
  crumbingTeam?: string;
  fryingTeam?: string;
  fryTemperature?: number;
  fryTime?: number;
  packedSkus?: Array<{ sku: string; cases: number; loose: number; weightKg?: number }>;
  recipe?: {
    flavourIyababKg: number;
    flavourPredustKg: number;
    batterIyababaKg: number;
    batterWaterL: number;
    breadingAdajioKg: number;
  };
  jpPrepping?: {
    buckets: Array<{
      id: string;
      nominalWeightKg: number;
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
    pan111InputKg: number;
    creamKg: number;
    blackPepperKg: number;
    saltKg: number;
    carriedCreamCheeseKg?: number;
    totalCreamCheeseAvailableKg?: number;
    preparedBy: string;
    completedAt?: string;
  };
  jpFilling?: {
    damagedPieces: number;
    filledPieces: number;
    traysFilled: number;
    filledBy: string;
    creamCheeseUsedKg?: number;
    creamCheeseLeftoverKg?: number;
    creamCheeseDisposition?: string;
    completedAt?: string;
    frozenAt?: string;
  };
  jpCrumbing?: {
    damagedPieces: number;
    finalCrumbedPieces: number;
    traysCrumbed: number;
    crumbedBy: string;
    predustKg: number;
    batterMixKg: number;
    batterWaterL: number;
    adajioKg: number;
    completedAt?: string;
  };
  notes?: string;
  createdAt: string;
}

const exportedAtMetadata = (): Array<[string, Date]> => [['Exported at', new Date()]];

function productionBatchCode(round: ProductionRound) {
  return round.batchCode || `${round.milkLotCode}/S${round.shiftNumber}/R${round.roundNumber}`;
}

function roundInput(round: ProductionRound) {
  if (round.type === 'Ghee') return { quantity: getGheeRoundInput(round), unit: 'kg' };
  if (round.type === 'Butter') return { quantity: Math.max(0, round.actualInput || round.plannedInput), unit: 'kg' };
  return { quantity: getRoundMilkInput(round), unit: 'L' };
}

function sortedRounds(rounds: ProductionRound[]) {
  return rounds.slice().sort((a, b) =>
    a.shiftNumber - b.shiftNumber
    || a.roundNumber - b.roundNumber
    || a.startTime.localeCompare(b.startTime),
  );
}

function sum(values: number[] | undefined) {
  return (values || []).reduce((total, value) => total + Math.max(0, value || 0), 0);
}

function withNoRecords(sheet: ExcelSheet, message: string): ExcelSheet {
  if (sheet.rows.length > 0) return sheet;
  const firstColumn = sheet.columns[0]?.key || 'status';
  return {
    ...sheet,
    metadata: [...(sheet.metadata || []), ['Record status', message]],
    rows: [{ [firstColumn]: message }],
  };
}

function productionSummarySheet(rounds: ProductionRound[], metadata: ExcelSheet['metadata']): ExcelSheet {
  return {
    name: 'Production Summary',
    title: 'Production Board — Complete Production Summary',
    metadata,
    columns: [
      { key: 'lot', header: 'Milk Lot', width: 14 },
      { key: 'shift', header: 'Shift', width: 9 },
      { key: 'round', header: 'Round', width: 9 },
      { key: 'batch', header: 'Batch Code', width: 25 },
      { key: 'type', header: 'Product / Process', width: 18 },
      { key: 'status', header: 'Current Stage', width: 19 },
      { key: 'input', header: 'Input', width: 12, numberFormat: '0.00' },
      { key: 'inputUnit', header: 'Input Unit', width: 11 },
      { key: 'outputKg', header: 'Recorded Output kg', width: 19, numberFormat: '0.00' },
      { key: 'creamKg', header: 'Cream Recovered kg', width: 19, numberFormat: '0.00' },
      { key: 'blocks', header: 'Blocks', width: 10, numberFormat: '0' },
      { key: 'packedCases', header: 'Packed Cases', width: 14, numberFormat: '0' },
      { key: 'packedLoose', header: 'Packed Loose Units', width: 18, numberFormat: '0' },
      { key: 'packedWeightKg', header: 'Packed Weight kg', width: 18, numberFormat: '0.00' },
      { key: 'amassiBottles', header: 'Amassi Bottles', width: 15, numberFormat: '0' },
      { key: 'remainingKg', header: 'Remaining kg', width: 15, numberFormat: '0.00' },
      { key: 'started', header: 'Started At', width: 21 },
      { key: 'completed', header: 'Completed At', width: 21 },
      { key: 'team', header: 'Team', width: 24 },
    ],
    rows: sortedRounds(rounds).map(round => {
      const input = roundInput(round);
      const packs = round.packedSkus || [];
      return {
        lot: round.milkLotCode,
        shift: round.shiftNumber || '',
        round: round.roundNumber,
        batch: productionBatchCode(round),
        type: round.type,
        status: round.status,
        input: input.quantity,
        inputUnit: input.unit,
        outputKg: round.outputWeight || round.butterOutput || 0,
        creamKg: round.creamRecovered || 0,
        blocks: round.numberOfBlocks || round.storedNumberOfBlocks || 0,
        packedCases: packs.reduce((total, pack) => total + Math.max(0, pack.cases || 0), 0),
        packedLoose: packs.reduce((total, pack) => total + Math.max(0, pack.loose || 0), 0),
        packedWeightKg: packs.reduce((total, pack) => total + packWeight(pack), 0),
        amassiBottles: (round.amassiPacked || []).reduce((total, pack) => total + Math.max(0, pack.bottles || 0), 0),
        remainingKg: round.remainingBalance ?? '',
        started: excelDate(round.startTime),
        completed: excelDate(round.completedAt),
        team: (round.team || []).join(', '),
      };
    }),
  };
}

function cuttingSheet(rounds: ProductionRound[], metadata: ExcelSheet['metadata']): ExcelSheet {
  const paneerRounds = sortedRounds(rounds.filter(round => round.type === 'D' || round.type === 'C/S'));
  return {
    name: 'Paneer Cutting',
    title: 'Production Board — Paneer Cutting and Balance Ledger',
    metadata,
    columns: [
      { key: 'lot', header: 'Milk Lot', width: 14 },
      { key: 'shift', header: 'Shift', width: 9 },
      { key: 'round', header: 'Round', width: 9 },
      { key: 'batch', header: 'Batch Code', width: 25 },
      { key: 'type', header: 'Type', width: 10 },
      { key: 'cuttingType', header: 'Cutting Type', width: 18 },
      { key: 'storedBlocks', header: 'Clingwrapped Blocks', width: 20, numberFormat: '0' },
      { key: 'storedWeightKg', header: 'Clingwrapped Weight kg', width: 22, numberFormat: '0.00' },
      { key: 'storedWeights', header: 'Clingwrapped Individual Weights kg', width: 34 },
      { key: 'finalBlocks', header: 'Final Blocks', width: 14, numberFormat: '0' },
      { key: 'finalWeightKg', header: 'Final Block Weight kg', width: 21, numberFormat: '0.00' },
      { key: 'finalWeights', header: 'Final Individual Weights kg', width: 32 },
      { key: 'sppKg', header: 'Sent to SPP kg', width: 16, numberFormat: '0.00' },
      { key: 'balanceKg', header: 'Balance Paneer kg', width: 18, numberFormat: '0.00' },
      { key: 'remainingKg', header: 'Remaining to Pack kg', width: 20, numberFormat: '0.00' },
      { key: 'cutBy', header: 'Final Cut By', width: 17 },
      { key: 'storedBy', header: 'Clingwrapped By', width: 18 },
      { key: 'clingwrappedAt', header: 'Clingwrapped At', width: 21 },
      { key: 'status', header: 'Status', width: 18 },
    ],
    rows: paneerRounds.map(round => ({
      lot: round.milkLotCode,
      shift: round.shiftNumber,
      round: round.roundNumber,
      batch: productionBatchCode(round),
      type: round.type,
      cuttingType: round.cuttingType || '',
      storedBlocks: round.storedNumberOfBlocks ?? round.storedBlockWeights?.length ?? 0,
      storedWeightKg: round.storedOutputWeight ?? sum(round.storedBlockWeights),
      storedWeights: (round.storedBlockWeights || []).map(value => value.toFixed(2)).join(', '),
      finalBlocks: round.numberOfBlocks ?? round.blockWeights?.length ?? 0,
      finalWeightKg: sum(round.blockWeights) || round.outputWeight || 0,
      finalWeights: (round.blockWeights || []).map(value => value.toFixed(2)).join(', '),
      sppKg: round.sppRecordedWeight || 0,
      balanceKg: round.balancePaneerWeight || 0,
      remainingKg: round.remainingBalance ?? '',
      cutBy: round.cutBy || '',
      storedBy: round.storedCutBy || '',
      clingwrappedAt: excelDate(round.clingwrappedAt),
      status: round.status,
    })),
  };
}

function creamSheet(rounds: ProductionRound[], metadata: ExcelSheet['metadata']): ExcelSheet {
  const creamRounds = sortedRounds(rounds.filter(round => round.type === 'C/S' || (round.creamRecovered || 0) > 0 || (round.creamBucketWeights || []).length > 0));
  return {
    name: 'Cream Recovery',
    title: 'Production Board — Cream Recovery',
    metadata,
    columns: [
      { key: 'lot', header: 'Milk Lot', width: 14 },
      { key: 'shift', header: 'Shift', width: 9 },
      { key: 'round', header: 'Round', width: 9 },
      { key: 'batch', header: 'Batch Code', width: 25 },
      { key: 'recordedKg', header: 'Recorded Cream kg', width: 19, numberFormat: '0.00' },
      { key: 'bucketCount', header: 'Buckets', width: 11, numberFormat: '0' },
      { key: 'bucketTotalKg', header: 'Bucket Total kg', width: 17, numberFormat: '0.00' },
      { key: 'varianceKg', header: 'Recorded - Bucket kg', width: 21, numberFormat: '0.00' },
      { key: 'bucketWeights', header: 'Individual Bucket Weights kg', width: 35 },
      { key: 'recordedBy', header: 'Recorded By', width: 18 },
      { key: 'recordedAt', header: 'Recorded At', width: 21 },
    ],
    rows: creamRounds.map(round => {
      const bucketTotal = sum(round.creamBucketWeights);
      const recorded = Math.max(0, round.creamRecovered || 0);
      return {
        lot: round.milkLotCode,
        shift: round.shiftNumber,
        round: round.roundNumber,
        batch: productionBatchCode(round),
        recordedKg: recorded,
        bucketCount: round.creamBucketWeights?.length || 0,
        bucketTotalKg: bucketTotal,
        varianceKg: recorded - bucketTotal,
        bucketWeights: (round.creamBucketWeights || []).map(value => value.toFixed(2)).join(', '),
        recordedBy: round.creamRecoveredBy || '',
        recordedAt: excelDate(round.creamRecoveredAt),
      };
    }),
  };
}

const butterSkuPacking: Record<string, { unitsPerCase: number; unitWeightKg: number }> = {
  PUBB: { unitsPerCase: 36, unitWeightKg: 0.5 },
  PUBBB: { unitsPerCase: 36, unitWeightKg: 0.5 },
  PSBBB: { unitsPerCase: 36, unitWeightKg: 0.5 },
  BB05: { unitsPerCase: 30, unitWeightKg: 0.5 },
  BBO5: { unitsPerCase: 30, unitWeightKg: 0.5 },
};

function butterPackWeight(pack: { sku: string; cases: number; loose?: number; weightKg?: number }) {
  const definition = butterSkuPacking[normalizeFinishedGoodsSku(pack.sku)];
  if (!definition) return Math.max(0, pack.weightKg || 0);
  return Math.round((
    (Math.max(0, pack.cases || 0) * definition.unitsPerCase + Math.max(0, pack.loose || 0))
    * definition.unitWeightKg
    + Number.EPSILON
  ) * 100) / 100;
}

function butterBatchCode(round: ProductionRound) {
  const batch = productionBatchCode(round);
  return round.batchCode && !/\/R\d+(?:\/|$)/i.test(batch)
    ? `${batch}/R${round.roundNumber}`
    : batch;
}

function isBlendedButterRound(round: ProductionRound) {
  return Boolean(round.blendedPoolId || (round.blendingInput || 0) > 0);
}

function packedButterKg(round: ProductionRound) {
  const packed = (round.packedSkus || []).reduce((total, pack) => total + butterPackWeight(pack), 0);
  return packed > 0 ? packed : Math.max(0, round.packedButterWeight || 0);
}

function inferredBlendUseKg(round: ProductionRound) {
  const produced = Math.max(0, round.butterOutput || round.outputWeight || 0);
  const remaining = Math.max(0, round.remainingBalance ?? produced);
  return Math.max(0, produced - Math.max(0, round.usedInGhee || 0) - packedButterKg(round) - remaining);
}

function butterStockForPacking(
  round: ProductionRound,
  packIndex: number,
  finishedStock: FinishedStockLot[],
) {
  const entry = getProductionPackingEntries([round]).find(candidate => candidate.packIndex === packIndex);
  if (!entry) return undefined;
  return finishedStock.find(candidate => candidate.packingRunId === entry.packingRunId)
    || finishedStock.find(candidate =>
      normalizeFinishedGoodsSku(candidate.sku) === entry.pack.sku
      && (candidate.sourceBatchCodes || []).includes(entry.sourceBatchCode)
    );
}

function butterWorkbookSheet(
  rounds: ProductionRound[],
  metadata: ExcelSheet['metadata'],
  finishedStock: FinishedStockLot[],
  emptyMessage: string,
): ExcelSheet {
  const butterRounds = sortedRounds(rounds.filter(round => round.type === 'Butter'));
  const sourceRounds = butterRounds.filter(round => !isBlendedButterRound(round));
  const blendRounds = butterRounds.filter(isBlendedButterRound);
  const gheeRounds = sortedRounds(rounds.filter(round => round.type === 'Ghee'));

  const summaryColumns = [
    { key: 'date', header: 'Production Date', width: 17 },
    { key: 'batch', header: 'Butter Batch', width: 25 },
    { key: 'creamSource', header: 'Cream Source', width: 16 },
    { key: 'creamLot', header: 'Source Cream Lot / Batch', width: 27 },
    { key: 'creamInputKg', header: 'Cream Consumed kg', width: 19, numberFormat: '0.00' },
    { key: 'butterKg', header: 'Butter Produced kg', width: 19, numberFormat: '0.00' },
    { key: 'buttermilkKg', header: 'Buttermilk Produced kg', width: 22, numberFormat: '0.00' },
    { key: 'gheeKg', header: 'Used for Ghee kg', width: 18, numberFormat: '0.00' },
    { key: 'pubbKg', header: 'Packed as PUBB kg', width: 19, numberFormat: '0.00' },
    { key: 'blendKg', header: 'Used in Blends kg', width: 19, numberFormat: '0.00' },
    { key: 'remainingKg', header: 'Butter Remaining kg', width: 20, numberFormat: '0.00' },
    { key: 'accountedKg', header: 'Total Accounted kg', width: 19, numberFormat: '0.00' },
    { key: 'varianceKg', header: 'Unrecorded Variance kg', width: 21, numberFormat: '0.00' },
    { key: 'destination', header: 'Destination / Use', width: 29 },
    { key: 'location', header: 'Current Location', width: 31 },
    { key: 'status', header: 'Status', width: 18 },
    { key: 'team', header: 'Team', width: 22 },
    { key: 'notes', header: 'Notes', width: 30 },
  ];

  const summaryRows = sourceRounds.map(round => {
    const produced = Math.max(0, round.butterOutput || round.outputWeight || 0);
    const gheeKg = Math.max(0, round.usedInGhee || 0);
    const pubbKg = packedButterKg(round);
    const blendKg = inferredBlendUseKg(round);
    const remainingKg = Math.max(0, round.remainingBalance ?? Math.max(0, produced - gheeKg - pubbKg - blendKg));
    const accountedKg = gheeKg + pubbKg + blendKg + remainingKg;
    const packedLocations = [...new Set((round.packedSkus || []).map((_, packIndex) =>
      butterStockForPacking(round, packIndex, finishedStock)?.storageLocation || 'Dairy Container (Finished Stock)'
    ))];
    const uses = [
      gheeKg > 0 ? 'Ghee' : '',
      pubbKg > 0 ? 'PUBB' : '',
      blendKg > 0 ? 'Blending' : '',
      remainingKg > 0 ? 'Butter pool' : '',
    ].filter(Boolean);
    const locations = [
      remainingKg > 0 ? 'Butter Pool (On Site)' : '',
      ...packedLocations,
      remainingKg === 0 && packedLocations.length === 0 ? 'Fully Allocated to Production' : '',
    ].filter(Boolean);
    return {
      date: excelDate(round.roundDate || round.startTime),
      batch: butterBatchCode(round),
      creamSource: round.creamSource || '',
      creamLot: round.sourceBatchCode || round.creamLotId || '',
      creamInputKg: Math.max(0, round.actualInput || round.plannedInput || 0),
      butterKg: produced,
      buttermilkKg: Math.max(0, round.buttermilkOutput || 0),
      gheeKg,
      pubbKg,
      blendKg,
      remainingKg,
      accountedKg,
      varianceKg: Math.round((produced - accountedKg + Number.EPSILON) * 100) / 100,
      destination: uses.join('; '),
      location: [...new Set(locations)].join('; '),
      status: round.status,
      team: (round.team || []).join(', '),
      notes: round.notes || '',
    };
  });

  const usageColumns = [
    { key: 'date', header: 'Date', width: 17 },
    { key: 'sourceBatch', header: 'Source Butter Batch', width: 25 },
    { key: 'usageType', header: 'Usage Type', width: 22 },
    { key: 'destinationBatch', header: 'Destination Batch', width: 27 },
    { key: 'sku', header: 'SKU / Resulting SKUs', width: 30 },
    { key: 'butterConsumedKg', header: 'Butter Consumed kg', width: 20, numberFormat: '0.00' },
    { key: 'cases', header: 'Cases', width: 11, numberFormat: '0' },
    { key: 'loose', header: 'Loose Units', width: 13, numberFormat: '0' },
    { key: 'finishedKg', header: 'Finished Weight kg', width: 20, numberFormat: '0.00' },
    { key: 'location', header: 'Current Location', width: 31 },
    { key: 'status', header: 'Status', width: 18 },
    { key: 'team', header: 'Recorded By / Team', width: 23 },
    { key: 'notes', header: 'Notes', width: 34 },
  ];

  const usageRows: Array<Record<string, ExcelCellValue>> = [];
  const gheeQueue = gheeRounds.map(round => ({
    round,
    remainingKg: Math.max(0, round.butterInput || round.actualInput || 0),
  }));
  sourceRounds.forEach(source => {
    let remainingSourceUse = Math.max(0, source.usedInGhee || 0);
    gheeQueue.forEach(target => {
      if (remainingSourceUse <= 0 || target.remainingKg <= 0) return;
      const consumed = Math.min(remainingSourceUse, target.remainingKg);
      usageRows.push({
        date: excelDate(target.round.roundDate || target.round.startTime),
        sourceBatch: butterBatchCode(source),
        usageType: 'Ghee Production',
        destinationBatch: productionBatchCode(target.round),
        sku: 'Ghee',
        butterConsumedKg: consumed,
        cases: '',
        loose: '',
        finishedKg: '',
        location: 'Ghee Production',
        status: target.round.status,
        team: (target.round.team || []).join(', '),
        notes: '',
      });
      remainingSourceUse -= consumed;
      target.remainingKg -= consumed;
    });
    if (remainingSourceUse > 0) {
      usageRows.push({
        date: excelDate(source.roundDate || source.startTime),
        sourceBatch: butterBatchCode(source),
        usageType: 'Ghee Production',
        destinationBatch: 'Ghee batch not linked in historical record',
        sku: 'Ghee',
        butterConsumedKg: remainingSourceUse,
        cases: '',
        loose: '',
        finishedKg: '',
        location: 'Ghee Production',
        status: source.status,
        team: (source.team || []).join(', '),
        notes: 'Butter use is recorded, but the destination ghee batch is not linked.',
      });
    }
  });
  gheeQueue.forEach(target => {
    if (target.remainingKg <= 0) return;
    usageRows.push({
      date: excelDate(target.round.roundDate || target.round.startTime),
      sourceBatch: 'Source butter batch not identified',
      usageType: 'Ghee Production',
      destinationBatch: productionBatchCode(target.round),
      sku: 'Ghee',
      butterConsumedKg: target.remainingKg,
      cases: '',
      loose: '',
      finishedKg: '',
      location: 'Ghee Production',
      status: target.round.status,
      team: (target.round.team || []).join(', '),
      notes: 'The ghee input is recorded, but its source butter batch is not linked.',
    });
  });

  sourceRounds.forEach(round => {
    (round.packedSkus || []).forEach((pack, packIndex) => {
      if (normalizeFinishedGoodsSku(pack.sku) !== 'PUBB') return;
      const stock = butterStockForPacking(round, packIndex, finishedStock);
      const weightKg = butterPackWeight(pack);
      usageRows.push({
        date: excelDate(stock?.createdAt || round.completedAt || round.startTime),
        sourceBatch: butterBatchCode(round),
        usageType: 'Pure Butter Packing',
        destinationBatch: stock?.finishedGoodsBatchCode || productionBatchCode(round),
        sku: 'PUBB',
        butterConsumedKg: weightKg,
        cases: Math.max(0, pack.cases || 0),
        loose: Math.max(0, pack.loose || 0),
        finishedKg: weightKg,
        location: stock?.storageLocation || 'Dairy Container (Finished Stock)',
        status: stock?.status || round.status,
        team: (round.team || []).join(', '),
        notes: '',
      });
    });
  });

  (['internal', 'external'] as const).forEach(origin => {
    const sourceQueue = sourceRounds
      .filter(round => (round.creamSource || 'internal') === origin)
      .map(round => ({ round, remainingKg: inferredBlendUseKg(round) }));
    blendRounds.forEach(blend => {
      let remainingBlendInput = Math.max(0, origin === 'internal'
        ? blend.blendingInternalButterQuantity || 0
        : blend.blendingExternalButterQuantity || 0);
      const packs = blend.packedSkus || [];
      const packedSummary = packs.map(pack => `${normalizeFinishedGoodsSku(pack.sku)}: ${pack.cases || 0} cs${pack.loose ? ` + ${pack.loose} loose` : ''}`).join('; ');
      const locations = [...new Set(packs.map((_, packIndex) =>
        butterStockForPacking(blend, packIndex, finishedStock)?.storageLocation || 'Dairy Container (Finished Stock)'
      ))].join('; ');
      sourceQueue.forEach(source => {
        if (remainingBlendInput <= 0 || source.remainingKg <= 0) return;
        const consumed = Math.min(remainingBlendInput, source.remainingKg);
        usageRows.push({
          date: excelDate(blend.roundDate || blend.startTime),
          sourceBatch: butterBatchCode(source.round),
          usageType: 'Blended Butter Production',
          destinationBatch: productionBatchCode(blend),
          sku: packedSummary || blend.pool || '',
          butterConsumedKg: consumed,
          cases: packs.reduce((total, pack) => total + Math.max(0, pack.cases || 0), 0),
          loose: packs.reduce((total, pack) => total + Math.max(0, pack.loose || 0), 0),
          finishedKg: packs.reduce((total, pack) => total + butterPackWeight(pack), 0),
          location: locations || (Math.max(0, blend.remainingBalance || 0) > 0 ? 'Blended Butter Pool (On Site)' : 'Fully Packed / Allocated'),
          status: blend.status,
          team: (blend.team || []).join(', '),
          notes: [
            blend.replacerQuantity ? `Replacer: ${blend.replacerQuantity.toFixed(2)} kg` : '',
            blend.saltQuantity ? `Salt: ${blend.saltQuantity.toFixed(3)} kg` : '',
          ].filter(Boolean).join('; '),
        });
        remainingBlendInput -= consumed;
        source.remainingKg -= consumed;
      });
      if (remainingBlendInput > 0) {
        usageRows.push({
          date: excelDate(blend.roundDate || blend.startTime),
          sourceBatch: `${origin} butter source not linked`,
          usageType: 'Blended Butter Production',
          destinationBatch: productionBatchCode(blend),
          sku: packedSummary || blend.pool || '',
          butterConsumedKg: remainingBlendInput,
          cases: packs.reduce((total, pack) => total + Math.max(0, pack.cases || 0), 0),
          loose: packs.reduce((total, pack) => total + Math.max(0, pack.loose || 0), 0),
          finishedKg: packs.reduce((total, pack) => total + butterPackWeight(pack), 0),
          location: locations || 'Blended Butter Pool (On Site)',
          status: blend.status,
          team: (blend.team || []).join(', '),
          notes: 'The blend quantity is recorded, but its source butter batch is not linked.',
        });
      }
    });
    sourceQueue.forEach(source => {
      if (source.remainingKg <= 0) return;
      usageRows.push({
        date: excelDate(source.round.roundDate || source.round.startTime),
        sourceBatch: butterBatchCode(source.round),
        usageType: 'Blended Butter Production',
        destinationBatch: 'Blend batch not linked in historical record',
        sku: '',
        butterConsumedKg: source.remainingKg,
        cases: '',
        loose: '',
        finishedKg: '',
        location: 'Blending',
        status: source.round.status,
        team: (source.round.team || []).join(', '),
        notes: 'Butter was deducted for blending, but the destination blend batch is not linked.',
      });
    });
  });

  return {
    name: 'Butter',
    title: 'Production Board — Butter Production and Usage',
    metadata: summaryRows.length
      ? [...(metadata || []), ['Accounting basis', 'Butter remaining = produced − ghee use − PUBB packing − blending use']]
      : [...(metadata || []), ['Record status', emptyMessage]],
    tableTitle: 'Butter Batch Summary — one row per butter production batch',
    columns: summaryColumns,
    rows: summaryRows.length ? summaryRows : [{ date: emptyMessage }],
    sections: [{
      title: 'Butter Usage Ledger — one row per use or destination',
      columns: usageColumns,
      rows: usageRows.length ? usageRows : [{ date: 'No butter use has been recorded' }],
    }],
  };
}

function gheeSheet(rounds: ProductionRound[], metadata: ExcelSheet['metadata']): ExcelSheet {
  return {
    name: 'Ghee',
    title: 'Production Board — Ghee Production and Packing',
    metadata,
    columns: [
      { key: 'date', header: 'Production Date', width: 17 },
      { key: 'batch', header: 'Batch Code', width: 25 },
      { key: 'source', header: 'Butter Source Batch', width: 25 },
      { key: 'status', header: 'Status', width: 18 },
      { key: 'butterKg', header: 'Butter Input kg', width: 17, numberFormat: '0.00' },
      { key: 'afOilKg', header: 'AF Oil Input kg', width: 17, numberFormat: '0.00' },
      { key: 'totalInputKg', header: 'Total Input kg', width: 16, numberFormat: '0.00' },
      { key: 'expectedKg', header: 'Expected Yield kg', width: 18, numberFormat: '0.00' },
      { key: 'outputKg', header: 'Ghee Output kg', width: 17, numberFormat: '0.00' },
      { key: 'packedCases', header: 'Packed Cases', width: 14, numberFormat: '0' },
      { key: 'packedLoose', header: 'Packed Loose', width: 14, numberFormat: '0' },
      { key: 'packedKg', header: 'Packed Weight kg', width: 18, numberFormat: '0.00' },
      { key: 'remainingKg', header: 'Remaining kg', width: 15, numberFormat: '0.00' },
      { key: 'team', header: 'Team', width: 22 },
      { key: 'notes', header: 'Notes', width: 30 },
    ],
    rows: sortedRounds(rounds.filter(round => round.type === 'Ghee')).map(round => ({
      date: excelDate(round.roundDate || round.startTime),
      batch: productionBatchCode(round),
      source: round.sourceBatchCode || '',
      status: round.status,
      butterKg: round.butterInput || round.actualInput || 0,
      afOilKg: round.afOilInput || 0,
      totalInputKg: getGheeRoundInput(round),
      expectedKg: round.expectedYield || 0,
      outputKg: round.outputWeight || 0,
      packedCases: (round.packedSkus || []).reduce((total, pack) => total + Math.max(0, pack.cases || 0), 0),
      packedLoose: (round.packedSkus || []).reduce((total, pack) => total + Math.max(0, pack.loose || 0), 0),
      packedKg: (round.packedSkus || []).reduce((total, pack) => total + packWeight(pack), 0),
      remainingKg: round.remainingBalance ?? '',
      team: (round.team || []).join(', '),
      notes: round.notes || '',
    })),
  };
}

function halloumiSheet(rounds: ProductionRound[], metadata: ExcelSheet['metadata']): ExcelSheet {
  return {
    name: 'Halloumi',
    title: 'Production Board — Halloumi Production',
    metadata,
    columns: [
      { key: 'lot', header: 'Milk Lot', width: 14 },
      { key: 'shift', header: 'Shift', width: 9 },
      { key: 'round', header: 'Round', width: 9 },
      { key: 'batch', header: 'Batch Code', width: 25 },
      { key: 'status', header: 'Status', width: 18 },
      { key: 'milkInputL', header: 'Milk Input L', width: 15, numberFormat: '0.00' },
      { key: 'outputKg', header: 'Halloumi Output kg', width: 20, numberFormat: '0.00' },
      { key: 'vacuumedKg', header: 'Vacuumed / Chiller kg', width: 22, numberFormat: '0.00' },
      { key: 'remainingKg', header: 'Remaining kg', width: 15, numberFormat: '0.00' },
      { key: 'curdSetting', header: 'Curd Setting Started', width: 22 },
      { key: 'curdCutting', header: 'Curd Cutting Started', width: 22 },
      { key: 'completed', header: 'Completed At', width: 21 },
      { key: 'team', header: 'Team', width: 22 },
      { key: 'notes', header: 'Notes', width: 30 },
    ],
    rows: sortedRounds(rounds.filter(round => round.type === 'Halloumi')).map(round => ({
      lot: round.milkLotCode,
      shift: round.shiftNumber,
      round: round.roundNumber,
      batch: productionBatchCode(round),
      status: round.status,
      milkInputL: getRoundMilkInput(round),
      outputKg: round.outputWeight || 0,
      vacuumedKg: round.vacuumPackedWeight || 0,
      remainingKg: round.remainingBalance ?? '',
      curdSetting: excelDate(round.curdSettingStartedAt),
      curdCutting: excelDate(round.curdCuttingStartedAt),
      completed: excelDate(round.completedAt),
      team: (round.team || []).join(', '),
      notes: round.notes || '',
    })),
  };
}

function amassiSheet(rounds: ProductionRound[], metadata: ExcelSheet['metadata']): ExcelSheet {
  return {
    name: 'Amassi',
    title: 'Production Board — Amassi Production and Packing',
    metadata,
    columns: [
      { key: 'lot', header: 'Milk Lot', width: 14 },
      { key: 'shift', header: 'Shift', width: 9 },
      { key: 'round', header: 'Round', width: 9 },
      { key: 'batch', header: 'Batch Code', width: 25 },
      { key: 'type', header: 'Amassi Type', width: 14 },
      { key: 'status', header: 'Status', width: 18 },
      { key: 'milkInputL', header: 'Milk Input L', width: 15, numberFormat: '0.00' },
      { key: 'incubation', header: 'Incubation Started', width: 22 },
      { key: 'phBeforeFreeze', header: 'pH Before Freezing', width: 19, numberFormat: '0.00' },
      { key: 'finalPh', header: 'Final pH', width: 12, numberFormat: '0.00' },
      { key: 'bottles18', header: '1.8 L Bottles', width: 15, numberFormat: '0' },
      { key: 'bottles2', header: '2 L Bottles', width: 14, numberFormat: '0' },
      { key: 'totalBottles', header: 'Total Bottles', width: 15, numberFormat: '0' },
      { key: 'team', header: 'Team', width: 22 },
      { key: 'notes', header: 'Notes', width: 30 },
    ],
    rows: sortedRounds(rounds.filter(round => round.type === 'Amassi')).map(round => {
      const bottles18 = (round.amassiPacked || []).filter(pack => pack.sku === 'AMASSI 1.8L').reduce((total, pack) => total + pack.bottles, 0);
      const bottles2 = (round.amassiPacked || []).filter(pack => pack.sku === 'AMASSI 2L').reduce((total, pack) => total + pack.bottles, 0);
      return {
        lot: round.milkLotCode,
        shift: round.shiftNumber,
        round: round.roundNumber,
        batch: productionBatchCode(round),
        type: round.amassiType || '',
        status: round.status,
        milkInputL: getRoundMilkInput(round),
        incubation: excelDate(round.amassiIncubationStartedAt),
        phBeforeFreeze: round.amassiPhBeforeFreezing ?? '',
        finalPh: round.amassiFinalPh ?? '',
        bottles18,
        bottles2,
        totalBottles: bottles18 + bottles2,
        team: (round.team || []).join(', '),
        notes: round.notes || '',
      };
    }),
  };
}

function packWeight(pack: { sku: string; cases: number; loose?: number; looseWeightKg?: number; weightKg?: number; caseWeightKg?: number }) {
  const sku = normalizeFinishedGoodsSku(pack.sku);
  if (paneerSkuByCode[sku]) {
    return Math.round((getPaneerPackWeight(
      paneerSkuByCode[sku],
      pack.cases || 0,
      pack.loose || 0,
      pack.looseWeightKg || 0,
      pack.weightKg || 0,
      pack.caseWeightKg,
    ) + Number.EPSILON) * 100) / 100;
  }
  if (gheeSkuByCode[sku]) return Math.round((getGheePackWeight(gheeSkuByCode[sku], pack.cases || 0, pack.loose || 0) + Number.EPSILON) * 100) / 100;
  if (crumbingSkuByCode[sku]) return Math.round((getCrumbingPackWeight(crumbingSkuByCode[sku], pack.cases || 0, pack.loose || 0) + Number.EPSILON) * 100) / 100;
  return Math.round((Math.max(0, pack.weightKg || pack.looseWeightKg || 0) + Number.EPSILON) * 100) / 100;
}

function packingSummary(round: ProductionRound) {
  return (round.packedSkus || [])
    .map(pack => {
      const sku = normalizeFinishedGoodsSku(pack.sku);
      const quantities = [
        `${Math.max(0, pack.cases || 0)} cs${paneerSkuByCode[sku]?.packMode === 'weight_loose' ? ` @ ${(pack.caseWeightKg ?? getDefaultPaneerCaseWeightKg(paneerSkuByCode[sku])).toFixed(2)} kg/case` : ''}`,
        pack.loose ? `${Math.max(0, pack.loose)} loose` : '',
      ].filter(Boolean).join(' + ');
      return `${sku}: ${quantities}`;
    })
    .join('; ');
}

function packingLocation(
  round: ProductionRound,
  packIndex: number,
  finishedStock: FinishedStockLot[],
) {
  const entry = getProductionPackingEntries([round]).find(candidate => candidate.packIndex === packIndex);
  if (!entry) return 'Dairy Container (Finished Stock)';
  const stock = finishedStock.find(candidate => candidate.packingRunId === entry.packingRunId)
    || finishedStock.find(candidate =>
      normalizeFinishedGoodsSku(candidate.sku) === entry.pack.sku
      && (candidate.sourceBatchCodes || []).includes(entry.sourceBatchCode)
    );
  return stock?.storageLocation || 'Dairy Container (Finished Stock)';
}

function paneerWorkbookSheet(
  rounds: ProductionRound[],
  metadata: ExcelSheet['metadata'],
  finishedStock: FinishedStockLot[],
  emptyMessage: string,
): ExcelSheet {
  const paneerRounds = sortedRounds(rounds.filter(round => round.type === 'D' || round.type === 'C/S'));
  const summaryColumns = [
    { key: 'shift', header: 'Shift', width: 9, numberFormat: '0' },
    { key: 'round', header: 'Round', width: 9, numberFormat: '0' },
    { key: 'batch', header: 'Batch Code', width: 25 },
    { key: 'type', header: 'Type', width: 10 },
    { key: 'status', header: 'Stage', width: 18 },
    { key: 'milkInputL', header: 'Milk Input L', width: 15, numberFormat: '0.00' },
    { key: 'outputKg', header: 'Paneer Output kg', width: 18, numberFormat: '0.00' },
    { key: 'creamKg', header: 'Cream Recovered kg', width: 20, numberFormat: '0.00' },
    { key: 'creamBuckets', header: 'Cream Bucket Weights kg', width: 30 },
    { key: 'cuttingType', header: 'Cutting Type', width: 18 },
    { key: 'clingBlocks', header: 'Clingwrapped Blocks', width: 19, numberFormat: '0' },
    { key: 'clingKg', header: 'Clingwrapped kg', width: 17, numberFormat: '0.00' },
    { key: 'clingWeights', header: 'Clingwrapped Weights kg', width: 30 },
    { key: 'finalBlocks', header: 'Final Blocks', width: 14, numberFormat: '0' },
    { key: 'finalKg', header: 'Final Block Weight kg', width: 21, numberFormat: '0.00' },
    { key: 'finalWeights', header: 'Final Block Weights kg', width: 30 },
    { key: 'packedSkus', header: 'Packed SKU Summary', width: 38 },
    { key: 'packedKg', header: 'Packed Weight kg', width: 18, numberFormat: '0.00' },
    { key: 'pan111Kg', header: 'PAN111 kg', width: 13, numberFormat: '0.00' },
    { key: 'sppKg', header: 'Sent to SPP kg', width: 16, numberFormat: '0.00' },
    { key: 'remainingKg', header: 'Remaining kg', width: 15, numberFormat: '0.00' },
    { key: 'started', header: 'Started At', width: 21 },
    { key: 'completed', header: 'Completed At', width: 21 },
    { key: 'team', header: 'Team', width: 24 },
  ];
  const summaryRows = paneerRounds.map(round => ({
    shift: round.shiftNumber,
    round: round.roundNumber,
    batch: productionBatchCode(round),
    type: round.type,
    status: round.status,
    milkInputL: getRoundMilkInput(round),
    outputKg: round.outputWeight || 0,
    creamKg: round.creamRecovered || 0,
    creamBuckets: (round.creamBucketWeights || []).map(weight => weight.toFixed(2)).join(', '),
    cuttingType: round.cuttingType || '',
    clingBlocks: round.storedNumberOfBlocks ?? round.storedBlockWeights?.length ?? 0,
    clingKg: round.storedOutputWeight ?? sum(round.storedBlockWeights),
    clingWeights: (round.storedBlockWeights || []).map(weight => weight.toFixed(2)).join(', '),
    finalBlocks: round.numberOfBlocks ?? round.blockWeights?.length ?? 0,
    finalKg: sum(round.blockWeights) || round.outputWeight || 0,
    finalWeights: (round.blockWeights || []).map(weight => weight.toFixed(2)).join(', '),
    packedSkus: packingSummary(round),
    packedKg: (round.packedSkus || []).reduce((total, pack) => total + packWeight(pack), 0),
    pan111Kg: roundPan111Weight(round),
    sppKg: round.sppRecordedWeight || 0,
    remainingKg: round.remainingBalance ?? '',
    started: excelDate(round.startTime),
    completed: excelDate(round.completedAt),
    team: (round.team || []).join(', '),
  }));
  const detailColumns = [
    { key: 'shift', header: 'Shift', width: 9, numberFormat: '0' },
    { key: 'round', header: 'Round', width: 9, numberFormat: '0' },
    { key: 'batch', header: 'Batch Code', width: 25 },
    { key: 'sku', header: 'SKU', width: 18 },
    { key: 'cases', header: 'Cases', width: 11, numberFormat: '0' },
    { key: 'caseWeightKg', header: 'Case Weight kg', width: 16, numberFormat: '0.00' },
    { key: 'loose', header: 'Loose Units', width: 13, numberFormat: '0' },
    { key: 'looseWeightKg', header: 'Loose Weight kg', width: 17, numberFormat: '0.00' },
    { key: 'weightKg', header: 'Calculated Weight kg', width: 21, numberFormat: '0.00' },
    { key: 'location', header: 'Current Location', width: 31 },
    { key: 'verified', header: 'Owner Verified', width: 15 },
    { key: 'verifiedBy', header: 'Verified By', width: 17 },
    { key: 'verifiedAt', header: 'Verified At', width: 21 },
  ];
  const detailRows = paneerRounds.flatMap(round => (round.packedSkus || []).map((pack, packIndex) => ({
    shift: round.shiftNumber,
    round: round.roundNumber,
    batch: productionBatchCode(round),
    sku: normalizeFinishedGoodsSku(pack.sku),
    cases: pack.cases || 0,
    caseWeightKg: pack.caseWeightKg ?? (paneerSkuByCode[pack.sku]?.packMode === 'weight_loose' ? getDefaultPaneerCaseWeightKg(paneerSkuByCode[pack.sku]) : ''),
    loose: pack.loose || 0,
    looseWeightKg: pack.looseWeightKg || 0,
    weightKg: packWeight(pack),
    location: packingLocation(round, packIndex, finishedStock),
    verified: Boolean(round.verifiedPackedSkus?.some(verified => normalizeFinishedGoodsSku(verified.sku) === normalizeFinishedGoodsSku(pack.sku))),
    verifiedBy: round.verifiedSkuBy || '',
    verifiedAt: excelDate(round.verifiedSkuAt),
  })));
  return {
    name: 'Paneer',
    title: `Production Board — Paneer — Lot ${metadata?.find(([label]) => label === 'Milk lot')?.[1] || ''}`,
    metadata: summaryRows.length ? metadata : [...(metadata || []), ['Record status', emptyMessage]],
    tableTitle: 'Round Summary — one row per production round',
    columns: summaryColumns,
    rows: summaryRows.length ? summaryRows : [{ shift: emptyMessage }],
    sections: [{
      title: 'SKU Packing Detail — one row per round and SKU',
      columns: detailColumns,
      rows: detailRows.length ? detailRows : [{ shift: 'No paneer SKU packing has been recorded' }],
    }],
  };
}

function gheeWorkbookSheet(
  rounds: ProductionRound[],
  metadata: ExcelSheet['metadata'],
  finishedStock: FinishedStockLot[],
  emptyMessage: string,
): ExcelSheet {
  const gheeRounds = sortedRounds(rounds.filter(round => round.type === 'Ghee'));
  const base = gheeSheet(gheeRounds, metadata);
  const summaryRows = gheeRounds.map((round, index) => ({
    ...base.rows[index],
    packedSkus: packingSummary(round),
    location: [...new Set((round.packedSkus || []).map((_, packIndex) => packingLocation(round, packIndex, finishedStock)))].join('; '),
  }));
  const summaryColumns = [
    ...base.columns.slice(0, 9),
    { key: 'packedSkus', header: 'Packed SKU Summary', width: 38 },
    ...base.columns.slice(9, 12),
    { key: 'location', header: 'Current Location', width: 31 },
    ...base.columns.slice(12),
  ];
  const detailColumns = [
    { key: 'date', header: 'Production Date', width: 17 },
    { key: 'batch', header: 'Ghee Batch', width: 25 },
    { key: 'sku', header: 'SKU', width: 18 },
    { key: 'cases', header: 'Cases', width: 11, numberFormat: '0' },
    { key: 'loose', header: 'Loose Buckets', width: 15, numberFormat: '0' },
    { key: 'weightKg', header: 'Packed Weight kg', width: 18, numberFormat: '0.00' },
    { key: 'location', header: 'Current Location', width: 31 },
  ];
  const detailRows = gheeRounds.flatMap(round => (round.packedSkus || []).map((pack, packIndex) => ({
    date: excelDate(round.roundDate || round.startTime),
    batch: productionBatchCode(round),
    sku: normalizeFinishedGoodsSku(pack.sku),
    cases: pack.cases || 0,
    loose: pack.loose || 0,
    weightKg: packWeight(pack),
    location: packingLocation(round, packIndex, finishedStock),
  })));
  return {
    name: 'Ghee',
    title: 'Production Board — Ghee Production and Packing',
    metadata: summaryRows.length ? metadata : [...(metadata || []), ['Record status', emptyMessage]],
    tableTitle: 'Ghee Batch Summary — one row per batch',
    columns: summaryColumns,
    rows: summaryRows.length ? summaryRows : [{ date: emptyMessage }],
    sections: [{
      title: 'Ghee SKU Packing Detail — one row per batch and SKU',
      columns: detailColumns,
      rows: detailRows.length ? detailRows : [{ date: 'No ghee SKU packing has been recorded' }],
    }],
  };
}

function roundLedgerSheet(
  rounds: ProductionRound[],
  title: string,
  metadata: ExcelSheet['metadata'],
  name = 'Round Ledger',
): ExcelSheet {
  return {
    name,
    title,
    metadata,
    columns: [
      { key: 'lot', header: 'Milk Lot', width: 14 },
      { key: 'shift', header: 'Shift', width: 9 },
      { key: 'round', header: 'Round', width: 9 },
      { key: 'batch', header: 'Batch Code', width: 25 },
      { key: 'type', header: 'Type', width: 13 },
      { key: 'status', header: 'Status', width: 18 },
      { key: 'started', header: 'Started At', width: 21 },
      { key: 'completed', header: 'Completed At', width: 21 },
      { key: 'plannedInput', header: 'Planned Input', width: 15, numberFormat: '0.00' },
      { key: 'accountableInput', header: 'Accountable Input', width: 17, numberFormat: '0.00' },
      { key: 'inputUnit', header: 'Input Unit', width: 11 },
      { key: 'sourceVessel', header: 'Vessel Allocation', width: 22 },
      { key: 'outputKg', header: 'Output kg', width: 13, numberFormat: '0.00' },
      { key: 'creamKg', header: 'Cream kg', width: 13, numberFormat: '0.00' },
      { key: 'pan111Kg', header: 'PAN111 kg', width: 13, numberFormat: '0.00' },
      { key: 'sppKg', header: 'SPP kg', width: 12, numberFormat: '0.00' },
      { key: 'remainingKg', header: 'Remaining kg', width: 15, numberFormat: '0.00' },
      { key: 'team', header: 'Team', width: 22 },
      { key: 'locked', header: 'Locked', width: 10 },
      { key: 'notes', header: 'Notes', width: 32 },
    ],
    rows: rounds
      .slice()
      .sort((a, b) => a.shiftNumber - b.shiftNumber || a.roundNumber - b.roundNumber)
      .map((round) => {
        const input = roundInput(round);
        const pan111Kg = round.pan111ApprovalStatus === 'approved'
          ? Math.max(0, round.pan111RequestedWeight || 0)
          : (round.packedSkus || []).filter(pack => pack.sku === 'PAN111').reduce((sum, pack) => sum + Math.max(0, pack.weightKg || 0), 0);
        return {
          lot: round.milkLotCode,
          shift: round.shiftNumber,
          round: round.roundNumber,
          batch: productionBatchCode(round),
          type: round.type,
          status: round.status,
          started: excelDate(round.startTime),
          completed: excelDate(round.completedAt),
          plannedInput: round.plannedInput,
          accountableInput: input.quantity,
          inputUnit: input.unit,
          sourceVessel: round.sourceVessel || 'Automatic allocation',
          outputKg: round.outputWeight || 0,
          creamKg: round.creamRecovered || 0,
          pan111Kg,
          sppKg: round.sppRecordedWeight || 0,
          remainingKg: round.remainingBalance ?? null,
          team: (round.team || []).join(', '),
          locked: round.locked,
          notes: round.notes || '',
        };
      }),
  };
}

function packingSheet(
  rounds: ProductionRound[],
  title: string,
  metadata: ExcelSheet['metadata'],
  name = 'Packed SKUs',
): ExcelSheet {
  const rows = rounds.flatMap(round => {
    const regular = (round.packedSkus || []).map((pack, index) => ({
      lot: round.milkLotCode,
      shift: round.shiftNumber,
      round: round.roundNumber,
      batch: productionBatchCode(round),
      sku: normalizeFinishedGoodsSku(pack.sku),
      entry: index + 1,
      cases: pack.cases || 0,
      loose: pack.loose || 0,
      looseWeightKg: pack.looseWeightKg || 0,
      totalWeightKg: packWeight(pack),
      verified: Boolean(round.verifiedPackedSkus?.some(verified => verified.sku === pack.sku)),
      verifiedBy: round.verifiedSkuBy || '',
      verifiedAt: excelDate(round.verifiedSkuAt),
      notes: pack.reason || '',
    }));
    const amassi = (round.amassiPacked || []).map((pack, index) => ({
      lot: round.milkLotCode,
      shift: round.shiftNumber,
      round: round.roundNumber,
      batch: productionBatchCode(round),
      sku: pack.sku,
      entry: regular.length + index + 1,
      cases: 0,
      loose: pack.bottles,
      looseWeightKg: 0,
      totalWeightKg: 0,
      verified: false,
      verifiedBy: '',
      verifiedAt: null,
      notes: 'Bottle quantity',
    }));
    return [...regular, ...amassi];
  });
  return {
    name,
    title,
    metadata,
    columns: [
      { key: 'lot', header: 'Milk Lot', width: 14 },
      { key: 'shift', header: 'Shift', width: 9 },
      { key: 'round', header: 'Round', width: 9 },
      { key: 'batch', header: 'Batch Code', width: 25 },
      { key: 'sku', header: 'SKU', width: 16 },
      { key: 'entry', header: 'Entry No.', width: 10 },
      { key: 'cases', header: 'Cases', width: 11, numberFormat: '0' },
      { key: 'loose', header: 'Loose Units', width: 13, numberFormat: '0' },
      { key: 'looseWeightKg', header: 'Loose Weight kg', width: 17, numberFormat: '0.00' },
      { key: 'totalWeightKg', header: 'Calculated Weight kg', width: 20, numberFormat: '0.00' },
      { key: 'verified', header: 'Verified', width: 11 },
      { key: 'verifiedBy', header: 'Verified By', width: 16 },
      { key: 'verifiedAt', header: 'Verified At', width: 21 },
      { key: 'notes', header: 'Notes', width: 26 },
    ],
    rows,
  };
}

function measurementSheet(rounds: ProductionRound[], metadata: ExcelSheet['metadata'], name = 'Weights'): ExcelSheet {
  const rows = rounds.flatMap(round => [
    ...(round.blockWeights || []).map((weight, index) => ({
      lot: round.milkLotCode,
      shift: round.shiftNumber,
      round: round.roundNumber,
      batch: productionBatchCode(round),
      measurement: 'Final block',
      sequence: index + 1,
      weightKg: weight,
      recordedBy: round.cutBy || '',
      recordedAt: excelDate(round.completedAt),
    })),
    ...(round.storedBlockWeights || []).map((weight, index) => ({
      lot: round.milkLotCode,
      shift: round.shiftNumber,
      round: round.roundNumber,
      batch: productionBatchCode(round),
      measurement: 'Clingwrapped block',
      sequence: index + 1,
      weightKg: weight,
      recordedBy: round.storedCutBy || '',
      recordedAt: excelDate(round.clingwrappedAt),
    })),
    ...(round.creamBucketWeights || []).map((weight, index) => ({
      lot: round.milkLotCode,
      shift: round.shiftNumber,
      round: round.roundNumber,
      batch: productionBatchCode(round),
      measurement: 'Cream bucket',
      sequence: index + 1,
      weightKg: weight,
      recordedBy: round.creamRecoveredBy || '',
      recordedAt: excelDate(round.creamRecoveredAt),
    })),
  ]);
  return {
    name,
    title: 'Production Board — Individual Weights',
    metadata,
    columns: [
      { key: 'lot', header: 'Milk Lot', width: 14 },
      { key: 'shift', header: 'Shift', width: 9 },
      { key: 'round', header: 'Round', width: 9 },
      { key: 'batch', header: 'Batch Code', width: 25 },
      { key: 'measurement', header: 'Measurement', width: 20 },
      { key: 'sequence', header: 'No.', width: 8, numberFormat: '0' },
      { key: 'weightKg', header: 'Weight kg', width: 14, numberFormat: '0.00' },
      { key: 'recordedBy', header: 'Recorded By', width: 18 },
      { key: 'recordedAt', header: 'Recorded At', width: 21 },
    ],
    rows,
  };
}

function crumbingBatchSheet(
  name: string,
  title: string,
  batches: CrumbingBatchExportRecord[],
  metadata: ExcelSheet['metadata'],
  emptyMessage: string,
): ExcelSheet {
  const sheet: ExcelSheet = {
    name,
    title,
    metadata,
    columns: [
      { key: 'batch', header: 'Batch Code', width: 24 },
      { key: 'source', header: 'Source Batch / Ingredient Trace', width: 30 },
      { key: 'origin', header: 'Manual Origin', width: 22 },
      { key: 'status', header: 'Current Stage', width: 19 },
      { key: 'sourceKg', header: 'Source kg', width: 13, numberFormat: '0.00' },
      { key: 'crumbedKg', header: 'Crumbed kg', width: 14, numberFormat: '0.00' },
      { key: 'balanceKg', header: 'Balance kg', width: 14, numberFormat: '0.00' },
      { key: 'wastageKg', header: 'Wastage kg', width: 14, numberFormat: '0.00' },
      { key: 'traysCrumbed', header: 'Trays Crumbed', width: 15, numberFormat: '0' },
      { key: 'traysFried', header: 'Trays Fried', width: 13, numberFormat: '0' },
      { key: 'traysRemaining', header: 'Trays Remaining', width: 17, numberFormat: '0' },
      { key: 'traysPacked', header: 'Trays Packed', width: 14, numberFormat: '0' },
      { key: 'predustKg', header: 'Predust kg', width: 14, numberFormat: '0.000' },
      { key: 'iyababKg', header: 'Iyabab kg', width: 14, numberFormat: '0.000' },
      { key: 'batterKg', header: 'Batter Mix kg', width: 16, numberFormat: '0.000' },
      { key: 'waterL', header: 'Batter Water L', width: 17, numberFormat: '0.000' },
      { key: 'adajioKg', header: 'Adajio kg', width: 14, numberFormat: '0.000' },
      { key: 'packedSkus', header: 'Packed SKUs', width: 34 },
      { key: 'packedCases', header: 'Packed Cases', width: 14, numberFormat: '0' },
      { key: 'packedLoose', header: 'Loose Units', width: 13, numberFormat: '0' },
      { key: 'packedWeightKg', header: 'Packed Weight kg', width: 18, numberFormat: '0.00' },
      { key: 'jpBuckets', header: 'JP Buckets', width: 12, numberFormat: '0' },
      { key: 'jpGood', header: 'JP Good Pieces', width: 16, numberFormat: '0' },
      { key: 'jpPrepDamaged', header: 'JP Prep Damaged', width: 17, numberFormat: '0' },
      { key: 'jpCrumbable', header: 'JP Crumbable Pieces', width: 20, numberFormat: '0' },
      { key: 'pan111Kg', header: 'PAN111 kg', width: 13, numberFormat: '0.00' },
      { key: 'creamKg', header: 'Cream kg', width: 12, numberFormat: '0.000' },
      { key: 'pepperKg', header: 'Black Pepper kg', width: 17, numberFormat: '0.000' },
      { key: 'saltKg', header: 'Salt kg', width: 12, numberFormat: '0.000' },
      { key: 'creamCheeseAvailableKg', header: 'Cream Cheese Available kg', width: 24, numberFormat: '0.00' },
      { key: 'fillingDamaged', header: 'Filling Damaged Pieces', width: 22, numberFormat: '0' },
      { key: 'filledPieces', header: 'Filled Pieces', width: 14, numberFormat: '0' },
      { key: 'traysFilled', header: 'Trays Filled', width: 13, numberFormat: '0' },
      { key: 'crumbingDamaged', header: 'Crumbing Damaged Pieces', width: 24, numberFormat: '0' },
      { key: 'finalCrumbedPieces', header: 'Final Crumbed Pieces', width: 21, numberFormat: '0' },
      { key: 'createdAt', header: 'Created At', width: 21 },
      { key: 'notes', header: 'Notes', width: 30 },
    ],
    rows: batches.map(batch => {
      const packs = batch.packedSkus || [];
      return {
        batch: batch.batchCode,
        source: batch.sourceBatchCode,
        origin: batch.origin || '',
        status: batch.status,
        sourceKg: batch.sourceWeightKg ?? '',
        crumbedKg: batch.weightCrumbedKg ?? '',
        balanceKg: batch.balanceWeightKg ?? '',
        wastageKg: batch.wastageKg ?? '',
        traysCrumbed: batch.traysCrumbed,
        traysFried: batch.traysFried,
        traysRemaining: batch.traysRemaining,
        traysPacked: batch.traysPacked,
        predustKg: batch.jpCrumbing?.predustKg ?? batch.recipe?.flavourPredustKg ?? 0,
        iyababKg: batch.recipe?.flavourIyababKg ?? 0,
        batterKg: batch.jpCrumbing?.batterMixKg ?? batch.recipe?.batterIyababaKg ?? 0,
        waterL: batch.jpCrumbing?.batterWaterL ?? batch.recipe?.batterWaterL ?? 0,
        adajioKg: batch.jpCrumbing?.adajioKg ?? batch.recipe?.breadingAdajioKg ?? 0,
        packedSkus: packs.map(pack => `${normalizeFinishedGoodsSku(pack.sku)}: ${pack.cases || 0} cs${pack.loose ? ` + ${pack.loose} loose` : ''}`).join('; '),
        packedCases: packs.reduce((total, pack) => total + Math.max(0, pack.cases || 0), 0),
        packedLoose: packs.reduce((total, pack) => total + Math.max(0, pack.loose || 0), 0),
        packedWeightKg: packs.reduce((total, pack) => total + packWeight(pack), 0),
        jpBuckets: batch.jpPrepping?.buckets.length ?? '',
        jpGood: batch.jpPrepping?.goodPieces ?? '',
        jpPrepDamaged: batch.jpPrepping?.damagedPieces ?? '',
        jpCrumbable: batch.jpPrepping?.crumbablePieces ?? '',
        pan111Kg: batch.jpPrepping?.pan111InputKg ?? '',
        creamKg: batch.jpPrepping?.creamKg ?? '',
        pepperKg: batch.jpPrepping?.blackPepperKg ?? '',
        saltKg: batch.jpPrepping?.saltKg ?? '',
        creamCheeseAvailableKg: batch.jpPrepping?.totalCreamCheeseAvailableKg ?? '',
        fillingDamaged: batch.jpFilling?.damagedPieces ?? '',
        filledPieces: batch.jpFilling?.filledPieces ?? '',
        traysFilled: batch.jpFilling?.traysFilled ?? '',
        crumbingDamaged: batch.jpCrumbing?.damagedPieces ?? '',
        finalCrumbedPieces: batch.jpCrumbing?.finalCrumbedPieces ?? '',
        createdAt: excelDate(batch.createdAt),
        notes: batch.notes || '',
      };
    }),
  };
  return withNoRecords(sheet, emptyMessage);
}

function crumbingSheets(
  batches: CrumbingBatchExportRecord[],
  lot: MilkLot,
  lotRounds: ProductionRound[],
): ExcelSheet[] {
  const roundIds = new Set(lotRounds.map(round => round.id));
  const matchesLotCode = (value: string) => value.includes(lot.lotCode);
  const sppBatches = batches.filter(batch => batch.type === 'SPP' && (
    roundIds.has(batch.sourceBatchId) || matchesLotCode(batch.sourceBatchCode || '')
  ));
  // JP is a standalone product register. PAN111 is ingredient traceability,
  // not ownership by a milk lot, so every JP batch remains visible here.
  const jpBatches = batches.filter(batch => batch.type === 'JP');
  const hcpBatches = batches.filter(batch => batch.type === 'HCP' && (
    batch.sourceBatchId === lot.id || matchesLotCode(batch.sourceBatchCode || '')
  ));
  const lotMetadata: ExcelSheet['metadata'] = [
    ...exportedAtMetadata(),
    ['Milk lot', lot.lotCode],
  ];
  const jpMetadata: ExcelSheet['metadata'] = [
    ...exportedAtMetadata(),
    ['Scope', 'Standalone JP production register; not filtered by milk lot'],
    ['PAN111 source', 'Shown only as ingredient traceability where recorded'],
  ];
  const jpBuckets: ExcelSheet = withNoRecords({
    name: 'JP Bucket Detail',
    title: 'Production Board — Standalone JP Jalapeño Bucket Inspection',
    metadata: jpMetadata,
    columns: [
      { key: 'batch', header: 'JP Batch Code', width: 24 },
      { key: 'bucket', header: 'Bucket', width: 10, numberFormat: '0' },
      { key: 'nominalKg', header: 'Nominal kg', width: 13, numberFormat: '0.00' },
      { key: 'rawKg', header: 'Raw kg', width: 12, numberFormat: '0.00' },
      { key: 'drainedKg', header: 'Drained kg', width: 13, numberFormat: '0.00' },
      { key: 'good', header: 'Good Pieces', width: 14, numberFormat: '0' },
      { key: 'damaged', header: 'Damaged Pieces', width: 17, numberFormat: '0' },
      { key: 'total', header: 'Total Pieces', width: 14, numberFormat: '0' },
    ],
    rows: jpBatches.flatMap(batch => (batch.jpPrepping?.buckets || []).map((bucket, index) => ({
      batch: batch.batchCode,
      bucket: index + 1,
      nominalKg: bucket.nominalWeightKg,
      rawKg: bucket.rawWeightKg,
      drainedKg: bucket.drainedWeightKg,
      good: bucket.goodPieces,
      damaged: bucket.damagedPieces,
      total: bucket.totalPieces,
    }))),
  }, 'No JP bucket inspection records have been recorded');

  return [
    crumbingBatchSheet('SPP Crumbing', `Production Board — SPP Crumbing — Lot ${lot.lotCode}`, sppBatches, lotMetadata, `No SPP crumbing batches recorded for milk lot ${lot.lotCode}`),
    crumbingBatchSheet('JP Crumbing Standalone', 'Production Board — Standalone JP Production Register', jpBatches, jpMetadata, 'No standalone JP production batches have been recorded'),
    jpBuckets,
    crumbingBatchSheet('HCP Crumbing', `Production Board — HCP Crumbing — Lot ${lot.lotCode}`, hcpBatches, lotMetadata, `No HCP crumbing batches recorded for milk lot ${lot.lotCode}`),
  ];
}

function crumbingWorkbookSheet(
  batches: CrumbingBatchExportRecord[],
  lot: MilkLot,
  lotRounds: ProductionRound[],
): ExcelSheet {
  const [spp, jp, jpBuckets, hcp] = crumbingSheets(batches, lot, lotRounds);
  return {
    name: 'Crumbing',
    title: `Production Board — Crumbing — Lot ${lot.lotCode}`,
    metadata: [
      ...exportedAtMetadata(),
      ['Milk lot', lot.lotCode],
      ['JP scope', 'Standalone JP register; JP is not filtered by milk lot'],
    ],
    tableTitle: 'SPP Crumbing',
    columns: spp.columns,
    rows: spp.rows,
    sections: [
      { title: 'JP Crumbing — standalone register', columns: jp.columns, rows: jp.rows },
      { title: 'JP Jalapeño Bucket Inspection', columns: jpBuckets.columns, rows: jpBuckets.rows },
      { title: 'HCP Crumbing', columns: hcp.columns, rows: hcp.rows },
    ],
  };
}

export function buildProductionBoardWorkbook(input: {
  lot: MilkLot;
  shifts: ProductionShift[];
  rounds: ProductionRound[];
  cipRecords: CipRecord[];
  crumbingBatches?: CrumbingBatchExportRecord[];
  finishedStock?: FinishedStockLot[];
}): ExcelWorkbookExport {
  const { lot } = input;
  const lotRounds = input.rounds.filter(round => round.milkLotId === lot.id || round.milkLotCode === lot.lotCode);
  const paneerRounds = lotRounds.filter(round => round.type === 'D' || round.type === 'C/S');
  const finishedStock = input.finishedStock || [];
  const metadata: ExcelSheet['metadata'] = [
    ...exportedAtMetadata(),
    ['Milk lot', lot.lotCode],
    ['Scope', 'All records for the selected milk lot; on-screen filters do not remove rows'],
  ];
  return {
    filename: `vejoy-production-board-${lot.lotCode}-${exportDateStamp()}.xlsx`,
    sheets: [
      paneerWorkbookSheet(paneerRounds, metadata, finishedStock, `No paneer rounds recorded for milk lot ${lot.lotCode}`),
      butterWorkbookSheet(lotRounds, metadata, finishedStock, `No butter production recorded for milk lot ${lot.lotCode}`),
      gheeWorkbookSheet(lotRounds, metadata, finishedStock, `No ghee production recorded for milk lot ${lot.lotCode}`),
      withNoRecords(halloumiSheet(lotRounds, metadata), `No Halloumi production recorded for milk lot ${lot.lotCode}`),
      withNoRecords(amassiSheet(lotRounds, metadata), `No Amassi production recorded for milk lot ${lot.lotCode}`),
      crumbingWorkbookSheet(input.crumbingBatches || [], lot, lotRounds),
    ],
  };
}

export async function exportProductionBoardWorkbook(input: Parameters<typeof buildProductionBoardWorkbook>[0]) {
  await exportExcelWorkbook(buildProductionBoardWorkbook(input));
}

function packedSkuSummary(lot: MilkLot, rounds: ProductionRound[]) {
  const boardEntries = getProductionPackingEntries(rounds)
    .filter(({ round }) => round.milkLotId === lot.id || round.milkLotCode === lot.lotCode)
    .map(({ pack }) => pack);
  const entries = boardEntries.length > 0 ? boardEntries : (lot.packedSkus || []);
  const summary = new Map<string, { sku: string; cases: number; loose: number; looseWeightKg: number; weightKg: number; caseWeights: Record<string, number> }>();
  entries.forEach(entry => {
    const sku = normalizeFinishedGoodsSku(entry.sku);
    const current = summary.get(sku) || { sku, cases: 0, loose: 0, looseWeightKg: 0, weightKg: 0, caseWeights: {} };
    current.cases += entry.cases || 0;
    if (paneerSkuByCode[sku]?.packMode === 'weight_loose' && (entry.cases || 0) > 0) {
      const caseWeight = entry.caseWeightKg ?? getDefaultPaneerCaseWeightKg(paneerSkuByCode[sku]);
      const key = caseWeight.toFixed(2);
      current.caseWeights[key] = (current.caseWeights[key] || 0) + (entry.cases || 0);
    }
    current.loose += entry.loose || 0;
    current.looseWeightKg += entry.looseWeightKg || 0;
    current.weightKg += packWeight(entry);
    summary.set(sku, current);
  });
  return [...summary.values()];
}

function roundPan111Weight(round: ProductionRound) {
  if (round.pan111ApprovalStatus === 'approved') {
    return Math.max(0, round.pan111RequestedWeight || 0);
  }
  return (round.packedSkus || [])
    .filter(pack => normalizeFinishedGoodsSku(pack.sku) === 'PAN111')
    .reduce((total, pack) => total + Math.max(0, pack.weightKg || 0), 0);
}

function roundPackingAudit(round: ProductionRound) {
  const packs = (round.packedSkus || []).filter(pack => normalizeFinishedGoodsSku(pack.sku) !== 'PAN111');
  const verifiedPacks = (round.verifiedPackedSkus || []).filter(pack => normalizeFinishedGoodsSku(pack.sku) !== 'PAN111');
  const describe = (entries: typeof packs) => entries
    .map(pack => {
      const sku = normalizeFinishedGoodsSku(pack.sku);
      const quantities = [
        `${Math.max(0, pack.cases || 0)} cs`,
        pack.loose ? `${Math.max(0, pack.loose)} loose` : '',
      ].filter(Boolean).join(' + ');
      return `${sku}: ${quantities}`;
    })
    .join('; ');

  return {
    description: describe(packs),
    cases: packs.reduce((total, pack) => total + Math.max(0, pack.cases || 0), 0),
    loose: packs.reduce((total, pack) => total + Math.max(0, pack.loose || 0), 0),
    weightKg: packs.reduce((total, pack) => total + packWeight(pack), 0),
    verifiedDescription: describe(verifiedPacks),
    verifiedWeightKg: verifiedPacks.reduce((total, pack) => total + packWeight(pack), 0),
    hasVerification: round.verifiedPackedSkus !== undefined,
  };
}

function milkLotAuditSheet(
  lot: MilkLot,
  lotRounds: ProductionRound[],
  metadata: ExcelSheet['metadata'],
): ExcelSheet {
  return {
    name: 'Milk Lot Audit',
    title: `Milk Receiving — Complete Lot Audit — Lot ${lot.lotCode}`,
    metadata,
    columns: [
      { key: 'shift', header: 'Shift', width: 9, numberFormat: '0' },
      { key: 'round', header: 'Round', width: 9, numberFormat: '0' },
      { key: 'batch', header: 'Batch Code', width: 25 },
      { key: 'type', header: 'Product / Process', width: 18 },
      { key: 'status', header: 'Current Stage', width: 18 },
      { key: 'milkInputL', header: 'Milk Input L', width: 15, numberFormat: '0.00' },
      { key: 'outputKg', header: 'Recorded Output kg', width: 19, numberFormat: '0.00' },
      { key: 'yieldKg100L', header: 'Yield kg / 100 L', width: 18, numberFormat: '0.00' },
      { key: 'yieldLKg', header: 'Yield L / kg', width: 15, numberFormat: '0.00' },
      { key: 'creamKg', header: 'Cream Recovered kg', width: 19, numberFormat: '0.00' },
      { key: 'blocks', header: 'Blocks', width: 10, numberFormat: '0' },
      { key: 'blockWeightKg', header: 'Block Weight Total kg', width: 21, numberFormat: '0.00' },
      { key: 'packedSkus', header: 'SKUs Packed on Board', width: 38 },
      { key: 'packedCases', header: 'Packed Cases', width: 14, numberFormat: '0' },
      { key: 'packedLoose', header: 'Loose Units', width: 13, numberFormat: '0' },
      { key: 'packedWeightKg', header: 'Recorded Packed Weight kg', width: 24, numberFormat: '0.00' },
      { key: 'verifiedWeightKg', header: 'Verified Packed Weight kg', width: 23, numberFormat: '0.00' },
      { key: 'pan111Kg', header: 'PAN111 kg', width: 13, numberFormat: '0.00' },
      { key: 'sppKg', header: 'Sent to SPP kg', width: 16, numberFormat: '0.00' },
      { key: 'remainingKg', header: 'Remaining kg', width: 15, numberFormat: '0.00' },
      { key: 'started', header: 'Started At', width: 21 },
      { key: 'completed', header: 'Completed At', width: 21 },
      { key: 'team', header: 'Team', width: 24 },
    ],
    rows: sortedRounds(lotRounds).map(round => {
      const milkInput = isMilkProductionRound(round) ? getRoundMilkInput(round) : 0;
      const outputKg = Math.max(0, round.outputWeight || round.butterOutput || 0);
      const packing = roundPackingAudit(round);
      const hasBlocks = (round.blockWeights || []).length > 0;
      return {
        shift: round.shiftNumber,
        round: round.roundNumber,
        batch: productionBatchCode(round),
        type: round.type,
        status: round.status,
        milkInputL: isMilkProductionRound(round) ? milkInput : '',
        outputKg,
        yieldKg100L: milkInput > 0 && outputKg > 0 ? (outputKg / milkInput) * 100 : '',
        yieldLKg: milkInput > 0 && outputKg > 0 ? milkInput / outputKg : '',
        creamKg: round.creamRecovered || 0,
        blocks: round.numberOfBlocks ?? round.blockWeights?.length ?? 0,
        blockWeightKg: hasBlocks ? sum(round.blockWeights) : '',
        packedSkus: packing.description,
        packedCases: packing.cases,
        packedLoose: packing.loose,
        packedWeightKg: packing.weightKg,
        verifiedWeightKg: packing.hasVerification ? packing.verifiedWeightKg : '',
        pan111Kg: roundPan111Weight(round),
        sppKg: round.sppRecordedWeight || 0,
        remainingKg: round.remainingBalance ?? '',
        started: excelDate(round.startTime),
        completed: excelDate(round.completedAt),
        team: (round.team || []).join(', '),
      };
    }),
  };
}

function weightReconciliationSheet(
  lot: MilkLot,
  lotRounds: ProductionRound[],
  metadata: ExcelSheet['metadata'],
): ExcelSheet {
  const paneerRounds = sortedRounds(lotRounds.filter(round => round.type === 'D' || round.type === 'C/S'));
  const reportAvailable = Boolean(lot.productionClosed);
  return {
    name: 'Weight Reconciliation',
    title: `Milk Receiving — Paneer Weight Reconciliation — Lot ${lot.lotCode}`,
    metadata: [
      ...(metadata || []),
      ['Accounted output formula', 'Packed weight (verified when available) + PAN111 + SPP + remaining balance'],
      ['Variance formula', 'Final block weight total minus accounted output'],
      ['Block vs packed report', reportAvailable ? '(Final block weight - PAN111 weight) - recorded packed weight' : 'Available after the milk lot is closed'],
    ],
    columns: [
      { key: 'shift', header: 'Shift', width: 9, numberFormat: '0' },
      { key: 'round', header: 'Round', width: 9, numberFormat: '0' },
      { key: 'batch', header: 'Batch Code', width: 25 },
      { key: 'type', header: 'Type', width: 10 },
      { key: 'milkInputL', header: 'Milk Input L', width: 15, numberFormat: '0.00' },
      { key: 'recordedOutputKg', header: 'Recorded Output kg', width: 19, numberFormat: '0.00' },
      { key: 'blocks', header: 'Final Blocks', width: 13, numberFormat: '0' },
      { key: 'blockWeightKg', header: 'Final Block Weight kg', width: 21, numberFormat: '0.00' },
      { key: 'packableAfterPan111Kg', header: 'Block Weight - PAN111 kg', width: 23, numberFormat: '0.00' },
      { key: 'blockVsPackedDifferenceKg', header: 'Block - PAN111 - Packed kg', width: 25, numberFormat: '0.00' },
      { key: 'blockVsPackedCheck', header: 'Block vs Packed Check', width: 29 },
      { key: 'outputBlockVarianceKg', header: 'Blocks - Output kg', width: 19, numberFormat: '0.00' },
      { key: 'recordedPackedKg', header: 'Recorded Packed kg', width: 19, numberFormat: '0.00' },
      { key: 'verifiedPackedKg', header: 'Verified Packed kg', width: 19, numberFormat: '0.00' },
      { key: 'packingBasis', header: 'Packing Basis Used', width: 20 },
      { key: 'pan111Kg', header: 'PAN111 kg', width: 13, numberFormat: '0.00' },
      { key: 'sppKg', header: 'SPP kg', width: 12, numberFormat: '0.00' },
      { key: 'remainingKg', header: 'Remaining kg', width: 15, numberFormat: '0.00' },
      { key: 'accountedOutputKg', header: 'Accounted Output kg', width: 20, numberFormat: '0.00' },
      { key: 'varianceKg', header: 'Unreconciled Variance kg', width: 22, numberFormat: '0.00' },
      { key: 'packedSkus', header: 'Recorded SKU Detail', width: 38 },
      { key: 'verifiedSkus', header: 'Verified SKU Detail', width: 38 },
    ],
    rows: paneerRounds.map(round => {
      const packing = roundPackingAudit(round);
      const hasBlocks = (round.blockWeights || []).length > 0;
      const blockWeightKg = sum(round.blockWeights);
      const packingWeight = packing.hasVerification ? packing.verifiedWeightKg : packing.weightKg;
      const pan111Kg = roundPan111Weight(round);
      const blockVsPacked = reportAvailable && hasBlocks
        ? comparePaneerBlockToPackedWeight(blockWeightKg, pan111Kg, packing.weightKg)
        : undefined;
      const sppKg = Math.max(0, round.sppRecordedWeight || 0);
      const remainingKg = Math.max(0, round.remainingBalance || 0);
      const accountedOutputKg = packingWeight + pan111Kg + sppKg + remainingKg;
      return {
        shift: round.shiftNumber,
        round: round.roundNumber,
        batch: productionBatchCode(round),
        type: round.type,
        milkInputL: getRoundMilkInput(round),
        recordedOutputKg: round.outputWeight || 0,
        blocks: round.numberOfBlocks ?? round.blockWeights?.length ?? 0,
        blockWeightKg: hasBlocks ? blockWeightKg : '',
        packableAfterPan111Kg: blockVsPacked?.packableWeightKg ?? '',
        blockVsPackedDifferenceKg: blockVsPacked?.differenceKg ?? '',
        blockVsPackedCheck: !reportAvailable
          ? 'Report available after milk is closed'
          : !hasBlocks
            ? 'No block weight recorded'
          : Math.abs(blockVsPacked!.differenceKg) <= 0.01
            ? 'Balanced'
            : blockVsPacked!.differenceKg > 0
              ? 'Weight not packed / investigate'
              : 'Packed above available / investigate',
        outputBlockVarianceKg: hasBlocks ? blockWeightKg - Math.max(0, round.outputWeight || 0) : '',
        recordedPackedKg: packing.weightKg,
        verifiedPackedKg: packing.hasVerification ? packing.verifiedWeightKg : '',
        packingBasis: packing.hasVerification ? 'Owner-verified' : 'Recorded on board',
        pan111Kg,
        sppKg,
        remainingKg: round.remainingBalance ?? '',
        accountedOutputKg,
        varianceKg: hasBlocks ? blockWeightKg - accountedOutputKg : '',
        packedSkus: packing.description,
        verifiedSkus: packing.verifiedDescription,
      };
    }),
  };
}

export function buildMilkReceivingWorkbook(lot: MilkLot, rounds: ProductionRound[]): ExcelWorkbookExport {
  const accounting = getMilkLotAccounting(lot, rounds);
  const production = getMilkLotProductionReconciliation(lot, rounds);
  const vesselAllocation = getMilkLotVesselBalances(lot, rounds);
  const lotRounds = rounds.filter(round => round.milkLotId === lot.id || round.milkLotCode === lot.lotCode);
  const skuTotals = packedSkuSummary(lot, rounds);
  const activeRounds = lotRounds.filter(round => !['scheduled', 'cancelled'].includes(round.status));
  const metadata: ExcelSheet['metadata'] = [
    ...exportedAtMetadata(),
    ['Milk lot', lot.lotCode],
    ['Supplier', lot.supplier],
    ['Milk received L', lot.litresReceived],
    ['Used in production L', accounting.consumed],
    ['Milk sold L', accounting.sold],
    ['Rejected milk L', lot.litresRejected],
    ['Spilled milk L', lot.litresSpilled],
    ['Milk remaining L', accounting.remaining],
    ['Milk overdraw L', accounting.overdraw],
    ['Rounds started / recorded', activeRounds.length],
    ['Completed output rounds', production.completedRounds],
    ['D paneer rounds', production.dRounds],
    ['C/S paneer rounds', production.csRounds],
    ['Paneer recorded kg', production.paneerRecorded],
    ['Paneer input L', production.paneerInputLitres],
    ['Paneer yield kg / 100 L', production.paneerYieldPer100L],
    ['Paneer yield L / kg', production.yieldLPerKg],
    ['Cream recovered kg', production.cream],
    ['PAN111 recovered kg', production.pan111],
    ['Paneer sent to SPP kg', production.paneerForSpp],
    ['Packed cases on board', skuTotals.reduce((total, sku) => total + sku.cases, 0)],
    ['Calculated packed weight kg', skuTotals.reduce((total, sku) => total + sku.weightKg, 0)],
  ];
  const receiptSheet: ExcelSheet = {
    name: 'Receipt Summary',
    title: `Milk Receiving — Lot ${lot.lotCode}`,
    metadata,
    columns: [
      { key: 'lot', header: 'Milk Lot', width: 14 },
      { key: 'receiptDate', header: 'Receipt Date', width: 15 },
      { key: 'receiptTime', header: 'Receipt Time', width: 14 },
      { key: 'supplier', header: 'Supplier', width: 24 },
      { key: 'invoice', header: 'Invoice', width: 18 },
      { key: 'deliveryNote', header: 'Delivery Note', width: 18 },
      { key: 'receivedL', header: 'Received L', width: 14, numberFormat: '0.00' },
      { key: 'productionL', header: 'Used in Production L', width: 20, numberFormat: '0.00' },
      { key: 'soldL', header: 'Sold L', width: 12, numberFormat: '0.00' },
      { key: 'rejectedL', header: 'Rejected L', width: 14, numberFormat: '0.00' },
      { key: 'spilledL', header: 'Spilled L', width: 13, numberFormat: '0.00' },
      { key: 'remainingL', header: 'Left / Unallocated L', width: 20, numberFormat: '0.00' },
      { key: 'overdrawL', header: 'Overdraw L', width: 14, numberFormat: '0.00' },
      { key: 'status', header: 'Status', width: 14 },
    ],
    rows: [{
      lot: lot.lotCode,
      receiptDate: excelDate(lot.receiptDate),
      receiptTime: lot.receiptTime || '',
      supplier: lot.supplier,
      invoice: lot.invoiceNo || '',
      deliveryNote: lot.deliveryNoteNo || '',
      receivedL: lot.litresReceived,
      productionL: accounting.consumed,
      soldL: accounting.sold,
      rejectedL: lot.litresRejected,
      spilledL: lot.litresSpilled,
      remainingL: accounting.remaining,
      overdrawL: accounting.overdraw,
      status: lot.productionClosed ? 'Production closed' : lot.status,
    }],
  };
  const reconciliationSheet: ExcelSheet = {
    name: 'Product Reconciliation',
    title: `Milk Receiving — Product Reconciliation — Lot ${lot.lotCode}`,
    metadata,
    columns: [
      { key: 'paneerKg', header: 'Paneer Recorded kg', width: 20, numberFormat: '0.00' },
      { key: 'paneerInputL', header: 'Paneer Input L', width: 17, numberFormat: '0.00' },
      { key: 'litresPerKg', header: 'Yield L/kg', width: 14, numberFormat: '0.00' },
      { key: 'kgPer100L', header: 'Paneer kg/100 L', width: 18, numberFormat: '0.00' },
      { key: 'dRounds', header: 'D Rounds', width: 12, numberFormat: '0' },
      { key: 'csRounds', header: 'C/S Rounds', width: 12, numberFormat: '0' },
      { key: 'creamKg', header: 'Cream kg', width: 13, numberFormat: '0.00' },
      { key: 'pan111Kg', header: 'PAN111 kg', width: 13, numberFormat: '0.00' },
      { key: 'sppKg', header: 'Paneer for SPP kg', width: 18, numberFormat: '0.00' },
      { key: 'completedRounds', header: 'Completed Rounds', width: 18, numberFormat: '0' },
    ],
    rows: [{
      paneerKg: production.paneerRecorded,
      paneerInputL: production.paneerInputLitres,
      litresPerKg: production.yieldLPerKg,
      kgPer100L: production.paneerYieldPer100L,
      dRounds: production.dRounds,
      csRounds: production.csRounds,
      creamKg: production.cream,
      pan111Kg: production.pan111,
      sppKg: production.paneerForSpp,
      completedRounds: production.completedRounds,
    }],
  };
  const skuSheet: ExcelSheet = {
    name: 'SKU Packed on Board',
    title: `Milk Receiving — SKU Packed on Board — Lot ${lot.lotCode}`,
    metadata,
    columns: [
      { key: 'sku', header: 'SKU', width: 16 },
      { key: 'cases', header: 'Cases', width: 12, numberFormat: '0' },
      { key: 'caseBreakdown', header: 'Cases by Weight', width: 26 },
      { key: 'loose', header: 'Loose Units', width: 14, numberFormat: '0' },
      { key: 'looseWeightKg', header: 'Loose Weight kg', width: 17, numberFormat: '0.00' },
      { key: 'weightKg', header: 'Calculated Weight kg', width: 20, numberFormat: '0.00' },
    ],
    rows: skuTotals.map(({ caseWeights, ...row }) => ({
      ...row,
      caseBreakdown: Object.entries(caseWeights || {}).map(([weight, cases]) => `${cases} × ${weight} kg`).join('; '),
    })),
  };
  const salesSheet: ExcelSheet = {
    name: 'Milk Sales',
    title: `Milk Receiving — Milk Sales — Lot ${lot.lotCode}`,
    metadata,
    columns: [
      { key: 'date', header: 'Sale Date', width: 15 },
      { key: 'customer', header: 'Customer', width: 25 },
      { key: 'source', header: 'Deducted From', width: 20 },
      { key: 'quantityL', header: 'Quantity L', width: 15, numberFormat: '0.00' },
    ],
    rows: (lot.milkSales || []).map(sale => {
      const source = sale.sourceVessel || getMilkSaleVesselSource(sale.quantity);
      const sourceLabel = sale.sourceAllocations?.length
        ? sale.sourceAllocations.map(allocation => {
          const vesselLabel = milkStorageVessels.find(vessel => vessel.id === allocation.vesselId)?.label || allocation.vesselId;
          return `${allocation.quantity} L ${vesselLabel}`;
        }).join(' + ')
        : source === 'ibc' ? 'IBC stock' : source === 'auxiliary' ? 'Auxiliary storage' : 'Legacy / unassigned';
      return {
        date: excelDate(sale.saleDate),
        customer: sale.customer,
        source: sourceLabel,
        quantityL: sale.quantity,
      };
    }),
  };
  const vesselSheet: ExcelSheet = {
    name: 'Vessel Allocation',
    title: `Milk Receiving — Automatic Vessel Allocation — Lot ${lot.lotCode}`,
    metadata: [...metadata, ['Allocation shortfall L', vesselAllocation.ruleShortfallLitres]],
    columns: [
      { key: 'vessel', header: 'Vessel / Location', width: 30 },
      { key: 'capacityL', header: 'Capacity L', width: 14, numberFormat: '0.00' },
      { key: 'openingL', header: 'Opening L', width: 14, numberFormat: '0.00' },
      { key: 'productionL', header: 'Production Draw L', width: 19, numberFormat: '0.00' },
      { key: 'salesL', header: 'Sales Draw L', width: 16, numberFormat: '0.00' },
      { key: 'otherL', header: 'Other Draw L', width: 15, numberFormat: '0.00' },
      { key: 'remainingL', header: 'Remaining L', width: 15, numberFormat: '0.00' },
    ],
    rows: vesselAllocation.vessels.map(vessel => ({
      vessel: vessel.label,
      capacityL: vessel.capacity,
      openingL: vessel.openingLitres,
      productionL: vessel.productionDrawLitres,
      salesL: vessel.salesDrawLitres,
      otherL: vessel.otherDrawLitres,
      remainingL: vessel.litres,
    })),
  };
  return {
    filename: `vejoy-milk-receiving-${lot.lotCode}-${exportDateStamp()}.xlsx`,
    sheets: [
      milkLotAuditSheet(lot, lotRounds, metadata),
      weightReconciliationSheet(lot, lotRounds, metadata),
      skuSheet,
      receiptSheet,
      reconciliationSheet,
      vesselSheet,
      roundLedgerSheet(lotRounds, `Milk Receiving — Round Ledger — Lot ${lot.lotCode}`, metadata),
      creamSheet(lotRounds, metadata),
      packingSheet(lotRounds, `Milk Receiving — Packing Entries — Lot ${lot.lotCode}`, metadata),
      measurementSheet(lotRounds, metadata),
      salesSheet,
    ],
  };
}

export async function exportMilkReceivingWorkbook(lot: MilkLot, rounds: ProductionRound[]) {
  await exportExcelWorkbook(buildMilkReceivingWorkbook(lot, rounds));
}

export async function exportReconciliationWorkbook(input: {
  lot: MilkLot;
  rounds: ProductionRound[];
  wasteEvents: WasteEvent[];
}) {
  const { lot, rounds, wasteEvents } = input;
  const accounting = getMilkLotAccounting(lot, rounds);
  const production = getMilkLotProductionReconciliation(lot, rounds);
  const lotRounds = rounds.filter(round => round.milkLotId === lot.id || round.milkLotCode === lot.lotCode);
  const completedRounds = lotRounds.filter(round => round.outputWeight > 0 && !['scheduled', 'cancelled', 'spoiled'].includes(round.status));
  const metadata: ExcelSheet['metadata'] = [...exportedAtMetadata(), ['Milk lot', lot.lotCode]];
  const unexplained = lot.litresReceived - accounting.consumed - accounting.remaining - lot.litresRejected - lot.litresSpilled - accounting.sold;
  const balanceSheet: ExcelSheet = {
    name: 'Milk Balance',
    title: `Milk Reconciliation — Balance — Lot ${lot.lotCode}`,
    metadata,
    columns: [
      { key: 'received', header: 'Received L', width: 14, numberFormat: '0.00' },
      { key: 'consumed', header: 'Consumed L', width: 14, numberFormat: '0.00' },
      { key: 'remaining', header: 'Remaining L', width: 14, numberFormat: '0.00' },
      { key: 'rejected', header: 'Rejected L', width: 14, numberFormat: '0.00' },
      { key: 'spilled', header: 'Spilled L', width: 13, numberFormat: '0.00' },
      { key: 'sold', header: 'Milk Sold L', width: 14, numberFormat: '0.00' },
      { key: 'unexplained', header: 'Unexplained L', width: 16, numberFormat: '0.00' },
      { key: 'overdraw', header: 'Overdraw L', width: 14, numberFormat: '0.00' },
    ],
    rows: [{
      received: lot.litresReceived,
      consumed: accounting.consumed,
      remaining: accounting.remaining,
      rejected: lot.litresRejected,
      spilled: lot.litresSpilled,
      sold: accounting.sold,
      unexplained,
      overdraw: accounting.overdraw,
    }],
  };
  const outputRows = [
    { product: 'Malai Paneer (D)', quantityKg: completedRounds.filter(round => round.type === 'D').reduce((sum, round) => sum + round.outputWeight, 0), rounds: production.dRounds },
    { product: 'Rozana Paneer (C/S)', quantityKg: completedRounds.filter(round => round.type === 'C/S').reduce((sum, round) => sum + round.outputWeight, 0), rounds: production.csRounds },
    { product: 'Halloumi', quantityKg: completedRounds.filter(round => round.type === 'Halloumi').reduce((sum, round) => sum + round.outputWeight, 0), rounds: completedRounds.filter(round => round.type === 'Halloumi').length },
    { product: 'Recovered Cream', quantityKg: production.cream, rounds: lotRounds.filter(round => (round.creamRecovered || 0) > 0).length },
    { product: 'PAN111 (Recovered)', quantityKg: production.pan111, rounds: lotRounds.filter(round => round.pan111ApprovalStatus === 'approved' || round.packedSkus?.some(pack => pack.sku === 'PAN111')).length },
    { product: 'Ghee', quantityKg: completedRounds.filter(round => round.type === 'Ghee').reduce((sum, round) => sum + round.outputWeight, 0), rounds: completedRounds.filter(round => round.type === 'Ghee').length },
  ];
  const outputsSheet: ExcelSheet = {
    name: 'Production Outputs',
    title: `Milk Reconciliation — Production Outputs — Lot ${lot.lotCode}`,
    metadata,
    columns: [
      { key: 'product', header: 'Product', width: 25 },
      { key: 'quantityKg', header: 'Quantity kg', width: 16, numberFormat: '0.00' },
      { key: 'rounds', header: 'Rounds', width: 12, numberFormat: '0' },
    ],
    rows: outputRows,
  };
  const wasteSheet: ExcelSheet = {
    name: 'Milk Waste',
    title: `Milk Reconciliation — Linked Milk Waste — Lot ${lot.lotCode}`,
    metadata,
    columns: [
      { key: 'date', header: 'Date', width: 15 },
      { key: 'product', header: 'Product', width: 20 },
      { key: 'quantity', header: 'Quantity', width: 13, numberFormat: '0.00' },
      { key: 'unit', header: 'Unit', width: 10 },
      { key: 'reason', header: 'Reason', width: 28 },
      { key: 'recordedBy', header: 'Recorded By', width: 18 },
      { key: 'batch', header: 'Batch / Lot', width: 20 },
    ],
    rows: wasteEvents
      .filter(event => event.unit.toLowerCase() === 'l' && /milk/i.test(event.product) && (event.batchCode === lot.id || event.batchCode === lot.lotCode))
      .map(event => ({
        date: excelDate(event.date),
        product: event.product,
        quantity: event.quantity,
        unit: event.unit,
        reason: event.reason,
        recordedBy: event.recordedBy,
        batch: event.batchCode || '',
      })),
  };
  const reviewsSheet: ExcelSheet = {
    name: 'Review History',
    title: `Milk Reconciliation — Owner/Admin Reviews — Lot ${lot.lotCode}`,
    metadata,
    columns: [
      { key: 'reviewedAt', header: 'Reviewed At', width: 21 },
      { key: 'reviewedBy', header: 'Reviewed By', width: 18 },
      { key: 'role', header: 'Role', width: 12 },
      { key: 'reason', header: 'Reason', width: 35 },
      { key: 'beforeConsumed', header: 'Before Consumed L', width: 19, numberFormat: '0.00' },
      { key: 'afterConsumed', header: 'After Consumed L', width: 18, numberFormat: '0.00' },
      { key: 'beforeRemaining', header: 'Before Remaining L', width: 20, numberFormat: '0.00' },
      { key: 'afterRemaining', header: 'After Remaining L', width: 19, numberFormat: '0.00' },
      { key: 'beforeOverdraw', header: 'Before Overdraw L', width: 19, numberFormat: '0.00' },
      { key: 'afterOverdraw', header: 'After Overdraw L', width: 18, numberFormat: '0.00' },
      { key: 'roundCorrections', header: 'Round Corrections', width: 35 },
      { key: 'wasteCorrections', header: 'Waste Corrections', width: 35 },
    ],
    rows: (lot.milkBalanceReviews || []).map(review => ({
      reviewedAt: excelDate(review.reviewedAt),
      reviewedBy: review.reviewedBy,
      role: review.reviewerRole,
      reason: review.reason,
      beforeConsumed: review.before.consumed,
      afterConsumed: review.after.consumed,
      beforeRemaining: review.before.remaining,
      afterRemaining: review.after.remaining,
      beforeOverdraw: review.before.overdraw,
      afterOverdraw: review.after.overdraw,
      roundCorrections: review.roundCorrections.map(correction => `S${correction.shiftNumber}/R${correction.roundNumber}: ${correction.previousInput} -> ${correction.correctedInput} L`).join('; '),
      wasteCorrections: (review.wasteCorrections || []).map(correction => `${correction.category}: ${correction.previousQuantity} -> ${correction.correctedQuantity} L`).join('; '),
    })),
  };
  await exportExcelWorkbook({
    filename: `vejoy-reconciliation-${lot.lotCode}-${exportDateStamp()}.xlsx`,
    sheets: [
      balanceSheet,
      outputsSheet,
      ...(lot.productionClosed ? [weightReconciliationSheet(lot, lotRounds, metadata)] : []),
      roundLedgerSheet(completedRounds, `Milk Reconciliation — Completed Rounds — Lot ${lot.lotCode}`, metadata),
      packingSheet(lotRounds, `Milk Reconciliation — Packed SKUs — Lot ${lot.lotCode}`, metadata),
      wasteSheet,
      reviewsSheet,
    ],
  });
}
