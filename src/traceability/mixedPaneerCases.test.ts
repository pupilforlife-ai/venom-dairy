import { describe,it,expect } from 'vitest';
import type { MilkLot,ProductionRound } from '../data/mockData';
import { emptyTraceState } from './domain';
import { packingLabels } from './labels';
import { loosePacketSources,recordMixedPaneerCase,voidMixedPaneerCase,paneerCaseSummary,type MixedCaseRequest } from './mixedPaneerCases';
const lots=[{id:'milk',lotCode:'091126',traceabilityProductionDate:'2026-11-10'},{id:'other',lotCode:'111126',traceabilityProductionDate:'2026-11-12'}] as MilkLot[];
function makeRound(id:string,shift:number,round:number,loose:number,lotId='milk',sku='MPAN100') {
 const r={id,type:'D',milkLotId:lotId,milkLotCode:lots.find(l=>l.id===lotId)!.lotCode,shiftNumber:shift,roundNumber:round,startTime:'2026-11-10T06:00:00Z',outputWeight:80,remainingBalance:7,packedSkus:[]} as unknown as ProductionRound;
 return {...r,packedSkus:[{...packingLabels(r,sku,lots.find(l=>l.id===lotId),emptyTraceState),sku,cases:4,loose,packingRunId:'packing-'+id}]};
}
function request(rounds:ProductionRound[],counts:number[],id='case1'):MixedCaseRequest {
 const sources=loosePacketSources(rounds,lots,emptyTraceState);return {id,sku:'MPAN100',caseCount:1,parts:sources.map((s,i)=>({key:s.key,packets:counts[i],expectedFingerprint:s.fingerprint}))};
}
describe('mixed paneer cases preserve source packet counts',()=>{
 it('records the exact 4c+13 / 4c+11 example as 9c+9, without changing the 73 and 71 source totals',()=>{
  const rounds=[makeRound('r1',1,1,13),makeRound('r2',1,2,11)],before=JSON.stringify(rounds);
  const next=recordMixedPaneerCase(emptyTraceState,request(rounds,[13,2]),rounds,lots,'packer','now');
  const summary=paneerCaseSummary(rounds,lots,next,'MPAN100')!;expect(summary).toMatchObject({originalCases:8,recordedLoose:24,mixedCases:1,totalCases:9,looseRemaining:9,totalPackets:144});
  expect(summary.sources.map(s=>s.availableLoose)).toEqual([0,9]);expect(rounds.map(r=>r.packedSkus![0].cases*15+r.packedSkus![0].loose)).toEqual([73,71]);
  expect(JSON.stringify(rounds)).toBe(before);expect(next.rounds).toBe(emptyTraceState.rounds);expect(next.mixedCases!.case1.parts.map(p=>p.packets)).toEqual([13,2]);
 });
 it('labels with the majority shift; the ninth case is never owned by either round',()=>{
  const rounds=[makeRound('r1',1,1,13),makeRound('r2',2,1,11)];const next=recordMixedPaneerCase(emptyTraceState,request(rounds,[13,2]),rounds,lots,'packer','now');
  expect(next.mixedCases!.case1).toMatchObject({number:1,labelShift:1,caseBatchCode:'11-1011A'});
  expect(next.mixedCases!.case1.parts.map(p=>p.source.roundId)).toEqual(['r1','r2']);
 });
 it('uses the latest shift when contributions tie, including cases spanning milk lots',()=>{
  const rounds=[makeRound('r1',2,1,12,'milk','MPAN200'),makeRound('r2',1,1,12,'other','MPAN200')];
  const req={...request(rounds,[12,12]),sku:'MPAN200'};const next=recordMixedPaneerCase(emptyTraceState,req,rounds,lots,'packer','now');
  expect(next.mixedCases!.case1).toMatchObject({labelLotId:'other',labelShift:1,caseBatchCode:'12-1211A'});expect(next.mixedCases!.case1.parts.map(p=>p.source.lotId)).toEqual(['milk','other']);
  const sameDay=[makeRound('r1',1,1,12,'milk','MPAN200'),makeRound('r2',2,1,12,'milk','MPAN200')];
  expect(recordMixedPaneerCase(emptyTraceState,{...request(sameDay,[12,12]),sku:'MPAN200'},sameDay,lots,'packer','now').mixedCases!.case1.labelShift).toBe(2);
 });
 it('adds contributions from multiple rounds of one shift before selecting the majority',()=>{
  const rounds=[makeRound('r1',1,1,5),makeRound('r2',1,2,5),makeRound('r3',2,1,5)];
  expect(recordMixedPaneerCase(emptyTraceState,request(rounds,[5,5,5]),rounds,lots,'packer','now').mixedCases!.case1.labelShift).toBe(1);
 });
 it('does not permit using loose packets twice and is retry-safe',()=>{
  const rounds=[makeRound('r1',1,1,13),makeRound('r2',1,2,11)],req=request(rounds,[13,2]);
  const next=recordMixedPaneerCase(emptyTraceState,req,rounds,lots,'packer','now');
  expect(recordMixedPaneerCase(next,req,rounds,lots,'packer','later')).toBe(next);
  expect(()=>recordMixedPaneerCase(next,{...req,id:'second-case'},rounds,lots,'packer','later')).toThrow(/only 0 loose/);
  expect(()=>recordMixedPaneerCase(next,{...req,parts:[{...req.parts[0],packets:12},{...req.parts[1],packets:3}]},rounds,lots,'packer','later')).toThrow(/different entry/);
 });
 it('rejects stale source edits, invalid packet counts, duplicate sources and wrong totals',()=>{
  const rounds=[makeRound('r1',1,1,13),makeRound('r2',1,2,11)],req=request(rounds,[13,2]);
  const changed=structuredClone(rounds);changed[0].packedSkus![0].loose=12;
  expect(()=>recordMixedPaneerCase(emptyTraceState,req,changed,lots,'packer','now')).toThrow(/changed/);
  const moved=structuredClone(rounds);moved[0].milkLotId='other';expect(()=>recordMixedPaneerCase(emptyTraceState,req,moved,lots,'packer','now')).toThrow(/changed/);
  for(const n of [-1,0,1.5,NaN])expect(()=>recordMixedPaneerCase(emptyTraceState,{...req,parts:[{...req.parts[0],packets:n},req.parts[1]]},rounds,lots,'packer','now')).toThrow();
  expect(()=>recordMixedPaneerCase(emptyTraceState,{...req,parts:[req.parts[0],req.parts[0]]},rounds,lots,'packer','now')).toThrow(/once each/);
  expect(()=>recordMixedPaneerCase(emptyTraceState,{...req,parts:[{...req.parts[0],packets:10},req.parts[1]]},rounds,lots,'packer','now')).toThrow(/exactly 15/);
 });
 it('retains an owner-cancelled record, releases allocations and protects staff permissions',()=>{
  const rounds=[makeRound('r1',1,1,13),makeRound('r2',1,2,11)],req=request(rounds,[13,2]);const next=recordMixedPaneerCase(emptyTraceState,req,rounds,lots,'packer','now');
  expect(()=>voidMixedPaneerCase(next,'case1','wrong entry','staff','staff','later')).toThrow(/owner\/admin/);
  const cancelled=voidMixedPaneerCase(next,'case1','wrong physical composition','owner','owner','later');
  expect(cancelled.mixedCases!.case1.voided).toMatchObject({by:'owner',reason:'wrong physical composition'});expect(next.mixedCases!.case1.voided).toBeUndefined();
  expect(paneerCaseSummary(rounds,lots,cancelled,'MPAN100')).toMatchObject({totalCases:8,looseRemaining:24,totalPackets:144});
 });
 it('flags later source corrections below an existing assembly allocation instead of deleting the trace',()=>{
  const rounds=[makeRound('r1',1,1,13),makeRound('r2',1,2,11)],next=recordMixedPaneerCase(emptyTraceState,request(rounds,[13,2]),rounds,lots,'packer','now');
  const changed=structuredClone(rounds);changed[0].packedSkus![0].loose=0;
  const result=paneerCaseSummary(changed,lots,next,'MPAN100')!;expect(result.looseRemaining).toBe(-4);expect(result.problems.length).toBe(1);expect(next.mixedCases!.case1.parts[0].packets).toBe(13);
 });
 it('records identical compositions together and keeps the saved label despite later prefix changes',()=>{
  const rounds=[makeRound('r1',1,1,26),makeRound('r2',2,1,22)],req={...request(rounds,[26,4]),caseCount:2};
  const next=recordMixedPaneerCase(emptyTraceState,req,rounds,lots,'packer','now');expect(next.mixedCases!.case1.caseCount).toBe(2);expect(paneerCaseSummary(rounds,lots,next,'MPAN100')).toMatchObject({totalCases:10,looseRemaining:18,totalPackets:168});
  expect(()=>recordMixedPaneerCase(emptyTraceState,{...req,parts:[{...req.parts[0],packets:25},{...req.parts[1],packets:5}]},rounds,lots,'packer','now')).toThrow(/same packet contribution/);
  const changed={...next,prefixes:{MPAN100:{value:'99',audit:[]}}};expect(paneerCaseSummary(rounds,lots,changed,'MPAN100')!.totalPackets).toBe(168);expect(changed.mixedCases!.case1.caseBatchCode).toBe('11-1011A');
 });
});

