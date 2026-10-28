import { describe, expect, it } from 'vitest';
import type { MilkLot, ProductionRound } from '../data/mockData';
import type { CrumbingBatch } from '../pages/CrumbingTab';
import { buildMilkLotPackedSummary } from './milkLotPackedSummary';

const lot = { id: 'milk-1', lotCode: '111026' } as MilkLot;
const round = (updates: Partial<ProductionRound> = {}): ProductionRound => ({ id: 'r1', milkLotId: lot.id, milkLotCode: lot.lotCode, type: 'D', status: 'packed', packedSkus: [], ...updates } as ProductionRound);
const batch = (updates: Partial<CrumbingBatch> = {}): CrumbingBatch => ({ id: 'b1', batchCode: 'SPP-1', type: 'SPP', status: 'packed', sourceBatchId: 'r1', sourceBatchCode: '111026/S1/R1/D', packedSkus: [{ sku: 'SPP', cases: 2, loose: 1 }], ...updates } as CrumbingBatch);
const group = (result: ReturnType<typeof buildMilkLotPackedSummary>, id: string) => result.groups.find(item => item.id === id)!;

describe('Milk Receiving grouped packed-production summary', () => {
  it('always shows the four requested categories, with explicit empty zero totals', () => {
    const summary = buildMilkLotPackedSummary(lot, []);
    expect(summary.groups.map(item => item.id)).toEqual(['paneer', 'halloumi', 'ghee', 'crumbing']);
    expect(summary.groups.every(item => item.weightKg === 0 && item.lines.length === 0)).toBe(true);
  });
  it('retains all 45 MPAN100 cases, at 15 × 1 kg per case plus loose packets', () => {
    const summary = buildMilkLotPackedSummary(lot, [round({ packedSkus: [{ sku: 'MPAN100', cases: 20, loose: 3 }, { sku: 'MPAN100', cases: 25, loose: 0 }] })]);
    expect(group(summary, 'paneer').lines[0]).toMatchObject({ cases: 45, loose: 3, weightKg: 678 });
    expect(group(summary, 'paneer').weightKg).toBe(678);
  });
  it.each(['MPAN010', 'RPAN010'])('keeps variable case weights for %s without reverting to the default case weight', sku => {
    const summary = buildMilkLotPackedSummary(lot, [round({ packedSkus: [
      { sku, cases: 2, loose: 0, caseWeightKg: 20 }, { sku, cases: 2, loose: 0, caseWeightKg: 30 },
      { sku, cases: 1, loose: 0, caseWeightKg: 10, looseWeightKg: 2 },
    ] })]);
    expect(group(summary, 'paneer').weightKg).toBe(112);
    expect(group(summary, 'paneer').lines[0]).toMatchObject({ cases: 5, looseWeightKg: 2, caseWeights: { '20.00': 2, '30.00': 2, '10.00': 1 } });
  });
  it('calculates both ghee case configurations separately and adds them accurately', () => {
    const summary = buildMilkLotPackedSummary(lot, [round({ type: 'Ghee', packedSkus: [
      { sku: 'GHEE-400', cases: 1, loose: 0 }, { sku: 'GHEE-400-24', cases: 2, loose: 3 },
    ] })]);
    expect(group(summary, 'ghee').weightKg).toBe(31.2);
    expect(group(summary, 'ghee').lines).toHaveLength(2);
  });
  it('keeps quantities and weights from different categories separate', () => {
    const summary = buildMilkLotPackedSummary(lot, [round({ packedSkus: [{ sku: 'MPAN200', cases: 2, loose: 1 }, { sku: 'GHEE-1500', cases: 1, loose: 1 }] })]);
    expect(group(summary, 'paneer').weightKg).toBe(9.8);
    expect(group(summary, 'ghee').weightKg).toBe(10.5);
  });
  it('counts cumulative vacuum-packed Halloumi kg, not output or pool availability', () => {
    const summary = buildMilkLotPackedSummary({ ...lot, halloumiPool: { vacuumPacked: 999 } } as MilkLot, [round({ type: 'Halloumi', vacuumPackedWeight: 31.7, outputWeight: 70 })]);
    expect(group(summary, 'halloumi').weightKg).toBe(31.7);
    expect(group(summary, 'halloumi').lines[0]).toMatchObject({ weightOnly: true, cases: 0 });
  });
  it('does not count Halloumi vacuum weight again when that round has explicit Halloumi SKU packing', () => {
    const summary = buildMilkLotPackedSummary(lot, [round({ type: 'Halloumi', vacuumPackedWeight: 30, packedSkus: [{ sku: 'HAL200', cases: 1, loose: 0, weightKg: 30 }] })]);
    expect(group(summary, 'halloumi').weightKg).toBe(30);
    expect(group(summary, 'halloumi').lines).toHaveLength(1);
  });
  it('includes lot-linked SPP and HCP packing, even before final batch completion', () => {
    const summary = buildMilkLotPackedSummary(lot, [round()], [batch({ status: 'frying' }), batch({ id: 'h1', type: 'HCP', sourceBatchId: lot.id, packedSkus: [{ sku: 'HCP', cases: 3, loose: 2 }] })]);
    expect(group(summary, 'crumbing').weightKg).toBe(15.75);
    expect(group(summary, 'crumbing').lines.map(item => item.sku)).toEqual(['HCP', 'SPP']);
  });
  it('excludes standalone JP even when PAN111 ingredient trace points to this milk lot', () => {
    const summary = buildMilkLotPackedSummary(lot, [round()], [batch({ type: 'JP', packedSkus: [{ sku: 'JP', cases: 100, loose: 0 }] })]);
    expect(group(summary, 'crumbing').weightKg).toBe(0);
  });
  it('excludes unrelated milk lots, stale code matches with a different explicit ID, and external cream', () => {
    const packs = [{ sku: 'MPAN100', cases: 100, loose: 0 }];
    const summary = buildMilkLotPackedSummary(lot, [round({ milkLotId: 'milk-2', packedSkus: packs }), round({ creamSource: 'external', type: 'Butter', packedSkus: packs }), round({ sourceCreamLotId: 'cream-2', type: 'Ghee', packedSkus: packs })]);
    expect(group(summary, 'paneer').weightKg).toBe(0);
  });
  it('does not count cancelled/spoiled rounds or intermediate PAN111/HAL111 as finished packing', () => {
    const summary = buildMilkLotPackedSummary(lot, [round({ status: 'cancelled', packedSkus: [{ sku: 'MPAN100', cases: 4, loose: 0 }] }), round({ status: 'spoiled', vacuumPackedWeight: 20, type: 'Halloumi' }), round({ packedSkus: [{ sku: 'PAN111', cases: 0, loose: 0, weightKg: 25 }, { sku: 'HAL111', cases: 0, loose: 0, weightKg: 10 }] })]);
    expect(summary.groups.every(item => item.weightKg === 0)).toBe(true);
  });
  it('uses legacy lot snapshot only if there are no authoritative board packing records', () => {
    const old = { ...lot, packedSkus: [{ sku: 'MPAN100', cases: 45 }] };
    expect(group(buildMilkLotPackedSummary(old, []), 'paneer').weightKg).toBe(675);
    expect(group(buildMilkLotPackedSummary(old, [round({ packedSkus: [{ sku: 'MPAN100', cases: 2, loose: 0 }] })]), 'paneer').weightKg).toBe(30);
  });
  it('does not let handover status reduce manufactured packing totals', () => {
    expect(group(buildMilkLotPackedSummary(lot, [round({ status: 'handed_over', packedSkus: [{ sku: 'MPAN100', cases: 5, loose: 0 }] })]), 'paneer').weightKg).toBe(75);
  });
  it('deduplicates mirrored packing runs, but keeps distinct SKUs from the same run', () => {
    const packs = [{ sku: 'SPP', cases: 2, loose: 0, packingRunId: 'pack-1' }, { sku: 'HCP', cases: 1, loose: 0, packingRunId: 'pack-1' }];
    const summary = buildMilkLotPackedSummary(lot, [round({ packedSkus: packs })], [batch({ packedSkus: packs })]);
    expect(group(summary, 'crumbing').weightKg).toBe(9);
  });
  it('counts same-lot combined crumbing once, not secondary tray allocations or combined-run copies', () => {
    const b1 = batch({ packedSkus: [{ sku: 'SPP', cases: 5, loose: 0, packingRunId: 'combined', sourceBatchCodes: ['SPP-1', 'SPP-2'] }] });
    const b2 = batch({ id: 'b2', batchCode: 'SPP-2', packedSkus: [], combinedPackingAllocations: [{ primaryBatchId: 'b1', batchId: 'b2', batchCode: 'SPP-2', packingRunId: 'combined', packedAt: '2026-10-28T10:00:00Z', packedBy: 'Tester', traysAllocated: 2, traysPackedBefore: 0, traysPackedAfter: 2, availableTraysAfter: 0 }] });
    expect(group(buildMilkLotPackedSummary(lot, [round()], [b1, b2]), 'crumbing').weightKg).toBe(15);
  });
  it('flags a mixed-lot combined pack rather than pretending all cases belong to each lot', () => {
    const other = round({ id: 'r2', milkLotId: 'milk-2', milkLotCode: '261026' });
    const b1 = batch({ packedSkus: [{ sku: 'SPP', cases: 5, loose: 0, sourceBatchCodes: ['SPP-1', 'SPP-2'] }] });
    const b2 = batch({ id: 'b2', batchCode: 'SPP-2', sourceBatchId: 'r2', packedSkus: [] });
    const result = buildMilkLotPackedSummary(lot, [round(), other], [b1, b2]);
    expect(result.mixedLotPackingEntries).toBe(1);
    expect(group(result, 'crumbing').weightKg).toBe(0);
  });
  it('matches legacy source lot tokens exactly, never substrings', () => {
    const result = buildMilkLotPackedSummary(lot, [], [batch({ sourceBatchId: 'legacy', sourceBatchCode: '2111026/S1/R1/D' })]);
    expect(group(result, 'crumbing').weightKg).toBe(0);
    expect(group(buildMilkLotPackedSummary(lot, [], [batch({ sourceBatchId: 'legacy' })]), 'crumbing').weightKg).toBe(6.25);
  });
  it('preserves other recorded SKUs and flags unknown weights, rather than claiming a complete zero', () => {
    const summary = buildMilkLotPackedSummary(lot, [round({ type: 'Butter', packedSkus: [{ sku: 'PUBB', cases: 2, loose: 0, weightKg: 36 }, { sku: 'UNKNOWN', cases: 2, loose: 0 }] })]);
    expect(group(summary, 'other')).toMatchObject({ weightKg: 36, missingWeight: true });
    expect(group(summary, 'other').lines).toHaveLength(2);
  });
  it('does not mutate the production records or create any new storage entries', () => {
    const input = [round({ packedSkus: [{ sku: 'MPAN200', cases: 4, loose: 1 }] })];
    const batches = [batch()]; const before = JSON.stringify({ lot, input, batches });
    buildMilkLotPackedSummary(lot, input, batches);
    expect(JSON.stringify({ lot, input, batches })).toBe(before);
  });
});
