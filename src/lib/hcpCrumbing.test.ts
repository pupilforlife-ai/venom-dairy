import { describe, expect, it } from 'vitest';
import type { CrumbingBatch } from '../pages/CrumbingTab';
import type { HalloumiPool } from '../data/mockData';
import { initialHcpCrumbingState, getHcpCrumbingForm, buildHcpDraftUpdates, buildHcpCompletionUpdates, hcpRecipeReady, returnHcpBalanceToPool, reconcileHcpChillerReturns, type HcpCrumbingForm } from './hcpCrumbing';

const now = '2026-10-28T10:00:00Z';
const batch = (): CrumbingBatch => ({
  id: 'test-hcp', type: 'HCP', batchCode: 'TEST-HCP', sourceBatchId: 'test-source',
  sourceBatchCode: 'HAL-TEST', sourceWeightKg: 20, createdAt: now,
  ...initialHcpCrumbingState(),
});
const form = (): HcpCrumbingForm => ({
  ...getHcpCrumbingForm(batch()), traysCrumbed: 8, crumbedBy: 'Test team',
  predustMultiplier: 1, batterMultiplier: 2, breadingMultiplier: 3,
  balanceWeightKg: 2, balanceRecorded: true, wastageKg: 0.5, balanceDisposition: 'HAL111',
});
const complete = (input = form(), source = batch()) => buildHcpCompletionUpdates(source, input, now, 'test-user');

describe('HCP production sequence', () => {
  it('starts without requiring or publishing a final tray count', () => {
    expect(initialHcpCrumbingState()).toMatchObject({ status: 'crumbing', traysCrumbed: 0, traysRemaining: 0 });
    expect(batch().productionCompletedAt).toBeUndefined();
    expect(getHcpCrumbingForm(batch()).balanceRecorded).toBe(false);
  });

  it('saves ingredient usage during production, before trays or balance are known', () => {
    const draft = buildHcpDraftUpdates(batch(), { ...getHcpCrumbingForm(batch()), batterMultiplier: 2 }, now);
    expect(draft.recipe).toMatchObject({ batterIyababaKg: 2, batterWaterL: 5 });
    for (const key of ['traysCrumbed', 'traysRemaining', 'productionCompletedAt', 'status', 'balanceWeightKg', 'wastageKg', 'weightCrumbedKg']) {
      expect(draft).not.toHaveProperty(key);
    }
    expect(draft.recipeAutosavedAt).toBe(now);
  });

  it('keeps finish-form drafts recoverable without making them stock', () => {
    const original = batch();
    const draft = buildHcpDraftUpdates(original, form(), now);
    const saved = { ...original, ...draft };
    expect(getHcpCrumbingForm(saved)).toEqual(form());
    expect(saved.traysRemaining).toBe(0);
    expect(saved.traysCrumbed).toBe(0);
    expect(saved.balanceWeightKg).toBeUndefined();
    expect(saved.productionCompletedAt).toBeUndefined();
  });

  it('preserves pre-change tray counts and recipes when reopening a legacy batch', () => {
    const legacy = { ...batch(), traysCrumbed: 7, crumbingTeam: 'Original team', hcpCrumbingDraft: undefined, recipe: complete().recipe };
    expect(getHcpCrumbingForm(legacy)).toMatchObject({ traysCrumbed: 7, crumbedBy: 'Original team', predustMultiplier: 1, batterMultiplier: 2, breadingMultiplier: 3 });
  });

  it('publishes final trays only at completion, without freezing or touching packing/source records', () => {
    const result = complete();
    expect(result).toMatchObject({ status: 'crumbing', traysCrumbed: 8, traysRemaining: 8,
      productionCompletedAt: now, hcpCrumbingDraft: null, hcpCompletedBy: 'test-user' });
    expect(result.recipe).toMatchObject({ flavourPredustKg: 1, batterIyababaKg: 2, batterWaterL: 5, breadingAdajioKg: 3, flavourIyababKg: 0 });
    for (const key of ['sourceBatchId', 'sourceBatchCode', 'traysPacked', 'packedSkus', 'frozenAt']) expect(result).not.toHaveProperty(key);
  });

  it('does not reset any legacy fried trays', () => {
    expect(complete(form(), { ...batch(), traysFried: 2 }).traysRemaining).toBe(6);
    expect(() => complete({ ...form(), traysCrumbed: 1 }, { ...batch(), traysFried: 2 })).toThrow('already fried');
  });

  it.each([0, -1, 1.5, NaN, Infinity])('rejects invalid final trays %s', traysCrumbed => {
    expect(() => complete({ ...form(), traysCrumbed })).toThrow();
  });

  it('requires all three coats and responsible staff', () => {
    expect(hcpRecipeReady(form())).toBe(true);
    for (const key of ['predustMultiplier', 'batterMultiplier', 'breadingMultiplier'] as const) {
      const incomplete = { ...form(), [key]: 0 };
      expect(hcpRecipeReady(incomplete)).toBe(false);
      expect(() => complete(incomplete)).toThrow('addition');
    }
    expect(() => complete({ ...form(), crumbedBy: '  ' })).toThrow('responsible staff');
  });

  it.each(['frozen', 'packed'] as const)('cannot reopen a %s batch through the draft or finish path', status => {
    const closed = { ...batch(), status };
    expect(() => buildHcpDraftUpdates(closed, form(), now)).toThrow('unfinished');
    expect(() => complete(form(), closed)).toThrow('unfinished');
  });

  it('does not change SPP, JP, or an already-completed HCP batch', () => {
    for (const closed of [{ ...batch(), type: 'SPP' as const }, { ...batch(), type: 'JP' as const }, { ...batch(), productionCompletedAt: now }]) {
      expect(() => buildHcpDraftUpdates(closed, form(), now)).toThrow('unfinished');
      expect(() => complete(form(), closed)).toThrow('unfinished');
    }
  });
});

