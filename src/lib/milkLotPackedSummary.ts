import type { MilkLot, PackedSku, ProductionRound } from '../data/mockData';
import type { CrumbingBatch } from '../pages/CrumbingTab';
import { crumbingSkuByCode, getCrumbingPackWeight, getGheePackWeight, getPaneerPackWeight, gheeSkuByCode, normalizeFinishedGoodsSku, paneerSkuByCode } from '../data/skuConfig';

export type PackedCategory = 'paneer' | 'halloumi' | 'ghee' | 'crumbing' | 'other';
export interface MilkLotPackedLine {
  sku: string; category: PackedCategory; cases: number; loose: number; looseWeightKg: number;
  weightKg: number; missingWeight: boolean; caseWeights: Record<string, number>; weightOnly: boolean;
}
export interface MilkLotPackedGroup {
  id: PackedCategory; label: string; lines: MilkLotPackedLine[]; weightKg: number; missingWeight: boolean;
}
const categories: Array<{ id: PackedCategory; label: string }> = [
  { id: 'paneer', label: 'Paneer' }, { id: 'halloumi', label: 'Halloumi' },
  { id: 'ghee', label: 'Ghee' }, { id: 'crumbing', label: 'Crumbing · SPP / JP / HCP' },
  { id: 'other', label: 'Other packed products' },
];
const positive = (value?: number) => Number.isFinite(value) ? Math.max(0, value!) : 0;
const roundKg = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

function categoryFor(sku: string, type?: ProductionRound['type']): PackedCategory {
  if (crumbingSkuByCode[sku]) return 'crumbing';
  if (paneerSkuByCode[sku]) return 'paneer';
  if (gheeSkuByCode[sku] || type === 'Ghee') return 'ghee';
  if (type === 'Halloumi' || /^HAL(?:LOUMI)?(?:$|[-\s\d])/i.test(sku)) return 'halloumi';
  return 'other';
}
function packingWeight(pack: PackedSku): number | undefined {
  const sku = normalizeFinishedGoodsSku(pack.sku);
  if (paneerSkuByCode[sku]) return getPaneerPackWeight(paneerSkuByCode[sku], positive(pack.cases), positive(pack.loose), positive(pack.looseWeightKg), positive(pack.weightKg), pack.caseWeightKg);
  if (gheeSkuByCode[sku]) return getGheePackWeight(gheeSkuByCode[sku], positive(pack.cases), positive(pack.loose));
  if (crumbingSkuByCode[sku]) return getCrumbingPackWeight(crumbingSkuByCode[sku], positive(pack.cases), positive(pack.loose));
  if (Number.isFinite(pack.weightKg)) return positive(pack.weightKg);
  if (Number.isFinite(pack.looseWeightKg) && !pack.cases) return positive(pack.looseWeightKg);
  return undefined;
}

