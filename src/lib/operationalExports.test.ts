import { describe, expect, it } from 'vitest';
import writeXlsxFile from 'write-excel-file/node';
import { MilkLot, ProductionRound, ProductionShift } from '../data/mockData';
import { buildExcelFileSheets } from './excelExport';
import { buildMilkReceivingWorkbook, buildProductionBoardWorkbook } from './operationalExports';

const lot: MilkLot = {
  id: 'lot-011026',
  lotCode: '011026',
  receiptDate: '2026-10-01',
  supplier: 'Test supplier',
  litresReceived: 31_812,
  litresConsumed: 0,
  litresRemaining: 31_812,
  litresRejected: 0,
  litresSpilled: 0,
  status: 'active',
};

const shift: ProductionShift = {
  id: 'shift-1',
  milkLotId: lot.id,
  milkLotCode: lot.lotCode,
  shiftNumber: 1,
  startedAt: '2026-10-01T08:00:00.000Z',
  team: ['Operator'],
  status: 'active',
};

function productionRound(overrides: Partial<ProductionRound>): ProductionRound {
  return {
    id: 'round-1',
    milkLotId: lot.id,
    milkLotCode: lot.lotCode,
    shiftId: shift.id,
    shiftNumber: 1,
    roundNumber: 1,
    type: 'D',
    status: 'packed',
    team: ['Operator'],
    plannedInput: 500,
    actualInput: 500,
    outputWeight: 70,
    startTime: '2026-10-01T08:00:00.000Z',
    locked: false,
    ...overrides,
  };
}

describe('Production Board Excel export', () => {
  it('puts a complete production summary first and generates a valid Excel file for every product workflow', async () => {
    const rounds = [
      productionRound({
        id: 'paneer',
        type: 'D',
        blockWeights: [10, 11],
        numberOfBlocks: 2,
        cuttingType: '1kg blocks',
        packedSkus: [{ sku: 'MPAN100', cases: 2, loose: 1 }],
      }),
      productionRound({
        id: 'cream',
        roundNumber: 2,
        type: 'C/S',
        creamRecovered: 33.6,
        creamBucketWeights: [16.8, 16.8],
      }),
      productionRound({
        id: 'butter',
        roundNumber: 3,
        type: 'Butter',
        plannedInput: 100,
        actualInput: 100,
        butterOutput: 42,
        buttermilkOutput: 55,
      }),
      productionRound({
        id: 'ghee',
        roundNumber: 4,
        type: 'Ghee',
        butterInput: 50,
        afOilInput: 12.5,
        outputWeight: 58,
        packedSkus: [{ sku: 'GHEE-400-24', cases: 2, loose: 0 }],
      }),
      productionRound({
        id: 'halloumi',
        roundNumber: 5,
        type: 'Halloumi',
        outputWeight: 64,
        vacuumPackedWeight: 60,
      }),
      productionRound({
        id: 'amassi',
        roundNumber: 6,
        type: 'Amassi',
        amassiType: 'BM',
        amassiPhBeforeFreezing: 4.6,
        amassiFinalPh: 4.4,
        amassiPacked: [
          { sku: 'AMASSI 1.8L', bottles: 20 },
          { sku: 'AMASSI 2L', bottles: 10 },
        ],
      }),
    ];

    const workbook = buildProductionBoardWorkbook({
      lot,
      shifts: [shift],
      rounds,
      cipRecords: [],
      crumbingBatches: [
        {
          id: 'crumb-jp',
          batchCode: 'JP-1',
          type: 'JP',
          sourceBatchId: 'manual',
          sourceBatchCode: 'manual',
          status: 'packed',
          traysCrumbed: 10,
          traysFried: 10,
          traysRemaining: 0,
          traysPacked: 10,
          packedSkus: [{ sku: 'JP', cases: 3, loose: 0 }],
          createdAt: '2026-10-01T09:00:00.000Z',
        },
        {
          id: 'crumb-spp',
          batchCode: 'SPP-1',
          type: 'SPP',
          sourceBatchId: 'paneer',
          sourceBatchCode: '011026/S1/R1/D',
          status: 'packed',
          traysCrumbed: 8,
          traysFried: 8,
          traysRemaining: 0,
          traysPacked: 8,
          packedSkus: [{ sku: 'SPP', cases: 2, loose: 0 }],
          createdAt: '2026-10-01T10:00:00.000Z',
        },
        {
          id: 'crumb-hcp',
          batchCode: 'HCP-1',
          type: 'HCP',
          sourceBatchId: lot.id,
          sourceBatchCode: 'HAL-011026',
          status: 'packed',
          traysCrumbed: 6,
          traysFried: 6,
          traysRemaining: 0,
          traysPacked: 6,
          packedSkus: [{ sku: 'HCP', cases: 1, loose: 0 }],
          createdAt: '2026-10-01T11:00:00.000Z',
        },
      ],
    });

    expect(workbook.sheets[0].name).toBe('Production Summary');
    expect(workbook.sheets[0].rows).toHaveLength(6);
    expect(workbook.sheets.map(sheet => sheet.name)).toEqual(expect.arrayContaining([
      'Paneer Rounds',
      'Paneer Cutting',
      'Paneer Packing',
      'Paneer Weights',
      'Cream Recovery',
      'Butter',
      'Ghee',
      'Halloumi',
      'Amassi',
      'SPP Crumbing',
      'JP Crumbing Standalone',
      'JP Bucket Detail',
      'HCP Crumbing',
      'Shifts',
      'CIP Records',
    ]));

    const sheet = (name: string) => workbook.sheets.find(candidate => candidate.name === name)!;
    expect(sheet('Paneer Cutting').rows).toHaveLength(2);
    expect(sheet('Paneer Packing').rows).toHaveLength(1);
    expect(sheet('Cream Recovery').rows[0]).toMatchObject({ recordedKg: 33.6, bucketTotalKg: 33.6 });
    expect(sheet('Butter').rows[0]).toMatchObject({ creamInputKg: 100, butterKg: 42, buttermilkKg: 55 });
    expect(sheet('Ghee').rows[0]).toMatchObject({ butterKg: 50, afOilKg: 12.5, totalInputKg: 62.5, outputKg: 58 });
    expect(sheet('Halloumi').rows[0]).toMatchObject({ outputKg: 64, vacuumedKg: 60 });
    expect(sheet('Amassi').rows[0]).toMatchObject({ bottles18: 20, bottles2: 10, totalBottles: 30 });
    expect(sheet('SPP Crumbing').rows[0]).toMatchObject({ batch: 'SPP-1', packedCases: 2 });
    expect(sheet('JP Crumbing Standalone').rows[0]).toMatchObject({ batch: 'JP-1', packedCases: 3 });
    expect(sheet('HCP Crumbing').rows[0]).toMatchObject({ batch: 'HCP-1', packedCases: 1 });

    const file = await writeXlsxFile(buildExcelFileSheets(workbook)).toBuffer();
    expect(file.byteLength).toBeGreaterThan(1_000);
  });

  it('does not export rounds belonging to another milk lot', () => {
    const workbook = buildProductionBoardWorkbook({
      lot,
      shifts: [shift],
      rounds: [
        productionRound({ id: 'included' }),
        productionRound({ id: 'excluded', milkLotId: 'other', milkLotCode: '111026' }),
      ],
      cipRecords: [],
    });

    expect(workbook.sheets[0].rows).toHaveLength(1);
    const gheeSheet = workbook.sheets.find(sheet => sheet.name === 'Ghee')!;
    expect(gheeSheet.metadata).toContainEqual(['Record status', 'No ghee production recorded for milk lot 011026']);
    expect(gheeSheet.rows[0]).toMatchObject({ date: 'No ghee production recorded for milk lot 011026' });
  });
});

