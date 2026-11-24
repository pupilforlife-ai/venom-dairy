import { memo, useState } from 'react';
import type { ProductionRound } from '../data/mockData';
import { Modal } from '../components/Modal';
import { useApp } from '../store/AppContext';
import { paneerTrayConflicts } from './paneerStorage';
import { trayPackingFingerprint,trayPackingProgress } from './paneerTrays';
function RoundTrayStatus({round,rounds}:{round:ProductionRound;rounds:ProductionRound[]}) {
 const {recordPaneerTrayPacking}=useApp();
 const [open,setOpen]=useState(false),[selected,setSelected]=useState<number[]>([]),[id,setId]=useState(''),[expected,setExpected]=useState(''),[reason,setReason]=useState(''),[message,setMessage]=useState('');
 const progress=trayPackingProgress(round),numbers=progress.assignment.numbers;
 if(!numbers.length)return null;
 const conflicts=paneerTrayConflicts(rounds).filter(c=>c.earlier.id===round.id),reopening=!progress.inferred&&progress.explicit&&progress.packed.some(n=>!selected.includes(n));
 const owner=['owner','admin'].includes((localStorage.getItem('vejoy_user_role')||'').toLowerCase());
 function start(){setSelected(progress.packed);setExpected(trayPackingFingerprint(round));setId(globalThis.crypto?.randomUUID?.()||`tray-${Date.now()}-${Math.random().toString(36).slice(2)}`);setReason('');setMessage('');setOpen(true);}
 async function save(){try{await recordPaneerTrayPacking({id,roundId:round.id,expectedFingerprint:expected,packedNumbers:selected,reason});setOpen(false);setMessage('Tray packing saved.');}catch(e){setMessage((e as Error).message);}}
 return <div className="trace-round-trays mt-1 rounded-lg border border-cyan-200 bg-cyan-50 p-2 text-xs text-cyan-900">
  <strong>Trays · {progress.packed.length}/{numbers.length} packed</strong>
  {!!progress.packed.length&&<p className="text-emerald-700">Packed: {progress.packed.join(', ')}{progress.inferred?' · from round status':''}</p>}
  {!!progress.pending.length&&<p className="font-semibold text-amber-800">Still waiting: {progress.pending.join(', ')}</p>}
  {progress.assignmentChanged&&<p className="text-amber-800">Tray numbers changed. Confirm packing for this assignment.</p>}
  <button type="button" className="mt-1 rounded border border-cyan-300 bg-white px-2 py-1.5 font-semibold text-cyan-900" onClick={start}>{progress.inferred?'Review tray packing':'Record trays packed'}</button>
  {!!conflicts.length&&<p className="trace-tray-warning text-amber-800" title={conflicts.map(c=>`Tray ${c.number}: ${c.later.milkLotCode} S${c.later.shiftNumber}/R${c.later.roundNumber}`).join("; ")}>Trays in use: {conflicts.map(c=>c.number).join(", ")}</p>}
  {message&&!open&&<p role="status" className="text-emerald-700">{message}</p>}
  <Modal isOpen={open} onClose={()=>setOpen(false)} title={`Tray packing · S${round.shiftNumber}/R${round.roundNumber}`}>
   <div className="space-y-3"><p className="text-sm text-slate-600">{progress.inferred?'This round is fully packed: all assigned trays are empty and available. Earlier partial tray records remain in the history below.':'Tick only trays that have been fully packed and emptied. Leave partly packed or untouched trays unticked.'}</p>
    <div className="trace-cut-tray-grid trace-tray-pack-grid">{numbers.map(n=><label key={n} className={selected.includes(n)?'trace-cut-tray-selected':''}><input type="checkbox" checked={selected.includes(n)} disabled={progress.inferred||(progress.explicit&&progress.packed.includes(n)&&!owner)} onChange={e=>setSelected((e.target.checked?[...selected,n]:selected.filter(x=>x!==n)).sort((a,b)=>a-b))}/>Tray {n}</label>)}</div>
    <p className="text-sm text-emerald-700">Packed: <strong>{selected.join(', ')||'none selected'}</strong></p><p className="text-sm text-amber-800">Still waiting: <strong>{numbers.filter(n=>!selected.includes(n)).join(', ')||'none'}</strong></p>
    <p className="text-xs text-slate-500">This records tray completion only. Enter cases and loose packets through Record Packing; do not add them again here.</p>
    {reopening&&<label className="block text-sm font-semibold">Owner/Admin reason for reopening packed trays<input className="mt-1 w-full rounded border border-slate-200 p-2" value={reason} onChange={e=>setReason(e.target.value)}/></label>}
    {!!round.paneerTrayPackingHistory?.length&&<details className="text-xs"><summary>Tray packing history · {round.paneerTrayPackingHistory.length}</summary>{round.paneerTrayPackingHistory.map(e=><p key={e.id}>{e.recordedBy} · {new Date(e.recordedAt).toLocaleString('en-GB')} · Trays {e.assignedNumbers.join(', ')} · Packed {e.beforePacked.join(', ')||'none'} → {e.packedNumbers.join(', ')||'none'}{e.reason?` · ${e.reason}`:''}</p>)}</details>}
    {message&&<p role="alert" className="trace-warning">{message}</p>}
    <div className="flex gap-2"><button type="button" className="flex-1 rounded-lg bg-cyan-600 px-3 py-2.5 text-sm font-semibold text-white" onClick={()=>progress.inferred?setOpen(false):save()}>{progress.inferred?'Close':'Save tray packing'}</button><button type="button" className="rounded-lg bg-slate-100 px-3 py-2.5 text-sm" onClick={()=>setOpen(false)}>Cancel</button></div>
   </div>
  </Modal>
 </div>;
}

export default memo(RoundTrayStatus);
