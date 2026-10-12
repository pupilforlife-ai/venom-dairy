import {
  CipRecord,
  getGheeRoundInput,
  getMilkLotAccounting,
  getMilkLotProductionReconciliation,
  getRoundMilkInput,
  MilkLot,
  ProductionRound,
  ProductionShift,
  WasteEvent,
} from '../data/mockData';
import {
  crumbingSkuByCode,
  getCrumbingPackWeight,
  getGheePackWeight,
  getPaneerPackWeight,
  gheeSkuByCode,
  normalizeFinishedGoodsSku,
  paneerSkuByCode,
} from '../data/skuConfig';
import { getProductionPackingEntries } from './finishedStock';
import { excelDate, ExcelSheet, ExcelWorkbookExport, exportDateStamp, exportExcelWorkbook } from './excelExport';
import { getMilkLotVesselBalances, getMilkSaleVesselSource } from './milkVesselAllocation';

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

function butterSheet(rounds: ProductionRound[], metadata: ExcelSheet['metadata']): ExcelSheet {
  return {
    name: 'Butter',
    title: 'Production Board — Butter Production',
    metadata,
    columns: [
      { key: 'date', header: 'Production Date', width: 17 },
      { key: 'batch', header: 'Batch Code', width: 25 },
      { key: 'status', header: 'Status', width: 18 },
      { key: 'creamSource', header: 'Cream Source', width: 16 },
      { key: 'creamLot', header: 'Cream Lot / Source Batch', width: 25 },
      { key: 'creamInputKg', header: 'Cream Input kg', width: 17, numberFormat: '0.00' },
      { key: 'butterKg', header: 'Butter Output kg', width: 18, numberFormat: '0.00' },
      { key: 'buttermilkKg', header: 'Buttermilk Output kg', width: 21, numberFormat: '0.00' },
      { key: 'destination', header: 'Destination', width: 16 },
      { key: 'pool', header: 'Pool', width: 12 },
      { key: 'saltKg', header: 'Salt kg', width: 11, numberFormat: '0.00' },
      { key: 'replacerKg', header: 'Replacer kg', width: 13, numberFormat: '0.00' },
      { key: 'gheeKg', header: 'Used in Ghee kg', width: 17, numberFormat: '0.00' },
      { key: 'blendKg', header: 'Blending Input kg', width: 18, numberFormat: '0.00' },
      { key: 'packedKg', header: 'Packed Butter kg', width: 17, numberFormat: '0.00' },
      { key: 'remainingKg', header: 'Remaining kg', width: 15, numberFormat: '0.00' },
      { key: 'team', header: 'Team', width: 22 },
      { key: 'notes', header: 'Notes', width: 30 },
    ],
    rows: sortedRounds(rounds.filter(round => round.type === 'Butter')).map(round => ({
      date: excelDate(round.roundDate || round.startTime),
      batch: productionBatchCode(round),
      status: round.status,
      creamSource: round.creamSource || '',
      creamLot: round.creamLotId || round.sourceBatchCode || '',
      creamInputKg: Math.max(0, round.actualInput || round.plannedInput || 0),
      butterKg: round.butterOutput || round.outputWeight || 0,
      buttermilkKg: round.buttermilkOutput || 0,
      destination: round.destination || '',
      pool: round.pool || '',
      saltKg: round.saltQuantity || 0,
      replacerKg: round.replacerQuantity || 0,
      gheeKg: round.usedInGhee || 0,
      blendKg: round.blendingInput || 0,
      packedKg: round.packedButterWeight || 0,
      remainingKg: round.remainingBalance ?? '',
      team: (round.team || []).join(', '),
      notes: round.notes || '',
    })),
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

function packWeight(pack: { sku: string; cases: number; loose?: number; looseWeightKg?: number; weightKg?: number }) {
  const sku = normalizeFinishedGoodsSku(pack.sku);
  if (paneerSkuByCode[sku]) {
    return getPaneerPackWeight(
      paneerSkuByCode[sku],
      pack.cases || 0,
      pack.loose || 0,
      pack.looseWeightKg || 0,
      pack.weightKg || 0,
    );
  }
  if (gheeSkuByCode[sku]) return getGheePackWeight(gheeSkuByCode[sku], pack.cases || 0, pack.loose || 0);
  if (crumbingSkuByCode[sku]) return getCrumbingPackWeight(crumbingSkuByCode[sku], pack.cases || 0, pack.loose || 0);
  return Math.max(0, pack.weightKg || pack.looseWeightKg || 0);
}

function roundLedgerSheet(rounds: ProductionRound[], title: string, metadata: ExcelSheet['metadata']): ExcelSheet {
  return {
    name: 'Round Ledger',
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

function packingSheet(rounds: ProductionRound[], title: string, metadata: ExcelSheet['metadata']): ExcelSheet {
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
    name: 'Packed SKUs',
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

function measurementSheet(rounds: ProductionRound[], metadata: ExcelSheet['metadata']): ExcelSheet {
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
    name: 'Weights',
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

function crumbingSheets(batches: CrumbingBatchExportRecord[]): ExcelSheet[] {
  const metadata: ExcelSheet['metadata'] = [...exportedAtMetadata(), ['Scope', 'All crumbing batches']];
  const overview: ExcelSheet = {
    name: 'Crumbing Batches',
    title: 'Production Board — Crumbing Batches',
    metadata,
    columns: [
      { key: 'batch', header: 'Batch Code', width: 24 },
      { key: 'type', header: 'Type', width: 10 },
      { key: 'source', header: 'Source Batch', width: 25 },
      { key: 'origin', header: 'Manual Origin', width: 22 },
      { key: 'status', header: 'Status', width: 19 },
      { key: 'sourceKg', header: 'Source kg', width: 13, numberFormat: '0.00' },
      { key: 'crumbedKg', header: 'Crumbed kg', width: 14, numberFormat: '0.00' },
      { key: 'balanceKg', header: 'Balance kg', width: 14, numberFormat: '0.00' },
      { key: 'wastageKg', header: 'Wastage kg', width: 14, numberFormat: '0.00' },
      { key: 'traysCrumbed', header: 'Trays Crumbed', width: 15, numberFormat: '0' },
      { key: 'traysFried', header: 'Trays Fried', width: 13, numberFormat: '0' },
      { key: 'traysRemaining', header: 'Trays Remaining', width: 17, numberFormat: '0' },
      { key: 'traysPacked', header: 'Trays Packed', width: 14, numberFormat: '0' },
      { key: 'createdAt', header: 'Created At', width: 21 },
      { key: 'notes', header: 'Notes', width: 30 },
    ],
    rows: batches.map(batch => ({
      batch: batch.batchCode,
      type: batch.type,
      source: batch.sourceBatchCode,
      origin: batch.origin || '',
      status: batch.status,
      sourceKg: batch.sourceWeightKg || 0,
      crumbedKg: batch.weightCrumbedKg || 0,
      balanceKg: batch.balanceWeightKg || 0,
      wastageKg: batch.wastageKg || 0,
      traysCrumbed: batch.traysCrumbed,
      traysFried: batch.traysFried,
      traysRemaining: batch.traysRemaining,
      traysPacked: batch.traysPacked,
      createdAt: excelDate(batch.createdAt),
      notes: batch.notes || '',
    })),
  };
  const ingredients: ExcelSheet = {
    name: 'Crumbing Ingredients',
    title: 'Production Board — Crumbing Ingredient Ledger',
    metadata,
    columns: [
      { key: 'batch', header: 'Batch Code', width: 24 },
      { key: 'type', header: 'Type', width: 10 },
      { key: 'predustKg', header: 'Predust kg', width: 14, numberFormat: '0.000' },
      { key: 'iyababKg', header: 'Iyabab kg', width: 14, numberFormat: '0.000' },
      { key: 'batterKg', header: 'Batter Mix kg', width: 16, numberFormat: '0.000' },
      { key: 'waterL', header: 'Batter Water L', width: 17, numberFormat: '0.000' },
      { key: 'adajioKg', header: 'Adajio kg', width: 14, numberFormat: '0.000' },
    ],
    rows: batches.map(batch => ({
      batch: batch.batchCode,
      type: batch.type,
      predustKg: batch.jpCrumbing?.predustKg ?? batch.recipe?.flavourPredustKg ?? 0,
      iyababKg: batch.recipe?.flavourIyababKg ?? 0,
      batterKg: batch.jpCrumbing?.batterMixKg ?? batch.recipe?.batterIyababaKg ?? 0,
      waterL: batch.jpCrumbing?.batterWaterL ?? batch.recipe?.batterWaterL ?? 0,
      adajioKg: batch.jpCrumbing?.adajioKg ?? batch.recipe?.breadingAdajioKg ?? 0,
    })),
  };
  const packed: ExcelSheet = {
    name: 'Crumbing Packed SKUs',
    title: 'Production Board — Crumbing Packed SKUs',
    metadata,
    columns: [
      { key: 'batch', header: 'Batch Code', width: 24 },
      { key: 'type', header: 'Type', width: 10 },
      { key: 'sku', header: 'SKU', width: 16 },
      { key: 'cases', header: 'Cases', width: 11, numberFormat: '0' },
      { key: 'loose', header: 'Loose', width: 11, numberFormat: '0' },
      { key: 'weightKg', header: 'Calculated Weight kg', width: 20, numberFormat: '0.00' },
    ],
    rows: batches.flatMap(batch => (batch.packedSkus || []).map(pack => ({
      batch: batch.batchCode,
      type: batch.type,
      sku: normalizeFinishedGoodsSku(pack.sku),
      cases: pack.cases || 0,
      loose: pack.loose || 0,
      weightKg: packWeight(pack),
    }))),
  };
  const jpBuckets: ExcelSheet = {
    name: 'JP Buckets',
    title: 'Production Board — JP Jalapeño Bucket Inspection',
    metadata,
    columns: [
      { key: 'batch', header: 'Batch Code', width: 24 },
      { key: 'bucket', header: 'Bucket', width: 10, numberFormat: '0' },
      { key: 'nominalKg', header: 'Nominal kg', width: 13, numberFormat: '0.00' },
      { key: 'rawKg', header: 'Raw kg', width: 12, numberFormat: '0.00' },
      { key: 'drainedKg', header: 'Drained kg', width: 13, numberFormat: '0.00' },
      { key: 'good', header: 'Good Pieces', width: 14, numberFormat: '0' },
      { key: 'damaged', header: 'Damaged Pieces', width: 17, numberFormat: '0' },
      { key: 'total', header: 'Total Pieces', width: 14, numberFormat: '0' },
    ],
    rows: batches.flatMap(batch => (batch.jpPrepping?.buckets || []).map((bucket, index) => ({
      batch: batch.batchCode,
      bucket: index + 1,
      nominalKg: bucket.nominalWeightKg,
      rawKg: bucket.rawWeightKg,
      drainedKg: bucket.drainedWeightKg,
      good: bucket.goodPieces,
      damaged: bucket.damagedPieces,
      total: bucket.totalPieces,
    }))),
  };
  return [overview, ingredients, packed, jpBuckets];
}

export function buildProductionBoardWorkbook(input: {
  lot: MilkLot;
  shifts: ProductionShift[];
  rounds: ProductionRound[];
  cipRecords: CipRecord[];
  crumbingBatches?: CrumbingBatchExportRecord[];
}): ExcelWorkbookExport {
  const { lot } = input;
  const lotRounds = input.rounds.filter(round => round.milkLotId === lot.id || round.milkLotCode === lot.lotCode);
  const lotShifts = input.shifts.filter(shift => shift.milkLotId === lot.id || shift.milkLotCode === lot.lotCode);
  const lotCip = input.cipRecords.filter(record => record.milkLotId === lot.id || record.milkLotCode === lot.lotCode);
  const metadata: ExcelSheet['metadata'] = [
    ...exportedAtMetadata(),
    ['Milk lot', lot.lotCode],
    ['Scope', 'All records for the selected milk lot; on-screen filters do not remove rows'],
  ];
  const shiftSheet: ExcelSheet = {
    name: 'Shifts',
    title: `Production Board — Shifts — Lot ${lot.lotCode}`,
    metadata,
    columns: [
      { key: 'shift', header: 'Shift', width: 10, numberFormat: '0' },
      { key: 'status', header: 'Status', width: 14 },
      { key: 'started', header: 'Started At', width: 21 },
      { key: 'ended', header: 'Ended At', width: 21 },
      { key: 'team', header: 'Team', width: 26 },
      { key: 'notes', header: 'Team Notes', width: 35 },
    ],
    rows: lotShifts.slice().sort((a, b) => a.shiftNumber - b.shiftNumber).map(shift => ({
      shift: shift.shiftNumber,
      status: shift.status,
      started: excelDate(shift.startedAt),
      ended: excelDate(shift.endedAt),
      team: shift.team.join(', '),
      notes: shift.teamNotes || '',
    })),
  };
  const cipSheet: ExcelSheet = {
    name: 'CIP Records',
    title: `Production Board — CIP Records — Lot ${lot.lotCode}`,
    metadata,
    columns: [
      { key: 'frequency', header: 'Frequency', width: 13 },
      { key: 'cycle', header: 'Cycle', width: 17 },
      { key: 'status', header: 'Status', width: 15 },
      { key: 'shift', header: 'Shift', width: 10 },
      { key: 'performed', header: 'Performed At', width: 21 },
      { key: 'recordedBy', header: 'Recorded By', width: 17 },
      { key: 'chemical', header: 'Chemical', width: 16 },
      { key: 'chemicalL', header: 'Chemical L', width: 13, numberFormat: '0.00' },
      { key: 'waterL', header: 'Water L', width: 11, numberFormat: '0.00' },
      { key: 'temperatureC', header: 'Temperature °C', width: 16, numberFormat: '0.0' },
      { key: 'minutes', header: 'Circulation min', width: 16, numberFormat: '0' },
      { key: 'supervisor', header: 'Supervisor', width: 18 },
      { key: 'notes', header: 'Notes', width: 30 },
    ],
    rows: lotCip.map(record => ({
      frequency: record.frequency,
      cycle: record.cycle,
      status: record.status || 'completed',
      shift: record.shiftNumber ?? '',
      performed: excelDate(record.performedAt),
      recordedBy: record.recordedBy,
      chemical: record.chemicalName || '',
      chemicalL: record.chemicalVolumeLitres || 0,
      waterL: record.waterVolumeLitres || 0,
      temperatureC: record.waterTemperatureC || 0,
      minutes: (record.circulationMinutes || 0) + (record.extensionMinutes || 0),
      supervisor: record.supervisorName || '',
      notes: record.notes || '',
    })),
  };
  return {
    filename: `vejoy-production-board-${lot.lotCode}-${exportDateStamp()}.xlsx`,
    sheets: [
      productionSummarySheet(lotRounds, metadata),
      roundLedgerSheet(lotRounds, `Production Board — Round Ledger — Lot ${lot.lotCode}`, metadata),
      cuttingSheet(lotRounds, metadata),
      packingSheet(lotRounds, `Production Board — Packed SKUs — Lot ${lot.lotCode}`, metadata),
      measurementSheet(lotRounds, metadata),
      creamSheet(lotRounds, metadata),
      butterSheet(lotRounds, metadata),
      gheeSheet(lotRounds, metadata),
      halloumiSheet(lotRounds, metadata),
      amassiSheet(lotRounds, metadata),
      ...crumbingSheets(input.crumbingBatches || []),
      shiftSheet,
      cipSheet,
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
  const summary = new Map<string, { sku: string; cases: number; loose: number; looseWeightKg: number; weightKg: number }>();
  entries.forEach(entry => {
    const sku = normalizeFinishedGoodsSku(entry.sku);
    const current = summary.get(sku) || { sku, cases: 0, loose: 0, looseWeightKg: 0, weightKg: 0 };
    current.cases += entry.cases || 0;
    current.loose += entry.loose || 0;
    current.looseWeightKg += entry.looseWeightKg || 0;
    current.weightKg += packWeight(entry);
    summary.set(sku, current);
  });
  return [...summary.values()];
}

export async function exportMilkReceivingWorkbook(lot: MilkLot, rounds: ProductionRound[]) {
  const accounting = getMilkLotAccounting(lot, rounds);
  const production = getMilkLotProductionReconciliation(lot, rounds);
  const vesselAllocation = getMilkLotVesselBalances(lot, rounds);
  const lotRounds = rounds.filter(round => round.milkLotId === lot.id || round.milkLotCode === lot.lotCode);
  const metadata: ExcelSheet['metadata'] = [...exportedAtMetadata(), ['Milk lot', lot.lotCode]];
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
      { key: 'loose', header: 'Loose Units', width: 14, numberFormat: '0' },
      { key: 'looseWeightKg', header: 'Loose Weight kg', width: 17, numberFormat: '0.00' },
      { key: 'weightKg', header: 'Calculated Weight kg', width: 20, numberFormat: '0.00' },
    ],
    rows: packedSkuSummary(lot, rounds),
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
      return {
        date: excelDate(sale.saleDate),
        customer: sale.customer,
        source: source === 'ibc' ? 'IBC stock' : source === 'auxiliary' ? 'Auxiliary storage' : 'Legacy / unassigned',
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
  await exportExcelWorkbook({
    filename: `vejoy-milk-receiving-${lot.lotCode}-${exportDateStamp()}.xlsx`,
    sheets: [receiptSheet, reconciliationSheet, vesselSheet, skuSheet, roundLedgerSheet(lotRounds, `Milk Receiving — Round Ledger — Lot ${lot.lotCode}`, metadata), salesSheet],
  });
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
      roundLedgerSheet(completedRounds, `Milk Reconciliation — Completed Rounds — Lot ${lot.lotCode}`, metadata),
      packingSheet(lotRounds, `Milk Reconciliation — Packed SKUs — Lot ${lot.lotCode}`, metadata),
      wasteSheet,
      reviewsSheet,
    ],
  });
}
