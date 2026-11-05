import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProductionRound } from '../data/mockData';

export type AfOilRole = 'staff' | 'admin' | 'owner';
export interface GheeAfOilRecord {
  id: string;
  recommendedKg: number;
  actualKg: number;
  butterInputKg: number;
  mode: 'recommended' | 'changed';
  reason: string;
  recordedAt: string;
  recordedBy: string;
  recordedByRole: AfOilRole;
  approvalStatus: 'not_required' | 'pending' | 'approved' | 'rejected';
  reviewedAt?: string;
  reviewedBy?: string;
  reviewedByRole?: 'owner' | 'admin';
  reviewNote?: string;
}
export interface GheeAfOilEvent {
  id: string;
  kind: 'record' | 'review';
  operationId: string;
  recordId: string;
  previousRecordId?: string | null;
  recommendedKg: number;
  actualKg: number;
  mode?: 'recommended' | 'changed';
  reason?: string;
  decision?: 'approve' | 'reject';
  note?: string;
  recordedAt: string;
  recordedBy: string;
  recordedByRole: AfOilRole;
}
export interface RecordGheeAfOilRequest {
  operationId: string; roundId: string; expectedRecordId: string | null;
  mode: 'recommended' | 'changed'; actualKg: number; reason: string;
}
export interface ReviewGheeAfOilRequest {
  operationId: string; roundId: string; recordId: string; decision: 'approve' | 'reject'; note: string;
}
const kg = (value: number) => Math.round(value * 1e6) / 1e6;
export const canReviewGheeAfOil = (role: string) => ['owner', 'admin'].includes(role);
export const canRecordGheeAfOil = (role: string) => ['staff', 'owner', 'admin'].includes(role);
export function recommendedGheeAfOil(round: Pick<ProductionRound, 'butterInput' | 'actualInput'>) {
  const butter = round.butterInput ?? round.actualInput;
  if (!Number.isFinite(butter) || butter <= 0) throw new Error('The recorded butter input needs review.');
  return kg(butter * 12.5 / 92.5);
}
function identity(round: ProductionRound, request: { operationId: string; roundId: string }) {
  if (round.type !== 'Ghee' || round.id !== request.roundId) throw new Error('Select a Ghee round.');
  if (!request.operationId || request.operationId.length > 120) throw new Error('An operation ID is required.');
}
export function prepareGheeAfOilRecord(round: ProductionRound, request: RecordGheeAfOilRequest, actor: string, role: string, at: string): ProductionRound {
  if (!canRecordGheeAfOil(role)) throw new Error('Approved production access required.');
  identity(round, request);
  if (!Number.isFinite(request.actualKg) || request.actualKg < 0 || !['recommended', 'changed'].includes(request.mode)) throw new Error('Enter a valid non-negative actual AF oil quantity.');
  const actual = kg(request.actualKg), reason = request.reason.trim(), eventId = `af-oil-record-${request.operationId}`;
  const priorEvent = round.afOilAuditHistory?.[eventId];
  if (priorEvent) {
    if (priorEvent.actualKg !== actual || priorEvent.mode !== request.mode || priorEvent.reason !== reason || priorEvent.previousRecordId !== request.expectedRecordId) throw new Error('This operation ID was used for a different AF oil entry.');
    return round;
  }
  if (round.locked || ['discarded', 'cancelled', 'spoiled', 'handed_over'].includes(round.status)) throw new Error('This round is closed for AF oil recording.');
  const previous = round.afOilRecord;
  if ((previous?.id ?? null) !== request.expectedRecordId) throw new Error('The AF oil record changed. Refresh and review it before recording.');
  const recommended = recommendedGheeAfOil(round);
  if ((request.mode === 'recommended') !== (actual === recommended)) throw new Error('Confirm the recommended quantity or select changed quantity and enter the actual amount.');
  if ((actual !== recommended || previous) && reason.length < 5) throw new Error('Enter a reason of at least 5 characters for this change.');
  if (previous?.actualKg === actual && previous.approvalStatus !== 'rejected') throw new Error('This quantity is already recorded. Review the existing entry.');
  const record: GheeAfOilRecord = { id: request.operationId, recommendedKg: recommended, actualKg: actual,
    butterInputKg: round.butterInput ?? round.actualInput, mode: request.mode, reason, recordedAt: at, recordedBy: actor,
    recordedByRole: role as AfOilRole, approvalStatus: actual !== recommended || previous ? 'pending' : 'not_required' };
  const event: GheeAfOilEvent = { id: eventId, operationId: request.operationId, kind: 'record', recordId: record.id,
    previousRecordId: request.expectedRecordId, recommendedKg: recommended, actualKg: actual, mode: request.mode,
    reason, recordedAt: at, recordedBy: actor, recordedByRole: role as AfOilRole };
  return { ...round, afOilInput: actual, expectedYield: kg(((round.butterInput ?? round.actualInput) + actual) * 0.7),
    status: ['scheduled', 'butter_selected'].includes(round.status) ? 'af_oil_added' : round.status,
    afOilRecord: record, afOilAuditHistory: { ...round.afOilAuditHistory, [eventId]: event },
    historyEvents: [...(round.historyEvents || []), { id: eventId, type: 'ghee_af_oil_recorded', stage: 'AF Oil Added', occurredAt: at,
      recordedBy: actor, source: previous ? 'correction' : 'workflow', details: `Actual AF oil ${actual} kg; recommended ${recommended} kg. ${record.approvalStatus === 'pending' ? 'Owner/admin approval pending. ' : 'Recommended amount confirmed. '}${reason}` }] };
}
export function prepareGheeAfOilReview(round: ProductionRound, request: ReviewGheeAfOilRequest, actor: string, role: string, at: string): ProductionRound {
  if (!canReviewGheeAfOil(role)) throw new Error('Only an owner or admin can review AF oil changes.');
  identity(round, request);
  if (!['approve', 'reject'].includes(request.decision)) throw new Error('Select approve or reject.');
  const note = request.note.trim(), eventId = `af-oil-review-${request.operationId}`, priorEvent = round.afOilAuditHistory?.[eventId];
  if (priorEvent) {
    if (priorEvent.recordId !== request.recordId || priorEvent.decision !== request.decision || priorEvent.note !== note) throw new Error('This operation ID was used for a different review.');
    return round;
  }
  const record = round.afOilRecord;
  if (!record || record.id !== request.recordId || record.approvalStatus !== 'pending') throw new Error('There is no matching pending AF oil change. Refresh and review the current entry.');
  if (request.decision === 'reject' && note.length < 5) throw new Error('Enter a rejection reason of at least 5 characters.');
  const reviewed: GheeAfOilRecord = { ...record, approvalStatus: request.decision === 'approve' ? 'approved' : 'rejected',
    reviewedAt: at, reviewedBy: actor, reviewedByRole: role as 'owner' | 'admin', reviewNote: note };
  const event: GheeAfOilEvent = { id: eventId, kind: 'review', operationId: request.operationId, recordId: record.id,
    recommendedKg: record.recommendedKg, actualKg: record.actualKg, decision: request.decision, note,
    recordedAt: at, recordedBy: actor, recordedByRole: role as AfOilRole };
  return { ...round, afOilRecord: reviewed, afOilAuditHistory: { ...round.afOilAuditHistory, [eventId]: event },
    historyEvents: [...(round.historyEvents || []), { id: eventId, type: 'ghee_af_oil_reviewed', stage: 'AF Oil Review',
      occurredAt: at, recordedBy: actor, source: 'approval', details: `AF oil ${request.decision === 'approve' ? 'approved' : 'rejected'}: actual ${record.actualKg} kg; recommended ${record.recommendedKg} kg. Actual input retained. ${note}` }] };
}
export async function persistGheeAfOil(client: Pick<SupabaseClient, 'rpc'>, action: 'record' | 'review', request: RecordGheeAfOilRequest | ReviewGheeAfOilRequest) {
  const { data, error } = await client.rpc(action === 'record' ? 'record_ghee_af_oil' : 'review_ghee_af_oil', { request });
  if (error) throw new Error(`AF oil ${action} was not confirmed. ${error.message} Retry the same form safely.`);
  if (!data?.round?.id || data.round.id !== request.roundId) throw new Error('The server did not confirm the AF oil save. Retry the same form safely.');
  return data.round as ProductionRound;
}
