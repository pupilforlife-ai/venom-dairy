import type { MilkLot, ProductionRound, PackedSku } from '../data/mockData';
import { agreedPrefixes, safeCode, TRACE_VERSION, type TraceState } from './domain';
export function packingLabels(round:ProductionRound,sku:string,lot:MilkLot|undefined,state:TraceState) {
  const productionDate=state.rounds[round.id]?.value.productionDate||round.traceabilityProductionDate||state.lots[round.milkLotId]?.value.productionDate||lot?.traceabilityProductionDate||'';
  const prefixKey=sku==='PAN111'?(round.type==='D'?'MPAN111':'RPAN111'):sku;
  const prefix=state.prefixes[prefixKey]?.value||agreedPrefixes[prefixKey];
  const packet=safeCode(prefix,productionDate,round.shiftNumber,round.roundNumber),outer=safeCode(prefix,productionDate,round.shiftNumber);
  return {packetBatchCode:packet.code,caseBatchCode:outer.code,traceabilityProductionDate:productionDate,
    traceabilityPrefixVersion:TRACE_VERSION,traceabilityGap:packet.gap};
}

export function labelsForPacking(round:ProductionRound,sku:string,lot:MilkLot|undefined,state:TraceState,previous?:PackedSku) {
 const calculated=packingLabels(round,sku,lot,state);
 if(!previous?.packetBatchCode||previous.sku!==sku) return calculated;
 return {...calculated,packetBatchCode:previous.packetBatchCode,caseBatchCode:previous.caseBatchCode||calculated.caseBatchCode,
  traceabilityProductionDate:previous.traceabilityProductionDate||calculated.traceabilityProductionDate,
  traceabilityPrefixVersion:previous.traceabilityPrefixVersion||calculated.traceabilityPrefixVersion,
  traceabilityGap:previous.traceabilityGap||''};
}