describe('HCP Halloumi mass balance and destinations', () => {
  it.each(['HAL111', 'disposed', 'chiller'] as const)('records leftover Halloumi as %s, separately from process wastage', balanceDisposition => {
    const result = complete({ ...form(), balanceDisposition });
    expect(result).toMatchObject({ balanceWeightKg: 2, wastageKg: 0.5, weightCrumbedKg: 17.5, hcpBalanceDisposition: balanceDisposition, balanceRecordedAt: now });
    expect(result.weightCrumbedKg! + result.balanceWeightKg! + result.wastageKg!).toBe(20);
  });

  it('accepts an explicitly entered zero balance and clears a stale destination', () => {
    expect(complete({ ...form(), balanceWeightKg: 0 })).toMatchObject({ balanceWeightKg: 0, hcpBalanceDisposition: '', weightCrumbedKg: 19.5 });
    expect(() => complete({ ...form(), balanceRecorded: false })).toThrow('including 0');
  });

  it('requires a destination when any balance remains', () => {
    expect(() => complete({ ...form(), balanceDisposition: '' })).toThrow('Select whether');
  });

  it('does not reject a balanced decimal input because of floating-point arithmetic', () => {
    expect(complete({ ...form(), balanceWeightKg: 0.1, wastageKg: 0.2 }, { ...batch(), sourceWeightKg: 0.3 }).weightCrumbedKg).toBe(0);
  });

  it('rejects negative, non-finite, or overallocated weights rather than silently changing figures', () => {
    for (const value of [-1, NaN, Infinity]) {
      expect(() => complete({ ...form(), wastageKg: value })).toThrow();
      expect(() => complete({ ...form(), balanceWeightKg: value })).toThrow();
    }
    expect(() => complete({ ...form(), balanceWeightKg: 20, wastageKg: 1 })).toThrow('cannot exceed');
    expect(() => complete(form(), { ...batch(), sourceWeightKg: undefined })).toThrow('source Halloumi weight');
  });
});

