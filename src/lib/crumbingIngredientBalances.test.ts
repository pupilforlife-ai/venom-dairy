import { describe, expect, it } from 'vitest';
import { appendCoatingBalance, buildCoatingBalanceRecord, getCoatingBalanceReport, getCoatingIssued, getCreamCheeseUsage,
  type CoatingBalanceMeasurement, type CoatingBatch } from './crumbingIngredientBalances';
import { mergePersistedValue } from '../hooks/useSupabaseState';

const batch = (type = 'SPP'): CoatingBatch & { id: string; traysPacked: number; packedSkus: unknown[] } => ({
  id: 'batch-1', type, recipe: { flavourIyababKg: type === 'SPP' ? 4 : 0, flavourPredustKg: type === 'SPP' ? 1 : 5,
    batterIyababaKg: 2, breadingAdajioKg: 5 }, traysPacked: 3, packedSkus: [{ sku: 'SPP', cases: 7 }],
});
const measurement = (): CoatingBalanceMeasurement => ({ flavourBasis: 'separate', iyababaKg: 0.8, predustKg: 0.2,
  flavourMixKg: 0, batterBasis: 'dry', batterKg: 0.5, adajioKg: 1.2 });
const record = (b = batch(), overrides = {}, id = 'check-1', note = '') => buildCoatingBalanceRecord(b,
  { ...measurement(), ...overrides }, { id, note, recordedAt: '2026-11-03T08:00:00Z', recordedBy: 'Test staff' });

