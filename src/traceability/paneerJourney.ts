import type { MilkLot, PackedSku, ProductionRound } from '../data/mockData';
import { getPaneerPackWeight, paneerSkuByCode } from '../data/skuConfig';
import { agreedPrefixes, emptyRoundTrace, safeCode, type CuttingTrace, type TraceState } from './domain';
import { roundIngredientSources } from './automaticPaneer';

const kg=(n:number)=>Math.round(n*1e9)/1e9;
export interface PaneerCutSnapshot { id:string; sequence?:number; recordedAt:string;recordedBy:string;stage:string;blockKg:number;netKg:number|null;details:CuttingTrace;missingChecks?:string[];pendingAcknowledged?:boolean;phase?:CuttingPhase;requestKey?:string;previousDetails?:CuttingTrace;correctionReason?:string }
export type CuttingPhase='all'|'weighing'|'after_cutting';
export function cuttingSaveDecision(details:CuttingTrace,acknowledged=false,phase:CuttingPhase='all') {
 const missing:string[]=[];
 if(phase!=='after_cutting'&&details.clothKg===null)missing.push('Cloth: confirm no cloth, or enter its weight');
 if(phase!=='weighing'&&!details.trayNumbers?.length)missing.push('Trays: select the physical tray numbers');
 if(phase==='after_cutting'&&details.scrambleKg===null)missing.push('Scramble: enter the weighed amount, or 0 if none');
 if(phase!=='weighing'&&details.samplePieces===null)missing.push('Samples: enter the number taken');
 else if(phase!=='weighing'&&details.samplePieces===0)missing.push('Samples: no retention sample taken');
 return {missing,canSave:missing.length===0||acknowledged};
}
export function validatePaneerCutting(details:CuttingTrace,blockKg:number) {
 for(const key of ['clothKg','trays','scrambleKg','samplePieces'] as const){const v=details[key];
  if(v!==null&&(!Number.isFinite(v)||v<0||(['trays','samplePieces'].includes(key)&&!Number.isInteger(v))))throw Error('Cutting details: weights must be zero or positive; trays and sample pieces must be whole numbers.');
 }
 if(details.trayNumbers&&(details.trayNumbers.some(n=>!Number.isInteger(n)||n<1||n>20)||new Set(details.trayNumbers).size!==details.trayNumbers.length))throw Error('Choose each physical tray number once, from 1 to 20.');
 if(details.trayNumbers&&details.trays!==details.trayNumbers.length)throw Error('Tray count must match the selected tray numbers.');
 if(details.clothKg!==null&&details.clothKg>blockKg)throw Error('Cloth weight cannot exceed the recorded block weight.');
}
export function capturePaneerCutting(round:ProductionRound,event:{id:string;occurredAt:string;recordedBy?:string;stage:string;sequence?:number;phase?:CuttingPhase;requestKey?:string;previousDetails?:CuttingTrace;correctionReason?:string}):ProductionRound {
 if(!['D','C/S'].includes(round.type)||!round.paneerCuttingDetails)return round;
 if(round.paneerCuttingHistory?.some(e=>e.id===event.id))return round;
 const blockKg=kg((round.blockWeights||[]).reduce((n,w)=>n+w,0));validatePaneerCutting(round.paneerCuttingDetails,blockKg);
 const snapshot:PaneerCutSnapshot={id:event.id,sequence:event.sequence,recordedAt:event.occurredAt,recordedBy:event.recordedBy||'Recorder not recorded',stage:event.stage,blockKg,netKg:round.paneerCuttingDetails.clothKg===null?null:kg(blockKg-round.paneerCuttingDetails.clothKg),details:structuredClone(round.paneerCuttingDetails),phase:event.phase,requestKey:event.requestKey,previousDetails:event.previousDetails?structuredClone(event.previousDetails):undefined,correctionReason:event.correctionReason,missingChecks:cuttingSaveDecision(round.paneerCuttingDetails,false,event.phase).missing,pendingAcknowledged:round.paneerCuttingDetails.pendingAcknowledged===true};
 return {...round,paneerCuttingHistory:[...(round.paneerCuttingHistory||[]),snapshot]};
}
export function paneerOrigin(round:ProductionRound,lot:MilkLot|undefined,state:TraceState) {
 const date=round.paneerAutomaticTrace?.productionDate||round.traceabilityProductionDate||state.rounds[round.id]?.value.productionDate||state.lots[round.milkLotId]?.value.productionDate||lot?.traceabilityProductionDate||'';
 const code=round.paneerAutomaticTrace?.code||safeCode(state.prefixes[round.type]?.value||agreedPrefixes[round.type],date,round.shiftNumber,round.roundNumber).code;
 return {date,code};
}
// Persist the label at cutting; later date/prefix edits must not relabel a physical sample.
export function retentionPacketBatchCode(round:ProductionRound,lot:MilkLot|undefined,state:TraceState) {
 return round.paneerCuttingDetails?.samplePacketBatchCode||state.rounds[round.id]?.value.cutting.samplePacketBatchCode||paneerOrigin(round,lot,state).code;
}
export function paneerPackMass(pack:PackedSku):number|null {
 const def=paneerSkuByCode[pack.sku];
 if(pack.weightKg!==undefined)return Number.isFinite(pack.weightKg)?pack.weightKg:null;
 if(!def)return null;
 return kg(getPaneerPackWeight(def,pack.cases||0,pack.loose||0,pack.looseWeightKg||0,0,pack.caseWeightKg));
}
export function paneerJourney(round:ProductionRound,lot:MilkLot|undefined,state:TraceState) {
 const origin=paneerOrigin(round,lot,state),manual=state.rounds[round.id]?.value;
 const cutting=round.paneerCuttingDetails||manual?.cutting||emptyRoundTrace().cutting;
 const weights=round.blockWeights||[],blockKg=weights.length?kg(weights.reduce((sum,w)=>sum+w,0)):null;
 const packed=(round.packedSkus||[]).map(pack=>({pack,kg:paneerPackMass(pack)}));
 const paneerPacked=packed.filter(p=>p.pack.sku!=='PAN111'),scramblePacked=packed.filter(p=>p.pack.sku==='PAN111');
 const packedKg=paneerPacked.some(p=>p.kg===null)?null:kg(paneerPacked.reduce((n,p)=>n+(p.kg||0),0));
 const packedPan111Kg=scramblePacked.some(p=>p.kg===null)?null:kg(scramblePacked.reduce((n,p)=>n+(p.kg||0),0));
 const pan111Kg=cutting.scrambleKg??packedPan111Kg;
 const netKg=blockKg===null||cutting.clothKg===null?null:kg(blockKg-cutting.clothKg);
 const derivative=(key:'MPAN111'|'RPAN111'|'MSPP'|'RSPP'|'Cream')=>safeCode(state.prefixes[key]?.value||agreedPrefixes[key],origin.date,round.shiftNumber,round.roundNumber).code;
 const pan111Code=derivative(round.type==='D'?'MPAN111':'RPAN111'),sppCode=derivative(round.type==='D'?'MSPP':'RSPP');
 const gaps:string[]=[];
 if(!origin.date)gaps.push('Start of production date missing.');
 if(round.paneerAutomaticTrace){
  for(const line of round.paneerAutomaticTrace.ingredients){const sources=roundIngredientSources(round,line.id);if(!sources.length||sources.some(s=>!s.batchCodes.length))gaps.push(`${line.name}: ingredient batch source incomplete.`);}
 }else gaps.push('Automatic ingredient snapshot not captured for this older round.');
 const vessels=manual?.vessels?.length?manual.vessels:round.sourceVessel?[{vessel:round.sourceVessel,litres:round.actualInput||round.plannedInput}]:[];
 if(!vessels.length)gaps.push('Milk vessel source not recorded for this round.');
 const cutRecorded=Boolean(weights.length||round.cutBy);
 if(cutRecorded){if(cutting.clothKg===null)gaps.push('Cloth weight / no-cloth confirmation missing.');if(!cutting.trayNumbers?.length)gaps.push('Physical tray numbers not recorded.');if(cutting.samplePieces===null)gaps.push('Retention sample count not recorded.');else if(cutting.samplePieces===0)gaps.push('No retention sample taken.');if(cutting.samplePieces!==null&&cutting.samplePieces>0&&!cutting.sampleLocation.trim())gaps.push('Retention sample storage reference missing.');if(cutting.scrambleKg!==null&&cutting.scrambleKg>0&&!cutting.scrambleLocation.trim())gaps.push('Scramble storage reference missing.');}
 for(const {pack} of paneerPacked)if(!pack.packetBatchCode||!pack.caseBatchCode)gaps.push(`${pack.sku}: label was not recorded on this packing entry.`);
 if(packedKg===null)gaps.push('A packing SKU has no known weight definition.');
 return {origin,cutting,blockKg,netKg,packed,paneerPacked,packedKg,pan111Kg,pan111Code,sppCode,creamCode:derivative('Cream'),vessels,gaps,cutRecorded,
  sppKg:round.sppRecordedWeight??null,
  // A measured sample has only a piece count; do not invent its kg or deduct it twice.
  unaccountedKg:netKg===null||packedKg===null||pan111Kg===null?null:kg(netKg-packedKg-pan111Kg-(round.sppRecordedWeight||0))};
}
