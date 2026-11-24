import type { ProductionRound } from '../data/mockData';
import { paneerSkuByCode } from '../data/skuConfig';
import { calculatePaneerRemainingBalance } from '../lib/paneerBalance';

/** Read-only printing estimate; never creates packing, stock or printed-label records. */
export function packetLabelPlan(round: ProductionRound, sku: string, requestedKg?: number) {
  const definition = paneerSkuByCode[sku];
  if (!definition || definition.packMode !== 'units') return null;
  if (!Number.isFinite(round.outputWeight) || round.outputWeight < 0) throw Error('Record the round weight before calculating packet labels.');
  const balanceKg = calculatePaneerRemainingBalance(round.outputWeight, round.sppRecordedWeight, round.packedSkus || [], round.paneerCuttingDetails?.clothKg ?? 0);
  const weightKg = requestedKg === undefined ? Math.max(0, balanceKg) : requestedKg;
  if (!Number.isFinite(weightKg) || weightKg < 0) throw Error('Enter a valid weight of zero or more.');
  // Integer milligrams avoid 72.4 / 0.2 rounding down to 361 due to floating point.
  const mass = Math.round(weightKg * 1e6), unit = Math.round(definition.unitWeightKg * 1e6);
  if (!Number.isSafeInteger(mass) || !Number.isSafeInteger(unit) || unit <= 0) throw Error('The weight is too large or the SKU packet weight is invalid.');
  const packets = Math.floor(mass / unit), unitsPerCase = definition.unitsPerCase || 0;
  return {balanceKg, weightKg, unitWeightKg: definition.unitWeightKg, packets,
    cases: unitsPerCase ? Math.floor(packets / unitsPerCase) : 0,
    loose: unitsPerCase ? packets % unitsPerCase : packets,
    remainderKg: (mass - packets * unit) / 1e6,
    exceedsBalance: mass > Math.round(Math.max(0, balanceKg) * 1e6)};
}
