import { useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { ProductionRound } from '../data/mockData';
import { useApp } from '../store/AppContext';
import { useToast } from './Toast';
import { Modal } from './Modal';
import { canRecordGheeAfOil, canReviewGheeAfOil, prepareGheeAfOilRecord, prepareGheeAfOilReview, recommendedGheeAfOil,
  type RecordGheeAfOilRequest, type ReviewGheeAfOilRequest } from '../lib/gheeAfOil';

export const afOilApprovalLabels = { not_required: 'Recommended quantity confirmed', pending: 'Pending owner/admin approval', approved: 'Approved by owner/admin', rejected: 'Rejected — follow-up required' };
const timestamp = (at: string) => `${new Date(at).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })} SAST`;
type Attempt = { action: 'record'; request: RecordGheeAfOilRequest } | { action: 'review'; request: ReviewGheeAfOilRequest };
export function GheeAfOilModal({ round, role, onClose }: { round: ProductionRound; role: string; onClose: () => void }) {
  const { recordGheeAfOil, reviewGheeAfOil } = useApp();
  const { showToast } = useToast();
  const record = round.afOilRecord;
  const butter = round.butterInput ?? round.actualInput;
  const recommended = Number.isFinite(butter) && butter > 0 ? recommendedGheeAfOil(round) : null;
  const [correcting, setCorrecting] = useState(false);
  const [mode, setMode] = useState<'recommended' | 'changed'>('recommended');
  const [actual, setActual] = useState(String(record?.actualKg ?? recommended ?? ''));
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const saving = useRef(false), pending = useRef<Attempt | null>(null);
  const canEdit = canRecordGheeAfOil(role) && !round.locked && !['discarded', 'cancelled', 'spoiled', 'handed_over'].includes(round.status);
  const editing = !record || correcting;
  const disabled = busy || Boolean(pending.current);
  const save = async (action: 'record' | 'review', decision: 'approve' | 'reject' = 'approve') => {
    if (saving.current) return;
    try {
      let attempt = pending.current;
      if (!attempt) {
        if (action === 'record') {
          if (recommended === null || (mode === 'changed' && actual.trim() === '')) throw new Error('Enter the actual AF oil quantity.');
          const request: RecordGheeAfOilRequest = { operationId: uuidv4(), roundId: round.id, expectedRecordId: record?.id ?? null,
            mode, actualKg: mode === 'recommended' ? recommended : Number(actual), reason: reason.trim() };
          prepareGheeAfOilRecord(round, request, 'Operator', role, new Date().toISOString());
          attempt = { action, request };
        } else {
          if (!record) throw new Error('No AF oil entry is available for review.');
          const request: ReviewGheeAfOilRequest = { operationId: uuidv4(), roundId: round.id, recordId: record.id, decision, note: note.trim() };
          prepareGheeAfOilReview(round, request, 'Reviewer', role, new Date().toISOString());
          attempt = { action, request };
        }
      }
      pending.current = attempt; saving.current = true; setBusy(true); setError('');
      if (attempt.action === 'record') await recordGheeAfOil(attempt.request); else await reviewGheeAfOil(attempt.request);
      pending.current = null;
      showToast('success', attempt.action === 'record' ? (!record && attempt.request.mode === 'recommended' ? 'Recommended AF oil quantity confirmed.' : 'Actual AF oil quantity recorded; owner/admin review pending.') : 'AF oil review recorded. Actual input retained.');
      onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'AF oil save was not confirmed.'); }
    finally { saving.current = false; setBusy(false); }
  };
  return <Modal isOpen onClose={() => { if (!saving.current) onClose(); }} title={`AF oil · ${round.batchCode || 'Ghee'}/R${round.roundNumber}`} size="md">
    <div className="space-y-4 text-sm">
      <p>Butter input: <strong>{butter?.toFixed(3)} kg</strong> · Recommended AF oil: <strong>{recommended === null ? 'Needs review' : `${recommended.toFixed(3)} kg`}</strong></p>
      <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">Standard ratio: 12.5 kg AF oil per 92.5 kg butter. Record the quantity physically added, not just the calculated amount. A variation requires owner/admin approval; production can continue.</p>
      {record && <section className="space-y-2 rounded-lg border border-slate-200 p-3">
        <p className="font-semibold">Actual AF oil: {record.actualKg.toFixed(3)} kg</p>
        <p className={record.approvalStatus === 'pending' || record.approvalStatus === 'rejected' ? 'font-semibold text-amber-800' : 'font-semibold text-emerald-700'}>{afOilApprovalLabels[record.approvalStatus]}</p>
        <p className="text-xs">Recorded by {record.recordedBy} · {timestamp(record.recordedAt)}</p>
        {record.reason && <p>Reason: {record.reason}</p>}
        {record.reviewedAt && <p className="text-xs">Reviewed by {record.reviewedBy} · {timestamp(record.reviewedAt)}{record.reviewNote && ` · ${record.reviewNote}`}</p>}
        {record.approvalStatus === 'rejected' && <p className="text-xs">Rejection does not change the amount physically used. Record an audited correction if the entry was wrong.</p>}
      </section>}
      {!record && <p className="text-xs text-slate-600">{round.afOilConfirmationRequired ? 'Actual quantity has not yet been confirmed.' : 'Existing round: no separate operator confirmation was recorded. Its existing quantities and progress are unchanged.'}</p>}
      {editing && canEdit && <fieldset disabled={disabled || recommended === null} className="space-y-3">
        <legend className="mb-2 font-semibold">Quantity actually added</legend>
        <label className="flex items-center gap-2"><input type="radio" name="af-oil-mode" checked={mode === 'recommended'} onChange={() => { setMode('recommended'); setError(''); }} />I added the recommended quantity</label>
        <label className="flex items-center gap-2"><input type="radio" name="af-oil-mode" checked={mode === 'changed'} onChange={() => { setMode('changed'); setError(''); }} />I used a different quantity</label>
        {mode === 'changed' && <label className="block font-medium">Actual AF oil (kg)<input type="number" inputMode="decimal" min="0" step="0.001" value={actual} onChange={e => { setActual(e.target.value); setError(''); }} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>}
        {(mode === 'changed' || record) && <label className="block font-medium">Reason for quantity change<textarea rows={3} value={reason} onChange={e => { setReason(e.target.value); setError(''); }} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>}
      </fieldset>}
      {editing && canEdit && !pending.current && <button disabled={busy || recommended === null} onClick={() => void save('record')} className="rounded-lg bg-orange-600 px-4 py-2 font-semibold text-white disabled:opacity-50">Confirm AF oil added</button>}
      {!editing && record?.approvalStatus === 'pending' && canReviewGheeAfOil(role) && <section className="space-y-3 rounded-lg border border-amber-200 p-3">
        <p className="font-semibold">Owner / Admin review</p>
        <label className="block">Review note (required for rejection)<textarea disabled={disabled} rows={2} value={note} onChange={e => { setNote(e.target.value); setError(''); }} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
        <div className="flex flex-wrap gap-2"><button disabled={disabled} onClick={() => void save('review', 'approve')} className="rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white">Approve quantity</button><button disabled={disabled} onClick={() => void save('review', 'reject')} className="rounded-lg bg-red-700 px-4 py-2 font-semibold text-white">Reject quantity</button></div>
      </section>}
      {!editing && canEdit && <button disabled={disabled} onClick={() => { setCorrecting(true); setMode('changed'); }} className="rounded-lg border border-slate-300 px-3 py-2">Correct recorded quantity</button>}
      {pending.current && <button disabled={busy} onClick={() => void save(pending.current!.action)} className="rounded-lg bg-orange-600 px-4 py-2 font-semibold text-white">{busy ? 'Confirming…' : 'Retry same AF oil entry'}</button>}
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {round.afOilAuditHistory && <details className="rounded-lg border border-slate-200 p-3"><summary className="cursor-pointer font-semibold">AF oil audit history</summary><div className="mt-3 space-y-3">{Object.values(round.afOilAuditHistory).map(event => <p key={event.id} className="border-b border-slate-100 pb-2 text-xs">{timestamp(event.recordedAt)} · {event.recordedBy} ({event.recordedByRole}) · {event.kind === 'record' ? `Recorded ${event.actualKg.toFixed(3)} kg; recommended ${event.recommendedKg.toFixed(3)} kg. ${event.reason || ''}` : `${event.decision === 'approve' ? 'Approved' : 'Rejected'} ${event.actualKg.toFixed(3)} kg. ${event.note || ''}`}</p>)}</div></details>}
    </div>
  </Modal>;
}
