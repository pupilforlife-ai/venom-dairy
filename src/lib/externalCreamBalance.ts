type CreamLotBalanceInput = {
  id: string;
  quantity: number;
  consumed: number | null;
  remaining: number | null;
};

type CreamUsageRound = {
  type: string;
  creamSource?: string;
  creamLotId?: string;
  actualInput?: number | null;
  plannedInput?: number | null;
};

/**
 * Repair legacy external-cream balances that were saved as null by deriving
 * the missing values from the lot receipt and its linked butter rounds.
 * Existing numeric balances remain authoritative and are never overwritten.
 */
export function normalizeExternalCreamBalance<T extends CreamLotBalanceInput>(
  lot: T,
  rounds: CreamUsageRound[],
): T {
  const hasConsumed = typeof lot.consumed === 'number' && Number.isFinite(lot.consumed);
  const hasRemaining = typeof lot.remaining === 'number' && Number.isFinite(lot.remaining);
  if (hasConsumed && hasRemaining) return lot;

  const recordedRoundUsage = rounds
    .filter(round => round.type === 'Butter'
      && round.creamSource === 'external'
      && round.creamLotId === lot.id)
    .reduce((sum, round) => {
      const input = round.actualInput ?? round.plannedInput ?? 0;
      return sum + Math.max(0, Number.isFinite(input) ? input : 0);
    }, 0);

  const consumed = typeof lot.consumed === 'number' && Number.isFinite(lot.consumed)
    ? lot.consumed
    : recordedRoundUsage;
  const remaining = typeof lot.remaining === 'number' && Number.isFinite(lot.remaining)
    ? lot.remaining
    : Math.max(0, lot.quantity - consumed);

  return { ...lot, consumed, remaining };
}
