// Offline form lifecycle check; no browser, credentials, network or production writes.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
const runtime=path.resolve(process.argv[2]||process.cwd()),require=createRequire(path.join(runtime,'package.json'));
const React=require('react'),{create,act}=require('react-test-renderer');
const compiled=path.join(runtime,'.milk-rejection-ui-check.mjs');
let calls=[],resolve,reject,closed=0;
globalThis.__milkRejectionTest={toast:()=>{},save:(kind,payload)=>{calls.push({kind,payload});return new Promise((a,b)=>{resolve=a;reject=b;});}};
try {
 await build({entryPoints:['src/components/MilkRejectionModal.tsx'],bundle:true,platform:'node',format:'esm',jsx:'automatic',external:['react','react/jsx-runtime'],outfile:compiled,logLevel:'silent',plugins:[{name:'offline-ui',setup(b){b.onResolve({filter:/(?:^|\/)(Modal|Toast|transport)$/},a=>({path:a.path.split('/').at(-1),namespace:'offline'}));b.onLoad({filter:/.*/,namespace:'offline'},a=>({contents:a.path==='Modal'?`import {createElement} from 'react';export const Modal=({children,title})=>createElement('section',{'aria-label':title},children);`:a.path==='Toast'?`export const useToast=()=>({showToast:globalThis.__milkRejectionTest.toast});`:`export const runTraceCommand=(...args)=>globalThis.__milkRejectionTest.save(...args);`,loader:'js'}));}}]});
 const {MilkRejectionModal}=await import(pathToFileURL(compiled).href);
 const lot={id:'milk',lotCode:'191126',receiptStatus:'received',status:'completed',litresReceived:26000,litresConsumed:0,litresRejected:0,litresSpilled:0,litresRemaining:26000};
 let ui;act(()=>{ui=create(React.createElement(MilkRejectionModal,{lot,rounds:[],onClose:()=>closed++}));});
 assert.equal(ui.root.findByProps({'aria-label':'Rejected milk litres'}).props.value,'26000');
 const button=()=>ui.root.findAllByType('button')[0];
 await act(async()=>{await button().props.onClick();});assert.equal(calls.length,0,'Missing reason must not save');
 act(()=>ui.root.findByType('textarea').props.onChange({target:{value:'Rejected for quality'}}));
 let pending;act(()=>{pending=button().props.onClick();});assert.equal(calls.length,1);assert.equal(closed,0,'Do not close before server confirmation');assert.equal(button().props.disabled,true);
 await act(async()=>{await button().props.onClick();});assert.equal(calls.length,1,'Double click must not duplicate request');
 await act(async()=>{resolve(null);await pending;});assert.equal(closed,1);assert.equal(calls[0].kind,'milk_rejection');assert.equal(calls[0].payload.quantity,26000);
 act(()=>ui.unmount());act(()=>{ui=create(React.createElement(MilkRejectionModal,{lot,rounds:[],onClose:()=>closed++}));});
 act(()=>ui.root.findByType('textarea').props.onChange({target:{value:'Rejected for quality'}}));
 act(()=>{pending=button().props.onClick();});await act(async()=>{reject(Error('Server save not confirmed; retry'));await pending;});
 assert.equal(closed,1,'Failed save must leave form open');assert.equal(button().props.disabled,false);assert.ok(ui.root.findByProps({role:'alert'}).children.join('').includes('not confirmed'));assert.equal(ui.root.findByType('textarea').props.value,'Rejected for quality');
 act(()=>ui.unmount());console.log(JSON.stringify({wholeLotDefault:true,missingReasonBlocked:true,doubleClickSafe:true,closesOnlyAfterConfirmation:true,failedSaveRetainsForm:true,networkCalls:0,productionWrites:0}));
}finally{delete globalThis.__milkRejectionTest;await fs.unlink(compiled).catch(()=>{});}
