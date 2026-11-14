import type { ProductionRound } from '../data/mockData';
import { latestPaneerIngredientIssue, type PaneerRecipeLine } from '../lib/paneerRecipe';
import { agreedPrefixes, numberedBags, safeCode, type TraceState } from './domain';

const last=<T>(items:T[])=>items[items.length-1];
const rounded=(n:number)=>Math.round(n*1e9)/1e9;
const codes=(text:string)=>[...new Set(text.split(/[,;\n]+/).map(x=>x.trim()).filter(Boolean))];
export interface PaneerBagSource { number:number; id:string; weightKg:number|null; batchCodes:string[]; checkId:string }
export interface PaneerBagCursor { bagNumber:number; remainingKg:number|null; acknowledgedIssueIds?:string[] }
export interface PaneerBagAllocation { source:PaneerBagSource; expectedKg:number|null }
export interface PaneerAutoIngredient extends PaneerRecipeLine {
  allocations:PaneerBagAllocation[]; cursorAfter?:PaneerBagCursor; warnings:string[];
}
export interface AutomaticPaneerTrace {
  version:1; sequence:number; recordedAt:string; recordedBy:string; productionDate:string; code:string; recipeIssueId:string;
  milkLitres:number; paneerType:'D'|'C/S'; ingredients:PaneerAutoIngredient[];
}
export interface PaneerBagCorrection {
  id:string; sequence:number; ingredientId:string; source:PaneerBagSource; previousSource?:PaneerBagSource;
  remainingKg:number|null; acknowledgedIssueIds?:string[]; warnings?:string[]; duringRound:boolean; recordedAt:string; recordedBy:string; reason:string;
}
export interface BagCorrectionRequest { id:string;roundId:string;ingredientId:string;bagNumber:number;previousBagNumber?:number;remainingKg:number|null;duringRound:boolean;reason:string;expectedSequence?:number;expectedCheckId?:string }
export function paneerBagQueue(state:TraceState,lotId:string,ingredientId:string):PaneerBagSource[] {
  const entry=state.readiness?.[lotId]?.[ingredientId];if(!entry)return [];
  const row=entry.value,checkId=entry.audit[entry.audit.length-1]?.id||'';
  const floor:PaneerBagSource={number:0,id:'floor',weightKg:row.floorBalanceKg??null,batchCodes:codes(row.floorBatchCodes||''),checkId};
  const bags=numberedBags(row.storageBags||[]).map(b=>({number:b.number!,id:b.id,weightKg:b.weightKg,batchCodes:codes(b.batchCode),checkId}));
  return [floor,...bags.sort((a,b)=>a.number-b.number)];
}
function nextSequence(rounds:ProductionRound[],lotId:string) {
  return Math.max(0,...rounds.filter(r=>r.milkLotId===lotId).flatMap(r=>[r.paneerAutomaticTrace?.sequence||0,...(r.paneerBagCorrections||[]).map(c=>c.sequence)]))+1;
}
export function paneerBagSequence(rounds:ProductionRound[],lotId:string) {return nextSequence(rounds,lotId)-1;}
function changedIssues(rounds:ProductionRound[],lotId:string) {return rounds.filter(r=>r.milkLotId===lotId&&r.paneerAutomaticTrace&&latestPaneerIngredientIssue(r)?.id!==r.paneerAutomaticTrace.recipeIssueId).map(r=>latestPaneerIngredientIssue(r)?.id||'missing-issue');}
function latestCursor(rounds:ProductionRound[],lotId:string,ingredientId:string) {
  const events:{at:string;sequence:number;order:number;cursor:PaneerBagCursor;issueId?:string}[]=[];let order=0;
  for(const round of rounds) {
    if(round.milkLotId!==lotId)continue;
    const trace=round.paneerAutomaticTrace,line=trace?.ingredients.find(x=>x.id===ingredientId);
    if(trace&&line?.cursorAfter)events.push({at:trace.recordedAt,sequence:trace.sequence,order:order++,cursor:line.cursorAfter,issueId:trace.recipeIssueId});
    for(const change of round.paneerBagCorrections||[])if(change.ingredientId===ingredientId)events.push({at:change.recordedAt,sequence:change.sequence,order:order++,cursor:{bagNumber:change.source.number,remainingKg:change.remainingKg,acknowledgedIssueIds:change.acknowledgedIssueIds}});
  }
  const event=last(events.sort((a,b)=>a.sequence-b.sequence||a.order-b.order));
  // A later milk/type correction changes standard use, but cannot establish
  // which physical bag supplied it. Keep production open and request a reweigh.
  const amendment=event&&changedIssues(rounds,lotId).some(id=>!event.cursor.acknowledgedIssueIds?.includes(id));
  return event?{...event.cursor,remainingKg:amendment?null:event.cursor.remainingKg}:rounds.some(r=>r.milkLotId===lotId&&r.paneerAutomaticTrace?.ingredients.some(i=>i.id===ingredientId))||changedIssues(rounds,lotId).length?{bagNumber:0,remainingKg:null}:undefined;
}
export function allocatePaneerIngredient(line:PaneerRecipeLine,queue:PaneerBagSource[],cursor?:PaneerBagCursor):PaneerAutoIngredient {
  const result:PaneerAutoIngredient={...line,allocations:[],warnings:[]};
  let need=rounded(line.quantity*(line.unit==='g'?0.001:1));
  let index=cursor?queue.findIndex(b=>b.number===cursor.bagNumber):0;
  if(index<0||!queue.length){result.warnings.push('Numbered bag details missing; production was not blocked.');return result;}
  let balance=cursor?cursor.remainingKg:queue[index].weightKg;
  while(need>1e-9) {
    const source=queue[index];
    if(!source){result.warnings.push('More numbered bags are needed to identify this ingredient source.');result.cursorAfter={bagNumber:(last(queue)?.number||0)+1,remainingKg:null};break;}
    if(!source.batchCodes.length&&balance!==0)result.warnings.push(`Bag ${source.number} batch code missing.`);
    if(balance===null){result.allocations.push({source,expectedKg:null});result.cursorAfter={bagNumber:source.number,remainingKg:null};result.warnings.push(`Bag ${source.number} remaining weight unknown; confirm it to resume automatic bag changes.`);break;}
    if(balance<0||!Number.isFinite(balance)){result.warnings.push('Recorded bag weight is invalid; confirm the weighed remaining amount.');result.cursorAfter={bagNumber:source.number,remainingKg:null};break;}
    if(balance<=1e-9){index++;balance=queue[index]?.weightKg??null;continue;}
    const used=Math.min(need,balance);result.allocations.push({source,expectedKg:rounded(used)});
    need=rounded(need-used);balance=rounded(balance-used);result.cursorAfter={bagNumber:source.number,remainingKg:balance};
    if(need>1e-9){index++;balance=queue[index]?.weightKg??null;}
  }
  if(result.cursorAfter&&cursor?.acknowledgedIssueIds)result.cursorAfter.acknowledgedIssueIds=cursor.acknowledgedIssueIds;
  return result;
}
export function captureAutomaticPaneer(round:ProductionRound,rounds:ProductionRound[],state:TraceState,actor:string,at:string):ProductionRound {
  if(round.paneerAutomaticTrace||!['D','C/S'].includes(round.type)||round.status!=='in_production'||!round.vat)return round;
  const issue=latestPaneerIngredientIssue(round);if(!issue)return round;
  const productionDate=round.traceabilityProductionDate||state.lots[round.milkLotId]?.value.productionDate||'';
  const code=safeCode(state.prefixes[round.type]?.value||agreedPrefixes[round.type],productionDate,round.shiftNumber,round.roundNumber);
  const ingredients=issue.lines.map(line=>allocatePaneerIngredient(line,paneerBagQueue(state,round.milkLotId,line.id),latestCursor(rounds,round.milkLotId,line.id)));
  const trace:AutomaticPaneerTrace={version:1,sequence:nextSequence(rounds,round.milkLotId),recordedAt:at,recordedBy:actor,productionDate,code:code.code,recipeIssueId:issue.id,milkLitres:issue.milkLitres,paneerType:issue.paneerType,ingredients};
  return {...round,traceabilityProductionDate:productionDate||undefined,paneerAutomaticTrace:trace,historyEvents:[...(round.historyEvents||[]),{id:`paneer-trace-${issue.id}`,type:'paneer_traceability_captured',stage:'Paneer Traceability Captured',occurredAt:at,recordedBy:actor,source:'workflow',details:`Automatic recipe-based bag estimate · ${code.code||'Code pending'} · ${ingredients.map(i=>`${i.name}: ${i.allocations.map(a=>'Bag '+a.source.number+' '+a.source.batchCodes.join('/')).join(' → ')||'source pending'}`).join(' · ')}`}]};
}
export function currentPaneerBags(rounds:ProductionRound[],state:TraceState,lotId:string,ingredientId:string) {
  const queue=paneerBagQueue(state,lotId,ingredientId),cursor=latestCursor(rounds,lotId,ingredientId);
  let source=cursor?queue.find(b=>b.number===cursor.bagNumber):queue[0],remaining=cursor?cursor.remainingKg:source?.weightKg;
  if(remaining===0){source=queue.find(b=>b.number>(source?.number??-1));remaining=source?.weightKg;}
  return {queue,source,remainingKg:remaining??null};
}
export function correctPaneerBag(rounds:ProductionRound[],state:TraceState,request:BagCorrectionRequest,actor:string,at:string):ProductionRound[] {
  const duplicate=rounds.flatMap(r=>(r.paneerBagCorrections||[]).map(event=>({roundId:r.id,event}))).find(e=>e.event.id===request.id);
  if(duplicate){const e=duplicate.event;if(duplicate.roundId!==request.roundId||e.ingredientId!==request.ingredientId||e.source.number!==request.bagNumber||e.previousSource?.number!==(request.duringRound?request.previousBagNumber:undefined)||e.remainingKg!==request.remainingKg||e.duringRound!==request.duringRound||e.reason!==request.reason.trim()||e.recordedBy!==actor)throw Error('This correction reference was already used for a different change.');return rounds;}
  const round=rounds.find(r=>r.id===request.roundId);
  if(!round?.paneerAutomaticTrace)throw Error('Select a round recorded with automatic paneer traceability.');
  if(request.expectedSequence!==undefined&&paneerBagSequence(rounds,round.milkLotId)!==request.expectedSequence)throw Error('Production or another bag correction has progressed. Reopen this form and check the weighed balance again.');
  if(!request.reason.trim())throw Error('Enter a reason for correcting the physical bag.');
  const queue=paneerBagQueue(state,round.milkLotId,request.ingredientId),source=queue.find(b=>b.number===request.bagNumber);
  if(!source||!source.batchCodes.length)throw Error('Record the bag and its batch code in the Ingredient checklist first.');
  if(request.expectedCheckId!==undefined&&source.checkId!==request.expectedCheckId)throw Error('This bag’s preparation details changed. Reopen the form and confirm the bag code.');
  if(!round.paneerAutomaticTrace.ingredients.some(line=>line.id===request.ingredientId))throw Error('This ingredient is not part of the selected round’s recipe.');
  if(request.remainingKg!==null&&(!Number.isFinite(request.remainingKg)||request.remainingKg<0))throw Error('Enter a valid zero or positive remaining weight.');
  const previousSource=request.duringRound?queue.find(b=>b.number===request.previousBagNumber):undefined;
  if(request.duringRound&&(!previousSource||!previousSource.batchCodes.length))throw Error('Choose the previous bag used during this round.');
  const event:PaneerBagCorrection={id:request.id,sequence:nextSequence(rounds,round.milkLotId),acknowledgedIssueIds:request.remainingKg===null?undefined:changedIssues(rounds,round.milkLotId),warnings:request.remainingKg!==null&&source.weightKg!==null&&request.remainingKg>source.weightKg?['Weighed remaining amount exceeds the checklist bag weight; owner review required.']:[],ingredientId:request.ingredientId,source:structuredClone(source),previousSource:previousSource?structuredClone(previousSource):undefined,remainingKg:request.remainingKg,duringRound:request.duringRound,recordedAt:at,recordedBy:actor,reason:request.reason.trim()};
  return rounds.map(r=>r.id!==round.id?r:{...r,paneerBagCorrections:[...(r.paneerBagCorrections||[]),event],historyEvents:[...(r.historyEvents||[]),{id:request.id,type:'paneer_bag_corrected',stage:'Ingredient Bag Corrected',occurredAt:at,recordedBy:actor,source:'workflow',details:`${request.ingredientId}: Bag ${request.bagNumber} · ${source.batchCodes.join(', ')} · ${request.remainingKg===null?'remaining weight unknown':request.remainingKg+' kg remaining'} · ${event.reason}`}]});
}
export function roundIngredientSources(round:ProductionRound,ingredientId:string):PaneerBagSource[] {
  const reported=(round.paneerBagCorrections||[]).filter(c=>c.ingredientId===ingredientId&&c.duringRound);
  if(reported.length)return reported.flatMap(c=>[...(c.previousSource?[c.previousSource]:[]),c.source]).filter((b,i,all)=>all.findIndex(x=>x.number===b.number&&x.batchCodes.join('|')===b.batchCodes.join('|'))===i);
  return round.paneerAutomaticTrace?.ingredients.find(i=>i.id===ingredientId)?.allocations.map(a=>a.source)||[];
}
