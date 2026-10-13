import { describe, expect, it } from 'vitest';
import type { FinishedStockLot, IntermediateLot, ProductionRound } from '../data/mockData';
import { getProductionRoundTypeChangeConflict } from './productionRoundTypeChange';

function round(overrides: Partial<ProductionRound> = {}): ProductionRound {
  return {
    id: 'round-8',
    milkLotId: 'milk-111026',
    milkLotCode: '111026',
    shiftId: 'shift-2',
    shiftNumber: 2,
    roundNumber: 8,
    type: 'C/S',
    status: 'cut',
    team: ['Team'],
    plannedInput: 500,
    actualInput: 500,
    outputWeight: 83.303,
    blockWeights: [13.091, 11.423],
    numberOfBlocks: 2,
    cuttingType: '400g cubes',
    remainingBalance: 83.303,
    startTime: '2026-10-12T09:21:54.605Z',
    locked: false,
    ...overrides,
  };
}

describe('Paneer round type-change conflicts', () => {
  it('allows a correction after cutting when no stock or cream conflicts exist', () => {
    expect(getProductionRoundTypeChangeConflict(round(), [], [])).toBeNull();
  });

  it('blocks a correction when cream has been recorded', () => {
    expect(getProductionRoundTypeChangeConflict(round({ creamRecovered: 0 }), [], [])).toContain('cream');
  });

  it('blocks a correction when an intermediate lot references the round', () => {
    const lot = { sourceBatchId: 'round-8' } as IntermediateLot;
    expect(getProductionRoundTypeChangeConflict(round(), [lot], [])).toContain('intermediate');
  });

  it('blocks a correction when finished stock references the round batch prefix', () => {
    const stock = { sourceBatchCodes: ['111026/S2/R8/C/S'] } as FinishedStockLot;
    expect(getProductionRoundTypeChangeConflict(round(), [], [stock])).toContain('finished stock');
  });
});
