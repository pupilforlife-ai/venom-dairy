import { describe,it,expect } from 'vitest';
import type { ProductionRound,MilkLot } from '../data/mockData';
import { emptyTraceState } from './domain';
import { validatePaneerCutting,capturePaneerCutting } from './paneerJourney';
import { cuttingStorageDefaults,currentTrayRegister,paneerTrayConflicts,retentionStorage,retentionSamples,retentionCrateCode,transferRetentionSamples,reviewRetentionTransfer,effectiveTransferSamples } from './paneerStorage';
const lot={id:'lot',lotCode:'111126',productionClosed:false,traceabilityProductionDate:'2026-11-12'} as MilkLot;
function makeRound(id:string,sequence:number,ids:number[],status='frozen',pieces=6,lotId='lot') {
 const round={id,type:'D',milkLotId:lotId,milkLotCode:lotId==='lot'?'111126':'other',shiftNumber:sequence,roundNumber:1,status,outputWeight:80,remainingBalance:5,blockWeights:[40,40],paneerCuttingDetails:{...cuttingStorageDefaults('111126'),trayNumbers:ids,trays:ids.length,samplePieces:pieces},packedSkus:[]} as unknown as ProductionRound;
 return capturePaneerCutting(round,{id:'cut-'+id,sequence,stage:'Cut',recordedBy:'cutter',occurredAt:'2026-11-12T10:00:00Z'});
}
describe('numbered physical trays and packed-round release',()=>{
 it('defaults new storage to Container without overwriting prior recorded storage',()=>{
  const details=cuttingStorageDefaults('111126');expect(details.scrambleLocation).toBe('Container');expect(details.sampleLocation).toBe('Container');expect(details.sampleCrateCode).toBe('RS-111126');expect(details.trayNumbers).toBeUndefined();
  const old={...details,scrambleLocation:'Chiller',sampleLocation:'Earlier sample crate',sampleCrateCode:'OLD'};expect(cuttingStorageDefaults('151126',old)).toMatchObject(old);expect(old.scrambleLocation).toBe('Chiller');
 });
 it('validates physical tray numbers and matches count, without blocking cross-round reuse',()=>{
  const details={...cuttingStorageDefaults('111126'),trayNumbers:[2,20],trays:2};expect(()=>validatePaneerCutting(details,80)).not.toThrow();
  for(const numbers of [[0],[21],[1.5],[2,2]])expect(()=>validatePaneerCutting({...details,trayNumbers:numbers,trays:numbers.length},80)).toThrow();
  expect(()=>validatePaneerCutting({...details,trays:3},80)).toThrow(/count/);
  expect(makeRound('later',2,[2,20]).paneerCuttingDetails!.trayNumbers).toEqual([2,20]);
 });
 it('flags the earlier unfinished round, across milk lots, using capture order even at identical timestamps',()=>{
  const first=makeRound('first',1,[3,8]),later=makeRound('later',2,[3],'cut',6,'other');
  const flags=paneerTrayConflicts([later,first]);expect(flags).toHaveLength(1);expect(flags[0]).toMatchObject({number:3,earlier:{id:'first'},later:{id:'later'}});
  expect(currentTrayRegister([later,first])[2].round?.id).toBe('later');expect(currentTrayRegister([later,first])[7].round?.id).toBe('first');
 });
 it('does not flag a packed earlier round and releases its trays for reuse; partial packing still holds trays',()=>{
  const packed=makeRound('first',1,[3,8],'packed'),later=makeRound('later',2,[3]);expect(paneerTrayConflicts([packed,later])).toEqual([]);expect(currentTrayRegister([packed,later])[7].round).toBeUndefined();
  const partial={...packed,status:'frozen',packedSkus:[{sku:'MPAN100',cases:4,loose:0}]};expect(paneerTrayConflicts([partial,later])[0].earlier.id).toBe('first');
  expect(paneerTrayConflicts([{...packed,status:'handed_over'},later])).toEqual([]);
 });
 it('keeps an earlier unresolved reuse warning while a later packed round releases the physical tray',()=>{
  const first=makeRound('first',1,[1]),later=makeRound('later',2,[1],'packed');expect(currentTrayRegister([first,later])[0].round).toBeUndefined();expect(paneerTrayConflicts([first,later])[0].earlier.id).toBe('first');
  expect(paneerTrayConflicts([{...first,status:'packed'},later])).toEqual([]);
 });
});
describe('milk-lot retention crate and recorded Coldroom transfer',()=>{
 it('generates one lot crate with separate sample batch references and does not auto-move on milk closure',()=>{
  const rounds=[makeRound('r1',1,[1]),makeRound('r2',2,[2], 'cut',4)],before=JSON.stringify(rounds),info=retentionStorage(rounds,lot,emptyTraceState);
  expect(retentionCrateCode('111126')).toBe('RS-111126');expect(info).toMatchObject({crateCode:'RS-111126',containerPieces:10,coldroomPieces:0});expect(info.rows.map(s=>s.batchCode)).toEqual(['80-1211A1','80-1211B1']);
  expect(retentionStorage(rounds,{...lot,productionClosed:true},emptyTraceState).coldroomPieces).toBe(0);expect(JSON.stringify(rounds)).toBe(before);
 });
 it('requires milk closure, then atomically snapshots the actual samples, with retry and lot isolation',()=>{
  const rounds=[makeRound('r1',1,[1]),makeRound('foreign',2,[2],'cut',8,'other')],info=retentionStorage(rounds,lot,emptyTraceState),request={id:'move1',lotId:lot.id,expectedSamples:info.fingerprint};
  expect(()=>transferRetentionSamples(emptyTraceState,request,rounds,[lot],'staff','now')).toThrow(/Close milk/);
  const closed={...lot,productionClosed:true},next=transferRetentionSamples(emptyTraceState,request,rounds,[closed],'staff','now');expect(next.retentionTransfers!.move1).toMatchObject({crateCode:'RS-111126',from:'Container',to:'Coldroom',packaging:'Case',recordedBy:'staff',recordedAt:'now'});expect(next.retentionTransfers!.move1.samples.map(s=>s.roundId)).toEqual(['r1']);
  expect(retentionStorage(rounds,closed,next)).toMatchObject({containerPieces:0,coldroomPieces:6});expect(next.rounds).toBe(emptyTraceState.rounds);expect(transferRetentionSamples(next,request,rounds,[closed],'staff','later')).toBe(next);
  expect(()=>transferRetentionSamples(next,{...request,id:'move2'},rounds,[closed],'staff','later')).toThrow(/No recorded/);
 });
 it('leaves later samples in Container and rejects stale sample lists',()=>{
  const closed={...lot,productionClosed:true},rounds=[makeRound('r1',1,[1])],info=retentionStorage(rounds,lot,emptyTraceState),req={id:'move',lotId:lot.id,expectedSamples:info.fingerprint};
  const next=transferRetentionSamples(emptyTraceState,req,rounds,[closed],'staff','now'),later=[...rounds,makeRound('r2',2,[2],'cut',4)];
  expect(retentionStorage(later,closed,next)).toMatchObject({containerPieces:4,coldroomPieces:6});expect(()=>transferRetentionSamples(emptyTraceState,req,later,[closed],'staff','later')).toThrow(/changed/);
 });
 it('preserves historical location entries rather than assuming old samples were in Container',()=>{
  const round=makeRound('r1',1,[1]);round.paneerCuttingDetails!.sampleLocation='Coldroom';expect(retentionStorage([round],lot,emptyTraceState)).toMatchObject({containerPieces:0,coldroomPieces:6});
  round.paneerCuttingDetails!.sampleLocation='Earlier crate reference';expect(retentionStorage([round],lot,emptyTraceState).rows[0].location).toBe('Earlier crate reference');
 });
 it('flags edits after transfer and lets owner/admin audit a physical review without rewriting original history',()=>{
  const closed={...lot,productionClosed:true},rounds=[makeRound('r1',1,[1])],info=retentionStorage(rounds,lot,emptyTraceState);
  const next=transferRetentionSamples(emptyTraceState,{id:'m',lotId:lot.id,expectedSamples:info.fingerprint},rounds,[closed],'staff','now');const changed=structuredClone(rounds);changed[0].paneerCuttingDetails!.samplePieces=4;
  const changedInfo=retentionStorage(changed,closed,next);expect(changedInfo.rows[0].changedAfterMove).toBe(true);
  expect(()=>transferRetentionSamples(next,{id:'m2',lotId:lot.id,expectedSamples:changedInfo.fingerprint},changed,[closed],'staff','later')).toThrow(/Owner review/);
  const req={id:'m',expectedSamples:JSON.stringify(effectiveTransferSamples(next.retentionTransfers!.m)),reason:'Physically checked the case: four sample pieces'};
  expect(()=>reviewRetentionTransfer(next,req,changed,[closed],'staff','staff','later')).toThrow(/owner\/admin/);
  const reviewed=reviewRetentionTransfer(next,req,changed,[closed],'owner','owner','later');expect(reviewed.retentionTransfers!.m.samples[0].pieces).toBe(6);expect(reviewed.retentionTransfers!.m.reviews![0].after[0].pieces).toBe(4);expect(retentionStorage(changed,closed,reviewed)).toMatchObject({containerPieces:0,coldroomPieces:4});
  expect(()=>reviewRetentionTransfer(reviewed,req,changed,[closed],'owner','owner','again')).toThrow(/changed/);
 });
});

