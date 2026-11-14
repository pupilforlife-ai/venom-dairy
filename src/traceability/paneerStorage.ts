import { trayAssignment, trayIsReleased, trayPackingProgress } from './paneerTrays';
import type { MilkLot, ProductionRound } from '../data/mockData';
import { emptyRoundTrace, type CuttingTrace, type TraceState } from './domain';
import { retentionPacketBatchCode } from './paneerJourney';

export const SCRAMBLE_LOCATIONS=['Container','Chiller','Coldroom'] as const;
export const retentionCrateCode=(lotCode:string)=>`RS-${lotCode}`;
export function cuttingStorageDefaults(lotCode:string,previous?:CuttingTrace):CuttingTrace {
 return {...emptyRoundTrace().cutting,...previous,scrambleLocation:previous?.scrambleLocation||'Container',sampleLocation:previous?.sampleLocation||'Container',sampleCrateCode:previous?.sampleCrateCode||retentionCrateCode(lotCode)};
}
export const traysReleased=(round:ProductionRound)=>trayPackingProgress(round).pending.length===0&&(['packed','handed_over'].includes(round.status)||trayPackingProgress(round).explicit);
export function trayClaims(rounds:ProductionRound[]) {
 return rounds.filter(r=>['D','C/S'].includes(r.type)).flatMap((round,index)=>{
  const {numbers,sequence,at}=trayAssignment(round);
  return numbers.length?[{round,numbers,sequence,at,index}]:[];
 }).sort((a,b)=>a.sequence-b.sequence||a.at.localeCompare(b.at)||a.index-b.index);
}
export function paneerTrayConflicts(rounds:ProductionRound[]) {
 const claims=trayClaims(rounds);
 return claims.flatMap((claim,index)=>claim.numbers.filter(number=>!trayIsReleased(claim.round,number)).flatMap(number=>{
  const later=claims.slice(index+1).filter(c=>c.numbers.includes(number));
  if(!later.length)return [];
  const latest=later[later.length-1];return [{number,earlier:claim.round,later:latest.round}];
 }));
}
export function currentTrayRegister(rounds:ProductionRound[]) {
 const claims=trayClaims(rounds),conflicts=paneerTrayConflicts(rounds);
 return Array.from({length:20},(_,i)=>{
  const number=i+1,uses=claims.filter(c=>c.numbers.includes(number)),last=uses[uses.length-1];
  return {number,round:last&&!trayIsReleased(last.round,number)?last.round:undefined,earlierConflicts:conflicts.filter(c=>c.number===number)};
 });
}
/** Picker warnings include every unresolved claim, even when this round is
 * the latest claimant. Reusing a tray never silently clears the earlier claim. */
