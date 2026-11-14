import MixedPaneerCases from './MixedCasePanel';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { paneerJourney } from './paneerJourney';
import PaneerJourneyView from './PaneerJourneyView';
import PaneerTraceReview from './PaneerTraceReview';
import PaneerStockCustody from './PaneerStockCustody';
import { paneerStockTrace } from './paneerStockTrace';
import { useApp } from '../store/AppContext';
import { useSupabaseState } from '../hooks/useSupabaseState';
import type { CrumbingBatch } from '../pages/CrumbingTab';
import { finishedGoodsBatchCodeDefinitions } from '../data/skuConfig';
import { agreedPrefixes, consumedTotals, safeCode } from './domain';
import { useTraceability } from './useTraceability';

import { printLabels } from './print';
function PrefixEditor({sku,initial,onSave}:{sku:string;initial:string;onSave:(v:string,r:string)=>void}) {
 const [value,setValue]=useState(initial),[reason,setReason]=useState('');
 return <div className="trace-fields"><label>{sku}<input value={value} onChange={e=>setValue(e.target.value.toUpperCase())} placeholder="Proposed prefix"/></label><label>Reason / approval note<input value={reason} onChange={e=>setReason(e.target.value)}/></label><button onClick={()=>onSave(value,reason)}>Confirm prefix</button></div>;
}
export default function TraceabilityPage() {
 const {milkLots,productionRounds,creamLots,finishedStock}=useApp(),{state,save}=useTraceability();
 const stockReport=useMemo(()=>paneerStockTrace(productionRounds,finishedStock),[productionRounds,finishedStock]);
 const [crumbs]=useSupabaseState<CrumbingBatch[]>('vejoy_crumbingBatches',[]);
 const [params]=useSearchParams();
 const [query,setQuery]=useState(params.get('q')||''),[lotId,setLotId]=useState('all'),[message,setMessage]=useState('');
 useEffect(()=>{if(params.get('q')){setQuery(params.get('q')!);setLotId('all');}},[params]);
 const role=localStorage.getItem('vejoy_user_role'),owner=['owner','admin'].includes(role||'');
 const roundRows=useMemo(()=>productionRounds.filter(r=>lotId==='all'||r.milkLotId===lotId).map(round=>{
  const lot=milkLots.find(l=>l.id===round.milkLotId),trace=state.rounds[round.id]?.value;
  const date=trace?.productionDate||round.traceabilityProductionDate||state.lots[round.milkLotId]?.value.productionDate||lot?.traceabilityProductionDate||'';
  const code=['D','C/S','Halloumi'].includes(round.type)?safeCode(state.prefixes[round.type]?.value||agreedPrefixes[round.type],date,round.shiftNumber,round.roundNumber).code:'';
  const journey=round.type==='D'||round.type==='C/S'?paneerJourney(round,lot,state):undefined;
  const text=JSON.stringify({round,trace,code,journey,mixedCases:Object.values(state.mixedCases||{}).filter(c=>c.parts.some(p=>p.source.roundId===round.id)),stock:stockReport.lines.filter(l=>l.shares.some(s=>s.roundId===round.id))}).toLowerCase();
  const gaps=journey?.gaps||[];
  return {round,lot,trace,code:journey?.origin.code||code,gaps,text};
 }).filter(r=>!query||r.text.includes(query.toLowerCase())),[productionRounds,milkLots,state,lotId,query,stockReport]);
 const skus=[...new Set([...Object.keys(agreedPrefixes),...finishedGoodsBatchCodeDefinitions.map(d=>d.sku)])];
 return <div className="space-y-5"><section className="trace-card"><h1>Batch traceability register</h1><p>Search recorded sources, supplier batches, rounds and packet codes. Missing links remain visible; standard recipe issue is not proof of actual consumption.</p>
 <div className="trace-fields"><label>Milk lot<select value={lotId} onChange={e=>setLotId(e.target.value)}><option value="all">All lots</option>{milkLots.map(l=><option key={l.id} value={l.id}>{l.lotCode}</option>)}</select></label><label>Find a code, supplier batch or round<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="e.g. 90-1011B8 or supplier batch"/></label></div></section>
 <MixedPaneerCases lotId={lotId} query={query}/>
 {!!stockReport.warnings.length&&<section className="trace-card"><details><summary className="text-amber-800">Stock source links needing review · {stockReport.warnings.length}</summary><p>These entries have not been assigned to a round by guesswork. Inventory quantities are unchanged.</p>{stockReport.warnings.map((w,i)=><p key={i} className="trace-warning">{w}</p>)}</details></section>}
 {roundRows.map(({round,lot,code,trace,gaps})=><section key={round.id} className="trace-card"><div className="trace-title"><h2>{round.type} · {['Butter','Ghee'].includes(round.type)?`Round ${round.roundNumber}`:`Shift ${round.shiftNumber} / Round ${round.roundNumber}`}</h2><span>{round.status}</span></div>
 <p>Milk lot: {lot?.lotCode||'Standalone / source pending'} → <strong>{code||round.batchCode||'Production code pending'}</strong></p>
 <p className="trace-help">Permanent source ID: {round.id}</p>
 {(round.type==='D'||round.type==='C/S')&&<><p className={gaps.length?'trace-warning':''}>{gaps.length?`${gaps.length} traceability details need attention`:'Recorded source references available'}</p><PaneerTraceReview round={round} lot={lot}/><PaneerJourneyView round={round} lot={lot} state={state}/><PaneerStockCustody round={round} report={stockReport}/></>}
 {trace&&<details><summary>Earlier manual ingredient consumption records</summary><div className="trace-table-scroll"><table><thead><tr><th>Ingredient</th><th>Actual</th><th>Supplier</th><th>Supplier product / batch</th></tr></thead><tbody>{trace.ingredients.map(i=><tr key={i.id}><td>{i.name}</td><td>{i.quantity===null?'Missing':`${i.quantity} ${i.unit}`}</td><td>{i.supplier||'Missing'}</td><td>{i.supplierProductCode||'Missing'} / {i.supplierBatch||'Missing'}</td></tr>)}</tbody></table></div><p>Total ingredient mass recorded: {Object.values(consumedTotals(trace.ingredients)).reduce((n,v)=>n+v,0).toFixed(3)} kg</p></details>}
 {(round.packedSkus||[]).map((p,i)=><div className="trace-packing" key={p.packingRunId||i}><p><strong>{p.sku}</strong> · {p.cases} cases + {p.loose||0} loose · Packet: <strong>{p.packetBatchCode||'Code not recorded'}</strong> · Case: <strong>{p.caseBatchCode||'Code not recorded'}</strong></p><p className="trace-help">{p.recordedBy||'Recorder missing'} · {p.recordedAt||'Time missing'} · {p.packingRunId||'Legacy packing entry'}</p>{p.packetBatchCode&&p.caseBatchCode&&<button onClick={()=>printLabels(p.sku,p.packetBatchCode!,p.caseBatchCode!,p.traceabilityProductionDate||'')}>Download label PDF</button>}</div>)}
 {round.creamRecovered!==undefined&&<p>Cream: {round.creamRecovered} kg · {safeCode('92',trace?.productionDate||state.lots[round.milkLotId]?.value.productionDate||lot?.traceabilityProductionDate||'',round.shiftNumber,round.roundNumber).code||'Cream code pending'}</p>}
 {round.type==='Butter'&&<p>Cream source: {round.creamSource==='external'?(creamLots.find(c=>c.id===round.creamLotId)?.lotCode||round.creamLotId):lot?.lotCode||'Source pending'} · Cream input {round.actualInput} kg → Butter {round.butterOutput??'Not recorded'} kg · Buttermilk {round.buttermilkOutput??0} kg. Source pool totals do not prove round-level allocations.</p>}
 {round.type==='Ghee'&&<p>Butter input {round.butterInput??round.actualInput} kg + AF oil {round.afOilInput??'Not recorded'} kg → Ghee {round.outputWeight} kg. Butter allocations: {round.butterSourceAllocations?.map(a=>`${a.id}: ${a.quantityKg} kg`).join('; ')||'Source allocations not recorded'}.</p>}
 </section>)}
 <section className="trace-card"><h2>Crumbing source connections</h2>{crumbs.filter(b=>!query||JSON.stringify(b).toLowerCase().includes(query.toLowerCase())).filter(b=>lotId==='all'||productionRounds.some(r=>r.milkLotId===lotId&&r.id===b.sourceBatchId)||b.sourceBatchId===lotId).map(b=><p key={b.id}><strong>{b.type} · {b.batchCode}</strong> ← {b.sourceBatchCode||b.sourceBatchId||'Source pending'} · {b.packedSkus?.map(p=>`${p.sku}: ${p.cases} cases + ${p.loose||0} loose`).join('; ')||'Packing not yet recorded'}</p>)}<p className="trace-help">Combined tray allocations are accounting records. Physical origins are not invented when source details are missing.</p></section>
 <section className="trace-card"><details><summary>Proposed prefix settings · owner/admin confirmation</summary><p>Agreed prefixes are prefilled. Other SKUs need confirmation. Changes apply to new labels; saved packet labels remain unchanged.</p>{owner&&skus.map(sku=><PrefixEditor key={sku} sku={sku} initial={state.prefixes[sku]?.value||agreedPrefixes[sku]||''} onSave={(value,reason)=>{try{if(!/^[A-Z0-9]{1,8}$/.test(value))throw Error('Use 1–8 letters/digits; leading zeros are preserved.');if(reason.trim().length<5)throw Error('Enter an approval reason.');save('prefixes',sku,value,reason);setMessage(`${sku} prefix saved for future labels.`);}catch(e){setMessage((e as Error).message);}}}/>)}{message&&<p role="status">{message}</p>}</details></section>
 </div>;
}
