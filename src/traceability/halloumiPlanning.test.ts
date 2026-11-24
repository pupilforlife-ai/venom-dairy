import {describe,it,expect} from 'vitest';
import {halloumiPlanningRecipe} from '../lib/halloumiRecipe';
import {checklistForecast,plannedMilkTotal,changeRecord,emptyTraceState,recordChecklist,recordReadiness,readinessStatus,type TraceState,type IngredientReadiness} from './domain';
import {liquidChecklistForecast,liquidPrepared,liquidStatus,liquidGaps,recordLiquidReadiness,type LiquidIngredientReadiness} from './liquidIngredients';
import {buildForecastPdf} from './print';
import {prepareTraceCommand,type TraceDocuments} from './server/commands';
const plan={productionDate:'2026-11-24',planCsLitres:1000,planDirectLitres:500,planHalloumiLitres:2400,halloumiSaltGPer240L:750};
const state=():TraceState=>({...emptyTraceState,lots:{lot:changeRecord(undefined,plan,'owner','owner','','now','p1')}});
const liquid=(overrides:Partial<LiquidIngredientReadiness>={}):LiquidIngredientReadiness=>({planRevision:'p1',requiredMl:150,floorBalanceMl:50,floorBatchCodes:'R0',containers:[{id:'bottle-1',volumeMl:500,batchCode:'R1'}],supplier:'',responsible:'Packer',onSite:true,checkedBy:'',checkedAt:'',...overrides});
const weighed:IngredientReadiness={planRevision:'p1',requiredKg:3.12,availableKg:25,floorBalanceKg:0,floorBatchCodes:'',storageBags:[{id:'bag',number:1,weightKg:25,batchCode:'C1'}],broughtFromStorageKg:25,supplier:'',supplierProductCode:'',supplierBatches:'C1',responsible:'Packer',onSite:true,checkedBy:'',checkedAt:''};
describe('Halloumi recipe and shared planning',()=>{
 it('calculates ten 240L rounds without confusing grams, kilograms or mL',()=>{
  expect(halloumiPlanningRecipe(2400)).toMatchObject({rounds:10,calciumChlorideKg:1.92,rennetMl:150,saltKg:7.5,calciumWaterLitres:38,rennetWaterLitres:5});
  expect(plannedMilkTotal(plan)).toBe(3900);
  const rows=checklistForecast(1000,500,2400,750);
  expect(rows.find(r=>r.id==='calcium_chloride')).toMatchObject({cs:0.8,direct:0.4,halloumi:1.92,total:3.12,unit:'kg'});
  expect(rows.find(r=>r.id==='salt')).toMatchObject({cs:0,direct:0,halloumi:7.5,total:7.5,unit:'kg'});
  expect(liquidChecklistForecast(plan)).toEqual([{id:'rennet',name:'Rennet',unit:'mL',total:150}]);
  expect(rows.some(r=>r.id==='rennet')).toBe(false);
 });
 it('allows variable salt, zero salt and non-default milk volumes while preserving other ratios',()=>{
  expect(halloumiPlanningRecipe(120,500)).toMatchObject({calciumChlorideKg:0.096,rennetMl:7.5,saltKg:0.25});
  expect(halloumiPlanningRecipe(480,1000)).toMatchObject({calciumChlorideKg:0.384,rennetMl:30,saltKg:2});
  expect(halloumiPlanningRecipe(240,0).saltKg).toBe(0);
  for(const amount of [-1,NaN,Infinity]){expect(()=>halloumiPlanningRecipe(amount)).toThrow();expect(()=>halloumiPlanningRecipe(240,amount)).toThrow();}
 });
 it('keeps legacy paneer-only forecasts, plans and saved checks intact',()=>{
  const legacy={productionDate:'2026-11-24',planCsLitres:500,planDirectLitres:0};
  expect(liquidChecklistForecast(legacy)).toEqual([]);
  expect(checklistForecast(500,0)).toEqual(checklistForecast(500,0,0));
  expect(checklistForecast(0,0)).toEqual([]);
  const old={...emptyTraceState,lots:{lot:changeRecord(undefined,legacy,'owner','owner','','now','p0')}};
  const saved=recordReadiness(old,'lot','calcium_chloride',weighed,'p0','','Packer','staff','now','c0');
  const revised={...saved,lots:{lot:changeRecord(saved.lots.lot,{...legacy,planHalloumiLitres:240},'owner','owner','Added Halloumi','later','p1')}};
  expect(readinessStatus(revised.readiness!.lot.calcium_chloride.value,'p1',0.592)).toBe('Recheck revised plan');
  expect(saved.readiness!.lot.calcium_chloride.value.requiredKg).toBe(0.4);
 });
});
describe('mL ingredient checklist storage and safety',()=>{
 it('records rennet bottles in mL with batch references, server name/time and no fictitious kg fields',()=>{
  const before=state(),result=recordLiquidReadiness(before,'lot',{ingredientId:'rennet',draft:liquid(),expectedCheckId:''},'p1','Packer','staff','time','r1');
  const v=result.liquidReadiness!.lot.rennet.value;
  expect(liquidPrepared(v)).toBe(550);expect(liquidStatus(v,'p1',150)).toBe('Ready');
  expect(v).toMatchObject({requiredMl:150,checkedBy:'Packer',checkedAt:'time',containers:[{id:'bottle-1',volumeMl:500,batchCode:'R1'}]});
  expect('requiredKg' in v).toBe(false);expect('availableKg' in v).toBe(false);expect(before.liquidReadiness).toBeUndefined();expect(result.lots).toBe(before.lots);
 });
 it('preserves incomplete work without false certification and accepts whole bottles above the minimum',()=>{
  const draft=liquid({onSite:false,floorBalanceMl:null,containers:[{id:'b',volumeMl:null,batchCode:''}]});
  const result=recordLiquidReadiness(state(),'lot',{ingredientId:'rennet',draft,expectedCheckId:''},'p1','Packer','staff','time','r1');
  expect(result.liquidReadiness!.lot.rennet.value.containers[0]).toMatchObject({volumeMl:null,batchCode:''});expect(liquidStatus(result.liquidReadiness!.lot.rennet.value,'p1',150)).toBe('Not ready');
  expect(liquidGaps(liquid({floorBalanceMl:0,containers:[{id:'b',volumeMl:149,batchCode:'B'}]}),150).join(' ')).toContain('Shortfall: 1 mL');
  expect(()=>recordLiquidReadiness(state(),'lot',{ingredientId:'rennet',draft:liquid({floorBalanceMl:0,containers:[],requiredMl:0.001}),expectedCheckId:''},'p1','Packer','staff','time','r1')).toThrow('Shortfall');
 });
 it('rejects stale revisions, invalid quantities, duplicate bottles and unauthorized supplier edits',()=>{
  const save=(draft=liquid(),revision='p1',s=state(),expectedCheckId='')=>recordLiquidReadiness(s,'lot',{ingredientId:'rennet',draft,expectedCheckId},revision,'Packer','staff','time','r1');
  expect(()=>save(liquid(),'old')).toThrow('plan changed');
  for(const volume of [-1,NaN,Infinity])expect(()=>save(liquid({floorBalanceMl:volume,onSite:false}))).toThrow('mL');
  expect(()=>save(liquid({containers:[{id:'b',volumeMl:100,batchCode:'A'},{id:'b',volumeMl:100,batchCode:'B'}]}))).toThrow('own entry');
  expect(()=>save(liquid({supplier:'Another supplier'}))).toThrow('Owner/Admin');
  const first=save();expect(()=>save(liquid(),'p1',first)).toThrow('changed elsewhere');
  expect(()=>recordLiquidReadiness(first,'lot',{ingredientId:'rennet',draft:liquid(),expectedCheckId:'r1'},'p1','other','staff','later','r2')).toThrow('original checker');
 });
 it('saves kg and mL preparation atomically, retains other lots and supports older clients',()=>{
  const before=state();const saved=recordChecklist(before,'lot',[{ingredientId:'calcium_chloride',draft:weighed,expectedCheckId:''}],'p1','Packer','staff','time','check',[{ingredientId:'rennet',draft:liquid(),expectedCheckId:''}]);
  expect(saved.readiness!.lot.calcium_chloride.value.requiredKg).toBe(3.12);expect(saved.liquidReadiness!.lot.rennet.value.requiredMl).toBe(150);
  expect(before.readiness).toBeUndefined();expect(before.liquidReadiness).toBeUndefined();
  expect(()=>recordChecklist(before,'lot',[{ingredientId:'calcium_chloride',draft:weighed,expectedCheckId:''}],'p1','Packer','staff','time','failed',[{ingredientId:'rennet',draft:liquid({floorBalanceMl:-1}),expectedCheckId:''}])).toThrow();
  expect(before.readiness).toBeUndefined();
  const oldClient=recordChecklist(saved,'lot',[],'p1','Packer','staff','later','legacy');expect(oldClient.liquidReadiness).toBe(saved.liquidReadiness);
 });
 it('uses the same server command and preserves actual production documents',()=>{
  const d:TraceDocuments={vejoy_traceability:state(),vejoy_milkLots:[{id:'lot',lotCode:'241126'} as TraceDocuments['vejoy_milkLots'][number]],vejoy_productionRounds:[],vejoy_intermediateLots:[],vejoy_distributionHandovers:[],vejoy_finishedStock:[]};
  const before=JSON.stringify(d),result=prepareTraceCommand(d,{id:'hall-check',kind:'checklist',payload:{lotId:'lot',revision:'p1',entries:[{ingredientId:'salt',draft:{...weighed,requiredKg:7.5},expectedCheckId:''}],liquidEntries:[{ingredientId:'rennet',draft:liquid(),expectedCheckId:''}]}},'Packer','staff','time').documents;
  expect(result.vejoy_traceability.readiness!.lot.salt.value.requiredKg).toBe(7.5);expect(result.vejoy_traceability.liquidReadiness!.lot.rennet.value.requiredMl).toBe(150);
  expect(result.vejoy_productionRounds).toBe(d.vejoy_productionRounds);expect(result.vejoy_milkLots).toBe(d.vejoy_milkLots);expect(JSON.stringify(d)).toBe(before);
 });
 it('prints the same Halloumi amounts, editable salt allowance and mL units',()=>{
  const pdf=buildForecastPdf('241126',{...plan,planCsLitres:0,planDirectLitres:0});const text=pdf.output();
  for(const part of ['Halloumi 2,400 L','750 g per 240 L','1.92 kg','7.5 kg','150 mL','Rennet'])expect(text).toContain(part);
 });
});
