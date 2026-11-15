import { describe,it,expect } from 'vitest';
import type { MilkLot,ProductionRound,IntermediateLot } from '../data/mockData';
import { emptyTraceState } from './domain';
import { lotScrambleSummary,pan111Fingerprint,reconcilePan111 } from './pan111Reconciliation';
import { emptyRoundTrace } from './domain';
import { createPreviewStore } from './testing/localStore';
const lot={id:'lot',lotCode:'141126'} as MilkLot;
const round=(id:string,n:number|null,lotId='lot')=>({id,milkLotId:lotId,type:'D',status:'cut',shiftNumber:1,roundNumber:Number(id.slice(-1))||1,blockWeights:[72],paneerCuttingDetails:{...emptyRoundTrace().cutting,scrambleKg:n}} as ProductionRound);
const rounds=[round('r1',2),round('r2',3),round('other',99,'other')];
const request=(measuredKg=5,stock:IntermediateLot[]=[])=>({id:'final-1',lotId:lot.id,expectedFingerprint:pan111Fingerprint(rounds,lot,emptyTraceState,stock),measuredKg,reason:'Final physical weighing'});
const at='2026-11-14T10:00:00Z';
describe('scramble is the same PAN111 output, reconciled once at lot level',()=>{
 it.each([5,4.5,6,0])('records final %s kg with signed lot difference and leaves rounds intact',measured=>{
  const before=JSON.stringify(rounds),result=reconcilePan111(emptyTraceState,[],request(measured),rounds,[lot],'sa','owner',at),entry=result.state.pan111Reconciliations!.lot;
  expect(entry).toMatchObject({scrambleKg:5,measuredKg:measured,differenceKg:measured-5,recordedBy:'sa'});
  expect(result.stock.reduce((n,s)=>n+s.producedQuantity,0)).toBe(measured);expect(result.stock.every(s=>s.sourceRound===0&&s.sourceBatchId==='lot')).toBe(true);
  expect(JSON.stringify(rounds)).toBe(before);expect(entry.sources.map(s=>s.roundId)).toEqual(['r1','r2']);
 });
 it('does not double count a PAN111 packing record as extra scramble',()=>{
  const input=structuredClone(rounds);input[0].packedSkus=[{sku:'PAN111',cases:0,weightKg:2}];
  expect(lotScrambleSummary(input,lot.id,emptyTraceState).totalKg).toBe(5);
 });
 it('is retry-safe, blocks a second final addition, and rejects stale source changes',()=>{
  const req=request(),first=reconcilePan111(emptyTraceState,[],req,rounds,[lot],'sa','admin',at);
  expect(reconcilePan111(first.state,first.stock,req,rounds,[lot],'sa','admin',at)).toEqual(first);
  expect(()=>reconcilePan111(first.state,first.stock,{...req,id:'another'},rounds,[lot],'sa','owner',at)).toThrow(/already been recorded/);
  const changed=structuredClone(rounds);changed[0].paneerCuttingDetails!.scrambleKg=4;
  expect(()=>reconcilePan111(emptyTraceState,[],req,changed,[lot],'sa','owner',at)).toThrow(/changed/);
 });
 it('preserves existing recovery stock and adds only the unrecorded remainder',()=>{
  const stock=[{id:'round-pan111',productId:'pan111',sourceMilkLotCode:lot.lotCode,producedQuantity:2,currentQuantity:0.5}] as IntermediateLot[];
  const before=JSON.stringify(stock),result=reconcilePan111(emptyTraceState,stock,request(5,stock),rounds,[lot],'sa','owner',at);
  expect(result.stock[0]).toBe(stock[0]);expect(result.stock[1].producedQuantity).toBe(3);expect(JSON.stringify(stock)).toBe(before);
  expect(()=>reconcilePan111(emptyTraceState,stock,request(1,stock),rounds,[lot],'sa','owner',at)).toThrow(/will not be overwritten/);
 });
 it('requires a reason for discrepancy or missing measurements without inventing missing quantities',()=>{
  expect(()=>reconcilePan111(emptyTraceState,[],{...request(4),reason:''},rounds,[lot],'sa','owner',at)).toThrow(/reason/);
  const partial=[round('r1',null),round('r2',3)],req={...request(5),expectedFingerprint:pan111Fingerprint(partial,lot,emptyTraceState,[])};
  const result=reconcilePan111(emptyTraceState,[],req,partial,[lot],'sa','owner',at);
  expect(result.state.pan111Reconciliations!.lot).toMatchObject({scrambleKg:3,differenceKg:2,missingRoundIds:['r1']});
  expect(()=>reconcilePan111(emptyTraceState,[],{...req,reason:''},partial,[lot],'sa','owner',at)).toThrow(/reason/);
 });
 it('rejects staff, non-finite and negative final amounts',()=>{
  expect(()=>reconcilePan111(emptyTraceState,[],request(),rounds,[lot],'worker','staff',at)).toThrow(/Owner\/Admin/);
  for(const v of [-1,NaN,Infinity])expect(()=>reconcilePan111(emptyTraceState,[],request(v),rounds,[lot],'sa','owner',at)).toThrow(/zero or positive/);
 });
 it('rolls back stock and reconciliation together if browser storage fails',()=>{
  let fail=false;const values=new Map<string,string>(),store=createPreviewStore({getItem:k=>values.get(k)??null,setItem:(k,v)=>{if(fail)throw Error('Storage full');values.set(k,v);}});
  store.set('trace',emptyTraceState,emptyTraceState);store.set<IntermediateLot[]>('stock',[],[]);fail=true;
  expect(()=>store.batch(()=>{const next=reconcilePan111(store.read('trace',emptyTraceState),store.read<IntermediateLot[]>('stock',[]),request(),rounds,[lot],'sa','owner',at);store.set('trace',emptyTraceState,next.state);store.set<IntermediateLot[]>('stock',[],next.stock);})).toThrow(/Storage full/);
  expect(store.read('trace',emptyTraceState).pan111Reconciliations).toBeUndefined();expect(store.read('stock',[])).toEqual([]);
 });
});
