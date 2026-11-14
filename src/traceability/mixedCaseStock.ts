import type { FinishedStockLot,MilkLot,ProductionRound } from '../data/mockData';
import { paneerSkuByCode } from '../data/skuConfig';
import { getLegacyPackingRunId,getProductionSourceBatchCode,reconcileFinishedStock,type ReconciledFinishedStockLine } from '../lib/finishedStock';
import { loosePacketSources,recordMixedPaneerCase,voidMixedPaneerCase,type MixedCaseRequest,type MixedPaneerCase,type LoosePacketSource } from './mixedPaneerCases';
import type { TraceState } from './domain';
export interface TraceStockEvent {id:string;kind:'assembly'|'disassembly'|'return'|'correction';at:string;by:string;reason:string;caseId:string;before:FinishedStockLot[];after:FinishedStockLot[];requestFingerprint?:string}
const onSite=(line:FinishedStockLot)=>['awaiting_handover','returned'].includes(line.status);
/** Cancelled assemblies still refer to the original source and its stock movements. */
export function hasMixedCaseSourceHistory(state:TraceState,sourceKey:string) {
 return Object.values(state.mixedCases||{}).some(c=>c.parts.some(p=>p.source.key===sourceKey));
}
export function stockForLooseSource(source:LoosePacketSource,lines:ReconciledFinishedStockLine[]) {
 const run=source.packingRunId||getLegacyPackingRunId(source.roundId,source.packIndex);
 return lines.filter(l=>!l.mixedCaseId&&l.sku===source.sku&&(l.sourceRoundId===source.roundId&&l.sourcePackIndex===source.packIndex||l.packingRunId===run||l.packingRunId.startsWith(run+'-')));
}
export function onSiteLooseBySource(rounds:ProductionRound[],lots:MilkLot[],state:TraceState,stock:FinishedStockLot[]) {
 const lines=reconcileFinishedStock(rounds,stock);
 return new Map(loosePacketSources(rounds,lots,state).map(s=>[s.key,stockForLooseSource(s,lines).filter(onSite).reduce((n,l)=>n+l.loosePackets,0)]));
}
function materialize(state:TraceState,stock:FinishedStockLot[],entry:MixedPaneerCase,rounds:ProductionRound[],lots:MilkLot[],actor:string,at:string) {
 if(entry.voided)throw Error('A cancelled case cannot be linked to stock.');
 if(entry.stockLink){if(!stock.some(s=>s.mixedCaseId===entry.id))throw Error('The linked case stock record is missing. Owner review required.');return {state,stock};}
 let nextStock=[...stock];const allocations:{sourceKey:string;stockId:string;packets:number}[]=[],before:FinishedStockLot[]=[],after:FinishedStockLot[]=[];
 const sources=loosePacketSources(rounds,lots,state);
 for(const part of entry.parts){
  const current=sources.find(s=>s.key===part.source.key);if(!current||current.fingerprint!==part.source.fingerprint||current.usedLoose>current.recordedLoose)throw Error('A case source changed. Review its original packing entry before linking stock.');
  const lines=stockForLooseSource(current,reconcileFinishedStock(rounds,nextStock)).filter(onSite).sort((a,b)=>a.createdAt.localeCompare(b.createdAt));let left=part.packets;
  for(const line of lines){const take=Math.min(left,line.loosePackets);if(take<=0)continue;
   const updated={...line,loosePackets:line.loosePackets-take,totalPackets:line.totalPackets-take};
   before.push(structuredClone(line));after.push(structuredClone(updated));allocations.push({sourceKey:current.key,stockId:line.id,packets:take});
   nextStock=nextStock.some(s=>s.id===line.id)?nextStock.map(s=>s.id===line.id?updated:s):[...nextStock,updated];left-=take;
  }
  if(left)throw Error(`Lot ${part.source.lotCode} S${part.source.shift}/R${part.source.round}: ${left} required loose packets are not on site. Already transferred stock cannot be assembled again.`);
 }
 const id=`mixed-stock-${entry.id}`;if(nextStock.some(s=>s.id===id||s.mixedCaseId===entry.id))throw Error('Case stock already exists without its allocation link. Owner review required.');
 const sourcesCodes=[...new Set(entry.parts.map(p=>getProductionSourceBatchCode(rounds.find(r=>r.id===p.source.roundId)!)))];
 const line:FinishedStockLot={id,sku:entry.sku,productName:paneerSkuByCode[entry.sku].productName,packingRunId:`mixed-case-${entry.id}`,cases:entry.caseCount,loosePackets:0,totalPackets:entry.caseCount*entry.packetsPerCase,storageLocation:'Dairy Container (Finished Stock)',status:'awaiting_handover',createdAt:at,sourceBatchCodes:sourcesCodes,finishedGoodsBatchCode:entry.caseBatchCode,caseBatchCode:entry.caseBatchCode,traceabilityProductionDate:entry.productionDate,mixedCaseId:entry.id,mixedCaseCount:entry.caseCount,mixedCaseParts:structuredClone(entry.parts)};
 nextStock.push(line);after.push(structuredClone(line));
 const linked={...entry,stockLink:{at,by:actor,stockId:id,allocations}};
 const event:TraceStockEvent={id:'assemble-'+entry.id,kind:'assembly',at,by:actor,reason:'Existing loose packets physically assembled into cases',caseId:entry.id,before,after};
 return {state:{...state,mixedCases:{...state.mixedCases,[entry.id]:linked},stockEvents:{...state.stockEvents,[event.id]:event}},stock:nextStock};
}
export function assembleMixedCaseStock(state:TraceState,stock:FinishedStockLot[],request:MixedCaseRequest,rounds:ProductionRound[],lots:MilkLot[],actor:string,at:string) {
 const next=recordMixedPaneerCase(state,request,rounds,lots,actor,at);return materialize(next,stock,next.mixedCases![request.id],rounds,lots,actor,at);
}
export function linkExistingMixedCaseStock(state:TraceState,stock:FinishedStockLot[],id:string,rounds:ProductionRound[],lots:MilkLot[],actor:string,role:string,at:string) {
 if(!['owner','admin'].includes(role))throw Error('Owner/Admin must review an earlier assembly before linking its stock.');
 const entry=state.mixedCases?.[id];if(!entry)throw Error('Case not found.');return materialize(state,stock,entry,rounds,lots,actor,at);
}
export function cancelMixedCaseStock(state:TraceState,stock:FinishedStockLot[],id:string,reason:string,actor:string,role:string,at:string) {
 const entry=state.mixedCases?.[id];if(!entry)throw Error('Case not found.');if(entry.voided)return {state,stock};
 const next=voidMixedPaneerCase(state,id,reason,actor,role,at);if(!entry.stockLink)return {state:next,stock};
 const caseLines=stock.filter(s=>s.mixedCaseId===id),total=caseLines.reduce((n,s)=>n+s.totalPackets,0);
 if(caseLines.some(s=>s.totalPackets>0&&!onSite(s))||total!==entry.caseCount*entry.packetsPerCase)throw Error('Return all case stock to production before cancelling this assembly. Transferred or discrepancy stock cannot be released as loose again.');
 const before=structuredClone(caseLines),after:FinishedStockLot[]=[];
 let nextStock=stock.map(s=>s.mixedCaseId===id?{...s,cases:0,loosePackets:0,totalPackets:0,status:'incorrectly_recorded' as const,incorrectlyRecordedAt:at,incorrectlyRecordedBy:actor,incorrectlyRecordedReason:'Assembly cancelled: '+reason}:s);
 entry.parts.forEach((part,index)=>{
  const run=part.source.packingRunId||getLegacyPackingRunId(part.source.roundId,part.source.packIndex);
  const original=stock.find(s=>s.id===entry.stockLink!.allocations.find(a=>a.sourceKey===part.source.key)?.stockId);
  if(!original)throw Error('Original source stock reference missing. Owner review required.');
  const released:FinishedStockLot={...original,id:`released-${id}-${index}`,packingRunId:`${run}-assembly-release-${id}`,cases:0,loosePackets:part.packets,totalPackets:part.packets,status:'awaiting_handover',storageLocation:'Dairy Container (Finished Stock)',createdAt:at,mixedCaseId:undefined,mixedCaseParts:undefined,mixedCaseCount:undefined,sourceStockId:original.id};
  nextStock.push(released);after.push(released);
 });
 const event:TraceStockEvent={id:'disassemble-'+id,kind:'disassembly',at,by:actor,reason,caseId:id,before,after};
 return {state:{...next,stockEvents:{...next.stockEvents,[event.id]:event}},stock:nextStock};
}
export function mixedCaseStockIssues(state:TraceState,rounds:ProductionRound[],lots:MilkLot[],stock:FinishedStockLot[]) {
 const issues:string[]=[],entries=Object.values(state.mixedCases||{}).filter(c=>!c.voided),lines=reconcileFinishedStock(rounds,stock),sources=loosePacketSources(rounds,lots,state);
 for(const c of entries){if(!c.stockLink){issues.push(`Mixed case ${c.number}: stock link pending owner review.`);continue;}
  if(stock.filter(s=>s.mixedCaseId===c.id).reduce((n,s)=>n+s.totalPackets,0)!==c.caseCount*c.packetsPerCase)issues.push(`Mixed case ${c.number}: stock quantity no longer matches the assembly.`);
  for(const p of c.parts){const source=sources.find(s=>s.key===p.source.key);if(!source||source.usedLoose>source.recordedLoose){issues.push(`Mixed case ${c.number}: source packing changed below allocated packets.`);continue;}
   const pack=rounds.find(r=>r.id===source.roundId)!.packedSkus![source.packIndex],units=paneerSkuByCode[pack.sku].unitsPerCase!;
   const sourceStockTotal=stockForLooseSource(source,lines).reduce((n,s)=>n+s.totalPackets,0);
   if(sourceStockTotal+source.usedLoose!==pack.cases*units+(pack.loose||0))issues.push(`S${source.shift}/R${source.round}: source stock + mixed-case allocation differs from recorded packing.`);
  }
 }
 return [...new Set(issues)];
}
export interface ReturnMixedCaseRequest {id:string;stockId:string;cases:number;expectedStock:string;reason:string;location:'Dairy Container (Finished Stock)'|'Chiller'}
export function returnMixedCaseStock(state:TraceState,stock:FinishedStockLot[],request:ReturnMixedCaseRequest,actor:string,role:string,at:string) {
 if(!['owner','admin'].includes(role))throw Error('Owner/Admin must record returns.');
 const prior=state.stockEvents?.[request.id];if(prior){if(prior.requestFingerprint!==JSON.stringify(request)||prior.by!==actor)throw Error('Return reference already used.');return {state,stock};}
 const line=stock.find(s=>s.id===request.stockId);if(!line?.mixedCaseId||line.status!=='handed_over')throw Error('Select transferred mixed-case stock.');
 if(JSON.stringify(line)!==request.expectedStock)throw Error('Stock changed. Reopen the return.');
 if(!Number.isSafeInteger(request.cases)||request.cases<=0||request.cases>line.cases||request.reason.trim().length<5)throw Error('Enter available whole cases and a return reason.');
 if(!['Dairy Container (Finished Stock)','Chiller'].includes(request.location))throw Error('Choose a production return location.');
 const units=paneerSkuByCode[line.sku].unitsPerCase!,returned:FinishedStockLot={...line,id:'return-'+request.id,packingRunId:line.packingRunId+'-return-'+request.id,cases:request.cases,loosePackets:0,totalPackets:request.cases*units,status:'returned',storageLocation:request.location,sourceStockId:line.id};
 const remaining={...line,cases:line.cases-request.cases,totalPackets:line.totalPackets-request.cases*units};
 const event:TraceStockEvent={id:request.id,kind:'return',requestFingerprint:JSON.stringify(request),at,by:actor,reason:request.reason,caseId:line.mixedCaseId,before:[structuredClone(line)],after:[remaining,returned]};
 return {state:{...state,stockEvents:{...state.stockEvents,[event.id]:event}},stock:[...stock.map(s=>s.id===line.id?remaining:s),returned]};
}

