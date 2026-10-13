export interface FifoTraySource {
  id: string;
  batchCode: string;
  createdAt: string;
  availableTrays: number;
  traysPackedBefore: number;
}

export interface FifoTrayAllocation {
  batchId: string;
  batchCode: string;
  traysAllocated: number;
  traysPackedBefore: number;
  traysPackedAfter: number;
  availableTraysAfter: number;
}

interface CombinedPackingDistributionSource {
  id: string;
  packedSkus?: unknown[];
  combinedPackingAllocations?: Array<{ primaryBatchId: string }>;
}

export function hasDistributionPackingRecord(batch: CombinedPackingDistributionSource) {
  const isAllocationOnlySecondary = batch.combinedPackingAllocations?.some(
    allocation => allocation.primaryBatchId !== batch.id
  ) && !(batch.packedSkus?.length);

  return !isAllocationOnlySecondary;
}

export function allocateTraysFifo(sources: FifoTraySource[], requestedTrays: number) {
  const sorted = [...sources].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt) || left.batchCode.localeCompare(right.batchCode)
  );
  let remaining = requestedTrays;
  const allocations: FifoTrayAllocation[] = [];

  for (const source of sorted) {
    if (remaining <= 0) break;
    const available = Math.max(0, Math.floor(source.availableTrays));
    const traysAllocated = Math.min(available, remaining);
    if (traysAllocated <= 0) continue;
    allocations.push({
      batchId: source.id,
      batchCode: source.batchCode,
      traysAllocated,
      traysPackedBefore: source.traysPackedBefore,
      traysPackedAfter: source.traysPackedBefore + traysAllocated,
      availableTraysAfter: available - traysAllocated,
    });
    remaining -= traysAllocated;
  }

  return { allocations, unallocatedTrays: remaining };
}
