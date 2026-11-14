import { describe,it,expect } from 'vitest';
import { batchCode,milkCode,forecast,consumedTotals,ingredientTemplate,emptyRoundTrace,roundGaps,changeRecord,shifts,emptyTraceState } from './domain';
import { packingLabels } from './labels';
import type { ProductionRound,MilkLot } from '../data/mockData';
describe('approved local traceability rules',()=>{
 it('keeps receiving and production dates separate, including leading zeros',()=>{
  expect(milkCode('2026-11-09')).toBe('091126');expect(batchCode('90','2026-11-10',2,8)).toBe('90-1011B8');
  expect(batchCode('08','2026-11-10',2,8)).toBe('08-1011B8');expect(batchCode('21','2026-11-10',2)).toBe('21-1011B');
 });
 it('preserves intentional skipped shift letters and numeric round 10',()=>{
  expect(shifts.join(',')).toBe('A,B,C,D,F,G,H,J,M,N');expect(batchCode('80','2026-11-10',5,10)).toBe('80-1011F10');
  expect(()=>batchCode('80','2026-11-10',11,1)).toThrow();
 });
 it('rejects invalid calendar dates and fractional rounds',()=>{
  expect(()=>milkCode('2026-02-30')).toThrow();expect(()=>batchCode('90','2026-11-10',1,1.5)).toThrow();
 });
 it('scales shared ingredients across all milk, but FIS/oil only across C/S',()=>{
  const rows=forecast(1000,500),by=Object.fromEntries(rows.map(r=>[r.id,r]));
  expect(by.calcium_chloride.total).toBe(1200);expect(by.gdl.total).toBe(5550);expect(by.potassium_sorbate.total).toBe(750);
  expect(by.fis.total).toBe(1670);expect(by.af_oil.total).toBe(40);expect(by.af_oil.direct).toBe(0);
 });
 it('handles zero plans, non-500 quantities and rejects negative/NaN forecasts',()=>{
  expect(forecast(0,0)).toEqual([]);expect(forecast(250,0).find(x=>x.id==='fis')?.total).toBe(417.5);
  expect(()=>forecast(-1,0)).toThrow();expect(()=>forecast(NaN,0)).toThrow();
 });
 it('never declares a standard recipe as actually consumed',()=>{
  const uses=ingredientTemplate('D',500);expect(uses.every(u=>u.quantity===null)).toBe(true);expect(consumedTotals(uses)).toEqual({});
 });
 it('adds actual contributions from multiple supplier batches, with unit conversion',()=>{
  const a=ingredientTemplate('D',500)[0];expect(consumedTotals([{...a,quantity:200},{...a,id:'second',quantity:0.2,unit:'kg'}]).calcium_chloride).toBe(0.4);
  expect(consumedTotals([{...a,quantity:0}]).calcium_chloride).toBe(0);expect(()=>consumedTotals([{...a,quantity:-2}])).toThrow();
 });
 it('reports gaps without using completeness as a packing guard',()=>{
  const trace=emptyRoundTrace('2026-11-10');expect(roundGaps(trace,500,'D').length).toBe(4);
  trace.vessels=[{vessel:'bmc-2',litres:500}];expect(roundGaps(trace,500,'D')).not.toContain('Vessel litres differ from round milk');
 });
 it('keeps before/after audit and prevents unauthorised or unexplained corrections',()=>{
  const original=changeRecord(undefined,{n:1},'sa','staff','initial','now','one');
  expect(()=>changeRecord(original,{n:2},'staff','staff','fix this','later','two')).toThrow();
  expect(()=>changeRecord(original,{n:2},'sa','owner','','later','two')).toThrow();
  const corrected=changeRecord(original,{n:2},'sa','owner','correct count','later','two');
  expect(corrected.audit).toHaveLength(2);expect(corrected.audit[1].before).toEqual({n:1});expect(original.value.n).toBe(1);
  expect(changeRecord(corrected,{n:2},'sa','owner','','later','three')).toBe(corrected);
 });
 it('new packing labels use production date without changing numeric shift or legacy source identity',()=>{
  const r={id:'r',milkLotId:'lot',shiftNumber:2,roundNumber:8,type:'C/S',batchCode:'091126/S2/R8'} as ProductionRound;
  const l={id:'lot',lotCode:'091126',receiptDate:'2026-11-09',traceabilityProductionDate:'2026-11-10'} as MilkLot;
  expect(packingLabels(r,'RPAN100',l,emptyTraceState).packetBatchCode).toBe('21-1011B8');
  expect(r.shiftNumber).toBe(2);expect(r.batchCode).toBe('091126/S2/R8');
  const labels=packingLabels(r,'UNKNOWN',l,emptyTraceState);expect(labels.packetBatchCode).toBe('');expect(labels.traceabilityGap).toBeTruthy();
 });
});
describe('staff completion without losing owner control',()=>{
 it('allows filling blank details but does not allow replacing a known quantity',()=>{
  const before=changeRecord(undefined,{quantity:null,batch:''},'staff','staff','initial','now','one');
  const after=changeRecord(before,{quantity:400,batch:'B1'},'staff','staff','','later','two',true);
  expect(after.value.quantity).toBe(400);expect(after.audit).toHaveLength(2);
  expect(()=>changeRecord(after,{quantity:450,batch:'B1'},'staff','staff','fix it','later','three',true)).toThrow();
 });
});
describe('saved label compatibility',()=>{
 it('keeps a recorded label when correcting quantities after a prefix change',async()=>{
  const {labelsForPacking}=await import('./labels');
  const round={id:'r',milkLotId:'lot',shiftNumber:1,roundNumber:1,type:'C/S'} as ProductionRound;
  const lot={id:'lot',traceabilityProductionDate:'2026-11-11'} as MilkLot;
  const labels=packingLabels(round,'RPAN100',lot,emptyTraceState);
  const next={...emptyTraceState,prefixes:{RPAN100:changeRecord(undefined,'99','owner','owner','new prefix','now','op')}};
  expect(labelsForPacking(round,'RPAN100',lot,next,{...labels,sku:'RPAN100',cases:1}).packetBatchCode).toBe('21-1111A1');
  expect(packingLabels(round,'RPAN100',lot,next).packetBatchCode).toBe('99-1111A1');
 });
});