describe('unused HCP Halloumi returned to chiller stock', () => {
  const pool = (): HalloumiPool => ({ batchId: 'HAL-TEST', milkLotId: 'test-source', totalProduced: 100,
    vacuumPacked: 100, availableForCrumbing: 80, usedInCrumbing: 20, soldWeight: 0, roundsContributed: [] });
  const finished = (): CrumbingBatch => ({ ...batch(), ...complete({ ...form(), balanceDisposition: 'chiller' }) });

  it('does not credit an authoritative server-reconciled chiller return a second time', () => {
    const reconciled: HalloumiPool = { ...pool(), hcpAccountingVersion: 1,
      availableForCrumbing: 82, usedInCrumbing: 18, hcpReturnedKg: 2,
      hcpChillerReturns: { 'test-hcp': { weightKg: 2, recordedAt: now, recordedBy: 'test-user' } },
      hcpChillerReturnsAppliedKg: 0 };
    expect(reconcileHcpChillerReturns(reconciled)).toBe(reconciled);
    expect(returnHcpBalanceToPool(reconciled, finished())).toBe(reconciled);
  });

  it('does not hide a server-reconciled overdraw or restore old stock from return receipts', () => {
    const overdraw: HalloumiPool = { ...pool(), hcpAccountingVersion: 1, availableForCrumbing: -5, hcpOverdrawKg: 5,
      hcpChillerReturns: { old: { weightKg: 100, recordedAt: now, recordedBy: 'old record' } } };
    expect(reconcileHcpChillerReturns(overdraw).availableForCrumbing).toBe(-5);
  });

  it('makes only the unused chiller balance available for future sale or HCP', () => {
    const updated = reconcileHcpChillerReturns(returnHcpBalanceToPool(pool(), finished()));
    expect(updated).toMatchObject({ availableForCrumbing: 82, usedInCrumbing: 18, vacuumPacked: 100, totalProduced: 100, soldWeight: 0 });
    expect(updated.hcpChillerReturns?.['test-hcp']).toEqual({ weightKg: 2, recordedAt: now, recordedBy: 'test-user' });
  });

  it('is idempotent on retries and after some returned stock has already been sold or reallocated', () => {
    const once = reconcileHcpChillerReturns(returnHcpBalanceToPool(pool(), finished()));
    expect(returnHcpBalanceToPool(once, finished())).toBe(once);
    const afterSale = { ...once, availableForCrumbing: 79, soldWeight: 3 };
    expect(returnHcpBalanceToPool(afterSale, finished())).toBe(afterSale);
    expect(reconcileHcpChillerReturns(afterSale)).toBe(afterSale);
  });

  it('does not return HAL111, disposal, an unfinished batch or another milk lot to available stock', () => {
    for (const input of [batch(), { ...finished(), hcpBalanceDisposition: 'HAL111' as const },
      { ...finished(), hcpBalanceDisposition: 'disposed' as const }, { ...finished(), sourceBatchId: 'different-lot' }]) {
      const original = pool();
      expect(returnHcpBalanceToPool(original, input)).toBe(original);
    }
  });

  it('accumulates distinct returns while keeping each source receipt and original produced quantities', () => {
    const once = returnHcpBalanceToPool(pool(), finished());
    const twice = returnHcpBalanceToPool(once, { ...finished(), id: 'second-batch', balanceWeightKg: 1 });
    expect(reconcileHcpChillerReturns(twice).availableForCrumbing).toBe(83);
    expect(Object.keys(twice.hcpChillerReturns!)).toHaveLength(2);
  });

  it('retains both concurrently merged receipts without relying on stale counter increments', () => {
    const first = returnHcpBalanceToPool(pool(), finished());
    const second = returnHcpBalanceToPool(pool(), { ...finished(), id: 'concurrent-batch', balanceWeightKg: 3 });
    const merged = { ...pool(), hcpChillerReturns: { ...first.hcpChillerReturns, ...second.hcpChillerReturns } };
    expect(reconcileHcpChillerReturns(merged).availableForCrumbing).toBe(85);
    const afterSale = { ...reconcileHcpChillerReturns(first), availableForCrumbing: 77, soldWeight: 5 };
    expect(reconcileHcpChillerReturns({ ...afterSale, hcpChillerReturns: merged.hcpChillerReturns }).availableForCrumbing).toBe(80);
  });
});
