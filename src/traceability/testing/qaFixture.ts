// Disposable data for the dedicated QA origin only. Never applied over saved browser work.
import type { MilkLot,ProductionRound } from '../../data/mockData';
import { changeRecord,emptyTraceState,type TraceState,type IngredientReadiness } from '../domain';
import { captureAutomaticPaneer } from '../automaticPaneer';
import { recordPaneerIngredientAllocation } from '../../lib/paneerRecipe';
import { capturePaneerCutting,paneerOrigin } from '../paneerJourney';
import { cuttingStorageDefaults } from '../paneerStorage';
import { savePaneerAfterCutting,afterCuttingFingerprint } from '../afterCutting';
import { packingLabels } from '../labels';
export function makePaneerQaFixture(initial=false){
 const at='2026-11-10T05:00:00Z',lot={id:'qa-milk',lotCode:'091126',receiptDate:'2026-11-09',receiptTime:'06:00',supplier:'QA SAMPLE DAIRY',invoiceNo:'QA-ONLY',litresReceived:1500,litresConsumed:1500,litresRemaining:0,litresRejected:0,litresSpilled:0,status:'active',isLatest:true,traceabilityProductionDate:'2026-11-10'} as MilkLot;
 let state:TraceState={...emptyTraceState,lots:{[lot.id]:changeRecord(undefined,{productionDate:'2026-11-10',planCsLitres:500,planDirectLitres:1000},'qa owner','owner','','start','qa-plan')},readiness:{[lot.id]:{}}};
 for(const id of ['calcium_chloride','gdl','potassium_sorbate','fis','af_oil']){
  const value:IngredientReadiness={planRevision:'qa-plan',requiredKg:0,availableKg:25,floorBalanceKg:id==='gdl'?1:0,floorBatchCodes:id==='gdl'?'QA-GDL-FLOOR':'',storageBags:[{id:id+'-bag',number:1,weightKg:25,batchCode:'QA-'+id+'-LOT1'}],responsible:'QA prep',supplier:'',supplierProductCode:'',supplierBatches:'',onSite:true,checkedBy:'QA prep',checkedAt:at};
  state.readiness![lot.id][id]=changeRecord(undefined,value,'QA prep','staff','','prep',id+'-ready');
 }
 let rounds:ProductionRound[]=[];
 for(let i=0;i<3;i++){
  const raw={id:'qa-r'+(i+1),milkLotId:lot.id,milkLotCode:lot.lotCode,shiftId:'qa-shift',shiftNumber:1,roundNumber:i+1,type:i===2?'C/S':'D',vat:'vat2',sourceVessel:'Direct to production',startingTemperature:4,status:'in_production',plannedInput:500,actualInput:500,startTime:at,team:['QA team'],outputWeight:0,locked:false,packedSkus:[],historyEvents:[]} as ProductionRound;
  const issued=recordPaneerIngredientAllocation(raw,at,'QA production','Vat confirmed',true),started=captureAutomaticPaneer(issued,rounds,state,'QA production',at),origin=paneerOrigin(started,lot,state);
  const weighed=capturePaneerCutting({...started,status:'cut',cutBy:'QA cutter',cuttingType:'400g cubes',numberOfBlocks:2,blockWeights:[40,40],outputWeight:80,remainingBalance:80,paneerCuttingDetails:{...cuttingStorageDefaults(lot.lotCode),clothKg:2,samplePacketBatchCode:origin.code}},{id:'qa-weigh-'+i,stage:'Cut',phase:'weighing',sequence:i*2+1,occurredAt:at,recordedBy:'QA cutter'});
  rounds.push(weighed);
  rounds=savePaneerAfterCutting(rounds,state,[lot],{id:'qa-after-'+i,roundId:weighed.id,expectedFingerprint:afterCuttingFingerprint(weighed,state),acknowledged:false,reason:'',details:{trayNumbers:i===0?[1,3,12]:i===1?[2,4]:[5,6],trays:i===0?3:2,scrambleKg:1.2,scrambleLocation:'Container',samplePieces:6}},'QA cutter','staff',at);
  const r=rounds[i],labels=packingLabels(r,i===2?'RPAN100':'MPAN100',lot,state);
  rounds[i]={...r,status:'frozen',packedSkus:i===2?[]:[{...labels,sku:'MPAN100',cases:4,loose:i===0?13:11,packingRunId:'qa-pack-'+i,recordedAt:at,recordedBy:'QA packer'}],remainingBalance:i===0?7:i===1?9:80};
 }
 if(initial){const first=rounds[0];rounds[0]={...first,status:'ready_cutting',cutBy:undefined,cuttingType:undefined,numberOfBlocks:undefined,blockWeights:undefined,outputWeight:0,remainingBalance:0,packedSkus:[],paneerCuttingDetails:undefined,paneerCuttingHistory:undefined};}
 return {lots:[lot],rounds,state,shift:{id:'qa-shift',milkLotId:lot.id,milkLotCode:lot.lotCode,shiftNumber:1,startedAt:at,team:['QA team'],status:'active'}};
}
