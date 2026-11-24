// Offline test of the real planning/checklist components and server transition.
import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import {createRequire} from 'node:module';import {pathToFileURL} from 'node:url';import {build} from 'esbuild';
const runtime=path.resolve(process.argv[2]||process.cwd()),require=createRequire(path.join(runtime,'package.json'));
const React=require('react'),{create,act}=require('react-test-renderer');const compiled=path.join(runtime,'.halloumi-ui-check.mjs');
const previousStorage=globalThis.localStorage;globalThis.localStorage={getItem:()=> 'owner'};
let ui;try {
 await build({stdin:{contents:`export {default as Plan} from './src/traceability/LotTracePanel';export {prepareTraceCommand} from './src/traceability/server/commands';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',jsx:'automatic',external:['react','react/jsx-runtime'],outfile:compiled,logLevel:'silent',plugins:[{name:'offline-context',setup(b){b.onResolve({filter:/useTraceability$/},()=>({path:'context',namespace:'offline'}));b.onResolve({filter:/react-router-dom$/},()=>({path:'router',namespace:'offline'}));b.onResolve({filter:/^\.\/print$/},()=>({path:'print',namespace:'offline'}));b.onLoad({filter:/.*/,namespace:'offline'},a=>({contents:a.path==='context'?`export const useTraceability=()=>globalThis.__halloumiUI.context;`:a.path==='router'?`import {createElement} from 'react';export const Link=({children,to})=>createElement('a',{href:to},children);`:`export const printForecast=(...args)=>globalThis.__halloumiUI.printed.push(args);`,loader:'js'}));}}]});
 const {Plan,prepareTraceCommand}=await import(pathToFileURL(compiled).href);
 const lot={id:'plan-lot',lotCode:'241126',traceabilityProductionDate:'2026-11-24',receiptStatus:'planned',litresReceived:0,litresConsumed:0,litresRemaining:0,litresRejected:0,litresSpilled:0};
 let docs={vejoy_traceability:{schema:1,lots:{},rounds:{},prefixes:{}},vejoy_milkLots:[lot],vejoy_productionRounds:[],vejoy_finishedStock:[],vejoy_intermediateLots:[],vejoy_distributionHandovers:[]},seq=0;
 const send=(kind,payload)=>{const out=prepareTraceCommand(docs,{id:'ui-'+(++seq),kind,payload},'Test preparer','owner','2026-11-24T12:00:00Z');docs=out.documents;globalThis.__halloumiUI.context.state=docs.vejoy_traceability;return Promise.resolve(out.result);};
 globalThis.__halloumiUI={printed:[],context:{loaded:true,state:docs.vejoy_traceability,save:(kind,id,value,reason,expectedRevision)=>send('save',{kind,id,value,reason,expectedRevision}),saveChecklist:(lotId,entries,revision,liquidEntries)=>send('checklist',{lotId,entries,revision,liquidEntries})}};
 const text=n=>typeof n==='string'?n:n.children?.map(text).join('')||'';
 const label=prefix=>ui.root.findAllByType('label').find(x=>text(x).trim().startsWith(prefix));
 const change=(prefix,value)=>act(()=>label(prefix).findByType('input').props.onChange({target:{value:String(value)}}));
 const button=name=>ui.root.findAllByType('button').find(x=>text(x)===name);
 act(()=>{ui=create(React.createElement(Plan,{lot}));});
 change('Halloumi rounds',10);assert.equal(label('Halloumi milk volume').findByType('input').props.value,2400);assert.equal(label('Halloumi salt per').findByType('input').props.value,750);
 change('C/S rounds',2);change('Direct rounds',1);assert.ok(text(ui.root).includes('3,900 L planned'));change('C/S rounds',0);change('Direct rounds',0);
 await act(async()=>{await button('Save production plan').props.onClick();});assert.equal(docs.vejoy_traceability.lots[lot.id].value.planHalloumiLitres,2400);assert.equal(docs.vejoy_productionRounds.length,0);
 assert.ok(text(ui.root).includes('Required 7.5 kg'));assert.ok(text(ui.root).includes('Required 150 mL'));
 change('Halloumi salt per',1000);assert.equal(button('Print / download Ingredient checklist').props.disabled,true);
 change('Reason for plan/date correction','Increase salt allowance');await act(async()=>{await button('Save production plan').props.onClick();});
 assert.equal(docs.vejoy_traceability.lots[lot.id].audit.length,2);assert.equal(docs.vejoy_traceability.lots[lot.id].value.halloumiSaltGPer240L,1000);
 change('Person’s name','Test preparer');change('Calcium chloride Bag 0 — floor balance',1.92);change('Calcium chloride Bag 0 — batch','CA-TEST');change('Salt Bag 0 — floor balance',10);change('Salt Bag 0 — batch','S-TEST');change('Rennet floor balance',1000);change('Rennet floor bottle batch','R-TEST');
 for(const name of ['Calcium chloride ready','Salt ready','Rennet ready'])act(()=>label(name).findByType('input').props.onChange({target:{checked:true}}));
 await act(async()=>{await button('Save Ingredient checklist').props.onClick();});
 assert.equal(docs.vejoy_traceability.readiness[lot.id].salt.value.requiredKg,10);assert.equal(docs.vejoy_traceability.liquidReadiness[lot.id].rennet.value.requiredMl,150);assert.ok(text(ui.root).includes('3/3 ready'));assert.equal(button('Print / download Ingredient checklist').props.disabled,false);
 act(()=>button('Print / download Ingredient checklist').props.onClick());assert.equal(globalThis.__halloumiUI.printed.length,1);assert.equal(globalThis.__halloumiUI.printed[0][2].liquidChecks.rennet.value.floorBalanceMl,1000);
 assert.equal(docs.vejoy_milkLots[0],lot);assert.equal(docs.vejoy_productionRounds.length,0);
 // Invalid unsaved draft must show validation instead of crashing a new plan.
 act(()=>ui.unmount());globalThis.__halloumiUI.context.state={schema:1,lots:{},rounds:{},prefixes:{}};act(()=>{ui=create(React.createElement(Plan,{lot}));});change('Halloumi salt per',-1);await act(async()=>{await button('Save production plan').props.onClick();});assert.ok(text(ui.root).includes('zero or positive'));
 console.log(JSON.stringify({roundsAndMilkStayLinked:true,combinedMilkTotalCorrect:true,variableSaltAudited:true,kgAndMlChecklistSavedTogether:true,printingUsesSavedAmounts:true,invalidDraftDoesNotCrash:true,productionWrites:0,networkCalls:0}));
}finally{if(ui)act(()=>ui.unmount());globalThis.localStorage=previousStorage;delete globalThis.__halloumiUI;await fs.unlink(compiled).catch(()=>{});}
