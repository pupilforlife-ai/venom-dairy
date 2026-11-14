import { describe,it,expect } from 'vitest';
import type { FinishedStockLot } from '../data/mockData';
import { splitUnitStock,stockTransferAllocation } from './unitStockTransfer';
const line={id:'stock',packingRunId:'run',sku:'MPAN100',cases:4,loosePackets:13,totalPackets:73,sourceBatchCodes:['source']} as FinishedStockLot;
describe('shared unit handover split',()=>{
 it('conserves all 73 packets for partial cases and loose handovers',()=>{
  const plan=splitUnitStock(line,2,3,15);expect(plan).toEqual({transferred:{cases:2,loosePackets:3,totalPackets:33},remaining:{cases:2,loosePackets:10,totalPackets:40}});
  expect(line.totalPackets).toBe(73);
 });
 it('caps each source line while grouped handover uses later lines for the remainder',()=>{expect(splitUnitStock(line,8,24,15).transferred).toMatchObject({cases:4,loosePackets:13,totalPackets:73});});
 it('rejects invalid and inconsistent historical quantity rows rather than inventing packets',()=>{
  expect(()=>splitUnitStock({...line,totalPackets:0},1,0,15)).toThrow(/differs/);expect(()=>splitUnitStock(line,1.5,0,15)).toThrow(/whole/);expect(()=>splitUnitStock(line,-1,0,15)).toThrow();
 });
 it('preserves source snapshots and proportional composition for grouped mixed-case handovers',()=>{
  const mixed={...line,mixedCaseId:'mixed',mixedCaseCount:2,mixedCaseParts:[{source:{key:'a',roundId:'r1'},packets:26},{source:{key:'b',roundId:'r2'},packets:4}]} as FinishedStockLot;
  expect(stockTransferAllocation(mixed,1,0).mixedCaseParts?.map(p=>p.packets)).toEqual([13,2]);expect(()=>stockTransferAllocation(mixed,0,1)).toThrow(/whole-case/);
 });
});
