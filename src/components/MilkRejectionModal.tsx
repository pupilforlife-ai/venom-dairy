import {useRef,useState} from 'react';
import {Modal} from './Modal';
import {useToast} from './Toast';
import {milkRejectionQuote} from '../lib/milkRejection';
import {runTraceCommand} from '../traceability/transport';
import type {MilkLot,ProductionRound} from '../data/mockData';

export function MilkRejectionModal({lot,rounds,onClose}:{lot:MilkLot;rounds:ProductionRound[];onClose:()=>void}) {
 const {showToast}=useToast();
 const [quote]=useState(()=>milkRejectionQuote(lot,rounds));
 const [quantity,setQuantity]=useState(String(quote.remaining));
 const [date,setDate]=useState(new Date().toLocaleDateString('en-CA',{timeZone:'Africa/Johannesburg'}));
 const [reason,setReason]=useState('');const [saving,setSaving]=useState(false);const busy=useRef(false);
 const [error,setError]=useState('');
 const save=async()=>{
  if(busy.current)return;
  const amount=Number(quantity);
  if(!quantity.trim()||!Number.isFinite(amount)||amount<=0||amount>quote.remaining){setError(`Enter rejected litres between 0 and ${quote.remaining.toLocaleString()} L (greater than zero).`);return;}
  if(reason.trim().length<3){setError('Enter the reason for rejection.');return;}
  busy.current=true;setSaving(true);setError('');
  try{await runTraceCommand('milk_rejection',{lotId:lot.id,expected:quote,quantity:amount,rejectionDate:date,reason:reason.trim()});showToast('success',`${amount.toLocaleString()} L rejected milk recorded for lot ${lot.lotCode}`);onClose();}
  catch(e){setError((e as Error).message);}finally{busy.current=false;setSaving(false);}
 };
 return <Modal isOpen onClose={()=>{if(!busy.current)onClose();}} title={`Reject milk · ${lot.lotCode}`}>
  <div className="space-y-3">
   <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900"><strong>{quote.received.toLocaleString()} L delivered</strong><p>{quote.rejected.toLocaleString()} L already rejected · {quote.remaining.toLocaleString()} L available to reject</p></div>
   <label className="block text-sm font-medium text-slate-700">Rejected milk (L)<input aria-label="Rejected milk litres" type="number" inputMode="decimal" min="0.001" step="any" value={quantity} onChange={e=>setQuantity(e.target.value)} className="mt-1 w-full min-w-0 rounded-lg border border-slate-200 p-2 text-base"/></label>
   <label className="block text-sm font-medium text-slate-700">Date of rejection<input type="date" value={date} onChange={e=>setDate(e.target.value)} className="mt-1 w-full min-w-0 rounded-lg border border-slate-200 p-2 text-base"/></label>
   <label className="block text-sm font-medium text-slate-700">Reason<textarea value={reason} onChange={e=>setReason(e.target.value)} placeholder="Why was the milk rejected?" rows={2} className="mt-1 w-full min-w-0 rounded-lg border border-slate-200 p-2 text-base"/></label>
   <p className="text-xs text-slate-600">The delivered quantity stays on record. Rejected litres are deducted from the milk balance. The app records your name and the save time.</p>
   {error&&<p role="alert" className="break-words rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}
   <div className="flex gap-2"><button type="button" onClick={save} disabled={saving} className="flex-1 rounded-lg bg-rose-600 p-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving?'Saving…':'Record rejection'}</button><button type="button" onClick={onClose} disabled={saving} className="rounded-lg bg-slate-100 p-2.5 text-sm">Cancel</button></div>
  </div>
 </Modal>;
}
