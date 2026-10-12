import { describe, expect, it } from 'vitest';
import { MilkLot, ProductionRound, ProductionShift } from '../data/mockData';
import { buildProductionBoardWorkbook } from './operationalExports';

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
  it('puts a complete production summary first and exports every product workflow', () => {
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
      crumbingBatches: [{
        id: 'crumb-1',
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
      }],
    });

    expect(workbook.sheets[0].name).toBe('Production Summary');
    expect(workbook.sheets[0].rows).toHaveLength(6);
    expect(workbook.sheets.map(sheet => sheet.name)).toEqual(expect.arrayContaining([
      'Round Ledger',
      'Paneer Cutting',
      'Packed SKUs',
      'Weights',
      'Cream Recovery',
      'Butter',
      'Ghee',
      'Halloumi',
      'Amassi',
      'Crumbing Batches',
      'Crumbing Ingredients',
      'Crumbing Packed SKUs',
      'JP Buckets',
      'Shifts',
      'CIP Records',
    ]));

    const sheet = (name: string) => workbook.sheets.find(candidate => candidate.name === name)!;
    expect(sheet('Paneer Cutting').rows).toHaveLength(2);
    expect(sheet('Packed SKUs').rows).toHaveLength(4);
    expect(sheet('Cream Recovery').rows[0]).toMatchObject({ recordedKg: 33.6, bucketTotalKg: 33.6 });
    expect(sheet('Butter').rows[0]).toMatchObject({ creamInputKg: 100, butterKg: 42, buttermilkKg: 55 });
    expect(sheet('Ghee').rows[0]).toMatchObject({ butterKg: 50, afOilKg: 12.5, totalInputKg: 62.5, outputKg: 58 });
    expect(sheet('Halloumi').rows[0]).toMatchObject({ outputKg: 64, vacuumedKg: 60 });
    expect(sheet('Amassi').rows[0]).toMatchObject({ bottles18: 20, bottles2: 10, totalBottles: 30 });
    expect(sheet('Crumbing Packed SKUs').rows[0]).toMatchObject({ sku: 'JP', cases: 3 });
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
  });
});
