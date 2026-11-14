import { describe,it,expect } from 'vitest';
import { checklistForecast, forecast, changeRecord, emptyTraceState, planRevision, recordReadiness, readinessStatus, type IngredientReadiness, type TraceState } from './domain';
const plan={productionDate:'2026-11-20',planCsLitres:500,planDirectLitres:0};
function initial():TraceState{return {...emptyTraceState,lots:{future:changeRecord(undefined,plan,'owner','owner','','now','p1')}};}
const draft:IngredientReadiness={planRevision:'p1',requiredKg:0.4,availableKg:0.4,supplier:'',supplierProductCode:'CA',supplierBatches:'B1, B2',responsible:'Jane',onSite:true,checkedBy:'',checkedAt:''};
describe('ingredient checklist planning and readiness',()=>{
 it('shows only kg for checklists while round recipes remain g except AF oil',()=>{
  const by=Object.fromEntries(checklistForecast(500,0).map(r=>[r.id,r]));
  expect(Object.values(by).every(r=>r.unit==='kg')).toBe(true);
  expect(by.calcium_chloride.total).toBe(0.4);expect(by.gdl.total).toBe(1.85);expect(by.potassium_sorbate.total).toBe(0.25);expect(by.fis.total).toBe(0.835);expect(by.af_oil.total).toBe(20);
  expect(forecast(500,0).find(r=>r.id==='gdl')).toMatchObject({total:1850,unit:'g'});
  expect(checklistForecast(0,500).map(r=>r.id)).not.toContain('af_oil');
  expect(checklistForecast(4000,0).find(r=>r.id==='af_oil')?.total).toBe(160);
 });
 it('keeps shared ingredients from both milk types in the same kg total',()=>{
  const by=Object.fromEntries(checklistForecast(1000,500).map(r=>[r.id,r]));
  expect(by.calcium_chloride.total).toBe(1.2);expect(by.gdl.total).toBe(5.55);expect(by.fis.total).toBe(1.67);
 });
 it('saves a named timed check before milk receiving without touching source records',()=>{
  const before=initial(),after=recordReadiness(before,'future','calcium_chloride',draft,'p1','','staff','staff','time','c1');
  const value=after.readiness!.future.calcium_chloride.value;
  expect(value.checkedBy).toBe('staff');expect(value.checkedAt).toBe('time');expect(readinessStatus(value,'p1',0.4)).toBe('Ready');
  expect(after.lots).toBe(before.lots);expect(after.rounds).toBe(before.rounds);expect(before.readiness).toBeUndefined();
 });
 it('records incomplete preparation without falsely confirming ready',()=>{
  const after=recordReadiness(initial(),'future','calcium_chloride',{...draft,onSite:false,availableKg:null,supplierBatches:''},'p1','','staff','staff','time','c1');
  expect(readinessStatus(after.readiness!.future.calcium_chloride.value,'p1',0.4)).toBe('Not ready');
  expect(()=>recordReadiness(initial(),'future','calcium_chloride',{...draft,availableKg:0.3},'p1','','staff','staff','time','c1')).toThrow();
  expect(()=>recordReadiness(initial(),'future','calcium_chloride',{...draft,supplierBatches:''},'p1','','staff','staff','time','c1')).toThrow();
 });
 it('marks a shortfall and preserves old confirmation after a plan increases',()=>{
  const before=recordReadiness(initial(),'future','calcium_chloride',draft,'p1','','staff','staff','time','c1');
  const next={...before,lots:{future:changeRecord(before.lots.future,{...plan,planCsLitres:1000},'owner','owner','more milk','later','p2')}};
  expect(readinessStatus(next.readiness!.future.calcium_chloride.value,planRevision(next.lots.future),0.8)).toBe('Shortfall');
  expect(next.readiness!.future.calcium_chloride.audit).toHaveLength(1);
  expect(()=>recordReadiness(next,'future','calcium_chloride',draft,'p1','c1','staff','staff','later','c2')).toThrow(/plan changed/);
  const checked=recordReadiness(next,'future','calcium_chloride',{...draft,availableKg:0.8},'p2','c1','staff','staff','later','c2');
  expect(checked.readiness!.future.calcium_chloride.audit).toHaveLength(2);
  expect(checked.readiness!.future.calcium_chloride.audit[1].before).toMatchObject({requiredKg:0.4});
 });
 it('requires rechecking a reduced plan and rejects stale/retried writes',()=>{
  const before=recordReadiness(initial(),'future','calcium_chloride',draft,'p1','','staff','staff','time','c1');
  expect(readinessStatus(before.readiness!.future.calcium_chloride.value,'p2',0.2)).toBe('Recheck revised plan');
  expect(()=>recordReadiness(before,'future','calcium_chloride',draft,'p1','','staff','staff','time','retry')).toThrow(/changed elsewhere/);
  expect(()=>recordReadiness(before,'future','calcium_chloride',draft,'p1','c1','other staff','staff','time','c2')).toThrow();
  expect(()=>recordReadiness(before,'another-lot','calcium_chloride',draft,'p1','','staff','staff','time','c2')).toThrow();
 });
});

