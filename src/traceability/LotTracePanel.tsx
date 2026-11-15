import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { MilkLot } from '../data/mockData';
import { useTraceability } from './useTraceability';
import { checklistForecast, planRevision, validDate, type LotTrace } from './domain';
import IngredientChecklist from './IngredientChecklist';
export default function LotTracePanel({lot}: {lot:MilkLot}) {const {loaded}=useTraceability();return loaded?<LoadedLotTracePanel lot={lot}/>:<section className="trace-card">Loading production plan…</section>;}
function LoadedLotTracePanel({lot}:{lot:MilkLot}) {
  const {state,save}=useTraceability(), saved=state.lots[lot.id];
  const [plan,setPlan]=useState<LotTrace>(()=>saved?.value||{productionDate:lot.traceabilityProductionDate||'',planCsLitres:0,planDirectLitres:0});
  const [draftRevision,setDraftRevision]=useState(()=>planRevision(saved));
  const [reason,setReason]=useState(''),[message,setMessage]=useState('');
  const dateInput=useRef<HTMLInputElement>(null);
  let rows:ReturnType<typeof checklistForecast>=[];try {rows=checklistForecast(plan.planCsLitres,plan.planDirectLitres);} catch {}
  const total=plan.planCsLitres+plan.planDirectLitres;
  const unsavedChanges=!saved||draftRevision!==planRevision(saved)||JSON.stringify(saved.value)!==JSON.stringify(plan);
  async function persist() { try {
    if(!validDate(plan.productionDate)) {dateInput.current?.focus();throw Error('Select the start of production date above, then save the plan.');}
    checklistForecast(plan.planCsLitres,plan.planDirectLitres);setDraftRevision(await save('lots',lot.id,plan,reason,draftRevision));setMessage('Production plan saved.');setReason('');
  } catch(e) {setMessage((e as Error).message);} }
  return <section className="trace-card" aria-label="Production plan and Ingredient checklist">
    <div className="trace-title"><h2>Production plan</h2><Link to="/traceability">Traceability register →</Link></div>
    <p>Milk lot <strong>{lot.lotCode}</strong> identifies receiving. Set the start of production date separately. Production can continue over several days; board shifts remain numeric.</p>
    <div className="trace-fields">
      <label>Start of production date<input ref={dateInput} type="date" value={plan.productionDate} onChange={e=>setPlan({...plan,productionDate:e.target.value})}/></label>
      <label>C/S rounds (500 L each)<input type="number" min="0" step="1" value={plan.planCsLitres/500} onChange={e=>setPlan({...plan,planCsLitres:Number(e.target.value)*500})}/></label>
      <label>C/S milk volume (litres)<input type="number" min="0" step="0.01" value={plan.planCsLitres} onChange={e=>setPlan({...plan,planCsLitres:Number(e.target.value)})}/></label>
      <label>Direct rounds (500 L each)<input type="number" min="0" step="1" value={plan.planDirectLitres/500} onChange={e=>setPlan({...plan,planDirectLitres:Number(e.target.value)*500})}/></label>
      <label>Direct milk volume (litres)<input type="number" min="0" step="0.01" value={plan.planDirectLitres} onChange={e=>setPlan({...plan,planDirectLitres:Number(e.target.value)})}/></label>
    </div>
    <p><strong>{total.toLocaleString()} L planned for paneer</strong>{lot.receiptStatus==='planned'?' · Future milk / receipt pending; this plan does not record a receipt.':<> · {Math.max(0,lot.litresReceived-total).toLocaleString()} L not assigned in this plan{total>lot.litresReceived?' · Plan exceeds recorded receipt; review required.':''}</>}</p>
    <p className="trace-help">Enter either rounds or litres; the other field updates automatically. For example, 8 C/S rounds = 4,000 L. Requirements below use litres, not the number of rounds. For a different batch size, enter the actual milk volume.</p>
    <p className="trace-help">Requirements scale with milk volume. These are forecasts, not stock balances or proof of actual consumption. Other products are not included in this paneer plan.</p>
    {rows.length>0&&<div className="trace-table-scroll"><table><thead><tr><th>Ingredient</th><th>C/S</th><th>Direct</th><th>Total required</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{r.name}</td><td>{r.cs} {r.unit}</td><td>{r.direct} {r.unit}</td><td><strong>{r.total} {r.unit}</strong></td></tr>)}</tbody></table></div>}
    {saved&&<label>Reason for plan/date correction<input value={reason} onChange={e=>setReason(e.target.value)} placeholder="Required when changing a saved plan"/></label>}
    <div className="trace-buttons"><button onClick={persist}>Save production plan</button>{unsavedChanges&&saved&&<button onClick={()=>{setPlan(saved.value);setDraftRevision(planRevision(saved));setReason('');setMessage('Unsaved plan changes discarded.');}}>Undo unsaved changes</button>}</div>
    {message&&<p role="status">{message}</p>}
    {saved&&<details><summary>Plan audit · {saved.audit.length} entries</summary>{saved.audit.map(a=><p key={a.id}>{new Date(a.at).toLocaleString('en-GB')} · {a.actor} · {a.reason} · C/S {(a.after as LotTrace).planCsLitres} L + Direct {(a.after as LotTrace).planDirectLitres} L · Start {(a.after as LotTrace).productionDate}</p>)}</details>}
    <IngredientChecklist lotId={lot.id} lotCode={lot.lotCode} unsavedChanges={unsavedChanges} draftPlan={plan} onSavePlan={persist}/>
  </section>;
}