describe('Milk Receiving Excel export', () => {
  it('opens with a complete round-by-round lot audit and includes weight reconciliation', async () => {
    const rounds = [
      productionRound({
        id: 'paneer',
        type: 'D',
        outputWeight: 70,
        blockWeights: [35, 35],
        numberOfBlocks: 2,
        packedSkus: [{ sku: 'MPAN100', cases: 2, loose: 1 }],
        verifiedPackedSkus: [{ sku: 'MPAN100', cases: 2, loose: 0 }],
        pan111ApprovalStatus: 'approved',
        pan111RequestedWeight: 10,
        sppRecordedWeight: 5,
        remainingBalance: 25,
      }),
      productionRound({
        id: 'cream',
        roundNumber: 2,
        type: 'C/S',
        outputWeight: 65,
        creamRecovered: 33.6,
        creamBucketWeights: [16.8, 16.8],
      }),
    ];

    const workbook = buildMilkReceivingWorkbook(lot, rounds);
    const sheet = (name: string) => workbook.sheets.find(candidate => candidate.name === name)!;

    expect(workbook.sheets[0].name).toBe('Milk Lot Audit');
    expect(sheet('Milk Lot Audit').rows).toHaveLength(2);
    expect(sheet('Milk Lot Audit').rows[0]).toMatchObject({
      milkInputL: 500,
      outputKg: 70,
      creamKg: 0,
      packedCases: 2,
      packedWeightKg: 31,
      verifiedWeightKg: 30,
      pan111Kg: 10,
      sppKg: 5,
    });
    expect(sheet('Milk Lot Audit').rows[0].yieldKg100L).toBeCloseTo(14);
    expect(sheet('Milk Lot Audit').rows[1]).toMatchObject({ creamKg: 33.6 });
    expect(sheet('Weight Reconciliation').rows[0]).toMatchObject({
      blockWeightKg: 70,
      recordedPackedKg: 31,
      verifiedPackedKg: 30,
      packingBasis: 'Owner-verified',
      accountedOutputKg: 70,
      varianceKg: 0,
    });
    expect(sheet('SKU Packed on Board').rows[0]).toMatchObject({ sku: 'MPAN100', cases: 2, weightKg: 31 });
    expect(workbook.sheets.map(candidate => candidate.name)).toEqual(expect.arrayContaining([
      'Receipt Summary',
      'Product Reconciliation',
      'Vessel Allocation',
      'Round Ledger',
      'Cream Recovery',
      'Packed SKUs',
      'Weights',
      'Milk Sales',
    ]));

    const file = await writeXlsxFile(buildExcelFileSheets(workbook)).toBuffer();
    expect(file.byteLength).toBeGreaterThan(1_000);
  });
});
