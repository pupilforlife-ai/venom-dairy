import { useState } from 'react';
import type { ProductionRound } from '../data/mockData';
import { Modal } from '../components/Modal';
import { useApp } from '../store/AppContext';
import { useTraceability } from './useTraceability';
import { afterCuttingFingerprint, afterCuttingValues, canRecordAfterCutting, changedRecordedCuttingFields, cuttingDetailsForRound } from './afterCutting';
import { emptyRoundTrace } from './domain';
import { cuttingStorageDefaults } from './paneerStorage';
import { cuttingSaveDecision, retentionPacketBatchCode } from './paneerJourney';
import PaneerCutDetailsForm from './PaneerCutDetailsForm';

export default function PaneerAfterCutting({round}:{round:ProductionRound}) {
 const {recordPaneerAfterCutting,milkLots,productionRounds}=useApp(),{state}=useTraceability();
 const [open,setOpen]=useState(false),[draft,setDraft]=useState(emptyRoundTrace().cutting),[expected,setExpected]=useState(''),[id,setId]=useState('');
 const [warning,setWarning]=useState(false),[ack,setAck]=useState(false),[reason,setReason]=useState(''),[message,setMessage]=useState('');
 if(!canRecordAfterCutting(round))return null;
 const current=cuttingDetailsForRound(round,state),completed=[Boolean(current.trayNumbers?.length),current.scrambleKg!==null,current.samplePieces!==null].filter(Boolean).length;
 const owner=['owner','admin'].includes((localStorage.getItem('vejoy_user_role')||'').toLowerCase());
 const corrections=changedRecordedCuttingFields(current,afterCuttingValues(draft));
 function start(){setDraft(cuttingStorageDefaults(round.milkLotCode,current));setExpected(afterCuttingFingerprint(round,state));setId(crypto.randomUUID());setWarning(false);setAck(false);setReason('');setMessage('');setOpen(true);}
 function save(){try{
  if(!cuttingSaveDecision(draft,ack,'after_cutting').canSave){setWarning(true);return;}
  recordPaneerAfterCutting({id,roundId:round.id,expectedFingerprint:expected,details:afterCuttingValues(draft),acknowledged:ack,reason});
  setOpen(false);setMessage('After-cutting details saved.');
 }catch(e){setMessage((e as Error).message);}}
 return <div className="mt-1"><button type="button" onClick={start} className="rounded-lg border border-cyan-300 bg-cyan-50 px-2 py-1.5 text-xs font-semibold text-cyan-900">After cutting · {completed}/3 recorded</button><div className="mt-1 flex flex-wrap gap-1 text-[10px] md:hidden" aria-label="After-cutting checks"><span className="rounded bg-cyan-50 px-1.5 py-1 text-cyan-900">Trays {current.trayNumbers?.length?"✓":"pending"}</span><span className="rounded bg-violet-50 px-1.5 py-1 text-violet-900">Scramble {current.scrambleKg!==null?"✓":"pending"}</span><span className="rounded bg-amber-50 px-1.5 py-1 text-amber-900">Samples {current.samplePieces!==null?"✓":"pending"}</span></div>{message&&!open&&<p role="status" className="text-xs text-emerald-700">{message}</p>}
  <Modal isOpen={open} onClose={()=>setOpen(false)} title={`After cutting · S${round.shiftNumber}/R${round.roundNumber}`}>
   <div className="space-y-3"><p className="text-xs text-slate-600">Add these when cutting is finished. Block and cloth weights, production stage and packing quantities stay as recorded.</p>
    <PaneerCutDetailsForm roundId={round.id} rounds={productionRounds} phase="after_cutting" value={draft} onChange={value=>{setDraft(value);setWarning(false);setAck(false);setMessage('');}} blockKg={(round.blockWeights||[]).reduce((n,w)=>n+w,0)} packetBatchCode={retentionPacketBatchCode(round,milkLots.find(l=>l.id===round.milkLotId),state)}/>
    {!!corrections.length&&(owner?<label className="block text-sm font-medium">Reason for correcting {corrections.join(', ')}<input className="mt-1 w-full rounded-lg border border-slate-200 p-2" value={reason} onChange={e=>setReason(e.target.value)}/></label>:<p className="trace-warning">Already recorded values need an Owner/Admin correction. You can still fill missing details.</p>)}
    {warning&&<div className="trace-cut-warning" role="alert"><strong>These after-cutting details are pending</strong><ul>{cuttingSaveDecision(draft,false,'after_cutting').missing.map(m=><li key={m}>{m}</li>)}</ul><label><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/> Leave the listed items pending and save the available details</label></div>}
    {message&&<p role="alert" className="trace-warning">{message}</p>}
    <div className="flex gap-2"><button type="button" className="flex-1 rounded-lg bg-cyan-600 px-3 py-2.5 text-sm font-semibold text-white" onClick={save}>{warning&&ack?'Save with pending details':'Save after-cutting details'}</button><button type="button" className="rounded-lg bg-slate-100 px-3 py-2.5 text-sm" onClick={()=>setOpen(false)}>Cancel</button></div>
   </div>
  </Modal>
 </div>;
}