/** Read-only production totals, not stock-on-hand. No transfer subtraction or writes. */
export function buildMilkLotPackedSummary(lot: MilkLot, rounds: ProductionRound[], batches: CrumbingBatch[] = []) {
  const belongs = (round: ProductionRound) => round.milkLotId ? round.milkLotId === lot.id : round.milkLotCode === lot.lotCode;
  const lotRounds = rounds.filter(round => belongs(round) && !['cancelled', 'spoiled'].includes(round.status)
    && round.creamSource !== 'external' && !round.sourceCreamLotId);
  const rows = new Map<string, MilkLotPackedLine>();
  const packingRuns = new Set<string>();
  const add = (pack: PackedSku, type?: ProductionRound['type'], label?: string) => {
    const sku = normalizeFinishedGoodsSku(pack.sku);
    // Recovery stock is not finished packing. Never include cream as paneer.
    if (['PAN111', 'HAL111'].includes(sku) || !sku) return;
    if (pack.packingRunId) {
      const identity = `${pack.packingRunId}:${sku}`;
      if (packingRuns.has(identity)) return;
      packingRuns.add(identity);
    }
    const category = categoryFor(sku, type);
    const key = `${category}:${label || sku}`;
    const current = rows.get(key) || { sku: label || sku, category, cases: 0, loose: 0, looseWeightKg: 0, weightKg: 0, missingWeight: false, caseWeights: {}, weightOnly: Boolean(label) };
    current.cases += positive(pack.cases); current.loose += positive(pack.loose); current.looseWeightKg += positive(pack.looseWeightKg);
    const weight = packingWeight(pack);
    current.weightKg += weight ?? 0;
    current.missingWeight ||= weight === undefined;
    const definition = paneerSkuByCode[sku];
    if (definition?.packMode === 'weight_loose' && positive(pack.cases) > 0) {
      const caseWeight = pack.caseWeightKg ?? (definition.unitsPerCase || 0) * definition.unitWeightKg;
      const bucket = caseWeight.toFixed(2);
      current.caseWeights[bucket] = (current.caseWeights[bucket] || 0) + positive(pack.cases);
    }
    rows.set(key, current);
  };
  const boardPacks = lotRounds.flatMap(round => (round.packedSkus || []).map(pack => ({ round, pack })));
  // Preserve the existing legacy fallback, but never add snapshots on top of board records.
  if (boardPacks.some(({ pack }) => !['PAN111', 'HAL111'].includes(normalizeFinishedGoodsSku(pack.sku)))) boardPacks.forEach(({ round, pack }) => add(pack, round.type));
  else (lot.packedSkus || []).forEach(pack => add(pack));

  // Halloumi's board records kg vacuumed, not cases/SKUs. Count each round's
  // cumulative vacuum total once, never the pool again or a distribution move.
  for (const round of lotRounds.filter(item => item.type === 'Halloumi')) {
    if (!(round.packedSkus || []).some(pack => categoryFor(normalizeFinishedGoodsSku(pack.sku), round.type) === 'halloumi') && positive(round.vacuumPackedWeight) > 0) {
      add({ sku: 'HALLOUMI', cases: 0, weightKg: positive(round.vacuumPackedWeight) }, 'Halloumi', 'Halloumi · vacuum packed (kg)');
    }
  }

  // Resolve explicit source identities; JP PAN111 traceability is NOT milk-lot ownership.
  // Unknown or mixed-lot runs cannot be split into cases/weight without recorded allocations.
  const byId = new Map(batches.map(batch => [batch.id, batch]));
  const byCode = new Map(batches.map(batch => [batch.batchCode, batch]));
  const roundById = new Map(rounds.map(round => [round.id, round]));
  const resolve = (batch: CrumbingBatch, seen = new Set<string>()): Set<string> => {
    if (batch.type === 'JP' || seen.has(batch.id)) return new Set(['unlinked']);
    const visited = new Set(seen).add(batch.id);
    if (batch.clubbedBatchIds?.length) return new Set(batch.clubbedBatchIds.flatMap(id => [...(byId.has(id) ? resolve(byId.get(id)!, visited) : new Set(['unlinked']))]));
    const source = roundById.get(batch.sourceBatchId);
    if (source) return new Set([belongs(source) ? lot.id : 'other-lot']);
    if (batch.sourceBatchId === lot.id) return new Set([lot.id]);
    // Date-coded legacy sources must match the whole lot token, not a substring.
    const token = (batch.sourceBatchCode || '').split('/')[0].replace(/^(HAL|CRM|BUT|GHEE)-/, '');
    if (token === lot.lotCode) return new Set([lot.id]);
    return new Set([token ? 'other-or-unlinked' : 'unlinked']);
  };
  let mixedLotPackingEntries = 0;
  for (const batch of batches) {
    if (batch.type === 'JP' || batch.clubbedInto || ['clubbed', 'cancelled', 'spoiled'].includes(batch.status)) continue;
    for (const pack of batch.packedSkus || []) {
      const sources = pack.sourceBatchCodes?.length
        ? new Set(pack.sourceBatchCodes.flatMap(code => byCode.has(code) ? [...resolve(byCode.get(code)!)] : ['unlinked']))
        : resolve(batch);
      if (!sources.has(lot.id)) continue;
      if (sources.size > 1) { mixedLotPackingEntries += 1; continue; }
      add(pack);
    }
  }
  const groups: MilkLotPackedGroup[] = categories.map(category => {
    const lines = [...rows.values()].filter(row => row.category === category.id).sort((a, b) => a.sku.localeCompare(b.sku));
    return { ...category, lines, weightKg: roundKg(lines.reduce((sum, line) => sum + line.weightKg, 0)), missingWeight: lines.some(line => line.missingWeight) };
  }).filter(group => group.id !== 'other' || group.lines.length > 0);
  return { groups, mixedLotPackingEntries };
}
