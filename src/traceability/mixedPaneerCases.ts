import type { MilkLot, PackedSku, ProductionRound } from '../data/mockData';
import { paneerSkuByCode } from '../data/skuConfig';
import type { TraceState } from './domain';
import { packingLabels } from './labels';

export interface LoosePacketSource {
 key:string;roundId:string;packIndex:number;packingRunId?:string;fingerprint:string;sku:string;
 lotId:string;lotCode:string;shift:number;round:number;productionDate:string;shiftStartedAt:string;
 packetBatchCode:string;caseBatchCode:string;recordedLoose:number;usedLoose:number;availableLoose:number;
}
export interface MixedCasePart { source:LoosePacketSource;packets:number }
export interface MixedPaneerCase {
 id:string;number:number;sku:string;caseCount:number;packetsPerCase:number;caseBatchCode:string;
 productionDate:string;labelLotId:string;labelShift:number;parts:MixedCasePart[];
 recordedAt:string;recordedBy:string;requestFingerprint:string;
 stockLink?:{at:string;by:string;stockId:string;allocations:{sourceKey:string;stockId:string;packets:number}[]};
 voided?:{at:string;by:string;reason:string};
}
export interface MixedCaseRequest { id:string;sku:string;caseCount:number;parts:{key:string;packets:number;expectedFingerprint:string}[] }
export const packingSourceKey=(roundId:string,pack:PackedSku,index:number)=>JSON.stringify([roundId,pack.packingRunId||`legacy-index:${index}`]);
export function loosePackingBalance(round:ProductionRound,pack:PackedSku,index:number,state:TraceState) {
 const key=packingSourceKey(round.id,pack,index);
 const used=Object.values(state.mixedCases||{}).filter(c=>!c.voided).flatMap(c=>c.parts).filter(p=>p.source.key===key).reduce((n,p)=>n+p.packets,0);
 return {recorded:pack.loose||0,used,remaining:(pack.loose||0)-used};
}
export function assemblySourceOptions(sources:LoosePacketSource[],parts:{key:string}[],index:number) {
 return sources.filter(s=>(s.availableLoose>0||s.key===parts[index]?.key)&&!parts.some((p,i)=>i!==index&&p.key===s.key));
}
export function loosePacketSources(rounds:ProductionRound[],lots:MilkLot[],state:TraceState):LoosePacketSource[] {
 const used=new Map<string,number>();
 for(const item of Object.values(state.mixedCases||{}))if(!item.voided)for(const part of item.parts)used.set(part.source.key,(used.get(part.source.key)||0)+part.packets);
 return rounds.filter(r=>['D','C/S'].includes(r.type)&&!['cancelled','spoiled'].includes(r.status)).flatMap(round=>(round.packedSkus||[]).flatMap((pack,index)=>{
  const definition=paneerSkuByCode[pack.sku];if(definition?.packMode!=='units'||!definition.unitsPerCase)return [];
  const labels=packingLabels(round,pack.sku,lots.find(l=>l.id===round.milkLotId),state),key=packingSourceKey(round.id,pack,index),usedLoose=used.get(key)||0;
  return [{key,roundId:round.id,packIndex:index,packingRunId:pack.packingRunId,fingerprint:JSON.stringify({pack,lotId:round.milkLotId,lotCode:round.milkLotCode,shift:round.shiftNumber,round:round.roundNumber,type:round.type,productionDate:pack.traceabilityProductionDate||labels.traceabilityProductionDate}),sku:pack.sku,lotId:round.milkLotId,lotCode:round.milkLotCode,
   shift:round.shiftNumber,round:round.roundNumber,productionDate:pack.traceabilityProductionDate||labels.traceabilityProductionDate,
   shiftStartedAt:round.startTime||'',packetBatchCode:pack.packetBatchCode||'',caseBatchCode:pack.caseBatchCode||'',
   recordedLoose:pack.loose||0,usedLoose,availableLoose:Math.max(0,(pack.loose||0)-usedLoose)}];
 }));
}
function requestFingerprint(request:MixedCaseRequest) {
 return JSON.stringify({sku:request.sku,caseCount:request.caseCount,parts:[...request.parts].sort((a,b)=>a.key.localeCompare(b.key))});
}
export function buildMixedPaneerCase(request:MixedCaseRequest,rounds:ProductionRound[],lots:MilkLot[],state:TraceState,actor:string,at:string):MixedPaneerCase {
 const definition=paneerSkuByCode[request.sku];if(definition?.packMode!=='units'||!definition.unitsPerCase)throw Error('Choose a paneer SKU packed by packet count.');
 if(!Number.isSafeInteger(request.caseCount)||request.caseCount<1)throw Error('Enter a positive whole number of cases.');
 if(!request.id||!actor.trim())throw Error('The case reference and recorder are required.');
 if(request.parts.length<1||new Set(request.parts.map(p=>p.key)).size!==request.parts.length)throw Error('Choose at least one loose-packet entry, once each.');
 const sources=loosePacketSources(rounds,lots,state);
 const parts=request.parts.map(part=>{
  const source=sources.find(s=>s.key===part.key);if(!source||source.sku!==request.sku)throw Error('The selected packing source no longer matches this SKU.');
  if(source.fingerprint!==part.expectedFingerprint)throw Error('A source packing entry changed. Reopen this form and review the remaining loose packets.');
  if(!Number.isSafeInteger(part.packets)||part.packets<1)throw Error('Enter a positive whole packet count for each source.');
  if(part.packets>source.availableLoose)throw Error(`Lot ${source.lotCode}, S${source.shift}/R${source.round}: only ${source.availableLoose} loose packets remain available.`);
  return {source:structuredClone(source),packets:part.packets};
 });
 if(request.parts.some(p=>p.packets%request.caseCount!==0))throw Error('Grouped cases must have the same packet contribution per case. Record different compositions separately.');
 const required=request.caseCount*definition.unitsPerCase;
 if(parts.reduce((sum,p)=>sum+p.packets,0)!==required)throw Error(`${request.caseCount} case(s) require exactly ${required} packets in total.`);
 // One contribution group is one original lot/date/shift. Never merge same-number shifts from different lots.
 const groups=new Map<string,{source:LoosePacketSource;packets:number}>();
 for(const part of parts){const key=JSON.stringify([part.source.lotId,part.source.productionDate,part.source.shift]),previous=groups.get(key);
  groups.set(key,{source:previous&&previous.source.shiftStartedAt>part.source.shiftStartedAt?previous.source:part.source,packets:(previous?.packets||0)+part.packets});}
 const latestShift=(a:LoosePacketSource,b:LoosePacketSource)=>{
  if(a.lotId===b.lotId&&a.shift!==b.shift)return b.shift-a.shift;
  const timeA=Date.parse(a.shiftStartedAt),timeB=Date.parse(b.shiftStartedAt);
  if(Number.isFinite(timeA)&&Number.isFinite(timeB)&&timeA!==timeB)return timeB-timeA;
  return b.productionDate.localeCompare(a.productionDate)||b.shift-a.shift;
 };
 const majority=[...groups.values()].sort((a,b)=>b.packets-a.packets||latestShift(a.source,b.source))[0].source;
 const round=rounds.find(r=>r.id===majority.roundId)!;
 const label=majority.caseBatchCode||packingLabels(round,request.sku,lots.find(l=>l.id===majority.lotId),state).caseBatchCode;
 if(!label)throw Error(majority.productionDate?`The ${request.sku} prefix is missing. Owner/Admin can confirm it in Batch Traceability.`:`Lot ${majority.lotCode}: start of production date is unavailable. Check its recorded Shift 1 date or set the lot’s start of production date. Its receipt date is not used for this label.`);
 return {id:request.id,number:Math.max(0,...Object.values(state.mixedCases||{}).map(c=>c.number||0))+1,sku:request.sku,caseCount:request.caseCount,packetsPerCase:definition.unitsPerCase,caseBatchCode:label,productionDate:majority.productionDate,labelLotId:majority.lotId,labelShift:majority.shift,parts,recordedAt:at,recordedBy:actor,requestFingerprint:requestFingerprint(request)};
}
export function recordMixedPaneerCase(state:TraceState,request:MixedCaseRequest,rounds:ProductionRound[],lots:MilkLot[],actor:string,at:string):TraceState {
 const previous=state.mixedCases?.[request.id];
 if(previous){if(previous.requestFingerprint!==requestFingerprint(request)||previous.recordedBy!==actor)throw Error('This case reference already belongs to a different entry.');return state;}
 const entry=buildMixedPaneerCase(request,rounds,lots,state,actor,at);
 return {...state,mixedCases:{...state.mixedCases,[entry.id]:entry}};
}
export function voidMixedPaneerCase(state:TraceState,id:string,reason:string,actor:string,role:string,at:string):TraceState {
 if(!['owner','admin'].includes(role))throw Error('Only owner/admin may correct a case assembly.');
 if(reason.trim().length<5)throw Error('Enter a reason for cancelling this assembly record.');
 const entry=state.mixedCases?.[id];if(!entry)throw Error('Case assembly not found.');if(entry.voided)return state;
 return {...state,mixedCases:{...state.mixedCases,[id]:{...entry,voided:{at,by:actor,reason:reason.trim()}}}};
}
export function paneerCaseSummary(rounds:ProductionRound[],lots:MilkLot[],state:TraceState,sku:string,lotId='all') {
 const definition=paneerSkuByCode[sku];if(definition?.packMode!=='units'||!definition.unitsPerCase)return null;
 const packs=rounds.filter(r=>(lotId==='all'||r.milkLotId===lotId)&&['D','C/S'].includes(r.type)&&!['cancelled','spoiled'].includes(r.status)).flatMap(r=>(r.packedSkus||[]).filter(p=>p.sku===sku));
 const fullCases=packs.reduce((n,p)=>n+p.cases,0),recordedLoose=packs.reduce((n,p)=>n+(p.loose||0),0);
 const cases=Object.values(state.mixedCases||{}).filter(c=>c.sku===sku&&!c.voided&&(lotId==='all'||c.parts.some(p=>p.source.lotId===lotId)));
 const ownCases=cases.filter(c=>lotId==='all'||c.parts.every(p=>p.source.lotId===lotId));
 const sharedCases=cases.filter(c=>!ownCases.includes(c));
 const mixedCases=ownCases.reduce((n,c)=>n+c.caseCount,0),used=cases.reduce((n,c)=>n+c.parts.filter(p=>lotId==='all'||p.source.lotId===lotId).reduce((m,p)=>m+p.packets,0),0);
 const looseRemaining=recordedLoose-used,totalPackets=fullCases*definition.unitsPerCase+recordedLoose;
 const sources=loosePacketSources(rounds,lots,state).filter(s=>s.sku===sku&&(lotId==='all'||s.lotId===lotId));
 const problems=sources.filter(s=>s.usedLoose>s.recordedLoose).map(s=>`S${s.shift}/R${s.round}: packing was corrected below the number of packets already used in mixed cases.`);
 for(const c of cases)for(const p of c.parts.filter(p=>lotId==='all'||p.source.lotId===lotId))if(!sources.some(s=>s.key===p.source.key))problems.push(`Case ${c.caseBatchCode}: a source packing entry is no longer present; owner review required.`);
 return {sku,originalCases:fullCases,recordedLoose,mixedCases,totalCases:fullCases+mixedCases,looseRemaining,totalPackets,sources,problems,sharedCases,sharedPackets:sharedCases.reduce((n,c)=>n+c.parts.filter(p=>p.source.lotId===lotId).reduce((m,p)=>m+p.packets,0),0)};
}