describe('crumbing ingredient balances, separate from issued recipe and stock', () => {
  it.each(['SPP', 'HCP', 'JP'])('deducts the unused balance once for %s', type => {
    const original = batch(type), before = JSON.stringify(original);
    const saved = appendCoatingBalance(original, record(original));
    const report = getCoatingBalanceReport(saved);
    expect(report.status).toBe('recorded');
    expect(report.rows.find(row => row.key === 'adajio')).toMatchObject({ issuedKg: 5, remainingKg: 1.2, consumedKg: 3.8 });
    expect(report.rows.find(row => row.key === 'batterMix')?.consumedKg).toBe(1.5);
    expect(JSON.stringify(original)).toBe(before);
    expect(saved.recipe).toBe(original.recipe);
    expect(saved.packedSkus).toBe(original.packedSkus);
    expect(saved.traysPacked).toBe(original.traysPacked);
  });
  it('does not pretend missing historical balances are zero or quantities consumed', () => {
    const report = getCoatingBalanceReport(batch());
    expect(report.status).toBe('missing');
    expect(report.rows.every(row => row.remainingKg === null && row.consumedKg === null)).toBe(true);
  });
  it('accepts explicit zero, and accepts a completely unused ingredient', () => {
    const saved = appendCoatingBalance(batch(), record(batch(), { batterKg: 0, adajioKg: 5 }));
    expect(getCoatingBalanceReport(saved).rows.find(row => row.key === 'batterMix')?.consumedKg).toBe(2);
    expect(getCoatingBalanceReport(saved).rows.find(row => row.key === 'adajio')?.consumedKg).toBe(0);
  });
  it('allocates a homogeneous SPP dry flavour balance in the actual issued proportions', () => {
    const r = record(batch(), { flavourBasis: 'mixed', flavourMixKg: 1.5 });
    expect(r.remaining).toMatchObject({ iyababa: 1.2, predust: 0.3 });
    expect(r.issued).toMatchObject({ iyababa: 4, predust: 1 });
  });
  it('converts leftover prepared batter to dry equivalent using its original weighed mass', () => {
    const r = record(batch(), { batterBasis: 'prepared', preparedBatterTotalKg: 7, batterKg: 1.75 });
    expect(r.remaining.batterMix).toBe(0.5);
    expect(r.measurement.batterKg).toBe(1.75);
    expect(r.measurement.preparedBatterTotalKg).toBe(7);
    expect(() => record(batch(), { batterBasis: 'dry', batterKg: 1.75 })).not.toThrow();
    // 5.25 kg wet balance is valid, although it exceeds the 2 kg dry issue.
    expect(record(batch(), { batterBasis: 'prepared', preparedBatterTotalKg: 7, batterKg: 5.25 }).remaining.batterMix).toBe(1.5);
    expect(() => record(batch(), { batterBasis: 'dry', batterKg: 5.25 })).toThrow('cannot exceed');
  });
  it.each(['SPP', 'HCP', 'JP'])('uses the known 1:2.5 recipe for %s without an original mixture weight', type => {
    const r = record(batch(type), { batterBasis: 'prepared', batterKg: 1.75 });
    expect(r.remaining.batterMix).toBe(0.5);
    expect(r.measurement).toMatchObject({ batterCalculationBasis: 'recipe_ratio', preparedBatterTotalKg: 7, recipeBatterWaterL: 5, waterKgPerL: 1 });
    expect(getCoatingBalanceReport(appendCoatingBalance(batch(type), r)).rows.find(row => row.key === 'batterMix')?.consumedKg).toBe(1.5);
  });
  it.each([0, 1, NaN, Infinity])('preserves validation of historical weighed-total records, got %s', total => {
    expect(() => record(batch(), { batterBasis: 'prepared', preparedBatterTotalKg: total })).toThrow('historical weighed total');
  });
  it('preserves a previous measured-total basis instead of recalculating its history from the recipe', () => {
    const r = record(batch(), { batterBasis: 'prepared', preparedBatterTotalKg: 5, batterKg: 1.25 });
    expect(r.remaining.batterMix).toBe(0.5);
    expect(r.measurement.batterCalculationBasis).toBe('weighed_total');
  });
  it('uses the recorded water ratio if that differs from the default', () => {
    const b = { ...batch(), recipe: { ...batch().recipe!, batterWaterL: 4 } };
    const r = record(b, { batterBasis: 'prepared', batterKg: 1.5, batterCalculationBasis: 'recipe_ratio' });
    expect(r.measurement.preparedBatterTotalKg).toBe(6);
    expect(r.remaining.batterMix).toBe(0.5);
    const changed = { ...appendCoatingBalance(b, r), recipe: { ...b.recipe, batterWaterL: 5 } };
    expect(getCoatingBalanceReport(changed).status).toBe('changed');
    expect(appendCoatingBalance(changed, r)).toBe(changed); // An already saved retry remains idempotent.
    expect(() => appendCoatingBalance({ ...b, recipe: changed.recipe }, r)).toThrow('changed');
  });
  it('accepts all or none of the prepared mixture remaining without a manual original weight', () => {
    expect(record(batch(), { batterBasis: 'prepared', batterKg: 7 }).remaining.batterMix).toBe(2);
    expect(record(batch(), { batterBasis: 'prepared', batterKg: 0 }).remaining.batterMix).toBe(0);
  });
  it('rejects more leftover prepared batter than was made', () => {
    expect(() => record(batch(), { batterBasis: 'prepared', batterKg: 8 })).toThrow('total made');
  });
  it.each([-1, NaN, Infinity, 5.1])('rejects invalid Adajio balance %s without changing recorded issues', adajioKg => {
    expect(() => record(batch(), { adajioKg })).toThrow();
    expect(batch().recipe?.breadingAdajioKg).toBe(5);
  });
  it('does not reject a matching decimal balance through floating-point noise', () => {
    const b = batch(); b.recipe!.breadingAdajioKg = 0.1 + 0.2;
    const saved = appendCoatingBalance(b, record(b, { adajioKg: 0.3 }));
    expect(getCoatingBalanceReport(saved).rows.find(row => row.key === 'adajio')?.consumedKg).toBe(0);
  });
  it('treats retries as one record and rechecks as replacement balances, never cumulative deductions', () => {
    const b = batch(), first = record(b), once = appendCoatingBalance(b, first);
    expect(appendCoatingBalance(once, first)).toBe(once);
    expect(() => record(once)).toThrow('reason');
    const next = record(once, { adajioKg: 0.5 }, 'check-2', 'Reweighed');
    const twice = appendCoatingBalance(once, next);
    expect(Object.keys(twice.ingredientBalanceHistory!)).toHaveLength(2);
    expect(getCoatingBalanceReport(twice).rows.find(row => row.key === 'adajio')?.consumedKg).toBe(4.5);
    expect(twice.ingredientBalanceHistory?.['check-1']).toBe(first);
  });
  it('marks old balances for recheck when later additions or clubbing change the gross issue', () => {
    const b = batch(), saved = appendCoatingBalance(b, record(b));
    const changed = { ...saved, recipe: { ...saved.recipe!, breadingAdajioKg: 6 } };
    expect(getCoatingBalanceReport(changed).status).toBe('changed');
    expect(getCoatingBalanceReport(changed).rows.every(row => row.consumedKg === null)).toBe(true);
    expect(() => appendCoatingBalance(changed, record(b, {}, 'late'))).toThrow('changed');
    expect(() => record({ ...b, clubbedInto: 'combined' })).toThrow('combined batch');
  });
  it('rejects a stale same-device recheck', () => {
    const b = batch(), first = record(b), stale = record(b, {}, 'stale');
    expect(() => appendCoatingBalance(appendCoatingBalance(b, first), stale)).toThrow('Another balance');
  });
  it('retains two first-time concurrent checks and requires one physical recheck to resolve them', () => {
    const b = batch(), first = appendCoatingBalance(b, record(b));
    const second = appendCoatingBalance(b, record(b, { adajioKg: 2 }, 'device-2'));
    const merged = mergePersistedValue([b], [first], [second])[0];
    expect(Object.keys(merged.ingredientBalanceHistory!)).toHaveLength(2);
    expect(getCoatingBalanceReport(merged).status).toBe('conflict');
    const resolution = record(merged, { adajioKg: 1.5 }, 'resolved', 'Both teams rechecked');
    expect(resolution.supersedes).toHaveLength(2);
    expect(getCoatingBalanceReport(appendCoatingBalance(merged, resolution)).status).toBe('recorded');
  });
  it('merges unrelated remote packing and legacy recipe writes without deleting balance history', () => {
    const b = batch(), saved = appendCoatingBalance(b, record(b));
    const remote = { ...b, traysPacked: 8, packedSkus: [{ sku: 'HCP', cases: 3 }] };
    expect(mergePersistedValue([b], [saved], [remote])[0]).toMatchObject({ traysPacked: 8, packedSkus: remote.packedSkus,
      ingredientBalanceHistory: saved.ingredientBalanceHistory });
    const oldClient = { ...b, traysPacked: 5 };
    expect(mergePersistedValue([b], [oldClient], [saved])[0].ingredientBalanceHistory).toEqual(saved.ingredientBalanceHistory);
  });
  it('uses JP coating issues when the phase-specific record exists', () => {
    const b = { ...batch('JP'), jpCrumbing: { predustKg: 3, batterMixKg: 4, adajioKg: 8 } };
    expect(getCoatingIssued(b)).toMatchObject({ predust: 3, batterMix: 4, adajio: 8 });
  });
});

