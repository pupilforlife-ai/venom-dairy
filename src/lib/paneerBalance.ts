import type { IntermediateLot, PackedSku } from '../data/mockData';
import { getPaneerPackWeight, paneerSkuByCode } from '../data/skuConfig';

/**
 * Derive paneer balance from its source records rather than trusting a cached
 * remainingBalance, which can be stale after an owner corrects block weights.
 */
export function calculatePaneerRemainingBalance(
  outputWeight: number,
  sppRecordedWeight = 0,
  packedSkus: PackedSku[] = [],
  clothWeightKg = 0,
): number {
  const packedWeight = packedSkus.reduce((total, pack) => {
    const weight = pack.weightKg !== undefined
      ? pack.weightKg
      : getPaneerPackWeight(
        paneerSkuByCode[pack.sku],
        pack.cases || 0,
        pack.loose || 0,
        pack.looseWeightKg || 0,
        0,
        pack.caseWeightKg,
      );
    return total + weight;
  }, 0);

  // Keep gross block measurements intact; cloth is tare, deducted exactly once.
  return Math.round((outputWeight - Math.max(0, clothWeightKg) - Math.max(0, sppRecordedWeight) - packedWeight) * 1e9) / 1e9;
}

export function getPaneerRoundRemainingBalance(round: {
  type: string;
  outputWeight: number;
  sppRecordedWeight?: number;
  packedSkus?: PackedSku[];
  remainingBalance?: number;
  paneerCuttingDetails?: { clothKg: number | null };
}): number | undefined {
  if (round.type !== 'D' && round.type !== 'C/S') return round.remainingBalance ?? round.outputWeight;
  if (round.remainingBalance === undefined && round.sppRecordedWeight === undefined && !round.packedSkus?.length && round.paneerCuttingDetails?.clothKg == null) return undefined;
  return calculatePaneerRemainingBalance(round.outputWeight, round.sppRecordedWeight, round.packedSkus || [], round.paneerCuttingDetails?.clothKg ?? 0);
}

/** A recovered-cream lot can share a source round ID without representing its paneer. */
export function isPaneerIntermediateLot(lot: Pick<IntermediateLot, 'productId' | 'productName'>): boolean {
  const productId = lot.productId.toLowerCase();
  return productId === 'pan111' || productId.startsWith('paneer-') || /\bpaneer\b/i.test(lot.productName);
}

/**
 * Net the round-level frozen balances as one shared legacy stock pool. A
 * negative round balance is overpacked stock and offsets positive balances
 * from the other eligible rounds; it is not additional frozen stock.
 */
export function reconcileFrozenRoundBalances(roundBalances: number[]) {
  const finiteBalances = roundBalances.filter(Number.isFinite);
  const positiveBalanceKg = finiteBalances.reduce((sum, balance) => sum + Math.max(0, balance), 0);
  const overpackedKg = finiteBalances.reduce((sum, balance) => sum + Math.max(0, -balance), 0);
  return {
    positiveBalanceKg,
    overpackedKg,
    netBalanceKg: Math.max(0, positiveBalanceKg - overpackedKg),
  };
}
