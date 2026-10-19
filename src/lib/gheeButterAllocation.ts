export interface ButterSourceBalance {
  id: string;
  remainingBalance?: number;
}

export interface ButterSourceAllocation {
  id: string;
  quantityKg: number;
}

export interface GheeButterAllocation {
  allocations: ButterSourceAllocation[];
  recordedFromSourceKg: number;
  overdrawKg: number;
}

/** Allocate available butter FIFO without preventing a truthful production record. */
export function allocateGheeButter(
  requestedKg: number,
  sourceRounds: ButterSourceBalance[],
): GheeButterAllocation {
  let remainingKg = Math.max(0, requestedKg);
  const allocations: ButterSourceAllocation[] = [];

  for (const round of sourceRounds) {
    if (remainingKg <= 0) break;
    const availableKg = Math.max(0, round.remainingBalance || 0);
    const quantityKg = Math.min(availableKg, remainingKg);
    if (quantityKg <= 0) continue;
    allocations.push({ id: round.id, quantityKg });
    remainingKg -= quantityKg;
  }

  const recordedFromSourceKg = allocations.reduce((total, allocation) => total + allocation.quantityKg, 0);
  return {
    allocations,
    recordedFromSourceKg,
    overdrawKg: Math.max(0, requestedKg - recordedFromSourceKg),
  };
}
