import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import writeXlsxFile from 'write-excel-file/node';
import { MilkLot, ProductionRound, ProductionShift } from '../data/mockData';
import { buildExcelFileSheets, excelAutoFilterFeature } from './excelExport';
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
        packedSkus: [
          { sku: 'MPAN100', cases: 2, loose: 1 },
          { sku: 'MPAN200', cases: 1, loose: 2 },
        ],
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
        batchCode: 'BUT-011026',
        sourceBatchCode: 'CREAM-011026',
        creamSource: 'internal',
        plannedInput: 100,
        actualInput: 100,
        butterOutput: 42,
        buttermilkOutput: 55,
        usedInGhee: 10,
        packedButterWeight: 9,
        packedSkus: [{ sku: 'PUBB', cases: 0, loose: 18 }],
        remainingBalance: 8,
      }),
      productionRound({
        id: 'ghee',
        roundNumber: 4,
        type: 'Ghee',
        batchCode: 'GHEE-011026',
        butterInput: 50,
        afOilInput: 12.5,
        outputWeight: 58,
        packedSkus: [{ sku: 'GHEE-400-24', cases: 2, loose: 0 }],
      }),
      productionRound({
        id: 'butter-blend',
        roundNumber: 5,
        type: 'Butter',
        batchCode: 'PUBBB-011026',
        sourceBatchCode: 'BUT-011026',
        status: 'pubbb_pool',
        plannedInput: 15,
        actualInput: 15,
        butterOutput: 15,
        outputWeight: 15,
        blendingInput: 15,
        blendingInternalButterQuantity: 15,
        replacerQuantity: 4.55,
        pool: 'PUBBB',
        packedButterWeight: 10,
        packedSkus: [{ sku: 'PUBBB', cases: 0, loose: 20 }],
        remainingBalance: 5,
        blendedPoolId: 'blend-1',
      }),
      productionRound({
        id: 'halloumi',
        roundNumber: 6,
        type: 'Halloumi',
        outputWeight: 64,
        vacuumPackedWeight: 60,
      }),
      productionRound({
        id: 'amassi',
        roundNumber: 7,
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
      finishedStock: [
        {
          id: 'stock-ghee',
          sku: 'GHEE-400-24',
          productName: 'Ghee 400g — 24 bucket case',
          packingRunId: 'legacy-ghee-0',
          cases: 2,
          loosePackets: 0,
          totalPackets: 48,
          storageLocation: 'Coldroom',
          status: 'handed_over',
          createdAt: '2026-10-01T12:00:00.000Z',
          sourceBatchCodes: ['011026/S1/R4/Ghee'],
        },
      ],
    });

    expect(workbook.sheets.map(sheet => sheet.name)).toEqual([
      'Paneer',
      'Butter',
      'Ghee',
      'Halloumi',
      'Amassi',
      'Crumbing',
    ]);

    const sheet = (name: string) => workbook.sheets.find(candidate => candidate.name === name)!;
    expect(sheet('Paneer').rows).toHaveLength(2);
    expect(sheet('Paneer').rows[0]).toMatchObject({ creamKg: 0, packedSkus: 'MPAN100: 2 cs + 1 loose; MPAN200: 1 cs + 2 loose', packedKg: 36.2 });
    expect(sheet('Paneer').rows[1]).toMatchObject({ creamKg: 33.6, creamBuckets: '16.80, 16.80' });
    expect(sheet('Paneer').sections?.[0].rows).toHaveLength(2);
    expect(sheet('Paneer').sections?.[0].rows[0]).toMatchObject({ sku: 'MPAN100', weightKg: 31 });
    expect(sheet('Butter').rows).toHaveLength(1);
    expect(sheet('Butter').rows[0]).toMatchObject({
      batch: 'BUT-011026/R3',
      creamLot: 'CREAM-011026',
      creamInputKg: 100,
      butterKg: 42,
      buttermilkKg: 55,
      gheeKg: 10,
      pubbKg: 9,
      blendKg: 15,
      remainingKg: 8,
      accountedKg: 42,
      varianceKg: 0,
    });
    expect(sheet('Butter').sections?.[0].rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ usageType: 'Ghee Production', sourceBatch: 'BUT-011026/R3', butterConsumedKg: 10 }),
      expect.objectContaining({ usageType: 'Pure Butter Packing', sku: 'PUBB', butterConsumedKg: 9, loose: 18 }),
      expect.objectContaining({ usageType: 'Blended Butter Production', destinationBatch: 'PUBBB-011026', butterConsumedKg: 15, finishedKg: 10 }),
    ]));
    expect(sheet('Ghee').rows[0]).toMatchObject({ butterKg: 50, afOilKg: 12.5, totalInputKg: 62.5, outputKg: 58, location: 'Coldroom' });
    expect(sheet('Ghee').sections?.[0].rows[0]).toMatchObject({ sku: 'GHEE-400-24', cases: 2, weightKg: 19.2, location: 'Coldroom' });
    expect(sheet('Halloumi').rows[0]).toMatchObject({ outputKg: 64, vacuumedKg: 60 });
    expect(sheet('Amassi').rows[0]).toMatchObject({ bottles18: 20, bottles2: 10, totalBottles: 30 });
    expect(sheet('Crumbing').rows[0]).toMatchObject({ batch: 'SPP-1', packedCases: 2 });
    expect(sheet('Crumbing').sections?.[0].rows[0]).toMatchObject({ batch: 'JP-1', packedCases: 3 });
    expect(sheet('Crumbing').sections?.[2].rows[0]).toMatchObject({ batch: 'HCP-1', packedCases: 1 });

    const file = await (writeXlsxFile as any)(buildExcelFileSheets(workbook), { features: [excelAutoFilterFeature] }).toBuffer();
    expect(file.byteLength).toBeGreaterThan(1_000);
    const archive = unzipSync(file);
    const workbookXml = strFromU8(archive['xl/workbook.xml']);
    expect(workbookXml.match(/<sheet /g)).toHaveLength(6);
    expect(workbookXml).toContain('name="Paneer"');
    expect(workbookXml).toContain('name="Crumbing"');
    expect(strFromU8(archive['xl/worksheets/sheet1.xml'])).toContain('<autoFilter ref="A7:X9"/>');
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

    expect(workbook.sheets[0].name).toBe('Paneer');
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
