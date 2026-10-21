import { DistributionHandover, DistributionHandoverSource, MilkLot } from '../data/mockData';

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

/** Use receipt dates, with DDMMYY lot codes as a fallback; never alphabetic lot order. */
export function getMilkLotSortTime(codes: string[] | undefined, milkLots: Pick<MilkLot, 'lotCode' | 'receiptDate'>[]) {
  return Math.max(-Infinity, ...(codes || []).map(code => {
    const receiptDate = milkLots.find(lot => lot.lotCode === code)?.receiptDate;
    if (receiptDate && Number.isFinite(Date.parse(receiptDate))) return Date.parse(receiptDate);
    if (!/^\d{6}$/.test(code)) return -Infinity;
    const day = Number(code.slice(0, 2));
    const month = Number(code.slice(2, 4));
    const year = 2000 + Number(code.slice(4));
    const timestamp = Date.UTC(year, month - 1, day);
    const date = new Date(timestamp);
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? timestamp : -Infinity;
  }));
}

/** Find the latest remainder decision for an active source, including older stock splits. */
export function getLatestRemainderReview(
  handovers: DistributionHandover[],
  sourceType: DistributionHandoverSource,
  sourceId: string,
  options: { stockIds?: string[]; sourceBatchCodes?: string[]; productName?: string } = {},
) {
  return handovers.filter(record => {
    if (record.sourceType !== sourceType || !record.partialTransferDisposition) return false;
    if (record.sourceId === sourceId || options.stockIds?.includes(record.sourceId || '')) return true;
    if (record.recordKind || sourceType !== 'finished_stock' || record.productName !== options.productName) return false;
    const sources = record.sourceBatchCodes || record.notes?.match(/Packed source batches: ([^·]+)/)?.[1].split(',').map(code => code.trim()) || [record.batchCode];
    return sources.some(code => options.sourceBatchCodes?.includes(code));
  }).sort((left, right) => right.handedOverAt.localeCompare(left.handedOverAt))[0];
}
