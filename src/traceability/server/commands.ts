import {recordMilkRejection} from '../../lib/milkRejection';
import {getPaneerRoundRemainingBalance} from '../../lib/paneerBalance';
import {paneerSkuByCode,getAllowedPaneerSkus,getPaneerPackWeight} from '../../data/skuConfig';
import {labelsForPacking} from '../labels';
import {preparePaneerHandover} from './handover';
import { changeRecord,emptyTraceState,planRevision,recordChecklist,recordReadiness,validDate,checklistForecast,type TraceState } from '../domain';
import { assembleMixedCaseStock,cancelMixedCaseStock,linkExistingMixedCaseStock,returnMixedCaseStock } from '../mixedCaseStock';
import { reconcilePan111 } from '../pan111Reconciliation';
import { transferRetentionSamples,reviewRetentionTransfer } from '../paneerStorage';
import { correctPaneerBag,captureAutomaticPaneer } from '../automaticPaneer';
import { savePaneerAfterCutting } from '../afterCutting';
import { saveTrayPacking } from '../paneerTrays';
import { capturePaneerCutting } from '../paneerJourney';
import { recordPaneerIngredientAllocation } from '../../lib/paneerRecipe';
import type { ProductionRound,MilkLot,FinishedStockLot,IntermediateLot } from '../../data/mockData';
export const traceKeys=['vejoy_distributionHandovers','vejoy_finishedStock','vejoy_intermediateLots','vejoy_milkLots','vejoy_productionRounds','vejoy_traceability'] as const;
export type TraceCommand={id:string;kind:string;payload:any};
export type TraceDocuments={vejoy_distributionHandovers:import('../../data/mockData').DistributionHandover[];vejoy_finishedStock:FinishedStockLot[];vejoy_intermediateLots:IntermediateLot[];vejoy_milkLots:MilkLot[];vejoy_productionRounds:ProductionRound[];vejoy_traceability:TraceState};
export function prepareTraceCommand(d:TraceDocuments,request:TraceCommand,actor:string,role:string,at:string){
 if(!['owner','admin','staff'].includes(role))throw Error('Approved production access required.');
 if(!request.id||request.id.length>120)throw Error('A save reference is required.');
 const p=request.payload||{},s=d.vejoy_traceability||emptyTraceState,r=d.vejoy_productionRounds,l=d.vejoy_milkLots,stock=d.vejoy_finishedStock;
 const next={...d};let result:any=null;
 const owner=()=>{if(!['owner','admin'].includes(role))throw Error('Owner/Admin access required.');};
 const lot=(id:string)=>{if(!l.some(x=>x.id===id))throw Error('Milk lot not found.');};
 if(request.kind==='handover')return preparePaneerHandover(d,request,actor,role,at);
 switch(request.kind){
 case 'milk_rejection': owner();next.vejoy_milkLots=recordMilkRejection(l,r,p,actor,role,at,request.id);break;
 case 'save':{
  if(!['lots','rounds','prefixes'].includes(p.kind))throw Error('Invalid traceability record.');
  if(p.kind==='prefixes'){owner();const previous=s.prefixes[p.id];if((previous?.audit[previous.audit.length-1]?.id||'')!==p.expectedRevision)throw Error('The prefix changed. Reopen it before saving.');}else if(p.kind==='lots'){
   lot(p.id);if(planRevision(s.lots[p.id])!==p.expectedRevision)throw Error('The plan changed. Reopen it before saving.');
   if(!validDate(p.value.productionDate))throw Error('Confirm the start of production date.');checklistForecast(p.value.planCsLitres,p.value.planDirectLitres);
  }else {owner();if(!r.some(x=>x.id===p.id))throw Error('Paneer round not found.');if((s.rounds[p.id]?.audit[s.rounds[p.id].audit.length-1]?.id||'')!==p.expectedRevision)throw Error('Round details changed. Reopen before correcting.');}
  const entry=changeRecord((s as any)[p.kind][p.id],p.value,actor,role,p.reason,at,request.id,p.kind==='rounds');
  next.vejoy_traceability={...s,[p.kind]:{...(s as any)[p.kind],[p.id]:entry}};result=entry.audit[entry.audit.length-1]?.id||request.id;break;
 }
 case 'checklist':lot(p.lotId);next.vejoy_traceability=recordChecklist(s,p.lotId,p.entries,p.revision,actor,role,at,request.id);break;
 case 'readiness':lot(p.lotId);next.vejoy_traceability=recordReadiness(s,p.lotId,p.ingredientId,p.draft,p.revision,p.checkId,actor,role,at,request.id);break;
 case 'assemble':{const a=assembleMixedCaseStock(s,stock,p,r,l,actor,at);next.vejoy_traceability=a.state;next.vejoy_finishedStock=a.stock;break;}
 case 'cancel_assembly':{const a=cancelMixedCaseStock(s,stock,p.id,p.reason,actor,role,at);next.vejoy_traceability=a.state;next.vejoy_finishedStock=a.stock;break;}
 case 'link_assembly':{const a=linkExistingMixedCaseStock(s,stock,p.id,r,l,actor,role,at);next.vejoy_traceability=a.state;next.vejoy_finishedStock=a.stock;break;}
 case 'return':{const a=returnMixedCaseStock(s,stock,p,actor,role,at);next.vejoy_traceability=a.state;next.vejoy_finishedStock=a.stock;break;}
 case 'pan111':{const a=reconcilePan111(s,d.vejoy_intermediateLots,p,r,l,actor,role,at);next.vejoy_traceability=a.state;next.vejoy_intermediateLots=a.stock;break;}
 case 'retention_transfer':next.vejoy_traceability=transferRetentionSamples(s,p,r,l,actor,at);break;
 case 'retention_review':next.vejoy_traceability=reviewRetentionTransfer(s,p,r,l,actor,role,at);break;
 case 'bag':next.vejoy_productionRounds=correctPaneerBag(r,s,p,actor,at);break;
 case 'after_cutting':next.vejoy_productionRounds=savePaneerAfterCutting(r,s,l,p,actor,role,at);break;
 case 'trays':next.vejoy_productionRounds=saveTrayPacking(r,p,actor,role,at);break;
 case 'intermediate_packing':{
  const source=d.vejoy_intermediateLots.find(x=>x.id===p.lotId);if(!source||JSON.stringify(source)!==JSON.stringify(p.expectedLot))throw Error('The source balance changed. Reopen packing.');
  const round=r.find(x=>x.id===source.sourceBatchId),definition=paneerSkuByCode[p.sku];
  if(!definition||!round||!getAllowedPaneerSkus(round.type as 'D'|'C/S',round.cuttingType).some(x=>x.sku===p.sku))throw Error('That SKU is not permitted for this source.');
  if(![p.cases,p.loosePackets].every(n=>Number.isSafeInteger(n)&&n>=0))throw Error('Enter whole case/packet counts.');
  const kg=getPaneerPackWeight(definition,p.cases,p.loosePackets,p.looseWeightKg,p.weightKg,p.caseWeightKg);
  if(!Number.isFinite(kg)||kg<=0||kg>source.currentQuantity+0.001)throw Error('Enter a valid packing weight within the source quantity.');
  if(definition.packMode==='weight_only')owner();
  const labels=labelsForPacking(round,p.sku,l.find(x=>x.id===round.milkLotId),s),balance=Math.max(0,source.currentQuantity-kg);
  const pack={...labels,sku:p.sku,cases:p.cases,loose:p.loosePackets,packingRunId:'pk-'+request.id,recordedBy:actor,recordedAt:at,lastSaveOperationId:request.id,...(definition.packMode==='weight_only'?{weightKg:kg}:definition.packMode==='weight_loose'?{caseWeightKg:p.caseWeightKg,looseWeightKg:p.looseWeightKg}:{})};
  next.vejoy_productionRounds=r.map(x=>x.id!==round.id?x:{...x,status:balance<=0?'packed':x.status,packedSkus:[...(x.packedSkus||[]),pack],remainingBalance:balance,intermediateBalance:balance,historyEvents:[...(x.historyEvents||[]),{id:request.id,type:'packing_recorded',stage:'Packing Recorded',occurredAt:at,recordedBy:actor,source:'workflow',details:`${p.sku} · ${p.cases} cases + ${p.loosePackets} loose · ${kg} kg`}]});
  next.vejoy_intermediateLots=d.vejoy_intermediateLots.map(x=>x.id!==source.id?x:{...x,currentQuantity:balance,status:balance<=0?'consumed':'available'});
  next.vejoy_finishedStock=[...stock,{...pack,id:'fs-'+request.id,productName:definition.productName,loosePackets:p.loosePackets,totalPackets:definition.packMode==='units'?p.cases*(definition.unitsPerCase||0)+p.loosePackets:0,storageLocation:'Dairy Container (Finished Stock)',status:'awaiting_handover',createdAt:at,sourceBatchCodes:[source.sourceBatchCode]}];break;
 }
 case 'activity':{
  const old=r.find(x=>x.id===p.roundId);if(!old||!['D','C/S'].includes(old.type))throw Error('Paneer round not found.');
  if(!p.expectedRound||old.status!==p.expectedRound.status)throw Error('The round has moved on. Reopen this action.');
  const blocked=['id','type','milkLotId','milkLotCode','shiftId','shiftNumber','roundNumber','packedSkus','historyEvents','paneerAutomaticTrace','paneerBagCorrections','paneerCuttingHistory','paneerTrayPackingHistory','paneerIngredientIssues'];
  for(const key of Object.keys(p.updates||{})){
   if(blocked.includes(key))throw Error('This action cannot change round identity, packing or audit records.');
   if(JSON.stringify((old as any)[key])!==JSON.stringify(p.expectedRound[key]))throw Error('Round values changed. Review the current record before saving.');
  }
  if(p.event.source==='correction')owner();
  if(old.locked&&p.event.source!=='correction')throw Error('This round is locked.');
  if(!['owner','admin'].includes(role)&&p.updates.status&&p.updates.status!==old.status){
   const transitions:Record<string,string[]>={scheduled:['in_production'],in_production:['coagulation'],coagulation:['pressing'],pressing:['cooling','cut'],cooling:['resting'],resting:['ready_cutting'],ready_cutting:['cut','clingwrapped','spp_pending'],clingwrapped:['cut','spp_pending'],cut:['frozen','chiller_storage'],spp_pending:['frozen'],chiller_storage:['frozen']};
   if(!transitions[old.status]?.includes(p.updates.status))throw Error('This stage change needs Owner/Admin review.');
  }
  if(p.updates.status==='in_production'&&(!['vat2','vat3'].includes(p.updates.vat)||!Number.isFinite(p.updates.startingTemperature)))throw Error('Record the vat and starting milk temperature.');

  const event={...p.event,id:request.id,recordedBy:actor,occurredAt:at};
  let updated={...old,...p.updates,historyEvents:[...(old.historyEvents||[]),event]} as ProductionRound;
  updated=recordPaneerIngredientAllocation(updated,at,actor,p.event.details,old.status==='scheduled'&&p.updates.status==='in_production'&&!!p.updates.vat);
  if(old.status==='scheduled'&&p.updates.status==='in_production')updated=captureAutomaticPaneer(updated,r,s,actor,at);
  else if(['cut','clingwrapped'].includes(p.event.type)&&p.updates.paneerCuttingDetails)updated=capturePaneerCutting(updated,{...event,phase:'weighing',sequence:Math.max(0,...r.flatMap(x=>(x.paneerCuttingHistory||[]).map(h=>h.sequence||0)))+1});
  // Source weights stay gross. Refresh only this action's derived balance when
  // weighing/cloth/SPP values change, including a late owner correction.
  if (['outputWeight','paneerCuttingDetails','sppRecordedWeight','remainingBalance'].some(key=>key in (p.updates||{})) && updated.paneerCuttingDetails?.clothKg != null) {
   const balance=getPaneerRoundRemainingBalance(updated);
   if(balance!==undefined)updated={...updated,remainingBalance:balance};
  }
  next.vejoy_productionRounds=r.map(x=>x.id===old.id?updated:x);break;
 }
 default:throw Error('Unknown paneer traceability command.');
 }
 return {documents:next,result};
}
