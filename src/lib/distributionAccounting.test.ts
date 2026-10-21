import { describe, expect, it } from 'vitest';
import { DistributionHandover } from '../data/mockData';
import { getMilkLotLabel, getPreviouslyAccountedTransfer } from './distributionAccounting';

const handover = (overrides: Partial<DistributionHandover>): DistributionHandover => ({
  id: 'h-1',
  sourceType: 'production_round',
  sourceId: 'round-1',
  productName: 'Butter',
  batchCode: 'lot/S1/R1',
  quantity: 20,
  unit: 'kg',
  destination: 'Distribution Coldroom',
  handedOverBy: 'staff',
  handedOverAt: '2026-10-21T00:00:00.000Z',
  ...overrides,
});

describe('distribution transfer accounting', () => {
  it('keeps a still-in-production remainder available after a partial handover', () => {
    expect(getPreviouslyAccountedTransfer([
      handover({ quantity: 20, partialTransferDisposition: 'still_in_production', partialRemainderQuantity: 30 }),
    ], 'production_round', 'round-1')).toBe(20);
  });

  it('removes an incorrectly recorded remainder from future transferable stock', () => {
    expect(getPreviouslyAccountedTransfer([
      handover({ quantity: 20, partialTransferDisposition: 'incorrectly_recorded', partialRemainderQuantity: 30 }),
    ], 'production_round', 'round-1')).toBe(50);
  });

  it('separates lot groups and gives unlinked records an explicit label', () => {
    expect(getMilkLotLabel(['111026'])).toBe('Milk lot 111026');
    expect(getMilkLotLabel(['011026', '111026'])).toBe('Multiple milk lots · 011026, 111026');
    expect(getMilkLotLabel([], 'Standalone JP (no milk lot)')).toBe('Standalone JP (no milk lot)');
  });
});
