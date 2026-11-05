import { describe, expect, it, vi } from 'vitest';
import type { ProductionRound } from '../data/mockData';
import { persistGheeAfOil, prepareGheeAfOilRecord, prepareGheeAfOilReview, recommendedGheeAfOil, type RecordGheeAfOilRequest } from './gheeAfOil';
import { getGheeRoundInput } from '../data/mockData';
const at = '2026-11-05T13:00:00Z';
const round: ProductionRound = { id: 'ghee', type: 'Ghee', milkLotId: 'milk', milkLotCode: '261026', shiftId: 'g', shiftNumber: 0,
  roundNumber: 1, plannedInput: 92.5, actualInput: 92.5, butterInput: 92.5, afOilInput: 12.5, expectedYield: 73.5,
  status: 'butter_selected', outputWeight: 0, startTime: at, team: ['Operator'], locked: false,
  butterSourceAllocations: [{ id: 'butter', quantityKg: 92.5 }], butterOverdrawKg: 0, afOilConfirmationRequired: true };
const request: RecordGheeAfOilRequest = { operationId: 'first', roundId: 'ghee', expectedRecordId: null, mode: 'recommended', actualKg: 12.5, reason: '' };
const record = (r = round, req = request) => prepareGheeAfOilRecord(r, req, 'Operator', 'staff', at);
describe('Ghee actual AF oil and approval', () => {
  it('scales the standard ratio and confirms normal actual use without an approval request', () => {
    expect(recommendedGheeAfOil({ butterInput: 185, actualInput: 185 })).toBe(25);
    const saved = record();
    expect(saved).toMatchObject({ afOilInput: 12.5, expectedYield: 73.5, status: 'af_oil_added', afOilRecord: { approvalStatus: 'not_required', actualKg: 12.5, recommendedKg: 12.5, recordedBy: 'Operator', recordedAt: at } });
    expect(saved.butterSourceAllocations).toBe(round.butterSourceAllocations);
    expect(record(saved)).toBe(saved);
  });
  it('records physical variations including zero, updates expected yield, and permits production pending approval', () => {
    const saved = record(round, { ...request, mode: 'changed', actualKg: 10, reason: 'Limited AF oil available' });
    expect(saved).toMatchObject({ afOilInput: 10, expectedYield: 71.75, status: 'af_oil_added', afOilRecord: { approvalStatus: 'pending' } });
    expect(getGheeRoundInput(saved)).toBe(102.5);
    expect(record(round, { ...request, mode: 'changed', actualKg: 0, reason: 'No AF oil available' }).afOilInput).toBe(0);
  });
  it('requires an explanation, finite quantities and an explicit matching choice', () => {
    for (const actualKg of [-1, NaN, Infinity]) expect(() => record(round, { ...request, actualKg })).toThrow('valid');
    expect(() => record(round, { ...request, actualKg: 10 })).toThrow('recommended quantity');
    expect(() => record(round, { ...request, mode: 'changed', actualKg: 10 })).toThrow('reason');
    expect(() => record(round, { ...request, mode: 'changed' })).toThrow('recommended quantity');
  });
  it('blocks staff approval and preserves the actual quantity on approval or rejection', () => {
    const saved = record(round, { ...request, mode: 'changed', actualKg: 10, reason: 'Limited AF oil available' });
    const req = { operationId: 'review', roundId: 'ghee', recordId: 'first', decision: 'reject' as const, note: 'Requires investigation' };
    expect(() => prepareGheeAfOilReview(saved, req, 'Operator', 'staff', at)).toThrow('owner or admin');
    const rejected = prepareGheeAfOilReview({ ...saved, status: 'cooking' }, req, 'Owner', 'owner', at);
    expect(rejected).toMatchObject({ afOilInput: 10, expectedYield: 71.75, status: 'cooking', afOilRecord: { approvalStatus: 'rejected', reviewedBy: 'Owner' } });
    expect(prepareGheeAfOilReview(rejected, req, 'Owner', 'owner', at)).toBe(rejected);
    expect(() => prepareGheeAfOilReview(saved, { ...req, note: '' }, 'Admin', 'admin', at)).toThrow('reason');
  });
  it('requires approval even when a correction returns to the recommended amount', () => {
    const saved = record(round, { ...request, mode: 'changed', actualKg: 10, reason: 'Limited AF oil available' });
    const corrected = record(saved, { ...request, operationId: 'correct', expectedRecordId: 'first', reason: 'Previous entry was a typo' });
    expect(corrected.afOilRecord?.approvalStatus).toBe('pending');
    expect(Object.keys(corrected.afOilAuditHistory!)).toHaveLength(2);
    expect(saved.afOilInput).toBe(10);
  });
  it('rejects stale writers, stale reviews and changed operation retries', () => {
    const saved = record();
    expect(() => record(saved, { ...request, operationId: 'concurrent' })).toThrow('record changed');
    expect(() => record(saved, { ...request, actualKg: 10, mode: 'changed', reason: 'Different payload' })).toThrow('different AF oil');
    expect(() => prepareGheeAfOilReview(saved, { operationId: 'r', roundId: 'ghee', recordId: 'old', decision: 'approve', note: '' }, 'Admin', 'admin', at)).toThrow('matching pending');
  });
  it('preserves legacy progress, packing and external butter genealogy; no invented confirmation', () => {
    const legacy = { ...round, afOilConfirmationRequired: undefined, status: 'packed', sourceCreamLotId: 'external-cream', outputWeight: 84, packedSkus: [{ sku: 'GHEE-1500', cases: 9, loose: 2 }] };
    const saved = record(legacy, { ...request, mode: 'changed', actualKg: 10, reason: 'Correct actual use from notes' });
    expect(saved.status).toBe('packed'); expect(saved.packedSkus).toBe(legacy.packedSkus); expect(saved.outputWeight).toBe(84); expect(saved.sourceCreamLotId).toBe('external-cream');
    expect(legacy).not.toHaveProperty('afOilRecord');
    expect(() => record({ ...round, locked: true })).toThrow('closed');
  });
  it('accepts approved manager review after production closes without changing production facts', () => {
    const saved = record(round, { ...request, mode: 'changed', actualKg: 10, reason: 'Limited AF oil available' });
    const approved = prepareGheeAfOilReview({ ...saved, locked: true, status: 'packed' }, { operationId: 'review', roundId: 'ghee', recordId: 'first', decision: 'approve', note: '' }, 'Admin', 'admin', at);
    expect(approved).toMatchObject({ locked: true, status: 'packed', afOilInput: 10, afOilRecord: { approvalStatus: 'approved', reviewedByRole: 'admin' } });
  });
  it('uses dedicated confirmed RPCs and keeps an uncertain retry identical', async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ error: { message: 'temporary error' } }).mockResolvedValueOnce({ data: { round: record() } });
    await expect(persistGheeAfOil({ rpc } as never, 'record', request)).rejects.toThrow('not confirmed');
    await expect(persistGheeAfOil({ rpc } as never, 'record', request)).resolves.toMatchObject({ afOilInput: 12.5 });
    expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);
  });
});