/** Correct a source entry without resurrecting packets already in a case or rewriting an external transfer. */
export function correctMixedSourceStock(state:TraceState,stock:FinishedStockLot[],rounds:ProductionRound[],lots:MilkLot[],roundId:string,index:number,next:{sku:string;cases:number;loose:number},operationId:string,reason:string,actor:string,role:string,at:string) {
 const source=loosePacketSources(rounds,lots,state).find(s=>s.roundId===roundId&&s.packIndex===index);
 const cases=Object.values(state.mixedCases||{}).filter(c=>c.parts.some(p=>p.source.key===source?.key));
 if(!source||!cases.length)return null;
 if(!['owner','admin'].includes(role))throw Error('Owner/Admin must correct source packing used in mixed cases.');
 if(cases.some(c=>!c.voided&&!c.stockLink))throw Error('Link or cancel the earlier mixed-case assembly before correcting its source packing.');
 if(next.sku!==source.sku||next.loose<source.usedLoose)throw Error(`${source.usedLoose} source packets are already in mixed cases. Return and cancel the affected assembly before reducing its allocated loose packets or changing SKU.`);
 if(!Number.isSafeInteger(next.cases)||!Number.isSafeInteger(next.loose)||next.cases<0||next.loose<0||reason.trim().length<5)throw Error('Enter whole nonnegative quantities and a correction reason.');
 const lines=stockForLooseSource(source,reconcileFinishedStock(rounds,stock)),onsite=lines.filter(onSite),units=paneerSkuByCode[source.sku].unitsPerCase!;
 let caseDelta=next.cases-lines.reduce((n,l)=>n+l.cases,0),looseDelta=next.loose-source.usedLoose-lines.reduce((n,l)=>n+l.loosePackets,0);
 const before:FinishedStockLot[]=[],after:FinishedStockLot[]=[];let updated=[...stock];
 if(!onsite.length&&(caseDelta>0||looseDelta>0)){
  const base=lines[0];if(!base)throw Error('Source stock record missing.');
  onsite.push({...base,id:'correction-'+operationId,packingRunId:(source.packingRunId||getLegacyPackingRunId(source.roundId,index))+'-correction-'+operationId,cases:0,loosePackets:0,totalPackets:0,status:'awaiting_handover',storageLocation:'Dairy Container (Finished Stock)',sourceStockId:base.id});
 }
 for(const line of onsite){
  const changeCases=caseDelta>=0?caseDelta:-Math.min(line.cases,-caseDelta),changeLoose=looseDelta>=0?looseDelta:-Math.min(line.loosePackets,-looseDelta);
  if(!changeCases&&!changeLoose)continue;
  const value={...line,cases:line.cases+changeCases,loosePackets:line.loosePackets+changeLoose,totalPackets:(line.cases+changeCases)*units+line.loosePackets+changeLoose};
  before.push(structuredClone(line));after.push(structuredClone(value));updated=updated.some(s=>s.id===line.id)?updated.map(s=>s.id===line.id?value:s):[...updated,value];caseDelta-=changeCases;looseDelta-=changeLoose;
 }
 if(caseDelta||looseDelta)throw Error('The correction would erase stock already transferred or cleared to Discrepancy. Review those movements first.');
 const event:TraceStockEvent={id:'source-correction-'+operationId,kind:'correction',at,by:actor,reason,caseId:cases[0].id,before,after};
 return {state:{...state,stockEvents:{...state.stockEvents,[event.id]:event}},stock:updated};
}
