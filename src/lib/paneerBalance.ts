import type { PackedSku } from '../data/mockData';
import { getPaneerPackWeight, paneerSkuByCode } from '../data/skuConfig';

/**
 * Derive paneer balance from its source records rather than trusting a cached
 * remainingBalance, which can be stale after an owner corrects block weights.
 */
export function calculatePaneerRemainingBalance(
  outputWeight: number,
  sppRecordedWeight = 0,
  packedSkus: PackedSku[] = [],
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

  return outputWeight - Math.max(0, sppRecordedWeight) - packedWeight;
}

export function getPaneerRoundRemainingBalance(round: {
  type: string;
  outputWeight: number;
  sppRecordedWeight?: number;
  packedSkus?: PackedSku[];
  remainingBalance?: number;
}): number | undefined {
  if (round.type !== 'D' && round.type !== 'C/S') return round.remainingBalance ?? round.outputWeight;
  if (round.remainingBalance === undefined && round.sppRecordedWeight === undefined && !round.packedSkus?.length) return undefined;
  return calculatePaneerRemainingBalance(round.outputWeight, round.sppRecordedWeight, round.packedSkus || []);
}
