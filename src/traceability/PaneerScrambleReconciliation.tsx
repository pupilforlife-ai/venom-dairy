import { useState } from 'react';
import { Modal } from '../components/Modal';
import { useApp } from '../store/AppContext';
import { useTraceability } from './useTraceability';
import { lotScrambleSummary,pan111Fingerprint } from './pan111Reconciliation';

export default function PaneerScrambleReconciliation({lotId,open=false,onClose=()=>{}}:{lotId:string;open?:boolean;onClose?:()=>void}) {
 const {productionRounds,milkLots,intermediateLots}=useApp(),{state,savePan111}=useTraceability();
 const lot=milkLots.find(l=>l.id===lotId),summary=lotScrambleSummary(productionRounds,lotId,state),saved=state.pan111Reconciliations?.[lotId];
 const [draft,setDraft]=useState<{id:string;expectedFingerprint:string;measured:string;reason:string}>(),[error,setError]=useState('');
 const owner=['owner','admin'].includes(localStorage.getItem('vejoy_user_role')||'');
 if(!lot)return null;
 function start(){if(!lot)return;setError('');setDraft({id:crypto.randomUUID(),expectedFingerprint:pan111Fingerprint(productionRounds,lot,state,intermediateLots),measured:'',reason:''});}
 async function submit(){if(!draft)return;try{await savePan111({id:draft.id,lotId,expectedFingerprint:draft.expectedFingerprint,measuredKg:draft.measured===''?NaN:Number(draft.measured),reason:draft.reason});setDraft(undefined);onClose();setError('');}catch(e){setError((e as Error).message);}}
 const changed=saved&&JSON.stringify(saved.sources)!==JSON.stringify(summary.sources);
 return <section className="trace-card trace-bag-status"><details><summary><strong>Scramble / PAN111 · Lot {lot.lotCode}</strong> · {summary.totalKg.toFixed(2)} kg recorded{saved?` · Final ${saved.measuredKg.toFixed(2)} kg`:''}</summary>
  <p>Scramble recorded after cutting is PAN111. It is counted once. Final PAN111 is weighed for this milk lot; any difference stays against the lot, not individual rounds.</p>
  <p>Round scramble total: <strong>{summary.totalKg.toFixed(2)} kg</strong>{summary.missingRoundIds.length?` · ${summary.missingRoundIds.length} round measurement(s) missing`:''}</p>
  {saved&&<div className="trace-case-group"><p>At confirmation: {saved.scrambleKg.toFixed(2)} kg scramble + <strong>{saved.differenceKg.toFixed(2)} kg lot-level difference</strong> = <strong>{saved.measuredKg.toFixed(2)} kg final PAN111</strong></p><p>{saved.recordedBy} · {new Date(saved.recordedAt).toLocaleString('en-GB')} · {saved.reason||'Measurements matched'}</p>{changed&&<p className="trace-warning">Round measurements changed after final weighing. The saved reconciliation and its original measurements are retained for owner review.</p>}</div>}
  <details><summary>Round scramble measurements · {summary.sources.length}</summary>{summary.sources.map(s=><p key={s.roundId}>S{s.shift}/R{s.round} · {s.kg===null?'Not recorded':`${s.kg.toFixed(2)} kg`}</p>)}</details>
  {!saved&&owner&&<button type="button" className="trace-primary" onClick={start}>Record final PAN111</button>}
 </details>
 <Modal isOpen={open||Boolean(draft)} onClose={()=>{setDraft(undefined);onClose();}} title={`Final PAN111 · Milk lot ${lot.lotCode}`}>
  {saved?<div className="trace-form"><p>Final PAN111 has already been recorded: <strong>{saved.measuredKg.toFixed(2)} kg</strong>. It will not be added to stock again.</p><p>{saved.scrambleKg.toFixed(2)} kg round scramble + {saved.differenceKg.toFixed(2)} kg lot-level difference.</p></div>:!draft?<div className="trace-form"><p>Round scramble total: {summary.totalKg.toFixed(2)} kg. Confirm the final physical weight once milk production is complete.</p><button className="trace-primary" onClick={start}>Enter final weighed amount</button></div>:<div className="trace-form">
   <p>Recorded round scramble: <strong>{summary.totalKg.toFixed(2)} kg</strong>. This is the same PAN111, not additional output.</p>
   {!!summary.missingRoundIds.length&&<p className="trace-warning">{summary.missingRoundIds.length} round measurement(s) missing. Confirm the measured final amount with a reason; missing amounts will not be invented.</p>}
   <label>Final weighed PAN111 (kg)<input type="number" inputMode="decimal" min="0" step="any" value={draft.measured} onChange={e=>setDraft({...draft,measured:e.target.value})}/></label>
   {draft.measured!==''&&<p>Lot-level difference: <strong>{(Number(draft.measured)-summary.totalKg).toFixed(2)} kg</strong> · No adjustment to individual rounds.</p>}
   <label>Reason for any difference or missing measurements<input value={draft.reason} onChange={e=>setDraft({...draft,reason:e.target.value})}/></label>
   {error&&<p role="alert" className="trace-warning">{error}</p>}
   <div className="trace-buttons"><button className="trace-primary" onClick={submit}>Confirm final PAN111 once</button><button onClick={()=>{setDraft(undefined);onClose();}}>Cancel</button></div>
  </div>}
 </Modal></section>;
}