describe('factory-floor balances and withdrawals',()=>{
 it('calculates the top-up, including zero floor balance and excess floor stock',async()=>{
  const {storageTopUp}=await import('./domain');
  expect(storageTopUp(20,3)).toBe(17);expect(storageTopUp(20,0)).toBe(20);expect(storageTopUp(20,25)).toBe(0);
  expect(storageTopUp(1.85,0.15)).toBe(1.7);expect(storageTopUp(20,null)).toBeNull();
  expect(()=>storageTopUp(20,-1)).toThrow();expect(()=>storageTopUp(20,NaN)).toThrow();
 });
 it('uses weighed floor balance plus actual withdrawal, never an asserted available total',async()=>{
  const {preparedQuantity}=await import('./domain');
  const before=initial();
  const row={...draft,availableKg:999,floorBalanceKg:0.1,broughtFromStorageKg:0.3,supplier:''};
  const next=recordReadiness(before,'future','calcium_chloride',row,'p1','','staff','staff','now','c1');
  expect(preparedQuantity(next.readiness!.future.calcium_chloride.value)).toBe(0.4);
  expect(next.readiness!.future.calcium_chloride.value.availableKg).toBe(0.4);
  expect(readinessStatus(next.readiness!.future.calcium_chloride.value,'p1',0.4)).toBe('Ready');
  expect(()=>recordReadiness(before,'future','calcium_chloride',{...row,broughtFromStorageKg:0.2},'p1','','staff','staff','now','c1')).toThrow();
  expect(()=>recordReadiness(before,'future','calcium_chloride',{...row,floorBalanceKg:null},'p1','','staff','staff','now','c1')).toThrow();
 });
 it('permits extra physical withdrawals, while supplier names can be added only by owner/admin',()=>{
  const row={...draft,availableKg:null,floorBalanceKg:0.1,broughtFromStorageKg:0.4,supplier:''};
  const next=recordReadiness(initial(),'future','calcium_chloride',row,'p1','','staff','staff','now','c1');
  expect(next.readiness!.future.calcium_chloride.value.availableKg).toBe(0.5);
  expect(()=>recordReadiness(next,'future','calcium_chloride',{...row,supplier:'New supplier'},'p1','c1','staff','staff','later','c2')).toThrow(/owner\/admin/);
  const owner=recordReadiness(next,'future','calcium_chloride',{...row,supplier:'New supplier'},'p1','c1','owner','owner','later','c2');
  expect(owner.readiness!.future.calcium_chloride.audit).toHaveLength(2);
  expect(owner.readiness!.future.calcium_chloride.value.checkedBy).toBe('staff');
  expect(owner.readiness!.future.calcium_chloride.value.checkedAt).toBe('now');
  expect(owner.readiness!.future.calcium_chloride.audit[0].after).toMatchObject({supplier:''});
 });
 it('saves a checklist atomically and never changes other lots or actual consumption',async()=>{
  const {recordChecklist}=await import('./domain');
  const before=initial(),rows=[{ingredientId:'calcium_chloride',draft:{...draft,supplier:'',floorBalanceKg:0.1,broughtFromStorageKg:0.3},expectedCheckId:''},{ingredientId:'gdl',draft:{...draft,supplier:'',floorBalanceKg:0.5,broughtFromStorageKg:1.35},expectedCheckId:''}];
  const next=recordChecklist(before,'future',rows,'p1','staff','staff','now','all');
  expect(Object.keys(next.readiness!.future)).toHaveLength(2);expect(before.readiness).toBeUndefined();expect(next.rounds).toBe(before.rounds);
  expect(()=>recordChecklist(before,'future',[rows[0],{...rows[1],draft:{...rows[1].draft,broughtFromStorageKg:0}}],'p1','staff','staff','now','bad')).toThrow();
  expect(before.readiness).toBeUndefined();
  expect(()=>recordChecklist(next,'future',rows,'p1','staff','staff','now','retry')).toThrow(/changed elsewhere/);
 });
 it('retains older available-total checks without inventing floor measurements',async()=>{
  const {preparedQuantity}=await import('./domain');
  expect(preparedQuantity(draft)).toBe(0.4);expect(draft.floorBalanceKg).toBeUndefined();
 });
});

