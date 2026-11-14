import { describe,it,expect } from 'vitest';
import type { ProductionRound } from '../data/mockData';
import { cuttingStorageDefaults,currentTrayRegister,paneerTrayConflicts,traysReleased } from './paneerStorage';
import { capturePaneerCutting } from './paneerJourney';
import { saveTrayPacking,trayPackingFingerprint,trayPackingProgress,type TrayPackingRequest } from './paneerTrays';
function source(id='r1',sequence=1,numbers=[1,3,12],status='cut'):ProductionRound {
 return capturePaneerCutting({id,type:'D',milkLotId:'milk1',milkLotCode:'091126',shiftNumber:1,roundNumber:sequence,status,blockWeights:[40,40],numberOfBlocks:2,outputWeight:80,remainingBalance:35,packedSkus:[{sku:'MPAN100',cases:3,loose:0}],historyEvents:[],paneerCuttingDetails:{...cuttingStorageDefaults('091126'),trayNumbers:numbers,trays:numbers.length,samplePieces:6,samplePacketBatchCode:'80-0911A1'}} as unknown as ProductionRound,{id:'cut-'+id,sequence,stage:'Cut',occurredAt:'2026-11-13T08:00:00Z',recordedBy:'cutter'});
}
const request=(round:ProductionRound,packedNumbers=[1,3],id='t1'):TrayPackingRequest=>({id,roundId:round.id,packedNumbers,expectedFingerprint:trayPackingFingerprint(round),reason:''});
const save=(rounds:ProductionRound[],r:TrayPackingRequest,actor='packer',role='staff')=>saveTrayPacking(rounds,r,actor,role,'2026-11-13T16:00:00Z');
describe('partial tray packing',()=>{
 it('records trays 1 and 3 packed, 12 waiting, without changing packets, weights, stages, retention samples or other lots',()=>{
  const original=source(),foreign={...source('foreign',2,[2]),milkLotId:'milk2'},before=JSON.stringify([original,foreign]),next=save([original,foreign],request(original));
  expect(trayPackingProgress(next[0])).toMatchObject({packed:[1,3],pending:[12],explicit:true});
  expect(next[0]).toMatchObject({status:'cut',outputWeight:80,remainingBalance:35,numberOfBlocks:2,blockWeights:[40,40],packedSkus:original.packedSkus,paneerCuttingDetails:original.paneerCuttingDetails});expect(next[1]).toBe(foreign);expect(JSON.stringify([original,foreign])).toBe(before);
  expect(next[0].paneerTrayPackingHistory![0]).toMatchObject({beforePacked:[],packedNumbers:[1,3],assignedNumbers:[1,3,12],recordedBy:'packer',recordedAt:'2026-11-13T16:00:00Z'});
  expect(next[0].historyEvents!.at(-1)!.details).toContain('Still waiting: 12');
 });
 it('releases only completed physical trays and flags only the remaining tray on later reuse',()=>{
  const r=source(),packed=save([r],request(r))[0],later={...source('later',2),milkLotId:'milk2'};
  const register=currentTrayRegister([packed]);expect(register[0].round).toBeUndefined();expect(register[2].round).toBeUndefined();expect(register[11].round?.id).toBe('r1');
  expect(traysReleased(packed)).toBe(false);
  expect(paneerTrayConflicts([packed,later]).map(c=>c.number)).toEqual([12]);
 });
 it('lets the next team finish tray 12 and releases every tray without inventing further packing quantities',()=>{
  const r=source(),partial=save([r],request(r)),next=save(partial,request(partial[0],[1,3,12],'t2'),'next shift');
  expect(trayPackingProgress(next[0])).toMatchObject({packed:[1,3,12],pending:[]});expect(traysReleased(next[0])).toBe(true);expect(next[0].paneerTrayPackingHistory).toHaveLength(2);expect(next[0].packedSkus).toEqual(r.packedSkus);expect(next[0].status).toBe('cut');
 });
 it('preserves old packed/handed-over release behavior, but an explicit partial tray record keeps its remaining tray occupied',()=>{
  for(const status of ['packed','handed_over']){
   const r=source('r1',1,[1,3,12],status);expect(trayPackingProgress(r)).toMatchObject({packed:[1,3,12],pending:[],inferred:true});
   const next=save([r],request(r))[0];expect(next.status).toBe(status);expect(trayPackingProgress(next)).toMatchObject({packed:[1,3],pending:[12],inferred:false});
  }
  const r=source(),partial=save([r],request(r))[0];expect(trayPackingProgress({...partial,status:'packed'}).pending).toEqual([12]);
 });
 it('prevents duplicate/invalid tray IDs, unassigned trays and marking completion before cutting',()=>{
  const r=source();for(const ids of [[1,1],[2],[0],[21],[1.5],[]])expect(()=>save([r],request(r,ids))).toThrow();
  expect(()=>save([{...r,status:'ready_cutting'}],request(r))).toThrow(/cutting/);
  expect(()=>save([{...r,paneerCuttingDetails:{...r.paneerCuttingDetails!,trayNumbers:[]}}],request(r))).toThrow(/numbers first/);
 });
 it('is idempotent on retries and rejects operation reuse for a different payload, actor or round',()=>{
  const r=source(),req=request(r),next=save([r],req);expect(save(next,req)).toBe(next);
  expect(()=>save(next,{...req,packedNumbers:[1]})).toThrow(/reference/);expect(()=>save(next,req,'another')).toThrow(/reference/);
  expect(()=>save([...next,source('r2')],{...req,roundId:'r2'})).toThrow(/reference/);
 });
 it('rejects stale tray drafts while preserving concurrent case packing and stage advancement',()=>{
  const r=source(),req=request(r),first=save([r],req);
  expect(()=>save(first,{...req,id:'stale'})).toThrow(/changed/);
  const advanced={...r,status:'packed',remainingBalance:0,packedSkus:[{sku:'MPAN100',cases:5,loose:0}]};
  const next=save([advanced],req)[0];expect(next).toMatchObject({status:'packed',remainingBalance:0,packedSkus:advanced.packedSkus});expect(trayPackingProgress(next).pending).toEqual([12]);
 });
 it('requires owner/admin and reason to reopen packed trays, retaining before/after history',()=>{
  const r=source(),partial=save([r],request(r)),reopen=request(partial[0],[1],'reopen');
  expect(()=>save(partial,reopen)).toThrow(/Owner\/Admin/);expect(()=>save(partial,reopen,'owner','owner')).toThrow(/reason/);
  const next=save(partial,{...reopen,reason:'Tray 3 was ticked by mistake'},'owner','owner');
  expect(trayPackingProgress(next[0])).toMatchObject({packed:[1],pending:[3,12]});expect(next[0].paneerTrayPackingHistory!.map(h=>h.packedNumbers)).toEqual([[1,3],[1]]);expect(next[0].paneerTrayPackingHistory![1]).toMatchObject({beforePacked:[1,3],reason:'Tray 3 was ticked by mistake'});
 });
 it('requires fresh confirmation after a tray assignment changes, while later sample updates do not reset completion',()=>{
  const r=source(),partial=save([r],request(r)),laterSamples=capturePaneerCutting({...partial[0],paneerCuttingDetails:{...partial[0].paneerCuttingDetails!,samplePieces:4}},{id:'samples',sequence:2,stage:'After cutting details',occurredAt:'later',recordedBy:'staff'});
  expect(trayPackingProgress(laterSamples)).toMatchObject({packed:[1,3],pending:[12],assignmentChanged:false});
  const reassigned=capturePaneerCutting({...laterSamples,status:'packed',paneerCuttingDetails:{...laterSamples.paneerCuttingDetails!,trayNumbers:[1,3,15],trays:3}},{id:'reassigned',sequence:3,stage:'After cutting details',occurredAt:'later',recordedBy:'owner'});
  expect(trayPackingProgress(reassigned)).toMatchObject({packed:[],pending:[1,3,15],assignmentChanged:true});
  expect(()=>save([reassigned],request(partial[0],[1,3,12],'stale'))).toThrow(/changed/);
  const confirmed=save([reassigned],request(reassigned,[1,3],'confirm'));expect(trayPackingProgress(confirmed[0])).toMatchObject({packed:[1,3],pending:[15]});expect(confirmed[0].paneerTrayPackingHistory).toHaveLength(2);
 });
});