export function trayPickerOccupants(rounds:ProductionRound[],roundId:string) {
 const claims=trayClaims(rounds),occupied=new Map<number,ProductionRound[]>();
 for(const claim of claims)if(claim.round.id!==roundId)for(const number of claim.numbers){
  if(trayIsReleased(claim.round,number))continue;
  occupied.set(number,[...(occupied.get(number)||[]),claim.round]);
 }
 return occupied;
}
export interface RetentionSample { roundId:string;lotId:string;lotCode:string;shift:number;round:number;pieces:number;batchCode:string;crateCode:string;recordedLocation:string;fingerprint:string }
export interface RetentionTransfer { id:string;lotId:string;crateCode:string;from:'Container';to:'Coldroom';packaging:'Case';samples:RetentionSample[];recordedAt:string;recordedBy:string;reviews?:{at:string;by:string;reason:string;before:RetentionSample[];after:RetentionSample[]}[] }
export function retentionSamples(rounds:ProductionRound[],lot:MilkLot,state:TraceState):RetentionSample[] {
 return rounds.filter(r=>r.milkLotId===lot.id&&['D','C/S'].includes(r.type)).flatMap(r=>{
  const details=r.paneerCuttingDetails||state.rounds[r.id]?.value.cutting;
  if(!details||details.samplePieces==null||!Number.isSafeInteger(details.samplePieces)||details.samplePieces<=0)return [];
  const value={roundId:r.id,lotId:lot.id,lotCode:lot.lotCode,shift:r.shiftNumber,round:r.roundNumber,pieces:details.samplePieces,batchCode:retentionPacketBatchCode(r,lot,state),crateCode:details.sampleCrateCode||retentionCrateCode(lot.lotCode),recordedLocation:details.sampleLocation||'Not recorded'};
  return [{...value,fingerprint:JSON.stringify(value)}];
 });
}
export function retentionStorage(rounds:ProductionRound[],lot:MilkLot,state:TraceState) {
 const samples=retentionSamples(rounds,lot,state),transfers=Object.values(state.retentionTransfers||{}).filter(t=>t.lotId===lot.id);
 const moved=new Set(transfers.flatMap(t=>effectiveTransferSamples(t).map(s=>s.fingerprint)));
 const rows=samples.map(s=>({...s,location:moved.has(s.fingerprint)?'Coldroom':s.recordedLocation,changedAfterMove:transfers.some(t=>effectiveTransferSamples(t).some(old=>old.roundId===s.roundId&&old.fingerprint!==s.fingerprint))&&!moved.has(s.fingerprint)}));
 const pending=rows.filter(s=>s.location==='Container');
 return {crateCode:transfers[0]?.crateCode||samples[0]?.crateCode||retentionCrateCode(lot.lotCode),rows,pending,transfers,unconfirmedPieces:rows.filter(s=>!['Container','Coldroom'].includes(s.location)).reduce((n,s)=>n+s.pieces,0),containerPieces:pending.reduce((n,s)=>n+s.pieces,0),coldroomPieces:rows.filter(s=>s.location==='Coldroom').reduce((n,s)=>n+s.pieces,0),fingerprint:JSON.stringify(pending.map(s=>s.fingerprint).sort())};
}
export function transferRetentionSamples(state:TraceState,request:{id:string;lotId:string;expectedSamples:string},rounds:ProductionRound[],lots:MilkLot[],actor:string,at:string):TraceState {
 const previous=state.retentionTransfers?.[request.id];
 if(previous){if(previous.lotId!==request.lotId||JSON.stringify(previous.samples.map(s=>s.fingerprint).sort())!==request.expectedSamples||previous.recordedBy!==actor)throw Error('This transfer reference already belongs to a different transfer.');return state;}
 const lot=lots.find(l=>l.id===request.lotId);if(!lot)throw Error('Milk lot not found.');
 if(!lot.productionClosed)throw Error('Close milk production before moving its retention samples into the Coldroom case.');
 const info=retentionStorage(rounds,lot,state);
 if(!info.pending.length)throw Error('No recorded retention samples are awaiting transfer.');
 if(info.fingerprint!==request.expectedSamples)throw Error('Retention samples changed. Reopen the transfer and check the listed samples.');
 if(info.pending.some(s=>s.changedAfterMove))throw Error('A sample record changed after an earlier transfer. Owner review is needed before recording another movement of that sample.');
 if(!actor.trim())throw Error('A recorder is required.');
 const entry:RetentionTransfer={id:request.id,lotId:lot.id,crateCode:info.crateCode,from:'Container',to:'Coldroom',packaging:'Case',samples:info.pending.map(({location,changedAfterMove,...sample})=>sample),recordedAt:at,recordedBy:actor};
 return {...state,retentionTransfers:{...state.retentionTransfers,[entry.id]:entry}};
}
export function reviewRetentionTransfer(state:TraceState,request:{id:string;expectedSamples:string;reason:string},rounds:ProductionRound[],lots:MilkLot[],actor:string,role:string,at:string):TraceState {
 if(!['owner','admin'].includes(role))throw Error('Only owner/admin can review a corrected retention transfer.');
 if(request.reason.trim().length<5)throw Error('Enter a reason and confirm the physical case contents.');
 const entry=state.retentionTransfers?.[request.id];if(!entry)throw Error('Retention transfer not found.');
 const before=effectiveTransferSamples(entry);if(JSON.stringify(before)!==request.expectedSamples)throw Error('This transfer changed. Reopen it before reviewing.');
 const lot=lots.find(l=>l.id===entry.lotId);if(!lot)throw Error('Milk lot not found.');
 const roundIds=new Set(entry.samples.map(s=>s.roundId)),after=retentionSamples(rounds,lot,state).filter(s=>roundIds.has(s.roundId));
 if(JSON.stringify(before)===JSON.stringify(after))return state;
 const correction={at,by:actor,reason:request.reason.trim(),before:structuredClone(before),after:structuredClone(after)};
 return {...state,retentionTransfers:{...state.retentionTransfers,[entry.id]:{...entry,reviews:[...(entry.reviews||[]),correction]}}};
}
export function effectiveTransferSamples(entry:RetentionTransfer):RetentionSample[] {return entry.reviews?.[entry.reviews.length-1]?.after||entry.samples;}
