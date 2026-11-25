import {describe,it,expect} from 'vitest';
import type {MilkLot,ProductionShift,ProductionRound} from '../data/mockData';
import {lotsWithRecordedProductionStart} from './productionStart';
import {emptyTraceState} from './domain';
import {buildMixedPaneerCase,loosePacketSources} from './mixedPaneerCases';
import {prepareTraceCommand,type TraceDocuments} from './server/commands';
const lot={id:'l1',lotCode:'111026',receiptDate:'2026-10-09'} as MilkLot;
const shift=(patch:Partial<ProductionShift>={})=>({id:'s1',milkLotId:lot.id,milkLotCode:lot.lotCode,shiftNumber:1,startedAt:'2026-10-11T14:27:00.000Z',status:'completed',...patch} as ProductionShift);
const rounds=[{id:'r1',shiftNumber:7,roundNumber:1,startTime:'2026-10-14T17:33:00Z',loose:13},{id:'r2',shiftNumber:8,roundNumber:9,startTime:'2026-10-15T14:04:00Z',loose:9}].map(({loose,...r})=>({...r,milkLotId:lot.id,milkLotCode:lot.lotCode,type:'D',status:'packed',packedSkus:[{sku:'MPAN100',cases:4,loose}]} as ProductionRound));
describe('historical lot dates follow the recorded first shift',()=>{
 it('uses Shift 1 rather than receipt or later-round dates, without altering source records',()=>{
  const before=JSON.stringify({lot,rounds}),lots=lotsWithRecordedProductionStart([lot],[shift(),shift({id:'duplicate',startedAt:'2026-10-11T15:11:00Z'})]);
  expect(lots[0].traceabilityProductionDate).toBe('2026-10-11');
  const sources=loosePacketSources(rounds,lots,emptyTraceState),request={id:'case',sku:'MPAN100',caseCount:1,parts:sources.map((s,i)=>({key:s.key,packets:i?2:13,expectedFingerprint:s.fingerprint}))};
  const result=buildMixedPaneerCase(request,rounds,lots,emptyTraceState,'packer','2026-11-25T08:00:00Z');
  expect(result.caseBatchCode).toBe('11-1110H');expect(result.labelShift).toBe(7);expect(result.productionDate).toBe('2026-10-11');
  expect(result.parts.map(p=>p.source.availableLoose-p.packets)).toEqual([0,7]);
  expect(result.parts.every(p=>p.source.packetBatchCode==='')).toBe(true);
  const d:TraceDocuments={vejoy_productionShifts:[shift()],vejoy_productionRounds:rounds,vejoy_milkLots:[lot],vejoy_traceability:emptyTraceState,vejoy_finishedStock:[],vejoy_intermediateLots:[],vejoy_distributionHandovers:[]};
  const next=prepareTraceCommand(d,{id:'case',kind:'assemble',payload:request},'packer','staff','2026-11-25T08:00:00Z').documents;
  expect(next.vejoy_traceability.mixedCases?.case.caseBatchCode).toBe(result.caseBatchCode);
  expect(next.vejoy_productionRounds).toBe(rounds);expect(next.vejoy_milkLots[0]).toBe(lot);expect(JSON.stringify({lot,rounds})).toBe(before);
 });
 it('preserves explicit lot dates and existing case labels',()=>{
  const explicit={...lot,traceabilityProductionDate:'2026-10-10'};expect(lotsWithRecordedProductionStart([explicit],[shift()])[0]).toBe(explicit);
  const saved=rounds.map(r=>({...r,packedSkus:r.packedSkus!.map(p=>({...p,caseBatchCode:'OLD-SAVED',packetBatchCode:'ORIGINAL'}))}));
  const lots=lotsWithRecordedProductionStart([lot],[shift()]),sources=loosePacketSources(saved,lots,emptyTraceState);
  expect(buildMixedPaneerCase({id:'old',sku:'MPAN100',caseCount:1,parts:sources.map((s,i)=>({key:s.key,packets:i?2:13,expectedFingerprint:s.fingerprint}))},saved,lots,emptyTraceState,'packer','now').caseBatchCode).toBe('OLD-SAVED');
 });
 it('handles SAST midnight and refuses missing, scheduled, conflicting or wrong-lot dates',()=>{
  expect(lotsWithRecordedProductionStart([lot],[shift({startedAt:'2026-10-10T23:30:00Z'})])[0].traceabilityProductionDate).toBe('2026-10-11');
  for(const shifts of [[],[shift({shiftNumber:7})],[shift({status:'scheduled'})],[shift({milkLotId:'other'})],[shift({startedAt:'bad'})],[shift({startedAt:'2026-10-11T14:27:00'})],[shift(),shift({id:'different',startedAt:'2026-10-12T14:00:00Z'})]])expect(lotsWithRecordedProductionStart([lot],shifts)[0]).toBe(lot);
 });
});
