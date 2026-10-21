import { DistributionHandover, DistributionHandoverSource } from '../data/mockData';

/** Amount unavailable for a later handover: physically transferred plus explicitly written off. */
export function getPreviouslyAccountedTransfer(
  handovers: DistributionHandover[],
  sourceType: DistributionHandoverSource,
  sourceId: string,
) {
  return handovers
    .filter(record => record.sourceType === sourceType && record.sourceId === sourceId)
    .reduce((total, record) => total + record.quantity + (
      record.partialTransferDisposition === 'incorrectly_recorded' ? record.partialRemainderQuantity || 0 : 0
    ), 0);
}

export function getMilkLotLabel(codes: string[] | undefined, standaloneLabel = 'No milk lot linked') {
  const uniqueCodes = [...new Set(codes || [])].filter(Boolean).sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
  if (uniqueCodes.length === 0) return standaloneLabel;
  return uniqueCodes.length === 1 ? `Milk lot ${uniqueCodes[0]}` : `Multiple milk lots · ${uniqueCodes.join(', ')}`;
}
