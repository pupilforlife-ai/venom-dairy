import { describe, expect, it } from 'vitest';
import { allocateTraysFifo, hasDistributionPackingRecord } from './crumbingPacking';

describe('combined SPP packing FIFO allocation', () => {
  it('uses the oldest batches first and leaves stock on the latest batch', () => {
    const result = allocateTraysFifo([
      { id: 'r3', batchCode: 'SPP-R3', createdAt: '2026-10-12T03:00:00Z', availableTrays: 7, traysPackedBefore: 0 },
      { id: 'r1', batchCode: 'SPP-R1', createdAt: '2026-10-12T01:00:00Z', availableTrays: 3, traysPackedBefore: 0 },
      { id: 'r2', batchCode: 'SPP-R2', createdAt: '2026-10-12T02:00:00Z', availableTrays: 4, traysPackedBefore: 0 },
    ], 4);

    expect(result.unallocatedTrays).toBe(0);
    expect(result.allocations).toEqual([
      { batchId: 'r1', batchCode: 'SPP-R1', traysAllocated: 3, traysPackedBefore: 0, traysPackedAfter: 3, availableTraysAfter: 0 },
      { batchId: 'r2', batchCode: 'SPP-R2', traysAllocated: 1, traysPackedBefore: 0, traysPackedAfter: 1, availableTraysAfter: 3 },
    ]);
  });

  it('reports any requested trays that are not available', () => {
    const result = allocateTraysFifo([
      { id: 'r1', batchCode: 'SPP-R1', createdAt: '2026-10-12T01:00:00Z', availableTrays: 2, traysPackedBefore: 1 },
      { id: 'r2', batchCode: 'SPP-R2', createdAt: '2026-10-12T02:00:00Z', availableTrays: 1, traysPackedBefore: 0 },
    ], 5);

    expect(result.allocations.map(allocation => allocation.traysAllocated)).toEqual([2, 1]);
    expect(result.unallocatedTrays).toBe(2);
  });
});

describe('combined SPP packing distribution output', () => {
  it('keeps the aggregate primary record and excludes allocation-only secondary records', () => {
    expect(hasDistributionPackingRecord({
      id: 'r1',
      packedSkus: [{ sku: 'SPP' }],
      combinedPackingAllocations: [{ primaryBatchId: 'r1' }],
    })).toBe(true);

    expect(hasDistributionPackingRecord({
      id: 'r2',
      packedSkus: [],
      combinedPackingAllocations: [{ primaryBatchId: 'r1' }],
    })).toBe(false);
  });
});