describe('assembly form choices and current composition',()=>{
 it('excludes another row’s selected source and offers it again when selection clears',async()=>{
  const {assemblySourceOptions}=await import('./mixedPaneerCases');
  const sources=loosePacketSources([makeRound('r1',1,1,13),makeRound('r2',1,2,11)],lots,emptyTraceState);
  const parts=[{key:sources[0].key},{key:''}];
  expect(assemblySourceOptions(sources,parts,1).map(s=>s.key)).toEqual([sources[1].key]);
  expect(assemblySourceOptions(sources,parts,0).map(s=>s.key)).toContain(sources[0].key);
  expect(assemblySourceOptions(sources,[{key:''},{key:''}],1)).toHaveLength(2);
 });
 it('shows 13 cases and 2 loose after casing 24 of 26 RPAN400 loose packets',async()=>{
  const {loosePackingBalance}=await import('./mixedPaneerCases');
  const rounds=[makeRound('r1',1,1,13,'milk','RPAN400'),makeRound('r2',1,2,13,'milk','RPAN400')];rounds.forEach(r=>r.packedSkus![0].cases=6);
  const req={...request(rounds,[13,11]),sku:'RPAN400'},next=recordMixedPaneerCase(emptyTraceState,req,rounds,lots,'packer','now');
  expect(paneerCaseSummary(rounds,lots,next,'RPAN400')).toMatchObject({totalCases:13,looseRemaining:2,totalPackets:314});
  expect(loosePackingBalance(rounds[0],rounds[0].packedSkus![0],0,next)).toEqual({recorded:13,used:13,remaining:0});
  expect(loosePackingBalance(rounds[1],rounds[1].packedSkus![0],0,next)).toEqual({recorded:13,used:11,remaining:2});
 });
 it('subtracts each lot’s cased loose packets while listing shared cases separately',()=>{
  const rounds=[makeRound('r1',1,1,12,'milk','MPAN200'),makeRound('r2',1,1,12,'other','MPAN200')];
  const next=recordMixedPaneerCase(emptyTraceState,{...request(rounds,[12,12]),sku:'MPAN200'},rounds,lots,'packer','now');
  for(const lotId of ['milk','other'])expect(paneerCaseSummary(rounds,lots,next,'MPAN200',lotId)).toMatchObject({totalCases:4,looseRemaining:0,sharedPackets:12,totalPackets:108});
  expect(paneerCaseSummary(rounds,lots,next,'MPAN200')).toMatchObject({totalCases:9,looseRemaining:0,totalPackets:216});
 });
});

it('allows casing 24 of a single entry’s 26 RPAN400 loose packets without selecting the same entry twice',()=>{
 const rounds=[makeRound('r1',1,1,26,'milk','RPAN400')];rounds[0].packedSkus![0].cases=12;
 const next=recordMixedPaneerCase(emptyTraceState,{...request(rounds,[24]),sku:'RPAN400'},rounds,lots,'packer','now');
 expect(paneerCaseSummary(rounds,lots,next,'RPAN400')).toMatchObject({totalCases:13,looseRemaining:2,totalPackets:314});
 expect(()=>recordMixedPaneerCase(next,{...request(rounds,[24]),id:'again',sku:'RPAN400'},rounds,lots,'packer','later')).toThrow(/only 2 loose/);
});
