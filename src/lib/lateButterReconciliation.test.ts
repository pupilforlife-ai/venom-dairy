import { describe, expect, it, vi } from 'vitest';
import type { ProductionRound } from '../data/mockData';
import { getGheeAvailableButter } from './gheeButterAllocation';
import { getPendingGheeButter, persistButterOutput, settleLateButter } from './lateButterReconciliation';
import { reconcileFinishedStock } from './finishedStock';
const round = (value: Partial<ProductionRound>): ProductionRound => ({ id: 'source', type: 'Butter', milkLotId: 'lot', milkLotCode: '261026',
  shiftId: '', shiftNumber: 0, roundNumber: 1, plannedInput: 500, actualInput: 500, outputWeight: 0, status: 'churned', team: [],
  startTime: '2026-11-03T08:00:00Z', locked: false, ...value });
const fixtures = () => [round({ id: 'old', butterOutput: 287.7, usedInGhee: 287.7, remainingBalance: 0 }),
  round({ id: 'late', butterOutput: 543.3, remainingBalance: 543.3 }),
  ...[82.3, 92.5, 92.5].map((butterOverdrawKg, i) => round({ id: `g${i}`, type: 'Ghee', butterInput: 92.5, butterOverdrawKg,
    butterSourceAllocations: i === 0 ? [{ id: 'old', quantityKg: 10.2 }] : [], startTime: `2026-11-0${i + 1}T10:00:00Z`,
    packedSkus: [{ sku: 'GHEE-1500', cases: 2, loose: 0 }] })),
  round({ id: 'external', creamSource: 'external', creamLotId: 'cream', butterOutput: 999, remainingBalance: 999 }),
  round({ id: 'blend', blendedPoolId: 'blend', butterOutput: 999, remainingBalance: 999 }),
  round({ id: 'other', milkLotId: 'other-lot', butterOutput: 999, remainingBalance: 999 })];
const settle = (rounds = fixtures(), id = 'test') => settleLateButter(rounds, 'milk:lot', id, 'Test recorder', '2026-11-03T12:00:00Z');
describe('late internal butter reconciliation', () => {
  it('settles only 267.3 kg, not 277.5 kg, leaving 276 kg with original production and packing intact', () => {
    const original = fixtures(), before = JSON.stringify(original), result = settle(original);
    expect(result[1]).toMatchObject({ remainingBalance: 276, usedInGhee: 267.3 });
    expect(result.slice(2, 5).map(r => r.butterOverdrawKg)).toEqual([0, 0, 0]);
    expect(result[2].butterSourceAllocations?.[0]).toEqual({ id: 'old', quantityKg: 10.2 });
    expect(result.slice(2, 5).map(r => r.butterOriginalOverdrawKg)).toEqual([82.3, 92.5, 92.5]);
    expect(reconcileFinishedStock(result, [])).toEqual(reconcileFinishedStock(original, []));
    expect(JSON.stringify(original)).toBe(before);
    for (let i = 5; i < original.length; i++) expect(result[i]).toBe(original[i]);
  });
  it('is FIFO and supports repeated small butter outputs without counting old use twice', () => {
    const first = settle(fixtures().map(r => r.id === 'late' ? { ...r, butterOutput: 50, remainingBalance: 50 } : r));
    expect(first[2].butterOverdrawKg).toBe(32.3); expect(first[3].butterOverdrawKg).toBe(92.5);
    const second = settle([...first, round({ id: 'new', butterOutput: 217.3, remainingBalance: 217.3 })], 'next');
    expect(getPendingGheeButter(second, 'milk:lot')).toBe(0);
    expect(second[second.length - 1]?.remainingBalance).toBe(0);
    expect(settle(second, 'retry')).toEqual(second);
  });
  it('reserves outstanding INTERNAL use in displayed availability until committed settlement', () => {
    expect(getGheeAvailableButter(fixtures(), 'milk:lot')).toBe(276);
    expect(getGheeAvailableButter(settle(), 'milk:lot')).toBe(276);
  });
  it('preserves a partial settlement receipt on retry even if more butter has since arrived', () => {
    const first = settle(fixtures().map(r => r.id === 'late' ? { ...r, butterOutput: 50, remainingBalance: 50 } : r));
    const arrived = [...first, round({ id: 'new', butterOutput: 217.3, remainingBalance: 217.3 })];
    const retry = settle(arrived);
    expect(retry[2]).toEqual(first[2]);
    expect(retry[retry.length - 1].remainingBalance).toBe(32.3);
    expect(settle(retry, 'new-event')[2].butterOverdrawKg).toBe(0);
  });
  it('NEVER reconciles external cream automatically, even with matching explicit external ghee debts', () => {
    const rounds = [...fixtures(), round({ id: 'external-ghee', type: 'Ghee', sourceCreamLotId: 'cream', butterInput: 92.5, butterOverdrawKg: 92.5 })];
    expect(settleLateButter(rounds, 'cream:cream', 'external-test', 'Test', '2026-11-03T12:00:00Z')).toBe(rounds);
    expect(settle(rounds).find(r => r.id === 'external-ghee')).toBe(rounds[rounds.length - 1]);
    expect(getGheeAvailableButter(rounds, 'cream:cream')).toBe(999);
  });
  it('rejects inconsistent claim totals rather than inventing a deduction', () => {
    expect(() => settle(fixtures().map(r => r.id === 'g0' ? { ...r, butterOverdrawKg: 90 } : r))).toThrow('need review');
  });
  it('confirms output only through one RPC and propagates server errors for a safe retry', async () => {
    const request = { operationId: 'one', roundId: 'late', butterOutput: 543.3, buttermilkOutput: 100 };
    const rpc = vi.fn().mockResolvedValueOnce({ error: { message: 'temporary failure' } })
      .mockResolvedValueOnce({ data: { round: { id: 'late' }, changedRounds: [], matchedKg: 267.3, milkLot: null } });
    await expect(persistButterOutput({ rpc } as never, request)).rejects.toThrow('not confirmed');
    await expect(persistButterOutput({ rpc } as never, request)).resolves.toMatchObject({ matchedKg: 267.3 });
    expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);
  });
});
