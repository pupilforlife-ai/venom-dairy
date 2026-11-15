import type { FinishedStockLot, ProductionRound } from '../data/mockData';
import { normalizeFinishedGoodsSku, paneerSkuByCode } from '../data/skuConfig';
import { getProductionPackingEntries, reconcileFinishedStock } from '../lib/finishedStock';
import { paneerPackMass } from './paneerJourney';

export interface PaneerStockShare {
  roundId: string;
  packIndex: number;
  packets: number | null;
  kg: number | null;
  packetBatchCode?: string;
}
export interface PaneerStockTraceLine {
  id: string;
  sku: string;
  category: 'on_site' | 'distribution' | 'discrepancy';
  location: string;
  returned: boolean;
  caseBatchCode?: string;
  mixedCaseId?: string;
  physicalCases: number;
  totalPackets: number | null;
  shares: PaneerStockShare[];
}
const kg = (n: number) => Math.round(n * 1e9) / 1e9;

/** Current stock custody, not gross handover history. Read-only; never infer unknown origins. */
export function paneerStockTrace(rounds: ProductionRound[], stock: FinishedStockLot[]) {
  const entries = getProductionPackingEntries(rounds).filter(e => ['D', 'C/S'].includes(e.round.type) && paneerSkuByCode[e.pack.sku]);
  const lines: PaneerStockTraceLine[] = [], warnings: string[] = [];
  const inputIds = new Set<string>();
  for (const line of stock) {
    if (inputIds.has(line.id) && paneerSkuByCode[normalizeFinishedGoodsSku(line.sku)]) warnings.push(`Stock ${line.id}: duplicate stock identity; only one record can be traced.`);
    inputIds.add(line.id);
  }
  const seen = new Set<string>();
  for (const line of reconcileFinishedStock(rounds, stock)) {
    const definition = paneerSkuByCode[line.sku];
    if (!definition || line.cases + line.loosePackets + (line.weightKg || 0) + (line.looseWeightKg || 0) === 0) continue;
    if (seen.has(line.id)) { warnings.push(`Stock ${line.id}: duplicate stock identity; omitted from this trace summary.`); continue; }
    seen.add(line.id);
    const units = definition.packMode === 'units';
    if (![line.cases, line.loosePackets, line.totalPackets].every(n => Number.isSafeInteger(n) && n >= 0)
      || (units && line.totalPackets !== line.cases * definition.unitsPerCase! + line.loosePackets)) {
      warnings.push(`Stock ${line.id}: invalid quantity or packet total; source attribution needs review.`); continue;
    }
    const shares: PaneerStockShare[] = [];
    if (line.mixedCaseId) {
      // Groups are explicitly recorded with identical composition per case, never an inferred FIFO split.
      const count = line.mixedCaseCount, parts = line.mixedCaseParts;
      if (!units || !count || !Number.isSafeInteger(count) || count < line.cases || line.loosePackets || !parts?.length
        || new Set(parts.map(p => p.source.key)).size !== parts.length
        || parts.some(p => !p.source.roundId || !Number.isSafeInteger(p.source.packIndex) || p.source.packIndex < 0 || !Number.isSafeInteger(p.packets) || p.packets <= 0 || p.packets % count !== 0 || normalizeFinishedGoodsSku(p.source.sku) !== line.sku)
        || parts.reduce((n, p) => n + p.packets, 0) !== count * definition.unitsPerCase!) {
        warnings.push(`Stock ${line.id}: mixed-case composition is incomplete; do not guess its sources.`); continue;
      }
      for (const part of parts) {
        const packets = part.packets / count * line.cases;
        shares.push({roundId: part.source.roundId, packIndex: part.source.packIndex, packets,
          kg: kg(packets * definition.unitWeightKg), packetBatchCode: part.source.packetBatchCode});
      }
    } else {
      const candidates = entries.filter(e => e.pack.sku === line.sku && (
        line.sourceRoundId === e.round.id && line.sourcePackIndex === e.packIndex
        || line.packingRunId === e.packingRunId || line.packingRunId.startsWith(e.packingRunId + '-')
      ));
      if (candidates.length !== 1) {
        warnings.push(`Stock ${line.id}: ${candidates.length ? 'ambiguous' : 'missing'} source packing link; not assigned to a round.`); continue;
      }
      const entry = candidates[0];
      const mass = units ? kg(line.totalPackets * definition.unitWeightKg) : paneerPackMass({
        sku: line.sku, cases: line.cases, loose: line.loosePackets,
        weightKg: line.weightKg, caseWeightKg: line.caseWeightKg, looseWeightKg: line.looseWeightKg,
      });
      if (mass === null || !Number.isFinite(mass) || mass < 0) { warnings.push(`Stock ${line.id}: weight needs review.`); continue; }
      shares.push({roundId: entry.round.id, packIndex: entry.packIndex, packets: units ? line.totalPackets : null,
        kg: mass, packetBatchCode: line.packetBatchCode || entry.pack.packetBatchCode});
    }
    lines.push({id: line.id, sku: line.sku,
      category: line.status === 'handed_over' ? 'distribution' : line.status === 'incorrectly_recorded' ? 'discrepancy' : 'on_site',
      location: line.storageLocation || 'Location not recorded', returned: line.status === 'returned',
      caseBatchCode: line.finishedGoodsBatchCode || line.caseBatchCode, mixedCaseId: line.mixedCaseId,
      physicalCases: line.cases, totalPackets: units ? line.totalPackets : null, shares});
  }
  return {lines, warnings};
}

