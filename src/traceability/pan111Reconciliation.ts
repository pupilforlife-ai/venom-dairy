import type { IntermediateLot, MilkLot, ProductionRound } from '../data/mockData';
import type { TraceState } from './domain';

const kg=(n:number)=>Math.round(n*1e9)/1e9;
export interface ScrambleSource {roundId:string;shift:number;round:number;kg:number|null}
export interface Pan111Reconciliation {
 id:string;lotId:string;lotCode:string;sources:ScrambleSource[];scrambleKg:number;measuredKg:number;differenceKg:number;
 missingRoundIds:string[];reason:string;recordedAt:string;recordedBy:string;requestKey:string;stockIds:string[];
}
export interface Pan111Request {id:string;lotId:string;expectedFingerprint:string;measuredKg:number;reason:string}
export function lotScrambleSummary(rounds:ProductionRound[],lotId:string,state:TraceState) {
 const sources=rounds.filter(r=>r.milkLotId===lotId&&['D','C/S'].includes(r.type)&&!['cancelled','spoiled'].includes(r.status))
  .filter(r=>r.blockWeights?.length||r.cutBy||r.paneerCuttingDetails||state.rounds[r.id]?.value.cutting.scrambleKg!=null)
  .map(r=>({roundId:r.id,shift:r.shiftNumber,round:r.roundNumber,kg:r.paneerCuttingDetails?.scrambleKg??state.rounds[r.id]?.value.cutting.scrambleKg??null}))
  .sort((a,b)=>a.shift-b.shift||a.round-b.round||a.roundId.localeCompare(b.roundId));
 if(sources.some(s=>s.kg!==null&&(!Number.isFinite(s.kg)||s.kg<0)))throw Error('A scramble weight is invalid. Review its source round.');
 return {sources,totalKg:kg(sources.reduce((n,s)=>n+(s.kg||0),0)),missingRoundIds:sources.filter(s=>s.kg===null).map(s=>s.roundId)};
}
function sourceStock(lot:MilkLot,stock:IntermediateLot[]) {
 return stock.filter(s=>s.productId==='pan111'&&s.sourceMilkLotCode===lot.lotCode);
}
export function pan111Fingerprint(rounds:ProductionRound[],lot:MilkLot,state:TraceState,stock:IntermediateLot[]) {
 return JSON.stringify({lotId:lot.id,lotCode:lot.lotCode,sources:lotScrambleSummary(rounds,lot.id,state).sources,stock:sourceStock(lot,stock)});
}
/** Cutting scramble and final PAN111 are two measurements of the same output, never two additions to stock. */
export function reconcilePan111(state:TraceState,stock:IntermediateLot[],request:Pan111Request,rounds:ProductionRound[],lots:MilkLot[],actor:string,role:string,at:string) {
 if(!['owner','admin'].includes(role.toLowerCase()))throw Error('Only Owner/Admin may confirm final PAN111.');
 if(!request.id||!actor.trim())throw Error('A save reference and recorder are required.');
 const requestKey=JSON.stringify(request),previous=state.pan111Reconciliations?.[request.lotId];
 if(previous){if(previous.id===request.id&&previous.requestKey===requestKey&&previous.recordedBy===actor)return {state,stock};throw Error('Final PAN111 has already been recorded for this milk lot. Review the saved reconciliation; do not add it twice.');}
 const lot=lots.find(l=>l.id===request.lotId);if(!lot)throw Error('Milk lot not found.');
 if(!Number.isFinite(request.measuredKg)||request.measuredKg<0)throw Error('Final PAN111 must be zero or positive, in kg.');
 if(pan111Fingerprint(rounds,lot,state,stock)!==request.expectedFingerprint)throw Error('Scramble or PAN111 stock changed. Reopen the form before confirming.');
 const summary=lotScrambleSummary(rounds,lot.id,state),measuredKg=kg(request.measuredKg),differenceKg=kg(measuredKg-summary.totalKg);
 if((Math.abs(differenceKg)>0.000000001||summary.missingRoundIds.length)&&request.reason.trim().length<5)throw Error('Enter a reason for the lot-level difference or missing round measurements.');
 const existing=sourceStock(lot,stock),existingKg=kg(existing.reduce((n,s)=>n+s.producedQuantity,0));
 if(existing.some(s=>!Number.isFinite(s.producedQuantity)||s.producedQuantity<0)||existingKg>measuredKg)throw Error(`Existing PAN111 recovery records total ${existingKg} kg. Owner must review those recoveries before confirming a lower final amount; they will not be overwritten.`);
 const additional=kg(measuredKg-existingKg),id='pan111-final-'+request.id;
 const added:IntermediateLot[]=[];
 if(additional>0){
  if(stock.some(s=>s.id===id))throw Error('This stock reference already exists. Review the saved recovery.');
  added.push({id,lotCode:`PAN111-${lot.lotCode}`,productId:'pan111',productName:'PAN111 (Recovered Paneer)',productClass:'intermediate',sourceBatchId:lot.id,sourceBatchCode:lot.lotCode,producedQuantity:additional,currentQuantity:additional,uom:'kg',storageLocation:'Chiller',status:'available',producedAt:at,sourceMilkLotCode:lot.lotCode,sourceShift:0,sourceRound:0,qualityClass:'standard',shelfLifeDays:730,useByDate:new Date(Date.parse(at)+730*86400000).toISOString(),priorityUse:false});
 }
 const entry:Pan111Reconciliation={id:request.id,lotId:lot.id,lotCode:lot.lotCode,sources:structuredClone(summary.sources),scrambleKg:summary.totalKg,measuredKg,differenceKg,missingRoundIds:summary.missingRoundIds,reason:request.reason.trim(),recordedAt:at,recordedBy:actor,requestKey,stockIds:[...existing,...added].map(s=>s.id)};
 return {state:{...state,pan111Reconciliations:{...state.pan111Reconciliations,[lot.id]:entry}},stock:added.length?[...stock,...added]:stock};
}
