import {liquidBrought,liquidGaps,liquidPrepared,liquidStatus,type LiquidIngredientReadiness} from './liquidIngredients';
import type {RecordEntry} from './domain';
export default function LiquidIngredientFields({value,onChange,requiredMl,revision,previous,owner}:{value:LiquidIngredientReadiness;onChange:(v:LiquidIngredientReadiness)=>void;requiredMl:number;revision:string;previous?:RecordEntry<LiquidIngredientReadiness>;owner:boolean}) {
 const update=(patch:Partial<LiquidIngredientReadiness>)=>onChange({...value,...patch});
 const amount=(text:string)=>text===''?null:Number(text),gaps=liquidGaps(value,requiredMl);
 const extra=value.floorBalanceMl===null?null:Math.max(0,Math.round((requiredMl-value.floorBalanceMl)*1e9)/1e9);
 return <div className="trace-ingredient" data-ingredient="rennet" data-ready={value.onSite&&gaps.length===0}>
  <strong>Rennet · Required {requiredMl} mL</strong><p className="trace-help">Use mL for rennet. Enter the measured bottle balance; no kg conversion is assumed.</p>
  <div className="trace-fields"><label>Rennet floor balance (mL)<input type="number" inputMode="decimal" min="0" step="any" value={value.floorBalanceMl??''} onChange={e=>update({floorBalanceMl:amount(e.target.value),onSite:false})}/></label><label>Rennet floor bottle batch/lot code(s)<input value={value.floorBatchCodes} onChange={e=>update({floorBatchCodes:e.target.value,onSite:false})}/></label></div>
  <p><strong>Minimum extra needed: {extra===null?'measure the floor balance first':`${extra} mL`}</strong></p>
  {value.containers.map((c,index)=><div key={c.id} className="trace-fields"><label>Rennet bottle {index+1} volume (mL)<input type="number" inputMode="decimal" min="0.001" step="any" value={c.volumeMl??''} onChange={e=>update({containers:value.containers.map(x=>x.id===c.id?{...x,volumeMl:amount(e.target.value)}:x),onSite:false})}/></label><label>Rennet bottle {index+1} batch/lot code<input value={c.batchCode} onChange={e=>update({containers:value.containers.map(x=>x.id===c.id?{...x,batchCode:e.target.value}:x),onSite:false})}/></label><button type="button" onClick={()=>update({containers:value.containers.filter(x=>x.id!==c.id),onSite:false})}>Remove bottle</button></div>)}
  <button type="button" onClick={()=>update({containers:[...value.containers,{id:crypto.randomUUID(),volumeMl:null,batchCode:''}],onSite:false})}>+ Bottle from storage</button>
  <p>Total brought: {liquidBrought(value)??'pending'} mL · Prepared total: {liquidPrepared(value)??'pending'} mL. Whole bottles may exceed the requirement.</p>
  <label><input type="checkbox" checked={value.onSite} onChange={e=>update({onSite:e.target.checked})}/> Rennet ready for production</label>
  {!!gaps.length&&<p className="trace-warning">{gaps.join(' ')}</p>}
  {owner&&<label>Rennet supplier · Owner/Admin<input value={value.supplier} onChange={e=>update({supplier:e.target.value})}/></label>}
  {previous&&<><p className="trace-help">Saved: {liquidStatus(previous.value,revision,requiredMl)} · {previous.value.checkedBy} · {new Date(previous.value.checkedAt).toLocaleString('en-GB',{timeZone:'Africa/Johannesburg'})} SAST</p><details><summary>Rennet checklist history · {previous.audit.length} records</summary>{previous.audit.map(a=>{const v=a.after as LiquidIngredientReadiness;return <p key={a.id}>{new Date(a.at).toLocaleString('en-GB',{timeZone:'Africa/Johannesburg'})} SAST · {a.actor} · {v.responsible}<br/>{v.requiredMl} mL required · Floor {v.floorBalanceMl??'pending'} mL · Prepared {liquidPrepared(v)??'pending'} mL · Floor batch {v.floorBatchCodes||'none'}{v.containers.map(c=><span key={c.id}><br/>{c.volumeMl??'pending'} mL · Batch {c.batchCode||'pending'}</span>)}</p>;})}</details></>}
 </div>;
}