describe('optional checklist product code',()=>{
 it('allows confirming readiness without a product code, while still requiring the batch/lot code',()=>{
  const row={...draft,supplierProductCode:'',floorBalanceKg:0.1,broughtFromStorageKg:0.3};
  const next=recordReadiness(initial(),'future','calcium_chloride',row,'p1','','staff','staff','now','no-product-code');
  expect(next.readiness!.future.calcium_chloride.value.supplierProductCode).toBe('');
  expect(readinessStatus(next.readiness!.future.calcium_chloride.value,'p1',0.4)).toBe('Ready');
  expect(()=>recordReadiness(initial(),'future','calcium_chloride',{...row,supplierBatches:''},'p1','','staff','staff','now','no-batch')).toThrow(/batch\/lot/);
 });
});

describe('whole bags with individual batch codes',()=>{
 it('records two whole 25 kg bags with different codes even when the requirement is only 0.2 kg',async()=>{
  const {storageBagTotal,preparationBatchCodes}=await import('./domain');
  const before=initial();before.lots.future=changeRecord(undefined,{...plan,planCsLitres:250},'owner','owner','','now','p1');
  const row={...draft,supplierProductCode:'',floorBalanceKg:0,floorBatchCodes:'',storageBags:[{id:'bag1',weightKg:25,batchCode:'LOT-A'},{id:'bag2',weightKg:25,batchCode:'LOT-B'}]};
  const next=recordReadiness(before,'future','calcium_chloride',row,'p1','','staff','staff','now','bags');
  const saved=next.readiness!.future.calcium_chloride.value;
  expect(saved.requiredKg).toBe(0.2);expect(saved.broughtFromStorageKg).toBe(50);expect(saved.availableKg).toBe(50);
  expect(storageBagTotal(saved.storageBags!)).toBe(50);expect(preparationBatchCodes(saved)).toEqual(['LOT-A','LOT-B']);
  expect(saved.storageBags).toHaveLength(2);expect(next.rounds).toBe(before.rounds);
 });
 it('requires each bag code and keeps the floor batch separate',async()=>{
  const {preparationBatchCodes}=await import('./domain');
  const row={...draft,floorBalanceKg:0.1,floorBatchCodes:'OPEN-BATCH',storageBags:[{id:'bag1',weightKg:5,batchCode:'BAG-BATCH'}]};
  const next=recordReadiness(initial(),'future','calcium_chloride',row,'p1','','staff','staff','now','bags');
  expect(preparationBatchCodes(next.readiness!.future.calcium_chloride.value)).toEqual(['OPEN-BATCH','BAG-BATCH']);
  expect(()=>recordReadiness(initial(),'future','calcium_chloride',{...row,storageBags:[{...row.storageBags[0],batchCode:''}]},'p1','','staff','staff','now','bad')).toThrow(/Calcium chloride: Enter weight and batch\/lot code/);
  expect(()=>recordReadiness(initial(),'future','calcium_chloride',{...row,floorBatchCodes:''},'p1','','staff','staff','now','bad')).toThrow();
 });
 it('does not count duplicate batch codes twice and rejects duplicate bag identities or invalid weights',async()=>{
  const {storageBagTotal,preparationBatchCodes}=await import('./domain');
  const row={...draft,floorBalanceKg:0,floorBatchCodes:'',storageBags:[{id:'a',weightKg:20,batchCode:'SAME'},{id:'b',weightKg:5,batchCode:'SAME'}]};
  expect(storageBagTotal(row.storageBags)).toBe(25);expect(preparationBatchCodes(row)).toEqual(['SAME']);
  expect(()=>recordReadiness(initial(),'future','calcium_chloride',{...row,storageBags:[row.storageBags[0],row.storageBags[0]]},'p1','','staff','staff','now','bad')).toThrow(/separate entry/);
  expect(()=>recordReadiness(initial(),'future','calcium_chloride',{...row,storageBags:[{id:'a',weightKg:-25,batchCode:'A'}]},'p1','','staff','staff','now','bad')).toThrow();
  expect(storageBagTotal([{id:'a',weightKg:null,batchCode:'A'}])).toBeNull();
 });
 it('preserves old aggregate transfers until an explicit audited bag breakdown is recorded',()=>{
  const before=recordReadiness(initial(),'future','calcium_chloride',draft,'p1','','staff','staff','now','legacy');
  expect(before.readiness!.future.calcium_chloride.value.storageBags).toBeUndefined();
  const next=recordReadiness(before,'future','calcium_chloride',{...draft,floorBalanceKg:0,floorBatchCodes:'',storageBags:[{id:'a',weightKg:5,batchCode:'NEW'}]},'p1','legacy','staff','staff','later','bags');
  expect(next.readiness!.future.calcium_chloride.audit[0].after).toMatchObject({availableKg:0.4,supplierBatches:'B1, B2'});
  expect(next.readiness!.future.calcium_chloride.value.broughtFromStorageKg).toBe(5);
 });
});

