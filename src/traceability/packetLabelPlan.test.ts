import { describe, it, expect } from 'vitest';
import type { ProductionRound } from '../data/mockData';
import { packetLabelPlan } from './packetLabelPlan';
import { labelsForPacking } from './labels';
import { emptyTraceState } from './domain';
const round = (patch: Partial<ProductionRound> = {}) => ({id:'r',milkLotId:'m',milkLotCode:'091126',shiftNumber:2,roundNumber:8,type:'D',outputWeight:72,traceabilityProductionDate:'2026-11-10',packedSkus:[],...patch} as ProductionRound);
describe('read-only packet label estimate', () => {
 it('72kg MPAN200 yields360 labels,15cases and full production-date round code',()=>{
  const r=round(),before=JSON.stringify(r);
  expect(packetLabelPlan(r,'MPAN200')).toMatchObject({packets:360,cases:15,loose:0,remainderKg:0});
  expect(labelsForPacking(r,'MPAN200',undefined,emptyTraceState).packetBatchCode).toBe('12-1011B8');
  expect(JSON.stringify(r)).toBe(before);
 });
 it('uses recorded source allocations rather than a stale cached balance',()=>{
  const r=round({remainingBalance:999,sppRecordedWeight:2,packedSkus:[{sku:'MPAN100',cases:1,loose:0},{sku:'PAN111',cases:0,weightKg:1}]});
  expect(packetLabelPlan(r,'MPAN200')).toMatchObject({weightKg:54,packets:270});
 });
 it('estimates packet labels from paneer after cloth, including subsequent packing',()=>{
  const r=round({paneerCuttingDetails:{clothKg:2} as ProductionRound['paneerCuttingDetails']});
  expect(packetLabelPlan(r,'MPAN200')).toMatchObject({balanceKg:70,packets:350});
  expect(packetLabelPlan({...r,packedSkus:[{sku:'MPAN200',cases:1,loose:1}]},'MPAN200')).toMatchObject({balanceKg:65,packets:325});
 });
 it('supports partial weights, SKU changes and accurate decimal division',()=>{
  expect(packetLabelPlan(round(),'MPAN200',72.4)).toMatchObject({packets:362,exceedsBalance:true});
  expect(packetLabelPlan(round(),'MPAN200',20.19)).toMatchObject({packets:100,remainderKg:0.19});
  expect(packetLabelPlan(round(),'MPAN400',20)).toMatchObject({packets:50,cases:2,loose:2});
  for(const sku of ['MPAN100','MPAN101','RPAN100','RPAN101']) expect(packetLabelPlan(round(),sku)?.packets).toBe(72);
 });
 it('never rounds up partial packets or makes negative label counts',()=>{
  expect(packetLabelPlan(round(),'MPAN200',0.199999)?.packets).toBe(0);
  expect(packetLabelPlan(round({outputWeight:1,packedSkus:[{sku:'MPAN100',cases:1,loose:0}]}),'MPAN200')).toMatchObject({packets:0,weightKg:0});
  expect(packetLabelPlan(round(),'MPAN200',0)?.packets).toBe(0);
 });
 it('does not invent unit counts for weight-only/variable weight SKUs and rejects invalid weights',()=>{
  for(const sku of ['PAN111','MPAN010','RPAN010','UNKNOWN']) expect(packetLabelPlan(round(),sku)).toBeNull();
  for(const weight of [-1,NaN,Infinity,1e15]) expect(()=>packetLabelPlan(round(),'MPAN200',weight)).toThrow();
 });
 it('retains an existing recorded packet code during correction',()=>{
  expect(labelsForPacking(round(),'MPAN200',undefined,emptyTraceState,{sku:'MPAN200',cases:1,packetBatchCode:'12-0911A1'}).packetBatchCode).toBe('12-0911A1');
 });
});
