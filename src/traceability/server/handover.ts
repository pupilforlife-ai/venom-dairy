import type {DistributionHandover,FinishedStockLot,ProductionRound} from '../../data/mockData';
import {getPaneerRoundRemainingBalance} from '../../lib/paneerBalance';
import {reconcileFinishedStock,getProductionSourceBatchCode} from '../../lib/finishedStock';
import {paneerSkuByCode,getPaneerPackWeight,getDefaultPaneerCaseWeightKg} from '../../data/skuConfig';
import {labelsForPacking} from '../labels';
import {stockTransferAllocation} from '../unitStockTransfer';
import type {TraceDocuments,TraceCommand} from './commands';
const canonical=(x:any):string=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
export function preparePaneerHandover(d:TraceDocuments,q:TraceCommand,actor:string,role:string,at:string){
 if(!['owner','admin'].includes(role))throw Error('Owner/Admin must verify the quantity and batch code.');
 const {form:f,candidate:c}=q.payload||{};const definition=paneerSkuByCode[c?.sku];
 if(!definition||c.sourceType!=='finished_stock'||!c.stockLines?.length)throw Error('Select recorded paneer stock.');
 const lines=reconcileFinishedStock(d.vejoy_productionRounds,d.vejoy_finishedStock);
 const quoted=c.stockLines.map((old:any)=>{const current=lines.find(x=>x.id===old.id);if(!current||canonical(current)!==canonical(old))throw Error('Stock changed. Reopen the handover and verify the quantity again.');if(current.sku!==c.sku||!['awaiting_handover','returned'].includes(current.status))throw Error('Stock is no longer on site.');return current;});
 const integer=(n:number)=>Number.isSafeInteger(n)&&n>=0,positive=(n:number)=>Number.isFinite(n)&&n>=0;
 if(![f.verifiedCases,f.verifiedLoose].every(integer)||!positive(f.verifiedLooseWeightKg)||!positive(f.quantity))throw Error('Enter valid cases, packets and weight.');
 const review=f.quantity===0&&f.partialTransferDisposition==='incorrectly_recorded';
 if(!review&&!f.quantityVerified)throw Error('Confirm the physical packed quantity.');
 if(!review&&!['Distribution Coldroom','Rental Cold Storage'].includes(f.destination))throw Error('Choose the receiving storage location.');
 if(!review&&!f.finishedGoodsBatchCode?.trim())throw Error('Enter the finished-goods batch code.');
 if(!f.handedOverBy?.trim())throw Error('Enter the person handing over the goods.');
 const units=definition.unitsPerCase||0,weight=(x:any)=>getPaneerPackWeight(definition,x.cases||0,x.loosePackets||0,x.looseWeightKg||0,x.weightKg||0,x.caseWeightKg);
 const availableCases=quoted.reduce((a:number,x:any)=>a+(x.cases||0),0),availableLoose=quoted.reduce((a:number,x:any)=>a+(x.loosePackets||0),0),availableLooseKg=quoted.reduce((a:number,x:any)=>a+(x.looseWeightKg||0),0);
 const available=definition.packMode==='units'?quoted.reduce((a:number,x:any)=>a+x.totalPackets,0):quoted.reduce((a:number,x:any)=>a+weight(x),0);
 const requested=definition.packMode==='units'?f.verifiedCases*units+f.verifiedLoose:definition.packMode==='weight_loose'?f.verifiedCases*(c.caseWeightKg||getDefaultPaneerCaseWeightKg(definition))+f.verifiedLooseWeightKg:f.quantity;
 if(Math.abs(requested-f.quantity)>0.01)throw Error('The verified case/packet count differs from the transfer quantity.');
 const extraCases=Math.max(0,f.verifiedCases-availableCases),extraLoose=Math.max(0,f.verifiedLoose-availableLoose),extraLooseKg=Math.max(0,f.verifiedLooseWeightKg-availableLooseKg);
 const extraKg=definition.packMode==='units'?(extraCases*units+extraLoose)*definition.unitWeightKg:definition.packMode==='weight_loose'?extraCases*(c.caseWeightKg||getDefaultPaneerCaseWeightKg(definition))+extraLooseKg:Math.max(0,f.quantity-available);
 const remaining=Math.max(0,available-Math.min(available,f.quantity));
 if(remaining>0.01&&!['still_in_production','incorrectly_recorded'].includes(f.partialTransferDisposition))throw Error('Classify the untransferred balance.');
 if(remaining>0.01&&f.partialTransferDisposition==='incorrectly_recorded'&&!f.partialDispositionReason?.trim())throw Error('Enter the discrepancy reason.');
 if(remaining>0.01&&f.partialTransferDisposition==='still_in_production'&&!['Dairy Container (Finished Stock)','Chiller'].includes(f.partialStorageLocation))throw Error('Choose Container or Chiller for the remaining stock.');
 let stock=[...d.vejoy_finishedStock],rounds=d.vejoy_productionRounds;const allocations:NonNullable<DistributionHandover['stockAllocations']>=[];let serial=0;
 const add=(row:Omit<FinishedStockLot,'id'>)=>{const item={...row,id:`fs-${q.id}-${++serial}`};stock.push(item);return item;};
 const reviewed={status:'handed_over' as const,storageLocation:f.destination,finishedGoodsBatchCode:f.finishedGoodsBatchCode.trim(),finishedGoodsBatchCodeReviewedBy:actor,finishedGoodsBatchCodeReviewedAt:at,finishedGoodsBatchCodeReviewMethod:c.finishedGoodsBatchCode===f.finishedGoodsBatchCode.trim()?'automatic_suggestion' as const:'owner_admin_override' as const};
 const remainingState=f.partialTransferDisposition==='incorrectly_recorded'?'incorrectly_recorded' as const:'awaiting_handover' as const;
 const remainderInfo={status:remainingState,storageLocation:f.partialTransferDisposition==='still_in_production'?f.partialStorageLocation:undefined,productionRemainderReviewId:q.id,...(remainingState==='incorrectly_recorded'?{incorrectlyRecordedAt:at,incorrectlyRecordedBy:actor,incorrectlyRecordedReason:f.partialDispositionReason.trim()}:{})};
 if(extraKg>0.005){
  const round=rounds.find(x=>x.id===f.extraSourceRoundId);if(!round||!['D','C/S'].includes(round.type)||!definition.sourceTypes.includes(round.type as never))throw Error('Choose the paneer source round for the extra packing.');
  if(extraKg>(getPaneerRoundRemainingBalance(round)??0)+0.01)throw Error('Extra packing exceeds that round’s recorded balance.');
  const pack={sku:c.sku,cases:extraCases,loose:extraLoose,...(definition.packMode==='weight_loose'?{caseWeightKg:c.caseWeightKg||getDefaultPaneerCaseWeightKg(definition),looseWeightKg:extraLooseKg}:definition.packMode==='weight_only'?{weightKg:extraKg}:{}),packingRunId:`pb-${round.id}-${q.id}`,recordedBy:actor,recordedAt:at,lastSaveOperationId:q.id,...labelsForPacking(round,c.sku,d.vejoy_milkLots.find(x=>x.id===round.milkLotId),d.vejoy_traceability)};
  const balance=(getPaneerRoundRemainingBalance(round)||0)-extraKg;
  rounds=rounds.map(x=>x.id!==round.id?x:{...x,packedSkus:[...(x.packedSkus||[]),pack],remainingBalance:balance,historyEvents:[...(x.historyEvents||[]),{id:q.id,type:'packing_recorded',stage:'Packing Recorded',source:'workflow',recordedBy:actor,occurredAt:at,details:`Physical handover verification: ${extraCases} cases + ${extraLoose} loose · ${extraKg} kg`}]} as ProductionRound);
  const row=add({...pack,productName:c.productName,loosePackets:extraLoose,totalPackets:definition.packMode==='units'?extraCases*units+extraLoose:0,sourceBatchCodes:[getProductionSourceBatchCode(round)],createdAt:at,...reviewed});
  allocations.push(stockTransferAllocation(row,extraCases,extraLoose));
 }
 let casesLeft=Math.min(f.verifiedCases,availableCases),looseLeft=Math.min(f.verifiedLoose,availableLoose),looseKgLeft=Math.min(f.verifiedLooseWeightKg,availableLooseKg),kgLeft=Math.min(f.quantity,available);
 for(const original of quoted){
  const source=stock.find(x=>x.id===original.id)||original;const takeCases=Math.min(original.cases||0,casesLeft),takeLoose=Math.min(original.loosePackets||0,looseLeft),takeLooseKg=Math.min(original.looseWeightKg||0,looseKgLeft);
  const transferred=definition.packMode==='units'?{cases:takeCases,loosePackets:takeLoose,totalPackets:takeCases*units+takeLoose}:definition.packMode==='weight_loose'?{cases:takeCases,loosePackets:0,totalPackets:0,caseWeightKg:original.caseWeightKg||c.caseWeightKg||getDefaultPaneerCaseWeightKg(definition),looseWeightKg:takeLooseKg}:{cases:0,loosePackets:0,totalPackets:0,weightKg:Math.min(weight(original),kgLeft)};
  const transferredQuantity=definition.packMode==='units'?transferred.totalPackets:weight({...source,...transferred});
  casesLeft-=takeCases;looseLeft-=takeLoose;looseKgLeft-=takeLooseKg;kgLeft-=transferredQuantity;
  const remainder=definition.packMode==='units'?{cases:original.cases-takeCases,loosePackets:original.loosePackets-takeLoose,totalPackets:original.totalPackets-transferred.totalPackets}:definition.packMode==='weight_loose'?{cases:original.cases-takeCases,loosePackets:0,totalPackets:0,caseWeightKg:(transferred as any).caseWeightKg,looseWeightKg:(original.looseWeightKg||0)-takeLooseKg}:{cases:0,loosePackets:0,totalPackets:0,weightKg:weight(original)-transferredQuantity};
  const remainderQuantity=definition.packMode==='units'?remainder.totalPackets:weight({...source,...remainder});
  const materialize=(value:any)=>{if(original.persisted)stock=stock.map(x=>x.id===original.id?{...x,...value}:x);else add({...source,...value,sourceStockId:original.id});};
  if(transferredQuantity<=0){materialize({...remainder,...remainderInfo,storageLocation:remainderInfo.storageLocation||original.storageLocation});continue;}
  if(original.mixedCaseId&&takeLoose)throw Error('Mixed cases must move as whole cases.');
  allocations.push(stockTransferAllocation(original,takeCases,takeLoose));
  if(remainderQuantity<=0.005)materialize({...transferred,...reviewed});
  else {materialize({...remainder,...remainderInfo,storageLocation:remainderInfo.storageLocation||original.storageLocation});add({...source,...transferred,...reviewed,packingRunId:`${source.packingRunId}-handover-${q.id}`,sourceStockId:source.id});}
 }
 const record:DistributionHandover={id:q.id,recordKind:review?'balance_review':'handover',sourceType:'finished_stock',sourceId:c.sourceId,sku:c.sku,stockAllocations:allocations,sourceBatchCodes:c.sourceBatchCodes,milkLotCodes:c.milkLotCodes,milkLotGroupLabel:c.milkLotLabel,productName:c.productName,batchCode:c.batchCode,finishedGoodsBatchCode:f.finishedGoodsBatchCode.trim(),finishedGoodsBatchCodeReviewedBy:actor,finishedGoodsBatchCodeReviewedAt:at,finishedGoodsBatchCodeReviewMethod:reviewed.finishedGoodsBatchCodeReviewMethod,quantity:f.quantity,unit:definition.packMode==='units'?'packets':'kg',cases:f.verifiedCases,looseQuantity:f.verifiedLoose,storageLocation:f.destination,destination:f.destination,handedOverBy:f.handedOverBy.trim(),handedOverAt:at,quantityVerified:!review,quantityVerifiedBy:actor,quantityVerifiedAt:at,recordedQuantityBeforeVerification:available,quantityVariance:f.quantity-available,notes:f.notes?.trim()||undefined,...(remaining>0.01?{partialTransferDisposition:f.partialTransferDisposition,partialRemainderQuantity:remaining,partialDispositionReason:f.partialDispositionReason?.trim(),partialReviewedBy:actor,partialStorageLocation:f.partialStorageLocation}: {})};
 return {documents:{...d,vejoy_productionRounds:rounds,vejoy_finishedStock:stock,vejoy_distributionHandovers:[...d.vejoy_distributionHandovers,record]},result:record};
}