export function roundStockSummary(round: ProductionRound, report: ReturnType<typeof paneerStockTrace>) {
  const rows = report.lines.flatMap(line => {
    const shares = line.shares.filter(s => s.roundId === round.id);
    if (!shares.length) return [];
    return [{...line, shares, packets: shares.some(s => s.packets === null) ? null : shares.reduce((n, s) => n + s.packets!, 0),
      kg: shares.some(s => s.kg === null) ? null : kg(shares.reduce((n, s) => n + s.kg!, 0))}];
  });
  const skus = [...new Set([...(round.packedSkus || []).map(p => normalizeFinishedGoodsSku(p.sku)).filter(s => s !== 'PAN111' && paneerSkuByCode[s]), ...rows.map(r => r.sku)])];
  const totals = skus.map(sku => {
    const definition = paneerSkuByCode[sku], packs = (round.packedSkus || []).filter(p => normalizeFinishedGoodsSku(p.sku) === sku);
    const unitBased = definition.packMode === 'units';
    const originalPackets = unitBased ? packs.reduce((n, p) => n + p.cases * definition.unitsPerCase! + (p.loose || 0), 0) : null;
    const masses = packs.map(p => paneerPackMass({...p, sku})), originalKg = masses.some(m => m === null) ? null : kg(masses.reduce<number>((n, m) => n + m!, 0));
    const amount = (category: PaneerStockTraceLine['category']) => {
      const selected = rows.filter(r => r.sku === sku && r.category === category);
      return {packets: unitBased ? selected.reduce((n, r) => n + (r.packets || 0), 0) : null,
        kg: selected.some(r => r.kg === null) ? null : kg(selected.reduce((n, r) => n + r.kg!, 0))};
    };
    const onSite = amount('on_site'), distribution = amount('distribution'), discrepancy = amount('discrepancy');
    const differencePackets = originalPackets === null ? null : originalPackets - onSite.packets! - distribution.packets! - discrepancy.packets!;
    const differenceKg = originalKg === null || [onSite, distribution, discrepancy].some(a => a.kg === null) ? null : kg(originalKg - onSite.kg! - distribution.kg! - discrepancy.kg!);
    return {sku, originalPackets, originalKg, onSite, distribution, discrepancy, differencePackets, differenceKg};
  });
  return {rows, totals};
}