describe('JP cream-cheese consumption uses existing filling balance, not another deduction', () => {
  const jp = () => ({ jpPrepping: { pan111InputKg: 15, creamKg: 0.75, blackPepperKg: 0.018, saltKg: 0.2,
    carriedCreamCheeseKg: 9, totalCreamCheeseAvailableKg: 24.968 },
    jpFilling: { creamCheeseAvailableKg: 24.968, creamCheeseLeftoverKg: 9, creamCheeseDisposition: 'carry_forward' } });
  it('includes fresh cheese and carry-in, subtracting leftover just once', () => {
    expect(getCreamCheeseUsage(jp())).toMatchObject({ availableKg: 24.968, remainingKg: 9, consumedKg: 15.968 });
  });
  it('keeps discarded leftover separate from filling use', () => {
    expect(getCreamCheeseUsage({ ...jp(), jpFilling: { ...jp().jpFilling, creamCheeseDisposition: 'discarded' } }).consumedKg).toBe(15.968);
  });
  it('distinguishes an explicit zero from an unmeasured balance', () => {
    expect(getCreamCheeseUsage({ ...jp(), jpFilling: { creamCheeseLeftoverKg: 0 } }).consumedKg).toBe(24.968);
    expect(getCreamCheeseUsage({ ...jp(), jpFilling: { creamCheeseBalanceRecorded: false, creamCheeseLeftoverKg: 0 } }).consumedKg).toBeNull();
    expect(getCreamCheeseUsage({ jpPrepping: jp().jpPrepping }).consumedKg).toBeNull();
  });
  it('does not publish a stale usage after more cream cheese is made', () => {
    expect(getCreamCheeseUsage({ ...jp(), jpPrepping: { ...jp().jpPrepping, totalCreamCheeseAvailableKg: 30 } })).toMatchObject({ availableKg: 30, remainingKg: null, consumedKg: null });
  });
});
