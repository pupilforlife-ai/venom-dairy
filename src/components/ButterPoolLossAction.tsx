import { useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Modal } from './Modal';
import { butterLossReasonLabels, canRecordButterLoss, validateButterLoss, type ButterLossReason, type ButterLossRequest } from '../lib/butterLoss';

interface Props { role: string; poolId: string; batchCode: string; availableKg: number; onRecord: (request: ButterLossRequest) => Promise<void> }
export function ButterPoolLossAction({ role, poolId, batchCode, availableKg, onRecord }: Props) {
  const [open, setOpen] = useState(false);
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState<ButterLossReason>('moisture_loss');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef<ButterLossRequest | null>(null);
  const saving = useRef(false);
  if (!canRecordButterLoss(role)) return null;
  const show = () => { pending.current = null; setError(''); setQuantity(''); setNote(''); setReason('moisture_loss'); setOpen(true); };
  const save = async () => {
    if (saving.current) return;
    try {
      const request = pending.current || { operationId: uuidv4(), poolId, expectedBalanceKg: Math.round(availableKg * 1e6) / 1e6,
        quantityKg: Number(quantity), reason, note: note.trim() };
      validateButterLoss(request);
      pending.current = request; saving.current = true; setBusy(true); setError('');
      await onRecord(request);
      pending.current = null; setOpen(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Butter loss was not confirmed.'); }
    finally { saving.current = false; setBusy(false); }
  };
  return <>
    <button type="button" onClick={show} className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">Record loss</button>
    <Modal isOpen={open} onClose={() => { if (!busy) setOpen(false); }} title={`Record butter loss · ${batchCode}`} size="md">
      <div className="space-y-4 text-sm">
        <p className="rounded-lg bg-amber-50 p-3 text-amber-950">Owner / Admin only. Record a confirmed loss, not a packing correction. Original butter produced and packed quantities will stay unchanged.</p>
        <p>Available balance: <strong>{availableKg.toFixed(3)} kg</strong></p>
        <label className="block font-medium">Confirmed loss (kg)<input type="number" inputMode="decimal" min="0.001" step="0.001" value={quantity} disabled={busy || Boolean(pending.current)} onChange={e => { setQuantity(e.target.value); setError(''); }} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
        <label className="block font-medium">Loss reason<select value={reason} disabled={busy || Boolean(pending.current)} onChange={e => setReason(e.target.value as ButterLossReason)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2">{Object.entries(butterLossReasonLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="block font-medium">Explanation / verification note<textarea value={note} disabled={busy || Boolean(pending.current)} onChange={e => setNote(e.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
        {quantity && Number.isFinite(Number(quantity)) && <p>Balance after loss: <strong>{(availableKg - Number(quantity)).toFixed(3)} kg</strong></p>}
        <p className="text-xs text-slate-500">The server checks the latest balance and records your account, time and reason. A repeated retry cannot deduct the same loss twice.</p>
        {error && <div role="alert" className="space-y-1 text-red-700"><p>{error}</p>{pending.current && <p className="text-xs">Retry sends the exact same entry. If you close this form, reload and review loss history before creating another entry.</p>}</div>}
        <button type="button" disabled={busy} onClick={() => void save()} className="rounded-lg bg-amber-700 px-4 py-2 font-semibold text-white disabled:opacity-50">{busy ? 'Confirming loss…' : pending.current ? 'Retry same loss entry' : 'Confirm and record loss'}</button>
      </div>
    </Modal>
  </>;
}
