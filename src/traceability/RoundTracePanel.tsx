import { useState } from 'react';
import type { MilkLot, ProductionRound } from '../data/mockData';
import { milkStorageVessels } from '../data/mockData';
import { Modal } from '../components/Modal';
import { useTraceability } from './useTraceability';
import { agreedPrefixes, consumedTotals, emptyRoundTrace, ingredientTemplate, roundGaps, safeCode, type RoundTrace } from './domain';
import { getPaneerRecipe } from '../lib/paneerRecipe';
import { applyPreparedSource, fillUnambiguousPreparedSources, preparedIngredientSources } from './preparedIngredients';
function optionalNumber(text:string) {return text===''?null:Number(text);}
export default function RoundTracePanel({round,lot}: {round:ProductionRound;lot?:MilkLot}) {
  const {state,save}=useTraceability(),saved=state.rounds[round.id];
  const date=saved?.value.productionDate||round.traceabilityProductionDate||state.lots[round.milkLotId]?.value.productionDate||lot?.traceabilityProductionDate||'';
  const type=round.type==='C/S'?'C/S':'D',milk=round.actualInput>0?round.actualInput:round.plannedInput;
  const code=safeCode(state.prefixes[round.type]?.value||agreedPrefixes[round.type],date,round.shiftNumber,round.roundNumber);
  const value=saved?.value||emptyRoundTrace(date),gaps=roundGaps(value,milk,type);
  const [open,setOpen]=useState(false),[draft,setDraft]=useState<RoundTrace>(value),[reason,setReason]=useState(''),[message,setMessage]=useState('');
  const [editingRevision,setEditingRevision]=useState('');
  const owner=['owner','admin'].includes(localStorage.getItem('vejoy_user_role')||'');
  const expected=getPaneerRecipe(type,milk).lines;
  function edit() {
    const next=structuredClone(value);next.productionDate=date;
    if(!next.ingredients.length) next.ingredients=ingredientTemplate(type,milk);
    setDraft(next);setEditingRevision(saved?.audit[saved.audit.length-1]?.id||'');setReason('');setMessage('');setOpen(true);
  }
  function persist() {try {
    consumedTotals(draft.ingredients);
    if(draft.vessels.some(v=>!v.vessel||!Number.isFinite(v.litres)||v.litres<0)) throw Error('Enter a vessel and non-negative litres for each draw.');
    if(Object.entries(draft.cutting).some(([k,v])=>typeof v==='number'&&(!Number.isFinite(v)||v<0||(['trays','samplePieces'].includes(k)&&!Number.isInteger(v))))) throw Error('Enter valid cutting quantities; counts must be whole numbers.');
    save('rounds',round.id,draft,reason,editingRevision);setOpen(false);
  }catch(e){setMessage((e as Error).message);} }
  let totalKg:ReturnType<typeof consumedTotals>={};try{totalKg=consumedTotals(draft.ingredients);}catch{}
  const gross=round.blockWeights?.reduce((n,w)=>n+w,0)||round.outputWeight;
  return <div className="trace-round"><button type="button" onClick={edit}>Batch traceability · {code.code||'Code pending'} · {gaps.length} detail gaps</button>
    <Modal isOpen={open} onClose={()=>setOpen(false)} title={`Traceability · Shift ${round.shiftNumber} / Round ${round.roundNumber}`} size="lg">
      <div className="trace-form"><p><strong>{code.code||code.gap}</strong> · Milk lot {round.milkLotCode}. Gaps do not block production or packing.</p>
      <label>Start of production date<input type="date" value={draft.productionDate} onChange={e=>setDraft({...draft,productionDate:e.target.value})}/></label>
      <h4>Actual milk source · {milk} L round input</h4><p className="trace-help">Record actual draws; suggested vessel balance is not evidence of the source used.</p>
      {draft.vessels.map((v,i)=><div className="trace-fields" key={i}><label>Source vessel<select value={v.vessel} onChange={e=>setDraft({...draft,vessels:draft.vessels.map((x,j)=>j===i?{...x,vessel:e.target.value}:x)})}><option value="">Select vessel</option>{milkStorageVessels.map(x=><option key={x.id} value={x.id}>{x.label}</option>)}</select></label><label>Milk drawn (L)<input type="number" min="0" value={v.litres} onChange={e=>setDraft({...draft,vessels:draft.vessels.map((x,j)=>j===i?{...x,litres:Number(e.target.value)}:x)})}/></label><button onClick={()=>setDraft({...draft,vessels:draft.vessels.filter((_,j)=>j!==i)})}>Remove draw</button></div>)}
      <button onClick={()=>setDraft({...draft,vessels:[...draft.vessels,{vessel:'',litres:milk-draft.vessels.reduce((n,v)=>n+v.litres,0)>0?milk-draft.vessels.reduce((n,v)=>n+v.litres,0):0}]})}>Add vessel draw</button>
      <h4>Actual ingredients consumed</h4><p className="trace-help">Leave unknown amounts blank. Zero means a recorded zero. Multiple supplier batches may contribute; no ingredient stock is deducted.</p>
      <div className="trace-buttons"><button onClick={()=>{setDraft({...draft,ingredients:fillUnambiguousPreparedSources(draft.ingredients,state,round.milkLotId)});setMessage('Only blank references with one ready batch were filled. Actual quantities were left unchanged. Select batches individually where several are listed.');}}>Use prepared codes where there is one ready batch</button></div>
      <p className="trace-help">Prepared codes come only from this milk lot’s Ingredient checklist. They identify a possible source; confirm what was actually used. Missing checklist details do not block recording.</p>
      {draft.ingredients.map((use,i)=>{const sources=preparedIngredientSources(state,round.milkLotId,use.ingredientId);return <fieldset key={use.id} className="trace-ingredient"><legend>{use.name}</legend>
      <label>Choose prepared {use.name} batch<select value="" onChange={e=>{if(e.target.value==='')return;const source=sources[Number(e.target.value)];if(source)setDraft({...draft,ingredients:draft.ingredients.map((x,j)=>i===j?applyPreparedSource(x,source):x)});}}><option value="">{sources.length?'Select the batch actually used':'No prepared batch recorded — enter details below'}</option>{sources.map((source,index)=><option key={`${source.checkId}:${source.batchCode}`} value={index}>{source.batchCode} · {source.status}</option>)}</select></label>
      {use.preparation&&<p className="trace-help">Linked to a saved preparation check for batch {use.preparation.batchCode}. Later checklist edits do not replace this recorded source.</p>}
      <div className="trace-fields">
        <label>Actual quantity ({use.unit})<input type="number" min="0" step="0.001" value={use.quantity??''} onChange={e=>setDraft({...draft,ingredients:draft.ingredients.map((x,j)=>i===j?{...x,quantity:optionalNumber(e.target.value)}:x)})}/></label>
        {owner&&<label>Supplier · Owner/Admin<input value={use.supplier} onChange={e=>setDraft({...draft,ingredients:draft.ingredients.map((x,j)=>i===j?{...x,supplier:e.target.value,preparation:undefined}:x)})}/></label>}
        <label>Product code<input value={use.supplierProductCode} onChange={e=>setDraft({...draft,ingredients:draft.ingredients.map((x,j)=>i===j?{...x,supplierProductCode:e.target.value,preparation:undefined}:x)})}/></label>
        <label>Actual batch/lot code<input value={use.supplierBatch} onChange={e=>setDraft({...draft,ingredients:draft.ingredients.map((x,j)=>i===j?{...x,supplierBatch:e.target.value,preparation:undefined}:x)})}/></label>
      </div><p className="trace-help">Standard total: {expected.find(x=>x.id===use.ingredientId)?.quantity} {use.unit} · Recorded total: {use.ingredientId in totalKg ? ((totalKg[use.ingredientId]||0)*(use.unit==='g'?1000:1)).toFixed(3)+' '+use.unit : 'Not recorded'}</p>
      <button onClick={()=>setDraft({...draft,ingredients:draft.ingredients.filter((_,j)=>i!==j)})}>Remove line</button></fieldset>;})}
      <label>Add another supplier batch<select value="" onChange={e=>{const item=ingredientTemplate(type,milk).find(x=>x.ingredientId===e.target.value);if(item)setDraft({...draft,ingredients:[...draft.ingredients,{...item,id:crypto.randomUUID()}]});}}><option value="">Select ingredient</option>{expected.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
      <h4>Cutting, scramble and retention sample</h4><div className="trace-fields">
      {(['clothKg','trays','scrambleKg','samplePieces'] as const).map(key=><label key={key}>{{clothKg:'Cloth weight (kg), 0 = no cloth',trays:'Cut trays',scrambleKg:'Scramble weighed (kg)',samplePieces:'Retention sample pieces'}[key]}<input type="number" min="0" step={key==='trays'||key==='samplePieces'?'1':'0.001'} value={draft.cutting[key]??''} onChange={e=>setDraft({...draft,cutting:{...draft.cutting,[key]:optionalNumber(e.target.value)}})}/></label>)}
      <label>Scramble storage reference<input value={draft.cutting.scrambleLocation} onChange={e=>setDraft({...draft,cutting:{...draft.cutting,scrambleLocation:e.target.value}})}/></label>
      <label>Retention sample storage reference<input value={draft.cutting.sampleLocation} onChange={e=>setDraft({...draft,cutting:{...draft.cutting,sampleLocation:e.target.value}})}/></label></div>
      <p>Recorded block weight: {gross.toFixed(3)} kg · Net after cloth: {draft.cutting.clothKg===null?'Cloth not recorded':(gross-draft.cutting.clothKg).toFixed(3)+' kg'}. This trace worksheet does not silently change the board's recorded balance.</p>
      <label>Notes / missing details<textarea value={draft.note} onChange={e=>setDraft({...draft,note:e.target.value})}/></label>
      {saved&&<label>Correction reason (owner/admin)<input value={reason} onChange={e=>setReason(e.target.value)}/></label>}
      <div className="trace-buttons"><button onClick={persist}>Save traceability details</button><button onClick={()=>setOpen(false)}>Cancel</button></div>{message&&<p role="alert">{message}</p>}
      {saved&&<details><summary>Audit history · {saved.audit.length} entries</summary>{saved.audit.map(a=><details key={a.id}><summary>{new Date(a.at).toLocaleString('en-GB')} · {a.actor} · {a.reason}</summary><pre>{JSON.stringify({before:a.before,after:a.after},null,2)}</pre></details>)}</details>}
      </div>
    </Modal>
  </div>;
}
