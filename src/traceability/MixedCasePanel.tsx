import {lotsWithRecordedProductionStart} from './productionStart';
import { onSiteLooseBySource,mixedCaseStockIssues } from './mixedCaseStock';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Modal } from '../components/Modal';
import { useApp } from '../store/AppContext';
import { paneerSkuDefinitions } from '../data/skuConfig';
import { useTraceability } from './useTraceability';
import { assemblySourceOptions, buildMixedPaneerCase, loosePacketSources, paneerCaseSummary, type MixedPaneerCase, type MixedCaseRequest } from './mixedPaneerCases';

function CaseCard({item,onCancel,onLink,owner}:{item:MixedPaneerCase;onLink:(id:string)=>void;onCancel:(id:string,reason:string)=>void;owner:boolean}) {
 const [reason,setReason]=useState('');
 return <details className="trace-case-group"><summary><strong>Mixed case {item.number}{item.caseCount>1?` · ${item.caseCount} identical cases`:''} · {item.sku} · {item.caseBatchCode}{item.voided?' · Cancelled':''}</strong></summary>
  <p>{item.recordedBy} · {new Date(item.recordedAt).toLocaleString('en-GB')} · {item.voided?'Cancelled record':'Recorded case assembly'}</p>
  <p>Case label uses Shift {item.labelShift} from lot {item.parts.find(p=>p.source.lotId===item.labelLotId)?.source.lotCode}. Packet labels keep their original round codes.</p>
  {item.parts.map(p=><p key={p.source.key}><Link to={`/traceability?q=${encodeURIComponent(p.source.roundId)}`}>Lot {p.source.lotCode} · S{p.source.shift}/R{p.source.round}</Link> · <strong>{p.packets} packets</strong>{item.caseCount>1?` (${p.packets/item.caseCount} per case)`:''} · {p.source.packetBatchCode||'Packet label not previously recorded'}</p>)}
  {!item.voided&&!item.stockLink&&<div className="trace-warning"><p>Earlier assembly: stock allocation has not been linked yet.</p>{owner&&<button onClick={()=>onLink(item.id)}>Review and link this assembly to stock</button>}</div>}
  {item.stockLink&&<p className="trace-help">Stock linked by {item.stockLink.by} · {new Date(item.stockLink.at).toLocaleString('en-GB')}. Existing loose packets were moved into this case, not added as new production.</p>}
  {item.voided?<p className="trace-warning">Cancelled by {item.voided.by} · {new Date(item.voided.at).toLocaleString('en-GB')} · {item.voided.reason}. Original case record retained.</p>:owner&&<details><summary>Owner/Admin · correct this assembly record</summary><label>Reason<input value={reason} onChange={e=>setReason(e.target.value)}/></label><button onClick={()=>onCancel(item.id,reason)}>Cancel assembly record and release its loose packets</button><p className="trace-help">Use only if this assembly was recorded incorrectly. Physical production and original packing entries stay unchanged.</p></details>}
 </details>;
}
export default function MixedPaneerCases({lotId='all',query=''}:{lotId?:string;query?:string}) {
 const {productionRounds,milkLots:recordedMilkLots,productionShifts,finishedStock}=useApp(),{state,saveMixedCase,cancelMixedCase,linkMixedCaseStock}=useTraceability();
 const milkLots=useMemo(()=>lotsWithRecordedProductionStart(recordedMilkLots,productionShifts),[recordedMilkLots,productionShifts]);
 const [open,setOpen]=useState(false),[sku,setSku]=useState('MPAN100'),[caseCount,setCaseCount]=useState('1'),[operationId,setOperationId]=useState('');
 const [parts,setParts]=useState([{key:'',packets:'',expectedFingerprint:''}]);
 const [error,setError]=useState(''),[message,setMessage]=useState('');
 const owner=['owner','admin'].includes(localStorage.getItem('vejoy_user_role')||'');
 const onSite=onSiteLooseBySource(productionRounds,milkLots,state,finishedStock);
 const sources=loosePacketSources(productionRounds,milkLots,state).filter(s=>s.sku===sku).map(s=>({...s,availableLoose:Math.min(s.availableLoose,onSite.get(s.key)||0)}));
 const request:MixedCaseRequest={id:operationId,sku,caseCount:Number(caseCount),parts:parts.map(p=>({key:p.key,packets:Number(p.packets)*Number(caseCount),expectedFingerprint:p.expectedFingerprint}))};
 let preview:MixedPaneerCase|undefined,previewError='';
 if(open&&parts.every(p=>p.key&&p.packets)){try{if(request.parts.some(p=>p.packets>(sources.find(s=>s.key===p.key)?.availableLoose||0)))throw Error('The requested loose packets are no longer on site. Review the source quantities.');preview=buildMixedPaneerCase(request,productionRounds,milkLots,state,'Preview',new Date().toISOString());}catch(e){previewError=(e as Error).message;}}
 const records=Object.values(state.mixedCases||{}).filter(c=>(lotId==='all'||c.parts.some(p=>p.source.lotId===lotId))&&(!query||JSON.stringify(c).toLowerCase().includes(query.toLowerCase()))).sort((a,b)=>b.number-a.number);
 const summaries=useMemo(()=>[...new Set(productionRounds.filter(r=>lotId==='all'||r.milkLotId===lotId).flatMap(r=>(r.packedSkus||[]).map(p=>p.sku)))].map(s=>paneerCaseSummary(productionRounds,milkLots,state,s,lotId)).filter(s=>s&&(!query||JSON.stringify(s).toLowerCase().includes(query.toLowerCase()))),[productionRounds,milkLots,state,query,lotId]);
 function start(){setOperationId(crypto.randomUUID());setParts([{key:'',packets:'',expectedFingerprint:''}]);setCaseCount('1');setError('');setMessage('');setOpen(true);}
 async function save(){try{await saveMixedCase(request);setOpen(false);setMessage('Mixed case saved. Source packet totals are unchanged; remaining loose quantities now reflect this assembly.');}catch(e){setError((e as Error).message);}}
 return <section className="trace-card trace-bag-status"><details><summary><strong>Mixed cases & remaining loose packets</strong> · {records.filter(c=>!c.voided).length} assembly records</summary>
  <p>A mixed case has its own record linked to every contributing round. Original round packing entries remain the production record. Assembling a case moves existing loose packets into a case; it does not create more packets.</p>
  {mixedCaseStockIssues(state,productionRounds,milkLots,finishedStock).map(p=><p key={p} className="trace-warning" role="alert">{p}</p>)}
  <button className="trace-primary" onClick={start}>Make a case from loose packets</button>
  {summaries.map(s=>s&&<div className="trace-case-group" key={s.sku}><strong>{s.sku}: {s.totalCases} cases + {s.looseRemaining} loose = {s.totalPackets} recorded packets</strong><p>{s.originalCases} original cases + {s.mixedCases} assembled cases · {s.recordedLoose} original loose packets − {s.recordedLoose-s.looseRemaining} used in assemblies = {s.looseRemaining} loose remaining</p>{s.sharedPackets>0&&<p>{s.sharedPackets} packets from this lot are in shared cases spanning milk lots; those cases are listed separately and are not counted twice.</p>}{s.problems.map(p=><p className="trace-warning" key={p}>{p}</p>)}</div>)}
  {lotId!=='all'&&<p className="trace-help">Showing cases linked to this milk lot. Cross-lot cases retain the full contribution from every lot. Open the register’s All lots view for combined SKU packing totals.</p>}
  {records.map(c=><CaseCard key={c.id} item={c} owner={owner} onLink={async id=>{try{await linkMixedCaseStock(id);setMessage('Stock linked; existing packet totals preserved.');setError('');}catch(e){setError((e as Error).message);}}} onCancel={async (id,reason)=>{try{await cancelMixedCase(id,reason);setMessage('Incorrect assembly cancelled with history retained. Loose-packet allocations released.');setError('');}catch(e){setError((e as Error).message);}}}/>)}
  {!records.length&&<p>No mixed-case assemblies recorded for this selection.</p>}
  <p className="trace-help">These are total packing composition figures. Inventory shows linked cases still on site; Distribution tracks their handover.</p>
 </details>{message&&<p role="status">{message}</p>}{error&&!open&&<p role="alert" className="trace-warning">{error}</p>}
 <Modal isOpen={open} onClose={()=>setOpen(false)} title="Make a case from recorded loose packets" size="lg"><div className="trace-form">
  <p>Confirm the labelled loose packets physically used. Each source must be for the same SKU and can be selected only once. Different milk lots are allowed and all origins are retained.</p>
  <div className="trace-fields"><label>SKU<select value={sku} onChange={e=>{setSku(e.target.value);setParts([{key:'',packets:'',expectedFingerprint:''}]);setError('');}}>{paneerSkuDefinitions.filter(d=>d.packMode==='units').map(d=><option key={d.sku} value={d.sku}>{d.sku} · {d.unitsPerCase} packets/case</option>)}</select></label><label>Number of cases with this identical composition<input type="number" min="1" step="1" value={caseCount} onChange={e=>setCaseCount(e.target.value)}/></label></div>
  {parts.map((p,index)=><div className="trace-case-group" key={index}><div className="trace-fields"><label>Loose-packet source {index+1}<select value={p.key} onChange={e=>{const source=sources.find(s=>s.key===e.target.value);setParts(old=>old.map((v,i)=>i===index?{...v,key:e.target.value,expectedFingerprint:source?.fingerprint||''}:v));setError('');}}><option value="">Choose lot, shift and round</option>{assemblySourceOptions(sources,parts,index).map(s=><option key={s.key} value={s.key}>{s.lotCode} · S{s.shift}/R{s.round} · {s.packetBatchCode||'Label not recorded'} · {s.availableLoose} loose available</option>)}</select></label><label>Packets from this source per case<input type="number" min="1" step="1" inputMode="numeric" value={p.packets} onChange={e=>setParts(old=>old.map((v,i)=>i===index?{...v,packets:e.target.value}:v))}/></label></div>{parts.length>1&&<button onClick={()=>setParts(old=>old.filter((_,i)=>i!==index))}>Remove source {index+1}</button>}</div>)}
  <button onClick={()=>setParts(old=>[...old,{key:'',packets:'',expectedFingerprint:''}])}>Add another round’s loose packets</button>
  <p><strong>{parts.reduce((sum,p)=>sum+(Number(p.packets)||0),0)} / {paneerSkuDefinitions.find(d=>d.sku===sku)?.unitsPerCase} packets per case</strong></p>
  {preview&&<div className="trace-case-group"><p><strong>Case label: {preview.caseBatchCode}</strong> · Shift {preview.labelShift}. Greatest contribution wins; ties use the latest contributing shift.</p>{preview.parts.map(p=><p key={p.source.key}>Lot {p.source.lotCode} · S{p.source.shift}/R{p.source.round}: {p.source.availableLoose} loose − {p.packets} used = <strong>{p.source.availableLoose-p.packets} remaining</strong></p>)}</div>}
  {(error||previewError)&&<p role="alert" className="trace-warning">{error||previewError}</p>}
  <div className="trace-buttons"><button className="trace-primary" disabled={!preview} onClick={save}>Confirm physical case assembly</button><button onClick={()=>setOpen(false)}>Cancel</button></div>
 </div></Modal></section>;
}