describe('retention packet source-round labels',()=>{
 it('uses Direct 80 and C/S 90 with start date, shift letter and round number; crate remains milk-lot based',()=>{
  const productionLot={...lot,lotCode:'091126',traceabilityProductionDate:'2026-11-09'};
  const direct={...makeRound('direct',1,[1]),milkLotCode:'091126'},cs={...makeRound('cs',2,[2]),milkLotCode:'091126',shiftNumber:1,roundNumber:2,type:'C/S' as const};
  const before=JSON.stringify([direct,cs]);
  expect(retentionSamples([direct,cs],productionLot,emptyTraceState).map(s=>s.batchCode)).toEqual(['80-0911A1','90-0911A2']);
  expect(JSON.stringify([direct,cs])).toBe(before);
 });
 it('preserves the saved physical sample packet label after date, type or prefix corrections, including on Coldroom transfer',()=>{
  const original=makeRound('r',1,[1]);original.paneerCuttingDetails!.samplePacketBatchCode='80-0911A1';
  const changed={...original,type:'C/S' as const,shiftNumber:2,roundNumber:8},closed={...lot,productionClosed:true,traceabilityProductionDate:'2026-12-01'};
  const state={...emptyTraceState,prefixes:{'C/S':{value:'99',audit:[]}}};
  const before=JSON.stringify(changed),info=retentionStorage([changed],closed,state);
  expect(info.rows[0].batchCode).toBe('80-0911A1');
  const next=transferRetentionSamples(state,{id:'saved-label',lotId:lot.id,expectedSamples:info.fingerprint},[changed],[closed],'cutter','now');
  expect(next.retentionTransfers!['saved-label'].samples[0].batchCode).toBe('80-0911A1');expect(JSON.stringify(changed)).toBe(before);
  const captured=capturePaneerCutting(changed,{id:'new-cut',occurredAt:'later',recordedBy:'cutter',stage:'Cut'});
  expect(captured.paneerCuttingHistory!.at(-1)!.details.samplePacketBatchCode).toBe('80-0911A1');
 });
});
