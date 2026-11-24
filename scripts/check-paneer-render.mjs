// Offline React lifecycle regression. No browser, network or production writes.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
const root=process.cwd(),runtime=path.resolve(process.argv[2]||root),require=createRequire(path.join(runtime,'package.json'));
const React=require('react'),{create,act}=require('react-test-renderer');
const compiled=path.join(runtime,'.paneer-render-check.mjs');
await build({stdin:{contents:`export {PaneerCountdown} from './src/components/PaneerCountdown';export {PaneerBoardView,usePhonePaneerBoard} from './src/components/PaneerBoardView';`,resolveDir:root,loader:'ts'},bundle:true,platform:'node',format:'esm',jsx:'automatic',external:['react','react/jsx-runtime'],outfile:compiled,logLevel:'silent'});
const {PaneerCountdown,PaneerBoardView,usePhonePaneerBoard}=await import(pathToFileURL(compiled).href+'?v='+Date.now());
const realNow=Date.now,realInterval=globalThis.setInterval,realClear=globalThis.clearInterval,realWindow=globalThis.window;
let now=Date.parse('2026-11-24T08:00:00Z'),sequence=0;const intervals=new Map();
Date.now=()=>now;globalThis.setInterval=(callback)=>{const id=++sequence;intervals.set(id,callback);return id;};globalThis.clearInterval=id=>intervals.delete(id);
const tick=ms=>act(()=>{now+=ms;for(const f of [...intervals.values()])f();});
try{
 let boardRenders=0,untimedRenders=0;
 function Untimed(){untimedRenders++;return React.createElement('span',null,'Round weights and packing');}
 function Board(){boardRenders++;return React.createElement('section',null,React.createElement(Untimed),React.createElement(PaneerCountdown,{round:{status:'pressing',pressingStartedAt:'2026-11-24T07:30:05Z'}},seconds=>React.createElement('output',null,seconds?String(seconds):'Ready for Cooling')));}
 let renderer;act(()=>{renderer=create(React.createElement(Board));});
 assert.equal(renderer.root.findByType('output').children[0],'5');
 for(let i=0;i<5;i++)tick(1000);
 assert.equal(renderer.root.findByType('output').children[0],'Ready for Cooling');
 assert.equal(boardRenders,1,'Timer ticks must not redraw the board');assert.equal(untimedRenders,1,'Timer ticks must not redraw unrelated round fields');assert.equal(intervals.size,0,'Completed timers stop ticking');
 act(()=>renderer.unmount());
 let mediaMatches=false,listener;globalThis.window={matchMedia:()=>({get matches(){return mediaMatches},addEventListener:(type,fn)=>{listener=fn},removeEventListener:()=>{listener=undefined}})};
 const counts={phone:0,desktop:0};
 function Draft({name}){const [value,setValue]=React.useState('');counts[name]++;return React.createElement('input',{name,value,onChange:e=>setValue(e.target.value)});}
 function Responsive(){const phone=usePhonePaneerBoard();return React.createElement('section',null,React.createElement(PaneerBoardView,{active:phone},React.createElement(Draft,{name:'phone'})),React.createElement(PaneerBoardView,{active:!phone},React.createElement(Draft,{name:'desktop'})));}
 act(()=>{renderer=create(React.createElement(Responsive));});
 assert.equal(counts.phone,0,'Phone tree must not mount on desktop');assert.equal(renderer.root.findAllByType('input').length,1);
 act(()=>renderer.root.findAllByType('input').find(x=>x.props.name==='desktop').props.onChange({target:{value:'unsaved desktop correction'}}));
 act(()=>{mediaMatches=true;listener();});assert.equal(renderer.root.findAllByType('input').length,2,'Visited desktop draft must remain mounted');
 act(()=>renderer.root.findAllByType('input').find(x=>x.props.name==='phone').props.onChange({target:{value:'unsaved phone cutting details'}}));
 act(()=>{mediaMatches=false;listener();});assert.equal(renderer.root.findAllByType('input').find(x=>x.props.name==='desktop').props.value,'unsaved desktop correction');
 act(()=>{mediaMatches=true;listener();});assert.equal(renderer.root.findAllByType('input').find(x=>x.props.name==='phone').props.value,'unsaved phone cutting details');
 act(()=>renderer.unmount());assert.equal(listener,undefined);
 console.log(JSON.stringify({boardRendersDuringFiveCountdownTicks:boardRenders,unrelatedFieldRenders:untimedRenders,expiredTimersStopped:true,hiddenLayoutInitiallyUnmounted:true,phoneAndDesktopDraftsPreservedAcrossResize:true,productionWrites:0}));
}finally{Date.now=realNow;globalThis.setInterval=realInterval;globalThis.clearInterval=realClear;globalThis.window=realWindow;await fs.unlink(compiled).catch(()=>{});}
