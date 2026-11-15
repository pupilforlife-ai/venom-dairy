import { describe,it,expect } from 'vitest';
import type { ProductionRound,MilkLot,FinishedStockLot } from '../data/mockData';
import { reconcileFinishedStock,isOnSiteFinishedStock } from '../lib/finishedStock';
import { emptyTraceState } from './domain';
import { loosePacketSources,recordMixedPaneerCase,type MixedCaseRequest,paneerCaseSummary } from './mixedPaneerCases';
import { assembleMixedCaseStock,linkExistingMixedCaseStock,cancelMixedCaseStock,mixedCaseStockIssues,onSiteLooseBySource,returnMixedCaseStock,correctMixedSourceStock,hasMixedCaseSourceHistory } from './mixedCaseStock';
import { paneerJourney } from './paneerJourney';
import { createPreviewStore } from './testing/localStore';
const lots=[{id:'milk',lotCode:'091126',traceabilityProductionDate:'2026-11-09'} as MilkLot];
function rounds():ProductionRound[]{return [13,11].map((loose,i)=>({id:'r'+(i+1),type:'D',milkLotId:'milk',milkLotCode:'091126',shiftNumber:1,roundNumber:i+1,status:'frozen',blockWeights:[40,40],outputWeight:80,remainingBalance:80-(60+loose),startTime:'2026-11-09T05:00:00Z',paneerAutomaticTrace:{code:`80-0911A${i+1}`,productionDate:'2026-11-09',ingredients:[{id:'gdl',name:'GDL',batchCodes:['SUPPLIER-GDL-A'],quantity:1850,unit:'g',warnings:[],allocations:[{source:{id:'gdl-bag',number:1,weightKg:25,batchCodes:['SUPPLIER-GDL-A'],checkId:'check'},expectedKg:1.85}]}]},packedSkus:[{sku:'MPAN100',cases:4,loose,packingRunId:'pack'+(i+1),packetBatchCode:`11-0911A${i+1}`,caseBatchCode:'11-0911A',traceabilityProductionDate:'2026-11-09'}]} as unknown as ProductionRound));}
function request(r:ProductionRound[],id='case1',count=1,a=13,b=2):MixedCaseRequest{const sources=loosePacketSources(r,lots,emptyTraceState);return {id,sku:'MPAN100',caseCount:count,parts:[{key:sources[0].key,packets:a,expectedFingerprint:sources[0].fingerprint},{key:sources[1].key,packets:b,expectedFingerprint:sources[1].fingerprint}]};}
const assemble=(r=rounds())=>assembleMixedCaseStock(emptyTraceState,[],request(r),r,lots,'packer','2026-11-13T10:00:00Z');
const sum=(r:ProductionRound[],stock:FinishedStockLot[],onSite=false)=>reconcileFinishedStock(r,stock).filter(l=>!onSite||isOnSiteFinishedStock(l)).reduce((n,l)=>n+l.totalPackets,0);
describe('mixed cases are existing stock reclassified, never additional production',()=>{
 it('makes 4c13 + 4c11 into 9c9 in the shared ledger while board production remains 73 + 71 packets',()=>{
  const r=rounds(),before=JSON.stringify(r),next=assemble(r),lines=reconcileFinishedStock(r,next.stock);
  expect(lines.reduce((n,l)=>n+l.cases,0)).toBe(9);expect(lines.reduce((n,l)=>n+l.loosePackets,0)).toBe(9);expect(sum(r,next.stock)).toBe(144);
  expect(lines.find(l=>l.packingRunId==='pack1')!.loosePackets).toBe(0);expect(lines.find(l=>l.packingRunId==='pack2')!.loosePackets).toBe(9);
  expect(JSON.stringify(r)).toBe(before);expect(paneerCaseSummary(r,lots,next.state,'MPAN100')).toMatchObject({totalCases:9,looseRemaining:9,totalPackets:144});
  expect(mixedCaseStockIssues(next.state,r,lots,next.stock)).toEqual([]);expect(next.state.mixedCases!.case1.stockLink!.allocations.map(a=>a.packets)).toEqual([13,2]);
 });
 it('retains saved production-date labels when legacy stock is materialized for assembly',()=>{
  const r=rounds(); const before=reconcileFinishedStock(r,[]);
  expect(before[0]).toMatchObject({packetBatchCode:'11-0911A1',caseBatchCode:'11-0911A',traceabilityProductionDate:'2026-11-09'});
  const old={...before[0],id:'older-stock',packetBatchCode:undefined,caseBatchCode:undefined};
  expect(reconcileFinishedStock(r,[old])[0].caseBatchCode).toBe('11-0911A');
  expect(reconcileFinishedStock(r,[{...old,caseBatchCode:'OWNER-REVIEWED'}])[0].caseBatchCode).toBe('OWNER-REVIEWED');
  const next=assemble(r);
  expect(next.stock.find(s=>s.packingRunId==='pack1')).toMatchObject({packetBatchCode:'11-0911A1',caseBatchCode:'11-0911A'});
 });
 it('retains both packet labels, original milk lots and round sources on cross-lot case stock',()=>{
  const r=rounds();r[1]={...r[1],milkLotId:'milk2',milkLotCode:'111126',shiftNumber:2};
  const next=assemble(r),line=next.stock.find(s=>s.mixedCaseId)!;expect(line.mixedCaseParts!.map(p=>[p.source.lotCode,p.source.round,p.source.packetBatchCode])).toEqual([['091126',1,'11-0911A1'],['111126',2,'11-0911A2']]);
  expect(line.sourceBatchCodes).toHaveLength(2);expect(line.caseBatchCode).toBe('11-0911A');
 });
 it('does not allow already transferred loose stock to be assembled again and leaves input collections unchanged on failure',()=>{
  const r=rounds(),line=reconcileFinishedStock(r,[])[0],stock=[{...line,status:'handed_over' as const}],before=JSON.stringify(stock);
  expect(()=>assembleMixedCaseStock(emptyTraceState,stock,request(r),r,lots,'staff','now')).toThrow(/not on site/);expect(JSON.stringify(stock)).toBe(before);
  expect(onSiteLooseBySource(r,lots,emptyTraceState,stock).get(loosePacketSources(r,lots,emptyTraceState)[0].key)).toBe(0);
 });
 it('safely replays an identical save, rejects altered operation reuse, and does not allocate stock twice',()=>{
  const r=rounds(),req=request(r),first=assemble(r),again=assembleMixedCaseStock(first.state,first.stock,req,r,lots,'packer','later');expect(again.state).toBe(first.state);expect(again.stock).toBe(first.stock);
  expect(()=>assembleMixedCaseStock(first.state,first.stock,{...req,caseCount:2},r,lots,'packer','later')).toThrow(/reference/);
  expect(()=>assembleMixedCaseStock(first.state,first.stock,request(r,'another'),r,lots,'packer','later')).toThrow(/remain/);
 });
 it('supports deliberate linking of earlier composition-only records without rewriting production',()=>{
  const r=rounds(),old=recordMixedPaneerCase(emptyTraceState,request(r),r,lots,'old staff','old');expect(mixedCaseStockIssues(old,r,lots,[])[0]).toContain('link pending');
  expect(()=>linkExistingMixedCaseStock(old,[],'case1',r,lots,'staff','staff','now')).toThrow(/Owner/);
  const next=linkExistingMixedCaseStock(old,[],'case1',r,lots,'owner','owner','now');expect(sum(r,next.stock)).toBe(144);expect(next.state.mixedCases!.case1.recordedBy).toBe('old staff');expect(next.state.mixedCases!.case1.stockLink!.by).toBe('owner');
 });
 it('shares exact Inventory/Distribution packet quantities before and after partial handover splits',()=>{
  const r=rounds(),next=assemble(r),mixed=next.stock.find(s=>s.mixedCaseId)!;
  const transferred={...mixed,status:'handed_over' as const,storageLocation:'Distribution Coldroom'};
  const stock=next.stock.map(s=>s.id===mixed.id?transferred:s);
  expect(sum(r,stock,true)).toBe(129);expect(sum(r,stock)-sum(r,stock,true)).toBe(15);expect(mixedCaseStockIssues(next.state,r,lots,stock)).toEqual([]);
  expect(()=>cancelMixedCaseStock(next.state,stock,'case1','Was recorded twice','owner','owner','now')).toThrow(/Return all/);
 });
 it('returns cases without losing genealogy, prevents duplicate return and permits later audited disassembly',()=>{
  const r=rounds(),first=assemble(r),mixed=first.stock.find(s=>s.mixedCaseId)!,stock=first.stock.map(s=>s.id===mixed.id?{...s,status:'handed_over' as const,storageLocation:'Rental Cold Storage'}:s),line=stock.find(s=>s.id===mixed.id)!;
  const req={id:'return1',stockId:line.id,cases:1,expectedStock:JSON.stringify(line),reason:'Physically returned intact',location:'Chiller' as const};
  const returned=returnMixedCaseStock(first.state,stock,req,'owner','owner','later');expect(sum(r,returned.stock,true)).toBe(144);expect(returned.stock.find(s=>s.status==='returned')!.mixedCaseParts).toEqual(mixed.mixedCaseParts);
  expect(returnMixedCaseStock(returned.state,returned.stock,req,'owner','owner','later2').stock).toBe(returned.stock);
  expect(()=>returnMixedCaseStock(returned.state,returned.stock,{...req,location:'Dairy Container (Finished Stock)'},'owner','owner','later')).toThrow(/reference/);
  const cancelled=cancelMixedCaseStock(returned.state,returned.stock,'case1','Wrong case assembly entry','owner','owner','later');expect(sum(r,cancelled.stock,true)).toBe(144);expect(reconcileFinishedStock(r,cancelled.stock).reduce((n,s)=>n+s.cases,0)).toBe(8);expect(reconcileFinishedStock(r,cancelled.stock).reduce((n,s)=>n+s.loosePackets,0)).toBe(24);expect(cancelled.state.mixedCases!.case1.parts).toEqual(first.state.mixedCases!.case1.parts);
 });
 it('does not release cases that were cleared to Discrepancy or an incomplete/missing stock record',()=>{
  const r=rounds(),next=assemble(r),bad=next.stock.map(s=>s.mixedCaseId?{...s,status:'incorrectly_recorded' as const}:s);
  expect(()=>cancelMixedCaseStock(next.state,bad,'case1','Wrong assembly','owner','owner','now')).toThrow(/discrepancy/i);
  expect(mixedCaseStockIssues(next.state,r,lots,next.stock.filter(s=>!s.mixedCaseId))[0]).toContain('quantity');
 });
 it('detects later source corrections that undercut allocated packets or stock conservation',()=>{
  const r=rounds(),next=assemble(r),changed=structuredClone(r);changed[0].packedSkus![0].loose=12;expect(mixedCaseStockIssues(next.state,changed,lots,next.stock)[0]).toContain('below allocated');
  changed[0].packedSkus![0].loose=13;changed[0].packedSkus![0].cases=3;expect(mixedCaseStockIssues(next.state,changed,lots,next.stock)[0]).toContain('differs');
 });
 it('corrects on-site source stock without recreating allocated loose packets or overwriting transferred cases',()=>{
  const r=rounds(),next=assemble(r),adjusted=correctMixedSourceStock(next.state,next.stock,r,lots,'r1',0,{sku:'MPAN100',cases:3,loose:13},'fix','Physical count corrected','owner','owner','now')!;
  const changed=structuredClone(r);changed[0].packedSkus![0].cases=3;
  expect(sum(changed,adjusted.stock)).toBe(129);expect(adjusted.stock.find(s=>s.packingRunId==='pack1')!.loosePackets).toBe(0);expect(mixedCaseStockIssues(adjusted.state,changed,lots,adjusted.stock)).toEqual([]);
  expect(()=>correctMixedSourceStock(next.state,next.stock,r,lots,'r1',0,{sku:'MPAN100',cases:4,loose:12},'bad','Checked','owner','owner','now')).toThrow(/already in mixed/);
  const external=next.stock.map(s=>s.packingRunId==='pack1'?{...s,status:'handed_over' as const}:s);
  expect(()=>correctMixedSourceStock(next.state,external,r,lots,'r1',0,{sku:'MPAN100',cases:3,loose:13},'bad','Checked','owner','owner','now')).toThrow(/erase stock/);
 });
 it('retains stock movement correction guards after an assembly is cancelled',()=>{
  const r=rounds(),first=assemble(r),external=first.stock.map(s=>s.packingRunId==='pack1'?{...s,status:'handed_over' as const}:s);
  const cancelled=cancelMixedCaseStock(first.state,external,'case1','QA physical disassembly','owner','owner','now');
  const corrected=correctMixedSourceStock(cancelled.state,cancelled.stock,r,lots,'r1',0,{sku:'MPAN100',cases:4,loose:12},'fix','One loose packet correction','owner','owner','later')!;
  expect(corrected).not.toBeNull();expect(corrected.stock.find(s=>s.packingRunId==='pack1')!.status).toBe('handed_over');
  expect(corrected.stock.filter(s=>s.status==='handed_over').reduce((n,s)=>n+s.totalPackets,0)).toBe(60);
  const changed=structuredClone(r);changed[0].packedSkus![0].loose=12;
  expect(sum(changed,corrected.stock)).toBe(143);
  expect(()=>correctMixedSourceStock(cancelled.state,cancelled.stock,r,lots,'r1',0,{sku:'MPAN100',cases:3,loose:13},'bad','Cannot erase external case','owner','owner','later')).toThrow(/erase stock/);
 });
 it('preserves legacy packing identity after disassembly and correction without duplicating transferred stock',()=>{
  const r=rounds();delete r[0].packedSkus![0].packingRunId;
  const first=assemble(r),sourceKey=first.state.mixedCases!.case1.parts[0].source.key;
  const external=first.stock.map(s=>s.sourceRoundId==='r1'?{...s,status:'handed_over' as const}:s);
  const cancelled=cancelMixedCaseStock(first.state,external,'case1','Physical disassembly','owner','owner','now');
  expect(hasMixedCaseSourceHistory(cancelled.state,sourceKey)).toBe(true);
  const corrected=correctMixedSourceStock(cancelled.state,cancelled.stock,r,lots,'r1',0,{sku:'MPAN100',cases:4,loose:12},'legacy-fix','Weighed loose correction','owner','owner','later')!;
  const changed=structuredClone(r);changed[0].packedSkus![0].loose=12;
  expect(sum(changed,corrected.stock)).toBe(143);
  expect(reconcileFinishedStock(changed,corrected.stock).filter(s=>s.status==='handed_over').reduce((n,s)=>n+s.totalPackets,0)).toBe(60);
  expect(changed[0].packedSkus![0].packingRunId).toBeUndefined();
 });
 it('handles grouped identical cases and preserves exact integers on a one-case return',()=>{
  const r=rounds();r[0].packedSkus![0].loose=26;r[1].packedSkus![0].loose=4;const first=assembleMixedCaseStock(emptyTraceState,[],request(r,'two',2,26,4),r,lots,'packer','now');const mixed=first.stock.find(s=>s.mixedCaseId)!;
  expect(mixed).toMatchObject({cases:2,totalPackets:30,mixedCaseCount:2});const stock=first.stock.map(s=>s.id===mixed.id?{...s,status:'handed_over' as const}:s),line=stock.find(s=>s.id===mixed.id)!;
  const returned=returnMixedCaseStock(first.state,stock,{id:'one-return',stockId:line.id,cases:1,expectedStock:JSON.stringify(line),reason:'One intact case returned',location:'Chiller'},'owner','owner','later');expect(sum(r,returned.stock)).toBe(150);expect(sum(r,returned.stock,true)).toBe(135);expect(mixedCaseStockIssues(returned.state,r,lots,returned.stock)).toEqual([]);
 });
 it('keeps source/stock link audit after cancellation and does not silently reuse a cancelled operation',()=>{
  const r=rounds(),next=assemble(r),cancelled=cancelMixedCaseStock(next.state,next.stock,'case1','Duplicate assembly','owner','owner','now');expect(cancelled.state.stockEvents!['disassemble-case1'].before.length).toBe(1);expect(cancelled.state.mixedCases!.case1.stockLink).toBeDefined();expect(()=>assembleMixedCaseStock(cancelled.state,cancelled.stock,request(r),r,lots,'packer','later')).toThrow(/cancelled/);
 });
 it('persists the full round→case→stock journey through a fresh browser store instance, without any Supabase access',()=>{
  const data=new Map<string,string>(),storage={getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);}},store=createPreviewStore(storage),r=rounds();store.set('rounds',[],r);
  store.batch(()=>{const next=assemble(r);store.set('trace',emptyTraceState,next.state);store.set('stock',[],next.stock);});const reopened=createPreviewStore(storage),state=reopened.read('trace',emptyTraceState),stock=reopened.read<FinishedStockLot[]>('stock',[]);
  expect(sum(r,stock)).toBe(144);expect(stock.find(s=>s.mixedCaseId)!.mixedCaseParts![0].source.roundId).toBe('r1');expect(state.mixedCases!.case1.parts[0].source.packetBatchCode).toBe('11-0911A1');expect(JSON.stringify(reopened.read('rounds',[]))).toContain('SUPPLIER-GDL-A');expect(paneerJourney(r[0],lots[0],state).packedKg).toBe(73);
 });
});
