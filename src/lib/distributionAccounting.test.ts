import { describe, expect, it } from 'vitest';
import { DistributionHandover } from '../data/mockData';
import { getLatestRemainderReview, getMilkLotLabel, getMilkLotSortTime, getPreviouslyAccountedTransfer } from './distributionAccounting';

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

  it('orders actual receipt dates and DDMMYY lots newest first across month and year boundaries', () => {
    const lots = ['270926', '011026', '211026', '010127', '311226'];
    expect(lots.sort((a, b) => getMilkLotSortTime([b], []) - getMilkLotSortTime([a], [])))
      .toEqual(['010127', '311226', '211026', '011026', '270926']);
    expect(getMilkLotSortTime(['planned-code'], [{ lotCode: 'planned-code', receiptDate: '2026-11-02' }]))
      .toBe(Date.parse('2026-11-02'));
    expect(getMilkLotSortTime(['311126'], [])).toBe(-Infinity);
  });

  it('a location-only review does not consume stock; a whole-balance discrepancy consumes only that balance', () => {
    const retained = handover({ recordKind: 'balance_review', quantity: 0, partialRemainderQuantity: 8, partialTransferDisposition: 'still_in_production', partialStorageLocation: 'Chiller' });
    const transfer = handover({ id: 'h-2', quantity: 3 });
    const moved = handover({ id: 'h-3', recordKind: 'balance_review', quantity: 0, partialRemainderQuantity: 5, partialTransferDisposition: 'still_in_production', partialStorageLocation: 'Dairy Container (Finished Stock)' });
    expect(getPreviouslyAccountedTransfer([retained, transfer, moved], 'production_round', 'round-1')).toBe(3);
    const cleared = handover({ id: 'h-4', recordKind: 'balance_review', quantity: 0, partialRemainderQuantity: 5, partialTransferDisposition: 'incorrectly_recorded' });
    expect(getPreviouslyAccountedTransfer([retained, transfer, moved, cleared], 'production_round', 'round-1')).toBe(8);
  });

  it('does not apply a new stock review to unrelated later packing with the same source code', () => {
    const review = handover({ sourceType: 'finished_stock', sourceId: 'original-stock', recordKind: 'balance_review', sourceBatchCodes: ['111026/S1/R1/D'], partialTransferDisposition: 'still_in_production', partialStorageLocation: 'Chiller' });
    expect(getLatestRemainderReview([review], 'finished_stock', 'original-stock')?.partialStorageLocation).toBe('Chiller');
    expect(getLatestRemainderReview([review], 'finished_stock', 'new-stock', { productName: 'Butter', sourceBatchCodes: ['111026/S1/R1/D'] })).toBeUndefined();
  });
});
