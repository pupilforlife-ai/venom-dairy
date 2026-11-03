import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ProductionRound } from '../data/mockData';
import { ButterPoolLossAction } from '../components/ButterPoolLossAction';
import { butterLossRecords, canRecordButterLoss, persistButterLoss, prepareLocalButterLoss, type ButterLossRequest } from './butterLoss';
import { reconcileFinishedStock } from './finishedStock';

const request: ButterLossRequest = { operationId: 'loss-one', poolId: 'blend-one', quantityKg: 3.5, expectedBalanceKg: 3.5, reason: 'moisture_loss', note: 'Weighed and confirmed moisture loss' };
const source = (overrides = {}): ProductionRound => ({ id: 'blend-1', type: 'Butter', status: 'pubbb_pool', blendedPoolId: 'blend-one',
  batchCode: 'PUBBB-281026', pool: 'PUBBB', outputWeight: 43, packedButterWeight: 39.5, remainingBalance: 3.5,
  packedSkus: [{ sku: 'PUBBB', cases: 2, loose: 7 }], milkLotId: '', milkLotCode: '', shiftId: '', shiftNumber: 0,
  roundNumber: 1, team: [], plannedInput: 33, actualInput: 33, startTime: '2026-10-28T08:00:00Z', locked: false, ...overrides });
const apply = (rounds = [source()], req = request, role = 'owner') => prepareLocalButterLoss(rounds, req, role, 'Owner test', '2026-11-03T13:00:00Z');
describe('audited butter pool losses', () => {
  it('records 43 − 39.5 − 3.5 = 0 without altering production or packing', () => {
    const input = [source(), source({ id: 'other', blendedPoolId: 'other-pool', remainingBalance: 0.02 })];
    const before = JSON.stringify(input);
    const result = apply(input);
    expect(result.rounds[0]).toMatchObject({ remainingBalance: 0, outputWeight: 43, packedButterWeight: 39.5, packedSkus: input[0].packedSkus });
    expect(result.rounds[1]).toBe(input[1]); expect(JSON.stringify(input)).toBe(before);
    expect(reconcileFinishedStock(result.rounds, [])).toEqual(reconcileFinishedStock(input, []));
    expect(result.loss).toMatchObject({ quantityKg: 3.5, balanceAfterKg: 0, recordedBy: 'Owner test', reason: 'moisture_loss' });
  });
  it.each(['owner', 'admin'])('permits %s and renders its action', role => {
    expect(canRecordButterLoss(role)).toBe(true); expect(apply(undefined, undefined, role).rounds[0].remainingBalance).toBe(0);
    expect(renderToStaticMarkup(<ButterPoolLossAction role={role} poolId="blend-one" batchCode="TEST" availableKg={3.5} onRecord={async () => { throw Error('render must not write'); }} />)).toContain('Record loss');
  });
  it.each(['staff', 'team_leader', 'quality_controller', ''])('does not permit or show the action to %s', role => {
    expect(() => apply(undefined, undefined, role)).toThrow('Owner and Admin');
    expect(renderToStaticMarkup(<ButterPoolLossAction role={role} poolId="blend-one" batchCode="TEST" availableKg={3.5} onRecord={async () => {}} />)).toBe('');
  });
  it.each([NaN, Infinity, -1, 0, 3.6])('rejects invalid/over-balance loss %s', quantityKg => expect(() => apply(undefined, { ...request, quantityKg })).toThrow());
  it('rejects a stale balance and an inadequate verification note', () => {
    expect(() => apply([source({ remainingBalance: 3 })], { ...request, quantityKg: 1 })).toThrow('balance changed');
    expect(() => apply(undefined, { ...request, note: '' })).toThrow('Explain');
  });
  it('deducts retries once and never merges distinct pools sharing a batch code', () => {
    const first = apply(); const second = apply(first.rounds);
    expect(second.rounds).toBe(first.rounds); expect(butterLossRecords(second.rounds)).toHaveLength(1);
    expect(() => apply(first.rounds, { ...request, quantityKg: 1 })).toThrow('operation ID');
  });
  it('allocates across source rounds and deduplicates the shared audit receipt', () => {
    const result = apply([source({ remainingBalance: 2 }), source({ id: 'blend-2', remainingBalance: 1.5 })]);
    expect(result.loss.allocations.map(row => row.quantityKg)).toEqual([2, 1.5]);
    expect(result.rounds.map(round => round.remainingBalance)).toEqual([0, 0]);
    expect(butterLossRecords(result.rounds)).toHaveLength(1);
  });
  it('keeps earlier losses when recording a later one', () => {
    const first = apply(undefined, { ...request, quantityKg: 1 });
    const second = apply(first.rounds, { ...request, operationId: 'loss-two', quantityKg: 2.5, expectedBalanceKg: 2.5 });
    expect(butterLossRecords(second.rounds)).toHaveLength(2); expect(second.rounds[0].remainingBalance).toBe(0);
  });
  it('accepts a full decimal balance despite legacy floating-point noise', () => {
    const result = apply([source({ remainingBalance: 0.019999999999999574 })], { ...request, quantityKg: 0.02, expectedBalanceKg: 0.02 });
    expect(result.rounds[0].remainingBalance).toBe(0);
    expect(result.loss.quantityKg).toBe(0.02);
  });
  it('does not report success until the server confirms, and reuses the operation ID on retry', async () => {
    const result = apply();
    const rpc = vi.fn().mockResolvedValueOnce({ data: null, error: { message: 'connection lost' } })
      .mockResolvedValueOnce({ data: result, error: null });
    await expect(persistButterLoss({ rpc } as never, request)).rejects.toThrow('not confirmed');
    await expect(persistButterLoss({ rpc } as never, request)).resolves.toEqual(result);
    expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);
  });
  it('rejects an unconfirmed response', async () => {
    await expect(persistButterLoss({ rpc: vi.fn().mockResolvedValue({ data: {}, error: null }) } as never, request)).rejects.toThrow('did not confirm');
  });
});
