import { describe,it,expect } from 'vitest';
import type { ProductionRound } from '../data/mockData';
import { recordPaneerIngredientAllocation } from '../lib/paneerRecipe';
import { addNumberedBag, addNumberedCases, bagEntryGroups, storageBagTotal, preparedQuantity, changeRecord, emptyTraceState, type IngredientReadiness, type TraceState } from './domain';
import { allocatePaneerIngredient,captureAutomaticPaneer,correctPaneerBag,currentPaneerBags,paneerBagQueue,roundIngredientSources,type BagCorrectionRequest } from './automaticPaneer';
function setup():TraceState {
 const state:TraceState={...emptyTraceState,lots:{lot:changeRecord(undefined,{productionDate:'2026-11-12',planCsLitres:30000,planDirectLitres:0},'owner','owner','','time','p1')},readiness:{lot:{}}};
 for(const id of ['calcium_chloride','gdl','potassium_sorbate','fis','af_oil']){
  const count=id==='af_oil'?48:6;
  const value:IngredientReadiness={planRevision:'p1',requiredKg:0,availableKg:count*25,floorBalanceKg:0,floorBatchCodes:'',storageBags:Array.from({length:count},(_,index)=>({id:`${id}-${index+1}`,number:index+1,weightKg:25,batchCode:`${id}-B${index+1}`})),supplier:'',supplierProductCode:'',supplierBatches:'',responsible:'prep',onSite:true,checkedBy:'prep',checkedAt:'time'};
  state.readiness!.lot[id]=changeRecord(undefined,value,'prep','staff','','time',id+'-check');
 }
 return state;
}
function raw(id:string,type:'D'|'C/S'='C/S'):ProductionRound {return {id,milkLotId:'lot',milkLotCode:'121126',shiftId:'s1',shiftNumber:1,roundNumber:Number(id.replace('r',''))||1,type,vat:'vat2',status:'in_production',plannedInput:500,actualInput:500,outputWeight:0,packedSkus:[],historyEvents:[]} as ProductionRound;}
function start(id:string,rounds:ProductionRound[],state:TraceState,type:'D'|'C/S'='C/S',at='2026-11-12T06:00:00.000Z') {
 const issued=recordPaneerIngredientAllocation(raw(id,type),at,'staff','Production start',true);
 return captureAutomaticPaneer(issued,rounds,state,'staff',at);
}
describe('numbered paneer bags',()=>{
 it('keeps Bag 0 for the floor and gives same-batch copies new stable numbers',()=>{
  let row=setup().readiness!.lot.calcium_chloride.value;row={...row,storageBags:[],nextBagNumber:1};
  row=addNumberedBag(row,25,'SAME','a');row=addNumberedBag(row,25,'SAME','b');
  expect(row.storageBags!.map(b=>b.number)).toEqual([1,2]);
  row={...row,storageBags:row.storageBags!.filter(b=>b.number!==2)};row=addNumberedBag(row,5,'OTHER','c');
  expect(row.storageBags!.map(b=>b.number)).toEqual([1,3]);expect(row.storageBags![0].batchCode).toBe('SAME');
  expect(paneerBagQueue(setup(),'lot','calcium_chloride')[0].number).toBe(0);
 });
 it('records 40 oil cases once, retains numbered traceability and adds the 5 kg floor remainder',()=>{
  const state=setup(),original=state.readiness!.lot.af_oil.value;
  const row=addNumberedCases({...original,storageBags:[],nextBagNumber:1,floorBalanceKg:5,floorBatchCodes:'233768'},40,25,'233769','oil-pallet');
  expect(storageBagTotal(row.storageBags!)).toBe(1000);expect(preparedQuantity(row)).toBe(1005);
  expect(row.storageBags).toHaveLength(40);expect(row.storageBags![39].number).toBe(40);
  expect(bagEntryGroups(row.storageBags!)).toHaveLength(1);expect(original.storageBags).toHaveLength(48);
  state.readiness!.lot.af_oil.value=row;
  const first=start('case-round',[],state);const oil=first.paneerAutomaticTrace!.ingredients.find(i=>i.id==='af_oil')!;
  expect(oil.allocations.map(a=>[a.source.number,a.source.batchCodes,a.expectedKg])).toEqual([[0,['233768'],5],[1,['233769'],15]]);
  expect(oil.cursorAfter?.remainingKg).toBe(10);
  const second=start('case-round-2',[first],state);expect(second.paneerAutomaticTrace!.ingredients.find(i=>i.id==='af_oil')!.allocations.map(a=>a.source.number)).toEqual([1,2]);
 });
 it('keeps different case batches separate, preserves old bag IDs and rejects invalid or repeated case groups',()=>{
  const base={...setup().readiness!.lot.af_oil.value,storageBags:[],nextBagNumber:1};
  const one=addNumberedBag(base,5,'OLD','old-bag');
  const two=addNumberedCases(one,2,25,'BATCH-A','a');const three=addNumberedCases(two,3,20,'BATCH-B','b');
  expect(bagEntryGroups(three.storageBags!).map(g=>g.length)).toEqual([1,2,3]);expect(three.storageBags![0]).toEqual(one.storageBags![0]);
  expect(three.nextBagNumber).toBe(7);expect(storageBagTotal(three.storageBags!)).toBe(115);
  for(const count of [0,-1,1.5,Infinity,10001])expect(()=>addNumberedCases(base,count,25,'B','bad')).toThrow();
  expect(()=>addNumberedCases(base,2,0,'B','bad')).toThrow();expect(()=>addNumberedCases(base,2,25,'','bad')).toThrow();
  expect(()=>addNumberedCases(two,2,25,'BATCH-A','a')).toThrow();
  const corrected=three.storageBags!.map(b=>b.number===3?{...b,batchCode:'CORRECTED'}:b);
  expect(bagEntryGroups(corrected).map(g=>g.length)).toEqual([1,1,1,3]);
 });
 it('links floor Bag 0 and Bag 1 when a single round crosses the boundary',()=>{
  const state=setup();state.readiness!.lot.calcium_chloride.value.floorBalanceKg=0.2;state.readiness!.lot.calcium_chloride.value.floorBatchCodes='FLOOR';
  const round=start('r1',[],state,'D');const line=round.paneerAutomaticTrace!.ingredients.find(i=>i.id==='calcium_chloride')!;
  expect(line.quantity).toBe(400);expect(line.unit).toBe('g');expect(line.allocations.map(a=>a.source.number)).toEqual([0,1]);
  expect(line.allocations.map(a=>a.expectedKg)).toEqual([0.2,0.2]);expect(line.cursorAfter?.remainingKg).toBe(24.8);
  expect(roundIngredientSources(round,'calcium_chloride').flatMap(s=>s.batchCodes)).toEqual(['FLOOR','calcium_chloride-B1']);
 });
 it('automatically accounts for 60 rounds without 60 traceability forms',()=>{
  const state=setup(),rounds:ProductionRound[]=[];
  for(let i=1;i<=60;i++)rounds.push(start('r'+i,rounds,state));
  expect(rounds).toHaveLength(60);expect(rounds.every(r=>r.paneerAutomaticTrace)).toBe(true);
  expect(rounds.reduce((sum,r)=>sum+r.paneerAutomaticTrace!.ingredients.find(i=>i.id==='af_oil')!.quantity,0)).toBe(1200);
  expect(currentPaneerBags(rounds,state,'lot','gdl').remainingKg).toBe(14);
  expect(currentPaneerBags(rounds,state,'lot','calcium_chloride').remainingKg).toBe(1);
  expect(rounds.every(r=>r.outputWeight===0&&!r.packedSkus?.length)).toBe(true);
  expect(rounds[1].paneerAutomaticTrace!.ingredients.find(i=>i.id==='af_oil')!.allocations.map(a=>a.source.number)).toEqual([1,2]);
 });
 it('uses sequence numbers when starts share the same timestamp, and isolates lots and paneer types',()=>{
  const state=setup(),first=start('r2',[],state,'D'),second=start('r1',[first],state,'D');
  expect(second.paneerAutomaticTrace!.sequence).toBe(2);expect(second.paneerAutomaticTrace!.ingredients).toHaveLength(3);
  expect(currentPaneerBags([first,second],state,'lot','gdl').remainingKg).toBe(21.3);
  expect(currentPaneerBags([first,second],state,'other','gdl').source).toBeUndefined();
 });
 it('does not duplicate or retrofit recorded snapshots and never blocks production for missing bag details',()=>{
  const round=start('r1',[],emptyTraceState,'D');expect(round.paneerAutomaticTrace!.ingredients.every(i=>i.warnings.length>0)).toBe(true);
  expect(captureAutomaticPaneer(round,[round],setup(),'someone','later')).toBe(round);
  const legacy=raw('r2');legacy.status='packed';expect(captureAutomaticPaneer(legacy,[],setup(),'staff','later')).toBe(legacy);
  const next=start('r2',[round],setup(),'D');expect(next.paneerAutomaticTrace!.ingredients[0].cursorAfter?.remainingKg).toBeNull();
 });
});
describe('weighed exceptions and audit',()=>{
 const correction=(overrides:Partial<BagCorrectionRequest>={}):BagCorrectionRequest=>({id:'fix',roundId:'r1',ingredientId:'gdl',bagNumber:2,previousBagNumber:1,remainingKg:20,duringRound:true,reason:'Physical bag changed early',...overrides});
 it('links both reported bags without requiring their individual quantities, then resets future calculations',()=>{
  const state=setup(),first=start('r1',[],state);
  const fixed=correctPaneerBag([first],state,correction(),'staff','2026-11-12T07:00:00Z');
  expect(roundIngredientSources(fixed[0],'gdl').map(b=>b.number)).toEqual([1,2]);
  expect(fixed[0].paneerAutomaticTrace).toBe(first.paneerAutomaticTrace);expect(fixed[0].paneerIngredientIssues).toBe(first.paneerIngredientIssues);
  const next=start('r2',fixed,state,'C/S','2026-11-12T08:00:00Z');
  expect(next.paneerAutomaticTrace!.ingredients.find(i=>i.id==='gdl')!.cursorAfter?.remainingKg).toBe(18.15);
  expect(first.paneerBagCorrections).toBeUndefined();
 });
 it('can correct the next bag without relabelling the round just completed; retries are idempotent',()=>{
  const state=setup(),first=start('r1',[],state),request=correction({duringRound:false});
  const fixed=correctPaneerBag([first],state,request,'staff','2026-11-12T07:00:00Z');
  expect(roundIngredientSources(fixed[0],'gdl').map(b=>b.number)).toEqual([1]);
  expect(correctPaneerBag(fixed,state,request,'staff','later')).toBe(fixed);
  expect(()=>correctPaneerBag(fixed,state,{...request,remainingKg:19},'staff','later')).toThrow(/different change/);
 });
 it('flags a recipe correction rather than silently reallocating old bags, and a reweigh restores the estimate',()=>{
  const state=setup(),first=start('r1',[],state);
  const changed=recordPaneerIngredientAllocation({...first,plannedInput:1000,actualInput:1000},'2026-11-12T07:00:00Z','owner','Correct milk volume');
  const next=start('r2',[changed],state,'C/S','2026-11-12T08:00:00Z');
  expect(next.paneerAutomaticTrace!.ingredients.find(i=>i.id==='gdl')!.cursorAfter?.remainingKg).toBeNull();
  const fixed=correctPaneerBag([changed,next],state,correction({roundId:'r2'}),'staff','2026-11-12T09:00:00Z');
  const after=start('r3',fixed,state,'C/S','2026-11-12T10:00:00Z');
  expect(after.paneerAutomaticTrace!.ingredients.find(i=>i.id==='gdl')!.cursorAfter?.remainingKg).toBe(18.15);
 });
 it('rejects negative weights, and records above-nominal physical weights with a review flag',()=>{
  const state=setup(),first=start('r1',[],state);
  expect(()=>correctPaneerBag([first],state,correction({remainingKg:-1}),'staff','later')).toThrow();
  const fixed=correctPaneerBag([first],state,correction({remainingKg:26}),'staff','later');
  expect(fixed[0].paneerBagCorrections![0].warnings?.length).toBe(1);
 });
 it('stops estimating across unknown weights rather than inventing a split',()=>{
  const line={id:'gdl' as const,name:'GDL',quantity:1850,unit:'g' as const};
  const result=allocatePaneerIngredient(line,[{number:0,id:'floor',weightKg:null,batchCodes:['FLOOR'],checkId:'check'}]);
  expect(result.allocations[0].expectedKg).toBeNull();expect(result.cursorAfter?.remainingKg).toBeNull();expect(result.quantity).toBe(1850);
 });
});

describe('stale bag corrections',()=>{
 it('does not reset a balance after another round starts or the bag preparation changes',()=>{
  const state=setup(),first=start('r1',[],state),second=start('r2',[first],state);
  const request:BagCorrectionRequest={id:'stale',roundId:'r1',ingredientId:'gdl',bagNumber:1,remainingKg:3,duringRound:false,reason:'Physical exception',expectedSequence:1,expectedCheckId:'gdl-check'};
  expect(()=>correctPaneerBag([first,second],state,request,'staff','later')).toThrow(/progressed/);
  expect(()=>correctPaneerBag([first],state,{...request,expectedCheckId:'changed-check'},'staff','later')).toThrow(/preparation details changed/);
 });
});
