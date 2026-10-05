import { FinishedStockLot, ProductionPackedSku, ProductionRound } from '../data/mockData';
import { normalizeFinishedGoodsSku, paneerSkuByCode } from '../data/skuConfig';

export interface ReconciledFinishedStockLine extends FinishedStockLot {
  persisted: boolean;
  sourceRoundId?: string;
  sourcePackIndex?: number;
}

export interface ProductionPackingEntry {
  round: ProductionRound;
  pack: ProductionPackedSku;
  packIndex: number;
  packingRunId: string;
  sourceBatchCode: string;
}

export function getProductionSourceBatchCode(round: ProductionRound) {
  return round.batchCode
    || round.sourceBatchCode
    || `${round.milkLotCode}/S${round.shiftNumber}/R${round.roundNumber}/${round.type}`;
}

export function getLegacyPackingRunId(roundId: string, packIndex: number) {
  return `legacy-${roundId}-${packIndex}`;
}

/**
 * The Production Board is the authoritative record of what was packed.
 * FinishedStock is the location/handover ledger for those packing entries.
 * This function gives every paneer packing entry a stable identity, including
 * entries created before packingRunId was introduced.
 */
export function getProductionPackingEntries(rounds: ProductionRound[]): ProductionPackingEntry[] {
  return rounds.flatMap((round) => {
    if ((round.type !== 'D' && round.type !== 'C/S') || ['cancelled', 'spoiled'].includes(round.status)) return [];
    const sourceBatchCode = getProductionSourceBatchCode(round);
    return (round.packedSkus || []).flatMap((rawPack, packIndex) => {
      const sku = normalizeFinishedGoodsSku(rawPack.sku);
      // PAN111 remains an intermediate recovery lot; it is not finished stock.
      if (sku === 'PAN111' || !paneerSkuByCode[sku]) return [];
      const pack: ProductionPackedSku = { ...rawPack, sku };
      return [{
        round,
        pack,
        packIndex,
        packingRunId: pack.packingRunId || getLegacyPackingRunId(round.id, packIndex),
        sourceBatchCode,
      }];
    });
  });
}

function matchesLegacyStock(
  stock: FinishedStockLot,
  entry: ProductionPackingEntry,
) {
  return normalizeFinishedGoodsSku(stock.sku) === entry.pack.sku
    && (stock.sourceBatchCodes || []).includes(entry.sourceBatchCode)
    && (stock.cases || 0) === (entry.pack.cases || 0)
    && (stock.loosePackets || 0) === (entry.pack.loose || 0);
}

/**
 * Reconcile the production packing ledger with persisted stock movements.
 * Missing legacy FinishedStock rows are represented as awaiting handover so
 * recorded production can never silently disappear from Inventory, Dashboard,
 * or Distribution. Once handed over, Distribution persists the synthetic line
 * under its stable legacy packingRunId.
 */
export function reconcileFinishedStock(
  rounds: ProductionRound[],
  finishedStock: FinishedStockLot[],
): ReconciledFinishedStockLine[] {
  const entries = getProductionPackingEntries(rounds);
  const claimedStockIds = new Set<string>();

  const productionLines = entries.map((entry) => {
    const linkedStock = finishedStock.find((stock) =>
      !claimedStockIds.has(stock.id)
      && (
        stock.packingRunId === entry.packingRunId
        || (!entry.pack.packingRunId && matchesLegacyStock(stock, entry))
      )
    );

    if (linkedStock) {
      claimedStockIds.add(linkedStock.id);
      return {
        ...linkedStock,
        sku: normalizeFinishedGoodsSku(linkedStock.sku),
        persisted: true,
        sourceRoundId: entry.round.id,
        sourcePackIndex: entry.packIndex,
      };
    }

    const definition = paneerSkuByCode[entry.pack.sku];
    const totalPackets = definition?.packMode === 'units'
      ? (entry.pack.cases || 0) * (definition.unitsPerCase || 0) + (entry.pack.loose || 0)
      : 0;

    return {
      id: `synthetic-${entry.packingRunId}`,
      sku: entry.pack.sku,
      productName: definition?.productName || entry.pack.sku,
      packingRunId: entry.packingRunId,
      cases: entry.pack.cases || 0,
      loosePackets: entry.pack.loose || 0,
      totalPackets,
      storageLocation: 'Dairy Container (Finished Stock)',
      status: 'awaiting_handover' as const,
      createdAt: entry.round.completedAt || entry.round.startTime,
      sourceBatchCodes: [entry.sourceBatchCode],
      ...(entry.pack.weightKg !== undefined ? { weightKg: entry.pack.weightKg } : {}),
      ...(entry.pack.looseWeightKg !== undefined ? { looseWeightKg: entry.pack.looseWeightKg } : {}),
      persisted: false,
      sourceRoundId: entry.round.id,
      sourcePackIndex: entry.packIndex,
    };
  });

  const otherPersistedLines = finishedStock
    .filter((stock) => !claimedStockIds.has(stock.id))
    .map((stock) => ({
      ...stock,
      sku: normalizeFinishedGoodsSku(stock.sku),
      persisted: true,
    }));

  return [...productionLines, ...otherPersistedLines];
}

export function isOnSiteFinishedStock(stock: Pick<FinishedStockLot, 'status'>) {
  return stock.status !== 'handed_over';
}
