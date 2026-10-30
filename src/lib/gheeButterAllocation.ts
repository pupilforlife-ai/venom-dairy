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

interface GheeButterSource extends ButterSourceBalance {
  type: string;
  status: string;
  milkLotId: string;
  creamSource?: string;
  creamLotId?: string;
  blendedPoolId?: string;
  butterOutput?: number;
}

/** Ghee consumes pure churned butter, never replacer/salt-containing blends. */
export function getGheeButterSources<T extends GheeButterSource>(rounds: T[], source: string): T[] {
  const [kind, id] = source.split(':', 2);
  if (!id || (kind !== 'milk' && kind !== 'cream')) return [];
  return rounds.filter(round => round.type === 'Butter' && !round.blendedPoolId
    && !['cancelled', 'spoiled', 'discarded'].includes(round.status)
    && Number.isFinite(round.butterOutput) && (round.butterOutput || 0) > 0
    && (kind === 'cream' ? round.creamSource === 'external' && round.creamLotId === id
      : round.creamSource !== 'external' && round.milkLotId === id));
}

export function getGheeAvailableButter(rounds: GheeButterSource[], source: string): number {
  return getGheeButterSources(rounds, source).reduce((total, round) => total
    + (Number.isFinite(round.remainingBalance) ? Math.max(0, round.remainingBalance || 0) : 0), 0);
}

/** Allocate available butter FIFO without preventing a truthful production record. */
export function allocateGheeButter(
  requestedKg: number,
  sourceRounds: ButterSourceBalance[],
): GheeButterAllocation {
  if (!Number.isFinite(requestedKg) || requestedKg <= 0) {
    throw new Error('Enter a finite positive butter input');
  }
  let remainingKg = requestedKg;
  const allocations: ButterSourceAllocation[] = [];

  for (const round of sourceRounds) {
    if (remainingKg <= 0) break;
    // An invalid legacy balance is not stock and must never contaminate the
    // allocation of any other source. Physical overdraw remains recordable.
    const availableKg = Number.isFinite(round.remainingBalance) ? Math.max(0, round.remainingBalance || 0) : 0;
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
