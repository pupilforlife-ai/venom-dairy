import { describe, it, expect } from 'vitest';
import type { FinishedStockLot, MilkLot, ProductionRound } from '../data/mockData';
import { reconcileFinishedStock } from '../lib/finishedStock';
import { emptyTraceState } from './domain';
import { assembleMixedCaseStock, cancelMixedCaseStock, returnMixedCaseStock } from './mixedCaseStock';
import { loosePacketSources } from './mixedPaneerCases';
import { paneerStockTrace, roundStockSummary } from './paneerStockTrace';

const lots = [{id: 'milk', lotCode: '091126', traceabilityProductionDate: '2026-11-10'} as MilkLot];
const rounds = (): ProductionRound[] => [13, 11].map((loose, i) => ({
  id: `r${i + 1}`, type: 'D', status: 'frozen', milkLotId: 'milk', milkLotCode: '091126', shiftNumber: 1, roundNumber: i + 1,
  startTime: '2026-11-10T06:00:00Z', packedSkus: [{sku: 'MPAN100', cases: 4, loose, packingRunId: `pack${i + 1}`,
    packetBatchCode: `11-1011A${i + 1}`, caseBatchCode: '11-1011A', traceabilityProductionDate: '2026-11-10'}],
} as ProductionRound));
function assembly(r = rounds()) {
  const sources = loosePacketSources(r, lots, emptyTraceState);
  return assembleMixedCaseStock(emptyTraceState, [], {id: 'case', sku: 'MPAN100', caseCount: 1,
    parts: sources.map((s, i) => ({key: s.key, packets: i ? 2 : 13, expectedFingerprint: s.fingerprint}))}, r, lots, 'packer', 'now');
}
describe('read-only paneer current custody trace', () => {
  it('shows synthetic original stock on site without needing a migration or changing records', () => {
    const r = rounds(), before = JSON.stringify(r), report = paneerStockTrace(r, []), s = roundStockSummary(r[0], report).totals[0];
    expect(s).toMatchObject({originalPackets: 73, onSite: {packets: 73, kg: 73}, distribution: {packets: 0}, differencePackets: 0, differenceKg: 0});
    expect(report.warnings).toEqual([]); expect(JSON.stringify(r)).toBe(before);
  });
  it('counts only each original round contribution to a mixed case, preserving 144 packets', () => {
    const r = rounds(), a = assembly(r), before = JSON.stringify(a), report = paneerStockTrace(r, a.stock);
    expect(roundStockSummary(r[0], report).totals[0].onSite.packets).toBe(73);
    expect(roundStockSummary(r[1], report).totals[0].onSite.packets).toBe(71);
    const mixed = roundStockSummary(r[0], report).rows.find(l => l.mixedCaseId)!;
    expect(mixed).toMatchObject({packets: 13, totalPackets: 15, physicalCases: 1});
    expect(report.lines.reduce((n, l) => n + l.shares.reduce((m, p) => m + p.packets!, 0), 0)).toBe(144);
    expect(JSON.stringify(a)).toBe(before);
  });
  it('shows current Distribution custody and returns without adding gross handovers twice', () => {
    const r = rounds(), a = assembly(r), stock = a.stock.map(s => ({...s, status: 'handed_over' as const}));
    const mixed = stock.find(s => s.mixedCaseId)!;
    const returned = returnMixedCaseStock(a.state, stock, {id: 'return', stockId: mixed.id, cases: 1,
      expectedStock: JSON.stringify(mixed), reason: 'Intact physical return', location: 'Chiller'}, 'owner', 'owner', 'later');
    const report = paneerStockTrace(r, returned.stock), s1 = roundStockSummary(r[0], report), s2 = roundStockSummary(r[1], report);
    expect(s1.totals[0]).toMatchObject({onSite: {packets: 13}, distribution: {packets: 60}, differencePackets: 0});
    expect(s2.totals[0]).toMatchObject({onSite: {packets: 2}, distribution: {packets: 69}, differencePackets: 0});
    expect(s1.rows.find(l => l.returned)).toMatchObject({location: 'Chiller', packets: 13});
  });
  it('attributes partial source handover splits by stable packing identity', () => {
    const r = rounds(), line = reconcileFinishedStock(r, [])[0];
    const stock = [{...line, cases: 3, loosePackets: 13, totalPackets: 58}, {...line, id: 'sent', packingRunId: 'pack1-handover-op-0', cases: 1, loosePackets: 0, totalPackets: 15, status: 'handed_over' as const}];
    expect(roundStockSummary(r[0], paneerStockTrace(r, stock)).totals[0]).toMatchObject({onSite: {packets: 58}, distribution: {packets: 15}, differencePackets: 0});
  });
  it('keeps discrepancy distinct from physical on-site stock and Distribution', () => {
    const r = rounds(), stock = reconcileFinishedStock(r, []).map(s => ({...s, status: 'incorrectly_recorded' as const}));
    expect(roundStockSummary(r[0], paneerStockTrace(r, stock)).totals[0]).toMatchObject({onSite: {packets: 0}, distribution: {packets: 0}, discrepancy: {packets: 73}, differencePackets: 0});
  });
  it('does not assign anonymous or ambiguous stock to a round by SKU or batch text alone', () => {
    const r = rounds(), stock = reconcileFinishedStock(r, []), anonymous = {...stock[0], id: 'anonymous', packingRunId: 'unknown', sourceRoundId: undefined, sourcePackIndex: undefined};
    const report = paneerStockTrace(r, [...stock, anonymous]);
    expect(report.warnings.join()).toMatch(/missing source/); expect(roundStockSummary(r[0], report).totals[0].onSite.packets).toBe(73);
    r[1].packedSkus![0].packingRunId = 'pack1-handover';
    const ambiguous = paneerStockTrace(r, [{...anonymous, packingRunId: 'pack1-handover-split'}]);
    expect(ambiguous.warnings.join()).toMatch(/ambiguous/);
  });
  it('preserves cross-lot origins even when both rounds use the same display code', () => {
    const r = rounds(); r[1].milkLotId = 'other'; r[1].milkLotCode = '101126';
    r[1].packedSkus![0].packetBatchCode = r[0].packedSkus![0].packetBatchCode;
    const a = assembly(r), report = paneerStockTrace(r, a.stock);
    expect(roundStockSummary(r[0], report).totals[0].onSite.packets).toBe(73);
    expect(roundStockSummary(r[1], report).totals[0].onSite.packets).toBe(71);
  });
  it('supports grouped identical cases with an exact one-case split, rejecting incomplete composition', () => {
    const r = rounds(); r[0].packedSkus![0].loose = 26; r[1].packedSkus![0].loose = 4;
    const sources = loosePacketSources(r, lots, emptyTraceState), a = assembleMixedCaseStock(emptyTraceState, [], {id: 'two', sku: 'MPAN100', caseCount: 2,
      parts: sources.map((s, i) => ({key: s.key, packets: i ? 4 : 26, expectedFingerprint: s.fingerprint}))}, r, lots, 'packer', 'now');
    const mixed = a.stock.find(s => s.mixedCaseId)!, split = {...mixed, cases: 1, totalPackets: 15, status: 'handed_over' as const};
    const report = paneerStockTrace(r, [split]);
    expect(report.lines.find(s => s.mixedCaseId)!.shares.map(s => s.packets)).toEqual([13, 2]);
    expect(paneerStockTrace(r, [{...split, mixedCaseCount: undefined}]).warnings.join()).toMatch(/incomplete/);
  });
  it('keeps released legacy loose stock after cancelled assembly linked to its source', () => {
    const r = rounds(); delete r[0].packedSkus![0].packingRunId;
    const a = assembly(r), cancelled = cancelMixedCaseStock(a.state, a.stock, 'case', 'Physical disassembly', 'owner', 'owner', 'now');
    expect(roundStockSummary(r[0], paneerStockTrace(r, cancelled.stock)).totals[0]).toMatchObject({onSite: {packets: 73}, differencePackets: 0});
  });
  it('uses actual variable case weights without inventing packet counts', () => {
    const r = rounds(); r[0].packedSkus = [{sku: 'MPAN010', cases: 2, loose: 0, caseWeightKg: 30, looseWeightKg: 5}];
    expect(roundStockSummary(r[0], paneerStockTrace(r, [])).totals[0]).toMatchObject({originalPackets: null, originalKg: 65, onSite: {packets: null, kg: 65}, differenceKg: 0});
  });
  it('flags duplicate stock IDs and invalid quantities without silently repairing them', () => {
    const r = rounds(), stock = reconcileFinishedStock(r, []), report = paneerStockTrace(r, [...stock, stock[0]]);
    expect(report.warnings.join()).toMatch(/duplicate/); expect(roundStockSummary(r[0], report).totals[0].onSite.packets).toBe(73);
    const invalid = paneerStockTrace(r, [{...stock[0], totalPackets: 999}]);
    expect(invalid.warnings.join()).toMatch(/invalid/); expect(roundStockSummary(r[0], invalid).totals[0].differencePackets).toBe(73);
  });
});
