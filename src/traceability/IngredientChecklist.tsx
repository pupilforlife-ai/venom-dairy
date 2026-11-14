import { useState } from 'react';
import { addNumberedBag, bagEntryGroups, bagGroupLabel, numberedBags, checklistForecast, planRevision, preparedQuantity, readinessStatus, readinessGaps, readinessProgress, storageBagTotal, storageTopUp, type IngredientReadiness, type LotTrace, type RecordEntry } from './domain';
import { useTraceability } from './useTraceability';
import { printForecast } from './print';
import CaseBagEntry from './CaseBagEntry';

type Requirement=ReturnType<typeof checklistForecast>[number];
type Checks=Record<string,RecordEntry<IngredientReadiness>>;
const weight=(text:string)=>text===''?null:Number(text);
function ChecklistForm({lotId,lotCode,plan,rows,revision,revisionNumber,checks,disabled,onSavePlan,onSaved}:{lotId:string;lotCode:string;plan:LotTrace;rows:Requirement[];revision:string;revisionNumber:number;checks:Checks;disabled:boolean;onSavePlan:()=>void;onSaved:(message:string)=>void}) {
  const {saveChecklist}=useTraceability();
  const [person,setPerson]=useState(()=>Object.values(checks).find(c=>c.value.responsible)?.value.responsible||'');
  const [drafts,setDrafts]=useState<Record<string,IngredientReadiness>>(()=>Object.fromEntries(rows.map(row=>{
    const current=checks[row.id]?.value;
    return [row.id,{planRevision:revision,requiredKg:row.total,availableKg:current?.availableKg??null,floorBalanceKg:current?.floorBalanceKg??null,floorBatchCodes:current?.floorBatchCodes,storageBags:current?.storageBags===undefined&&current?.broughtFromStorageKg?undefined:numberedBags(current?.storageBags||[]),nextBagNumber:current?.nextBagNumber,broughtFromStorageKg:current?.broughtFromStorageKg??null,supplier:current?.supplier||'',supplierProductCode:current?.supplierProductCode||'',supplierBatches:current?.supplierBatches||'',responsible:current?.responsible||'',onSite:current?.floorBalanceKg!=null&&current?.broughtFromStorageKg!=null&&current.planRevision===revision&&current.requiredKg===row.total?current.onSite:false,checkedBy:current?.checkedBy||'',checkedAt:current?.checkedAt||''}];
  })));
  const [message,setMessage]=useState('');
  const owner=['owner','admin'].includes(localStorage.getItem('vejoy_user_role')||'');
  const update=(id:string,patch:Partial<IngredientReadiness>)=>setDrafts(current=>({...current,[id]:{...current[id],...patch}}));
  const addSameBatchBag=(ingredientId:string,bagId:string)=>setDrafts(current=>{
    const ingredient=current[ingredientId],bag=ingredient.storageBags?.find(item=>item.id===bagId);
    if(!bag?.batchCode.trim())return current;
    return {...current,[ingredientId]:addNumberedBag(ingredient,bag.weightKg,bag.batchCode,crypto.randomUUID())};
  });
  const ready=rows.filter(row=>readinessStatus(checks[row.id]?.value,revision,row.total)==='Ready').length;
  const hasEdits=rows.some(row=>{const current=checks[row.id]?.value,draft=drafts[row.id];return !current||current.responsible!==person||['floorBalanceKg','floorBatchCodes','storageBags','nextBagNumber','broughtFromStorageKg','supplier','onSite'].some(key=>JSON.stringify(current[key as keyof IngredientReadiness])!==JSON.stringify(draft[key as keyof IngredientReadiness]));});
  function persist() {
    try {
      if(!person.trim())throw Error('Enter the person’s name at the top.');
      const progress=rows.map(row=>({row,...readinessProgress({...drafts[row.id],responsible:person.trim()},row.total)}));
      saveChecklist(lotId,progress.map(({row,value})=>({ingredientId:row.id,draft:value,expectedCheckId:checks[row.id]?.audit[checks[row.id].audit.length-1]?.id||''})),revision);
      const pending=progress.filter(p=>p.gaps.length);
      onSaved(pending.length?`Checklist progress saved. ${pending.map(p=>p.row.name+': '+p.gaps.join(' ')).join(' ')} These ingredients remain incomplete; the entered quantities and codes were kept.`:'Ingredient checklist saved.');
      setMessage('');
    }catch(e){setMessage((e as Error).message);}
  }
  return <section aria-label="Ingredient checklist"><h3>Ingredient checklist · {revision==='draft'?'draft':`${ready}/${rows.length} ready`}</h3>
    <label>Person’s name<input value={person} onChange={e=>setPerson(e.target.value)} placeholder="Who is pulling the ingredients?"/></label>
    <p className="trace-help">Weigh what is already on the factory floor. The checklist calculates the minimum extra needed. The leftover on the floor is Bag 0. New bags are numbered 1, 2, 3… for each ingredient and milk lot. Label and use the bags in that order; keep each batch/lot code. All weights are in kg. Tick each ingredient after bringing it out. Save at any time; missing details or short quantities are saved as incomplete, so your entries are kept.</p>
    {disabled&&<div className="trace-warning"><p>Save the production plan above before saving ingredient checks. The list stays visible while you prepare the plan.</p><button onClick={onSavePlan}>Save production plan</button></div>}
    {!rows.length&&<p>Enter C/S or Direct rounds above to calculate the ingredient list.</p>}
    <fieldset disabled={disabled}>
      {rows.map(row=>{const draft=drafts[row.id],previous=checks[row.id]?.value;const gaps=readinessGaps({...draft,responsible:person},row.total);let bring:number|null=null;try{bring=storageTopUp(row.total,draft.floorBalanceKg??null);}catch{}
        return <div key={row.id} className="trace-ingredient" data-ingredient={row.id} data-ready={draft.onSite&&gaps.length===0}><strong>{row.name} · Required {row.total} kg</strong>
          <div className="trace-fields">
            <label>{row.name} Bag 0 — floor balance (kg)<input type="number" min="0" step="any" value={draft.floorBalanceKg??''} onChange={e=>update(row.id,{floorBalanceKg:weight(e.target.value),onSite:false})}/></label>
            <label>{row.name} Bag 0 — batch/lot code(s)<input value={draft.floorBatchCodes||''} onChange={e=>update(row.id,{floorBatchCodes:e.target.value,onSite:false})} placeholder="Needed only when floor balance is above zero"/></label>
          </div>
          <p><strong>Minimum extra needed: {bring===null?'weigh floor balance first':`${bring} kg`}</strong>{bring!==null&&` = max(0, ${row.total} kg required − ${draft.floorBalanceKg} kg already on floor)`}</p>
          {draft.storageBags===undefined?<div><p>Earlier recorded transfer: <strong>{draft.broughtFromStorageKg} kg</strong> · Batch/lot codes: {draft.supplierBatches||'Not recorded'}. Individual bags were not recorded.</p><button onClick={()=>update(row.id,{storageBags:[],onSite:false})}>Re-record this transfer as individual bags</button></div>:<div>
            <h4>Bags brought from storage</h4>
            <CaseBagEntry ingredient={row.name} row={draft} onChange={value=>setDrafts(current=>({...current,[row.id]:value}))}/>
            {bagEntryGroups(draft.storageBags).map(group=>{const bag=group[0],index=draft.storageBags!.findIndex(b=>b.id===bag.id);return group.length>1?<div className="trace-case-group" key={bag.id}>
              <strong>{group.length} cases × {bag.weightKg} kg = {storageBagTotal(group)} kg</strong>
              <p>{bagGroupLabel(group)} · Batch/lot code: <strong>{bag.batchCode}</strong></p>
              <details><summary>View or correct individual cases</summary>{group.map(item=><div className="trace-fields" key={item.id}>
                <label>{row.name} case {item.number} weight (kg)<input type="number" min="0.001" step="any" value={item.weightKg??''} onChange={e=>update(row.id,{storageBags:draft.storageBags!.map(b=>b.id===item.id?{...b,weightKg:weight(e.target.value)}:b),onSite:false})}/></label>
                <label>{row.name} case {item.number} batch/lot code<input value={item.batchCode} onChange={e=>update(row.id,{storageBags:draft.storageBags!.map(b=>b.id===item.id?{...b,batchCode:e.target.value}:b),onSite:false})}/></label>
              </div>)}</details>
              <button onClick={()=>update(row.id,{storageBags:draft.storageBags!.filter(b=>!group.some(item=>item.id===b.id)),onSite:false})}>Remove these {group.length} cases</button>
            </div>:<div className="trace-fields" key={bag.id}>
              <label>{row.name} bag {bag.number??index+1} weight (kg)<input type="number" min="0.001" step="any" value={bag.weightKg??''} onChange={e=>update(row.id,{storageBags:draft.storageBags!.map(b=>b.id===bag.id?{...b,weightKg:weight(e.target.value)}:b),onSite:false})}/></label>
              <label>{row.name} bag {bag.number??index+1} batch/lot code<input value={bag.batchCode} onChange={e=>update(row.id,{storageBags:draft.storageBags!.map(b=>b.id===bag.id?{...b,batchCode:e.target.value}:b),onSite:false})}/></label>
              <button disabled={!bag.batchCode.trim()} title="Enter this bag’s batch/lot code first. The new bag’s weight can be edited." onClick={()=>addSameBatchBag(row.id,bag.id)}>Add another bag — same batch</button>
              <button onClick={()=>update(row.id,{storageBags:draft.storageBags!.filter(b=>b.id!==bag.id),onSite:false})}>Remove bag {bag.number??index+1}</button>
            </div>;})}
            <div className="trace-buttons">{[5,20,25,null].map(size=><button key={size??'custom'} onClick={()=>setDrafts(current=>({...current,[row.id]:addNumberedBag(current[row.id],size,'',crypto.randomUUID())}))}>{size===null?'+ Other size bag':`+ ${size} kg bag`}</button>)}</div>
            <p><strong>Total brought from storage: {storageBagTotal(draft.storageBags)===null?'Enter every bag weight':`${storageBagTotal(draft.storageBags)} kg`}</strong>. Whole bags may exceed the minimum needed; this is not recorded as consumption.</p>
          </div>}
          <label><input type="checkbox" checked={draft.onSite} onChange={e=>update(row.id,{onSite:e.target.checked})}/> {row.name} ready for production</label>
          {!!gaps.length&&<p className="trace-warning">{gaps.join(' ')}</p>}
          {previous&&<p className="trace-help">Saved: {readinessStatus(previous,revision,row.total)} · {previous.checkedBy} · {new Date(previous.checkedAt).toLocaleString('en-GB',{timeZone:'Africa/Johannesburg'})} SAST{previous.floorBalanceKg===undefined?' · Earlier available-total record retained; reweigh the floor balance for this checklist.':''}</p>}
        </div>;
      })}
      {owner&&<details><summary>Supplier details · Owner/Admin</summary><p className="trace-help">Staff record each bag’s batch/lot code above. Supplier names can be added here later without blocking preparation.</p>{rows.map(row=><label key={row.id}>{row.name} supplier<input value={drafts[row.id].supplier} onChange={e=>update(row.id,{supplier:e.target.value})}/></label>)}</details>}
      <div className="trace-buttons"><button className="trace-primary" disabled={!rows.length} onClick={persist}>Save Ingredient checklist</button></div>
    </fieldset>
    {message&&<p role="alert" className="trace-warning">{message}</p>}
    {hasEdits&&revision!=='draft'&&<p className="trace-help">Save checklist changes before printing.</p>}
    <div className="trace-buttons"><button disabled={disabled||!rows.length||hasEdits} onClick={()=>printForecast(lotCode,plan,{revision,revisionNumber,checks})}>Print / download Ingredient checklist</button></div>
    <details><summary>Checklist history</summary>{Object.entries(checks).map(([id,entry])=><details key={id}><summary>{id.replace(/_/g,' ')} · {entry.audit.length} records</summary>{entry.audit.map(a=>{const v=a.after as IngredientReadiness;return <p key={a.id}>{new Date(a.at).toLocaleString('en-GB',{timeZone:'Africa/Johannesburg'})} SAST · {a.actor} · {v.responsible}<br/>{v.requiredKg} kg required · Floor: {v.floorBalanceKg??'Not recorded'} kg · Brought from storage: {v.broughtFromStorageKg??'Not recorded'} kg · Prepared total: {preparedQuantity(v)??'Not recorded'} kg · Batch {v.supplierBatches||'Missing'}{bagEntryGroups(numberedBags(v.storageBags||[])).map(group=><span key={group[0].id}><br/>{bagGroupLabel(group)}: {group.length>1?`${group.length} × ${group[0].weightKg} kg = `:''}{storageBagTotal(group)??'Not recorded'} kg · {group[0].batchCode||'Batch missing'}</span>)} · Supplier {v.supplier||'Pending'}</p>;})}</details>)}</details>
  </section>;
}
export default function IngredientChecklist({lotId,lotCode,unsavedChanges,draftPlan,onSavePlan}:{lotId:string;lotCode:string;unsavedChanges:boolean;draftPlan:LotTrace;onSavePlan:()=>void}) {
  const {state}=useTraceability(),plan=state.lots[lotId],checks=state.readiness?.[lotId]||{};
  const [savedMessage,setSavedMessage]=useState<{lotId:string;text:string}>();
  const source=plan?.value||draftPlan,revision=planRevision(plan)||'draft';
  let rows:Requirement[]=[];try{rows=checklistForecast(source.planCsLitres,source.planDirectLitres);}catch{}
  const key=revision+JSON.stringify(Object.fromEntries(Object.entries(checks).map(([id,c])=>[id,c.audit[c.audit.length-1]?.id])))+(!plan?JSON.stringify(draftPlan):'');
  return <><ChecklistForm key={key} lotId={lotId} lotCode={lotCode} plan={source} rows={rows} revision={revision} revisionNumber={plan?.audit.length||0} checks={checks} disabled={!plan||unsavedChanges} onSavePlan={onSavePlan} onSaved={text=>setSavedMessage({lotId,text})}/>{savedMessage?.lotId===lotId&&<p role="status">{savedMessage.text}</p>}</>;
}
