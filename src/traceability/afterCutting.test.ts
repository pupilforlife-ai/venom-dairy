import { describe,it,expect } from 'vitest';
import type { MilkLot,ProductionRound } from '../data/mockData';
import { emptyTraceState } from './domain';
import { capturePaneerCutting,cuttingSaveDecision } from './paneerJourney';
import { cuttingStorageDefaults,paneerTrayConflicts,retentionStorage } from './paneerStorage';
import { afterCuttingFingerprint,afterCuttingValues,canRecordAfterCutting,savePaneerAfterCutting,type AfterCuttingRequest } from './afterCutting';
const lot={id:'lot',lotCode:'091126',traceabilityProductionDate:'2026-11-09'} as MilkLot;
function source(id='r1',status='cut'):ProductionRound {
 return {id,type:'D',milkLotId:lot.id,milkLotCode:lot.lotCode,shiftNumber:1,roundNumber:1,status,blockWeights:[40,40],numberOfBlocks:2,outputWeight:80,remainingBalance:61,cutBy:'cutter',packedSkus:[{sku:'MPAN100',cases:1,loose:4}],paneerCuttingDetails:{...cuttingStorageDefaults(lot.lotCode),clothKg:2,samplePacketBatchCode:'80-0911A1'},historyEvents:[]} as unknown as ProductionRound;
}
function request(round:ProductionRound,id='after1'):AfterCuttingRequest {
 return {id,roundId:round.id,expectedFingerprint:afterCuttingFingerprint(round,emptyTraceState),details:{trayNumbers:[1,3],trays:2,scrambleKg:2.3,scrambleLocation:'Container',samplePieces:6},acknowledged:false,reason:''};
}
const save=(rounds:ProductionRound[],req:AfterCuttingRequest,actor='staff',role='staff')=>savePaneerAfterCutting(rounds,emptyTraceState,[lot],req,actor,role,'2026-11-13T10:00:00Z');
describe('weigh now and record after-cutting details later',()=>{
 it('requires only cloth confirmation at weighing; unknown later details stay null',()=>{
  const r=source(),details=r.paneerCuttingDetails!;
  expect(cuttingSaveDecision(details,false,'weighing')).toEqual({missing:[],canSave:true});
  expect(cuttingSaveDecision({...details,clothKg:null},false,'weighing').missing).toEqual(['Cloth: confirm no cloth, or enter its weight']);
  const saved=capturePaneerCutting(r,{id:'weigh',occurredAt:'now',recordedBy:'cutter',stage:'Cut',phase:'weighing'});
  expect(saved.paneerCuttingHistory![0]).toMatchObject({phase:'weighing',missingChecks:[],details:{trays:null,scrambleKg:null,samplePieces:null}});
 });
 it('lets staff add the later details, preserving cloth, blocks, balances, recipes, labels and every unrelated source',()=>{
  const r=source(),foreign={...source('other'),milkLotId:'another',milkLotCode:'111126'},before=JSON.stringify([r,foreign]);
  const next=save([r,foreign],request(r));
  expect(next[1]).toBe(foreign);expect(JSON.stringify([r,foreign])).toBe(before);
  expect(next[0]).toMatchObject({status:'cut',blockWeights:[40,40],numberOfBlocks:2,remainingBalance:61,outputWeight:80,packedSkus:r.packedSkus,paneerCuttingDetails:{clothKg:2,trayNumbers:[1,3],trays:2,scrambleKg:2.3,samplePieces:6,samplePacketBatchCode:'80-0911A1'}});
  expect(next[0].paneerCuttingHistory![0]).toMatchObject({phase:'after_cutting',recordedBy:'staff',recordedAt:'2026-11-13T10:00:00Z',details:{samplePieces:6}});
  expect(next[0].historyEvents![0]).toMatchObject({type:'cutting_details_recorded',recordedBy:'staff',source:'workflow'});
  expect(retentionStorage(next,lot,emptyTraceState)).toMatchObject({containerPieces:6,crateCode:'RS-091126'});
 });
 it('allows late entry even after packing or handover and does not regress the current stage',()=>{
  for(const status of ['frozen','packed','handed_over']){
   const r=source(status,status),next=save([r],request(r));expect(next[0].status).toBe(status);expect(next[0].packedSkus).toEqual(r.packedSkus);
  }
  const r=source(),req=request(r);expect(save([{...r,status:'packed',remainingBalance:42}],req)[0]).toMatchObject({status:'packed',remainingBalance:42});
 });
 it('requires cutting and rejects old drafts after cloth, block or after-cut values change',()=>{
  for(const status of ['scheduled','in_production','clingwrapped','cancelled'])expect(canRecordAfterCutting(source('r',status))).toBe(false);
  const r=source(),req=request(r);
  expect(()=>save([{...r,status:'scheduled'}],req)).toThrow(/cutting first/);
  expect(()=>save([{...r,blockWeights:[39,40]}],req)).toThrow(/changed/);
  expect(()=>save([{...r,paneerCuttingDetails:{...r.paneerCuttingDetails!,clothKg:1}}],req)).toThrow(/changed/);
 });
 it('saves partial later progress only with acknowledgement and keeps pending fields unknown rather than inventing zero',()=>{
  const r=source(),details={...r.paneerCuttingDetails!,scrambleKg:0},req={...request(r),details:afterCuttingValues(details)};
  expect(()=>save([r],req)).toThrow(/pending/);
  const partial=save([r],{...req,acknowledged:true});expect(partial[0].paneerCuttingDetails).toMatchObject({trays:null,scrambleKg:0,samplePieces:null});
  expect(partial[0].paneerCuttingHistory![0]).toMatchObject({pendingAcknowledged:true,missingChecks:['Trays: select the physical tray numbers','Samples: enter the number taken']});
  const nextRequest=request(partial[0],'after2');nextRequest.details.scrambleKg=0;const finished=save(partial,nextRequest);expect(finished[0].paneerCuttingHistory).toHaveLength(2);expect(finished[0].paneerCuttingDetails!.samplePieces).toBe(6);
 });
 it('is retry safe, rejects changed retry payloads and never overwrites an already recorded correction without owner/admin reason',()=>{
  const r=source(),req=request(r),first=save([r],req);expect(save(first,req)).toBe(first);
  expect(()=>save(first,{...req,details:{...req.details,samplePieces:4}})).toThrow(/reference/);
  const correction={...request(first[0],'correction'),details:{...req.details,samplePieces:4}};
  expect(()=>save(first,correction)).toThrow(/Owner\/Admin/);expect(()=>save(first,correction,'owner','owner')).toThrow(/reason/);
  const corrected=save(first,{...correction,reason:'Count physically checked'},'owner','owner');
  expect(corrected[0].paneerCuttingHistory!.map(h=>h.details.samplePieces)).toEqual([6,4]);expect(corrected[0].paneerCuttingHistory!.at(-1)).toMatchObject({previousDetails:{samplePieces:6},correctionReason:'Count physically checked'});expect(corrected[0].historyEvents!.at(-1)!.details).toContain('Count physically checked');
 });
 it('retains source labels and rejects negative/fractional after-cut quantities and invalid tray IDs',()=>{
  const r=source();
  for(const details of [{samplePieces:-1},{samplePieces:1.5},{scrambleKg:-1},{trays:1,trayNumbers:[21]},{trays:2,trayNumbers:[2,2]}])expect(()=>save([r],{...request(r),details:{...request(r).details,...details},acknowledged:true})).toThrow();
  const next=save([r],request(r));expect(next[0].paneerCuttingDetails!.samplePacketBatchCode).toBe('80-0911A1');
 });
 it('does not turn later sample or scramble entry into a new tray claim',()=>{
  const original=source();original.paneerCuttingDetails={...original.paneerCuttingDetails!,trayNumbers:[1],trays:1};
  const earlier=capturePaneerCutting(original,{id:'early',occurredAt:'2026-11-13T08:00:00Z',sequence:1,stage:'Cut'});
  const later=capturePaneerCutting({...source('later'),paneerCuttingDetails:{...source().paneerCuttingDetails!,trayNumbers:[1],trays:1}},{id:'late',occurredAt:'2026-11-13T09:00:00Z',sequence:2,stage:'Cut'});
  const req={...request(earlier),details:{...request(earlier).details,trayNumbers:[1],trays:1}};
  const next=save([earlier,later],req),flags=paneerTrayConflicts(next);expect(flags[0]).toMatchObject({earlier:{id:'r1'},later:{id:'later'}});
  expect(paneerTrayConflicts([{...next[0],status:'packed'},later])).toEqual([]);
 });
});
