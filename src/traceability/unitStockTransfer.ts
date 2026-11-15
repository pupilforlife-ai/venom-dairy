import type { DistributionHandover,FinishedStockLot } from '../data/mockData';
export function splitUnitStock(stock:FinishedStockLot,casesRequested:number,looseRequested:number,units:number){
 if(![stock.cases,stock.loosePackets,stock.totalPackets,casesRequested,looseRequested,units].every(n=>Number.isSafeInteger(n)&&n>=0)||units===0)throw Error('Packing quantities must be nonnegative whole packets and cases.');
 if(stock.totalPackets!==stock.cases*units+stock.loosePackets)throw Error('Stock packet total differs from its cases and loose packets. Owner review required.');
 const cases=Math.min(stock.cases,casesRequested),loosePackets=Math.min(stock.loosePackets,looseRequested);
 return {transferred:{cases,loosePackets,totalPackets:cases*units+loosePackets},remaining:{cases:stock.cases-cases,loosePackets:stock.loosePackets-loosePackets,totalPackets:stock.totalPackets-cases*units-loosePackets}};
}
export function stockTransferAllocation(stock:FinishedStockLot,cases:number,loosePackets:number):NonNullable<DistributionHandover['stockAllocations']>[number]{
 if(stock.mixedCaseId&&loosePackets)throw Error('A mixed case must retain its full packet composition. Record whole-case handover.');
 return {stockId:stock.id,packingRunId:stock.packingRunId,cases,loosePackets,sourceBatchCodes:stock.sourceBatchCodes,mixedCaseId:stock.mixedCaseId,mixedCaseParts:stock.mixedCaseParts?.map(p=>({...p,packets:p.packets*cases/(stock.mixedCaseCount||1)}))};
}