describe('save incomplete checklist progress without claiming readiness',()=>{
 it('saves the reported FIS example with an 18 kg shortfall and retains other ready checks',async()=>{
  const {readinessProgress,recordChecklist,preparedQuantity}=await import('./domain');
  const before=initial();before.lots.future=changeRecord(undefined,{...plan,planCsLitres:20000},'owner','owner','','now','p1');
  const fis={...draft,requiredKg:33.4,availableKg:null,floorBalanceKg:3.4,floorBatchCodes:'232324',storageBags:[{id:'f1',number:1,weightKg:4,batchCode:'2424134'},{id:'f2',number:2,weightKg:4,batchCode:'2424134'},{id:'f3',number:3,weightKg:4,batchCode:'2424134'}]};
  const oil={...draft,availableKg:null,floorBalanceKg:250,floorBatchCodes:'OIL-0',storageBags:Array.from({length:22},(_,i)=>({id:'o'+i,number:i+1,weightKg:25,batchCode:'OIL-1'}))};
  const fisProgress=readinessProgress(fis,33.4),oilProgress=readinessProgress(oil,800);
  expect(fisProgress.gaps).toEqual(['Shortfall: 18 kg (15.4 kg prepared / 33.4 kg required).']);
  const next=recordChecklist(before,'future',[{ingredientId:'fis',draft:fisProgress.value,expectedCheckId:''},{ingredientId:'af_oil',draft:oilProgress.value,expectedCheckId:''}],'p1','staff','staff','now','progress');
  const saved=next.readiness!.future.fis.value;expect(saved.onSite).toBe(false);expect(preparedQuantity(saved)).toBe(15.4);expect(saved.storageBags).toEqual(fis.storageBags);expect(saved.floorBatchCodes).toBe(fis.floorBatchCodes);
  expect(readinessStatus(saved,'p1',33.4)).toBe('Shortfall');expect(next.readiness!.future.af_oil.value.onSite).toBe(true);
  expect(next.rounds).toBe(before.rounds);expect(before.readiness).toBeUndefined();
  expect(()=>recordReadiness(before,'future','fis',fis,'p1','','staff','staff','now','false-confirmation')).toThrow(/FIS: Shortfall: 18 kg/);
 });
 it('preserves missing bag details as pending, without inventing codes, zeroes or quantities',async()=>{
  const {readinessProgress}=await import('./domain');
  const row={...draft,floorBalanceKg:null,storageBags:[{id:'unknown',number:1,weightKg:null,batchCode:''}]};
  const progress=readinessProgress(row,0.4);expect(progress.value.onSite).toBe(false);expect(progress.value.floorBalanceKg).toBeNull();expect(progress.value.storageBags).toEqual(row.storageBags);
  const next=recordReadiness(initial(),'future','calcium_chloride',progress.value,'p1','','staff','staff','now','pending');
  expect(next.readiness!.future.calcium_chloride.value.availableKg).toBeNull();expect(readinessStatus(next.readiness!.future.calcium_chloride.value,'p1',0.4)).toBe('Not ready');
 });
 it('still rejects invalid weights and stale writes when saving progress',async()=>{
  const {readinessProgress}=await import('./domain');
  const invalid=readinessProgress({...draft,floorBalanceKg:-1,storageBags:[]},0.4).value;
  expect(()=>recordReadiness(initial(),'future','calcium_chloride',invalid,'p1','','staff','staff','now','invalid')).toThrow(/zero or positive/);
  const partial=readinessProgress({...draft,floorBalanceKg:0,storageBags:[]},0.4).value;
  const next=recordReadiness(initial(),'future','calcium_chloride',partial,'p1','','staff','staff','now','first');
  expect(()=>recordReadiness(next,'future','calcium_chloride',partial,'p1','','staff','staff','later','stale')).toThrow(/changed elsewhere/);
 });
});
