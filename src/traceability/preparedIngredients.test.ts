import { describe,it,expect } from 'vitest';
import { applyPreparedSource, fillUnambiguousPreparedSources, preparedIngredientSources } from './preparedIngredients';
import { changeRecord, emptyTraceState, ingredientTemplate, type IngredientReadiness, type TraceState } from './domain';
function state(batch='BATCH-1',ready=true):TraceState {
 const plan=changeRecord(undefined,{productionDate:'2026-11-11',planCsLitres:500,planDirectLitres:0},'owner','owner','','now','p1');
 const check:IngredientReadiness={planRevision:'p1',requiredKg:0.4,availableKg:0.4,floorBalanceKg:0.1,broughtFromStorageKg:0.3,supplier:'Owner-entered supplier',supplierProductCode:'',supplierBatches:batch,responsible:'Jane',onSite:ready,checkedBy:'Jane',checkedAt:'now'};
 return {...emptyTraceState,lots:{lot:plan},readiness:{lot:{calcium_chloride:changeRecord(undefined,check,'Jane','staff','','now','check1')}}};
}
describe('prepared ingredient references on paneer rounds',()=>{
 it('copies a single ready batch code but never converts planned quantities into consumption',()=>{
  const original=ingredientTemplate('D',500),next=fillUnambiguousPreparedSources(original,state(),'lot');
  expect(next[0].supplierBatch).toBe('BATCH-1');expect(next[0].supplierProductCode).toBe('');expect(next[0].quantity).toBeNull();
  expect(next[0].preparation).toMatchObject({lotId:'lot',checkId:'check1',planRevision:'p1',batchCode:'BATCH-1'});
  expect(original[0].supplierBatch).toBe('');expect(next[1]).toBe(original[1]);
 });
 it('never replaces existing actual references or changes a recorded amount',()=>{
  const use={...ingredientTemplate('D',500)[0],supplierBatch:'MANUAL',quantity:399};
  expect(fillUnambiguousPreparedSources([use],state(),'lot')[0]).toBe(use);
  const blank={...use,supplierBatch:''},next=fillUnambiguousPreparedSources([blank],state(),'lot')[0];
  expect(next.quantity).toBe(399);
 });
 it('requires an explicit batch choice for multiple prepared codes and preserves punctuation within codes',()=>{
  const s=state('B-1; B-2\nB-1, BATCH 3/26'),options=preparedIngredientSources(s,'lot','calcium_chloride');
  expect(options.map(x=>x.batchCode)).toEqual(['B-1','B-2','BATCH 3/26']);
  const use=ingredientTemplate('D',500)[0];expect(fillUnambiguousPreparedSources([use],s,'lot')[0]).toBe(use);
  expect(applyPreparedSource(use,options[1]).supplierBatch).toBe('B-2');
 });
 it('does not auto-select unconfirmed or revised-plan preparations',()=>{
  const use=ingredientTemplate('D',500)[0];expect(fillUnambiguousPreparedSources([use],state('B1',false),'lot')[0]).toBe(use);
  const s=state();s.lots.lot=changeRecord(s.lots.lot,{...s.lots.lot.value,planCsLitres:1000},'owner','owner','plan increase','later','p2');
  expect(preparedIngredientSources(s,'lot','calcium_chloride')[0].status).toBe('Recheck revised plan');
  expect(fillUnambiguousPreparedSources([use],s,'lot')[0]).toBe(use);
 });
 it('keeps milk lots and ingredients isolated',()=>{
  expect(preparedIngredientSources(state(),'other-lot','calcium_chloride')).toEqual([]);
  expect(preparedIngredientSources(state(),'lot','gdl')).toEqual([]);
  expect(()=>applyPreparedSource(ingredientTemplate('D',500)[1],preparedIngredientSources(state(),'lot','calcium_chloride')[0])).toThrow();
 });
 it('keeps the actual round snapshot unchanged when the preparation record is corrected later',()=>{
  const s=state(),actual=fillUnambiguousPreparedSources(ingredientTemplate('D',500),s,'lot')[0];
  s.readiness!.lot.calcium_chloride=changeRecord(s.readiness!.lot.calcium_chloride,{...s.readiness!.lot.calcium_chloride.value,supplierBatches:'NEW-BATCH'},'owner','owner','correct source','later','check2');
  expect(actual.supplierBatch).toBe('BATCH-1');expect(actual.preparation?.checkId).toBe('check1');
  expect(s.readiness!.lot.calcium_chloride.audit[0].after).toMatchObject({supplierBatches:'BATCH-1'});
 });
});

describe('bag batch selection by production rounds',()=>{
 it('offers each distinct bag and floor batch without automatically choosing among them',()=>{
  const s=state();s.readiness!.lot.calcium_chloride.value={...s.readiness!.lot.calcium_chloride.value,floorBalanceKg:0.1,floorBatchCodes:'FLOOR',storageBags:[{id:'a',weightKg:25,batchCode:'BAG-A'},{id:'b',weightKg:25,batchCode:'BAG-B'}]};
  const options=preparedIngredientSources(s,'lot','calcium_chloride');expect(options.map(x=>x.batchCode)).toEqual(['FLOOR','BAG-A','BAG-B']);
  const use=ingredientTemplate('D',500)[0];expect(fillUnambiguousPreparedSources([use],s,'lot')[0]).toBe(use);
  expect(applyPreparedSource(use,options[2]).supplierBatch).toBe('BAG-B');expect(use.quantity).toBeNull();
 });
});
