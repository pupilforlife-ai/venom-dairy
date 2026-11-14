import type { MilkLot, ProductionRound } from '../data/mockData';
import { emptyRoundTrace, type CuttingTrace, type TraceState } from './domain';
import { capturePaneerCutting, cuttingSaveDecision, retentionPacketBatchCode, validatePaneerCutting } from './paneerJourney';
import { cuttingStorageDefaults } from './paneerStorage';

export type AfterCuttingDetails=Pick<CuttingTrace,'trayNumbers'|'trays'|'scrambleKg'|'scrambleLocation'|'samplePieces'>;
export interface AfterCuttingRequest { id:string;roundId:string;expectedFingerprint:string;details:AfterCuttingDetails;acknowledged:boolean;reason:string }
export function canRecordAfterCutting(round:ProductionRound) {
 return ['D','C/S'].includes(round.type)&&Boolean(round.blockWeights?.length)&&['cut','chiller_storage','frozen','packed','handed_over','spp_pending','pan111_pending','spoilage_pending','spoiled'].includes(round.status);
}
export function cuttingDetailsForRound(round:ProductionRound,state:TraceState):CuttingTrace {
 return round.paneerCuttingDetails||state.rounds[round.id]?.value.cutting||emptyRoundTrace().cutting;
}
export function afterCuttingValues(details:CuttingTrace):AfterCuttingDetails {
 return {trayNumbers:details.trayNumbers,trays:details.trays,scrambleKg:details.scrambleKg,scrambleLocation:details.scrambleLocation,samplePieces:details.samplePieces};
}
export function afterCuttingFingerprint(round:ProductionRound,state:TraceState) {
 return JSON.stringify({details:cuttingDetailsForRound(round,state),blockWeights:round.blockWeights});
}
export function changedRecordedCuttingFields(before:CuttingTrace,after:AfterCuttingDetails) {
 const changes:string[]=[];
 if(before.trayNumbers?.length&&JSON.stringify(before.trayNumbers)!==JSON.stringify(after.trayNumbers))changes.push('tray numbers');
 else if(before.trays!==null&&before.trays!==after.trays)changes.push('tray count');
 if(before.scrambleKg!==null&&before.scrambleKg!==after.scrambleKg)changes.push('scramble weight');
 if(before.scrambleKg!==null&&before.scrambleLocation&&before.scrambleLocation!==after.scrambleLocation)changes.push('scramble location');
 if(before.samplePieces!==null&&before.samplePieces!==after.samplePieces)changes.push('sample pieces');
 return changes;
}
export function savePaneerAfterCutting(rounds:ProductionRound[],state:TraceState,lots:MilkLot[],request:AfterCuttingRequest,actor:string,role:string,at:string):ProductionRound[] {
 if(!request.id||!actor.trim())throw Error('A save reference and recorder are required.');
 const requestKey=JSON.stringify(request);
 const prior=rounds.find(r=>r.paneerCuttingHistory?.some(h=>h.id===request.id));
 if(prior){const snapshot=prior.paneerCuttingHistory!.find(h=>h.id===request.id)!;if(prior.id!==request.roundId||snapshot.requestKey!==requestKey||snapshot.recordedBy!==actor)throw Error('This save reference belongs to a different cutting record.');return rounds;}
 const round=rounds.find(r=>r.id===request.roundId);if(!round)throw Error('Round not found.');
 if(!canRecordAfterCutting(round))throw Error('Save block weights and cutting first.');
 if(afterCuttingFingerprint(round,state)!==request.expectedFingerprint)throw Error('Cutting details or block weights changed. Reopen After cutting before saving.');
 const before=cuttingDetailsForRound(round,state),changes=changedRecordedCuttingFields(before,request.details);
 if(changes.length){if(!['owner','admin'].includes(role.toLowerCase()))throw Error('Owner/Admin must correct already recorded cutting details.');if(request.reason.trim().length<5)throw Error('Enter a reason for correcting the recorded details.');}
 // Only the after-cut fields are writable here. Never replay status, block weights or packing balances from a draft.
 const details={...cuttingStorageDefaults(round.milkLotCode,before),...afterCuttingValues(request.details as CuttingTrace)};
 details.samplePacketBatchCode=before.samplePacketBatchCode||retentionPacketBatchCode(round,lots.find(l=>l.id===round.milkLotId),state);
 const blockKg=(round.blockWeights||[]).reduce((n,w)=>n+w,0);validatePaneerCutting(details,blockKg);
 const decision=cuttingSaveDecision(details,request.acknowledged,'after_cutting');
 if(!decision.canSave)throw Error('Complete the after-cutting details or explicitly leave the listed items pending.');
 details.pendingAcknowledged=decision.missing.length>0&&request.acknowledged;
 const sequence=Math.max(0,...rounds.flatMap(r=>(r.paneerCuttingHistory||[]).map(h=>h.sequence||0)))+1;
 const event={id:request.id,type:'cutting_details_recorded',stage:'After cutting details',occurredAt:at,recordedBy:actor,source:changes.length?'correction' as const:'workflow' as const,
  details:`Trays ${details.trayNumbers?.join(', ')||'pending'} · Scramble ${details.scrambleKg??'pending'} kg (${details.scrambleLocation}) · Samples ${details.samplePieces??'pending'} pieces · Packet ${details.samplePacketBatchCode||'pending'}${changes.length?` · Corrected ${changes.join(', ')}: ${request.reason.trim()}`:''}${decision.missing.length?` · Left pending: ${decision.missing.join('; ')}`:''}`};
 const next=capturePaneerCutting({...round,paneerCuttingDetails:details,historyEvents:[...(round.historyEvents||[]),event]},{...event,sequence,phase:'after_cutting',requestKey,previousDetails:changes.length?before:undefined,correctionReason:changes.length?request.reason.trim():undefined});
 return rounds.map(r=>r.id===round.id?next:r);
}
