import type { FinishedStockLot, IntermediateLot, ProductionRound } from '../data/mockData';

function roundBatchPrefix(round: ProductionRound) {
  return `${round.milkLotCode}/S${round.shiftNumber}/R${round.roundNumber}/`;
}

/**
 * Returns the stock/genealogy conflict that must be resolved before a Paneer
 * type correction can be approved. Physical production measurements such as
 * block weights, cutting details and output weight are deliberately allowed:
 * they describe the same round and must survive a data-entry correction.
 */
export function getProductionRoundTypeChangeConflict(
  round: ProductionRound,
  intermediateLots: IntermediateLot[],
  finishedStock: FinishedStockLot[],
) {
  if (round.creamRecovered !== undefined || (round.creamBucketWeights?.length || 0) > 0) {
    return 'cream recovery is already recorded';
  }
  if (round.sppRecordedWeight !== undefined) {
    return 'SPP allocation is already recorded';
  }
  if ((round.packedSkus?.length || 0) > 0) {
    return 'packing is already recorded on the round';
  }
  if (intermediateLots.some(lot => lot.sourceBatchId === round.id)) {
    return 'an intermediate stock lot already references the round';
  }

  const batchPrefix = roundBatchPrefix(round);
  if (finishedStock.some(stock => (stock.sourceBatchCodes || []).some(code => code.startsWith(batchPrefix)))) {
    return 'finished stock already references the round';
  }

  return null;
}
