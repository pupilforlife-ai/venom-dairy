import { describe, expect, it } from 'vitest';
import {
  getMilkLotAccounting,
  getMilkLotCreamPool,
  MilkLot,
  ProductionRound,
} from '../data/mockData';
import { reconcileFinishedStock } from './finishedStock';

function milkLot(overrides: Partial<MilkLot> = {}): MilkLot {
  return {
    id: 'milk-1',
    lotCode: '011026',
    receiptDate: '2026-10-01',
    supplier: 'Test supplier',
    litresReceived: 31_812,
    litresConsumed: 0,
    litresRemaining: 31_812,
    litresRejected: 0,
    litresSpilled: 0,
    status: 'active',
    ...overrides,
  };
}

function round(overrides: Partial<ProductionRound> = {}): ProductionRound {
  return {
    id: 'round-1',
    milkLotId: 'milk-1',
    milkLotCode: '011026',
    shiftId: 'shift-1',
    shiftNumber: 1,
    roundNumber: 1,
    type: 'D',
    status: 'packed',
    team: [],
    plannedInput: 500,
    actualInput: 500,
    outputWeight: 70,
    startTime: '2026-10-01T08:00:00.000Z',
    locked: false,
    ...overrides,
  };
}

describe('milk accounting', () => {
  it('counts 28 started 500 L rounds as 14,000 L consumed', () => {
    const rounds = Array.from({ length: 28 }, (_, index) => round({
      id: `round-${index + 1}`,
      roundNumber: index + 1,
    }));

    expect(getMilkLotAccounting(milkLot(), rounds)).toEqual({
      consumed: 14_000,
      sold: 0,
      remaining: 17_812,
      overdraw: 0,
      rawRemaining: 17_812,
    });
  });

  it('deducts rejected, spilled and sold milk while ignoring scheduled rounds', () => {
    const lot = milkLot({ litresRejected: 1_000, litresSpilled: 12, litresSold: 800 });
    const rounds = [
      round({ id: 'started', actualInput: 500 }),
      round({ id: 'scheduled', status: 'scheduled', actualInput: 500 }),
    ];

    expect(getMilkLotAccounting(lot, rounds)).toMatchObject({
      consumed: 500,
      sold: 800,
      remaining: 29_500,
    });
  });
});

describe('cream pool accounting', () => {
  it('uses every recorded recovery and deducts internal butter allocations exactly once', () => {
    const lot = milkLot();
    const rounds = [
      round({ id: 'cs-1', type: 'C/S', creamRecovered: 200.15 }),
      round({ id: 'cs-2', type: 'C/S', creamRecovered: 186.2 }),
      round({
        id: 'butter-1',
        type: 'Butter',
        status: 'scheduled',
        creamSource: 'internal',
        creamLotId: lot.id,
        plannedInput: 100.3,
        actualInput: 100.3,
      }),
    ];

    expect(getMilkLotCreamPool(lot, rounds)).toMatchObject({
      totalCream: 386.35,
      usedInButter: 100.3,
      availableBalance: 286.05,
      roundsContributed: ['cs-1', 'cs-2'],
    });
  });

  it('preserves an overdrawn cream balance for review instead of clamping it to zero', () => {
    const lot = milkLot();
    const rounds = [
      round({ id: 'cs-1', type: 'C/S', creamRecovered: 200 }),
      round({
        id: 'butter-1',
        type: 'Butter',
        status: 'scheduled',
        creamSource: 'internal',
        creamLotId: lot.id,
        plannedInput: 205,
        actualInput: 205,
      }),
    ];

    expect(getMilkLotCreamPool(lot, rounds)?.availableBalance).toBe(-5);
  });
});

describe('finished stock reconciliation', () => {
  it('keeps all production-board packing entries and totals 45 MPAN100 cases', () => {
    const rounds = [
      round({ id: 'round-a', packedSkus: [{ sku: 'MPAN100', cases: 25, loose: 0, packingRunId: 'pack-a' }] }),
      round({ id: 'round-b', roundNumber: 2, packedSkus: [{ sku: 'MPAN100', cases: 20, loose: 0, packingRunId: 'pack-b' }] }),
    ];

    const lines = reconcileFinishedStock(rounds, []);
    expect(lines).toHaveLength(2);
    expect(lines.reduce((total, line) => total + line.cases, 0)).toBe(45);
    expect(lines.reduce((total, line) => total + line.totalPackets, 0)).toBe(675);
  });

  it('does not duplicate a packing run after it has been persisted', () => {
    const rounds = [round({
      packedSkus: [{ sku: 'MPAN100', cases: 45, loose: 0, packingRunId: 'pack-45' }],
    })];
    const persisted = [{
      id: 'stock-1',
      sku: 'MPAN100',
      productName: 'Malai Paneer - 1kg',
      packingRunId: 'pack-45',
      cases: 45,
      loosePackets: 0,
      totalPackets: 675,
      storageLocation: 'Distribution Coldroom',
      status: 'handed_over' as const,
      createdAt: '2026-10-01T10:00:00.000Z',
      sourceBatchCodes: ['011026/S1/R1/D'],
    }];

    const lines = reconcileFinishedStock(rounds, persisted);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ id: 'stock-1', cases: 45, persisted: true });
  });

  it('calculates packet totals for ghee and butter SKUs', () => {
    const rounds = [
      round({ id: 'ghee', type: 'Ghee', packedSkus: [{ sku: 'GHEE-400-24', cases: 2, loose: 3 }] }),
      round({ id: 'butter', type: 'Butter', packedSkus: [{ sku: 'PUBB', cases: 1, loose: 4 }] }),
    ];

    const lines = reconcileFinishedStock(rounds, []);
    expect(lines.find(line => line.sku === 'GHEE-400-24')?.totalPackets).toBe(51);
    expect(lines.find(line => line.sku === 'PUBB')?.totalPackets).toBe(40);
  });
});
