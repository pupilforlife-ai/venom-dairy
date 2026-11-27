// Actual hook lifecycle checks with an offline Supabase adapter. No production calls.
import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import {build} from 'esbuild';import {createRequire} from 'node:module';import {pathToFileURL} from 'node:url';
const root=process.cwd(),runtime=path.resolve(process.argv[2]||root),require=createRequire(path.join(runtime,'package.json'));
const React=require('react'),{create,act}=require('react-test-renderer'),file=path.join(runtime,'.save-sync-check.mjs');
const savedWindow=globalThis.window,savedClient=globalThis.__saveSyncClient;let server,listeners,live,reads,writes,cacheWrites,renders,value,setValue,writeHandler;
const clone=x=>structuredClone(x),flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve()};
globalThis.window={localStorage:{getItem:()=>null,setItem:()=>cacheWrites++},addEventListener:(name,cb)=>listeners.set(name,cb),removeEventListener:name=>listeners.delete(name)};
globalThis.__saveSyncClient={from:()=>{let update,version;const q={select(){return q},eq(k,v){if(k==='version')version=v;return q},update(v){update=v.value;return q},async maybeSingle(){if(!update){reads++;return {data:clone(server),error:null}}writes++;return writeHandler?writeHandler(update,version):commit(update,version)}};return q},channel:()=>({on(type,filter,cb){live=cb;return this},subscribe(){return this}}),removeChannel:async()=>{}};
function commit(update,version){if(server.version!==version)return {data:null,error:null};server={...server,value:clone(update),version:version+1};return {data:clone(server),error:null}}
function reset(){server={key:'fixture',version:5,value:[{id:'a',weight:72},{id:'b',weight:80}]};listeners=new Map();reads=writes=cacheWrites=renders=0;writeHandler=undefined}
await build({entryPoints:[path.join(root,'src/hooks/useSupabaseState.ts')],bundle:true,platform:'node',format:'esm',outfile:file,external:['react'],plugins:[{name:'offline-adapter',setup(b){b.onLoad({filter:/[/\\]lib[/\\]supabase\.ts$/},()=>({contents:'export const supabase=globalThis.__saveSyncClient;',loader:'js'}))}}],logLevel:'silent'});
try{
 const {useSupabaseState}=await import(pathToFileURL(file).href+'?'+Date.now());
 function Observer(){[value,setValue]=useSupabaseState('fixture',[]);renders++;return React.createElement('span',null,value.length)}
 async function mount(){reset();let r;await act(async()=>{r=create(React.createElement(Observer));await flush()});return r}
 let r=await mount(),baseline={renders,cacheWrites};
 await act(async()=>{listeners.get('vejoy:committed-app-state')({detail:clone(server)});live({new:clone(server)});listeners.get('vejoy:committed-app-state')({detail:clone(server)});await flush()});
 assert.equal(renders,baseline.renders);assert.equal(cacheWrites,baseline.cacheWrites);
 await act(async()=>live({new:{...clone(server),version:6,value:[{id:'a',weight:73}]}}));assert.equal(value[0].weight,73);
 await act(async()=>live({new:clone(server)}));assert.equal(value[0].weight,73,'An older event cannot overwrite a newer server snapshot');act(()=>r.unmount());
 r=await mount();
 writeHandler=(update,version)=>{server={...server,version:version+1,value:server.value.map(x=>x.id==='b'?{...x,weight:81}:x)};writeHandler=undefined;return {data:null,error:null}};
 await act(async()=>{setValue(v=>v.map(x=>x.id==='a'?{...x,weight:74}:x));await flush()});
 assert.deepEqual(value,[{id:'a',weight:74},{id:'b',weight:81}]);assert.equal(writes,2,'CAS collision retries onto the latest staff edit');act(()=>r.unmount());
 r=await mount();server={...server,version:6,value:[{id:'a',weight:74},{id:'b',weight:80}]};
 await act(async()=>{setValue(v=>v.map(x=>x.id==='a'?{...x,weight:74}:x));await flush()});assert.equal(writes,0,'An edit already present remotely must not issue a no-op write');assert.deepEqual(value,server.value);act(()=>r.unmount());
 r=await mount();let release;
 writeHandler=(update,version)=>new Promise(resolve=>{release=()=>resolve(commit(update,version))});
 await act(async()=>{setValue(v=>v.map(x=>x.id==='a'?{...x,weight:75}:x));await flush()});
 await act(async()=>{live({new:clone(server)});await flush()});assert.equal(value[0].weight,75,'A duplicate event must not erase an optimistic edit');
 await act(async()=>{writeHandler=undefined;release();await flush()});assert.equal(value[0].weight,75);act(()=>r.unmount());
 r=await mount();const originalError=console.error;console.error=()=>{};
 try{writeHandler=()=>({data:null,error:{message:'Intentional rejection'}});await act(async()=>{setValue(v=>v.map(x=>({...x,weight:999})));await flush()});assert.deepEqual(value,server.value,'Rejected optimistic values must restore even at the same server version')}finally{console.error=originalError}act(()=>r.unmount());
 r=await mount();await act(async()=>{setValue(v=>v.map(x=>x.id==='a'?{...x,weight:76}:x));setValue(v=>v.map(x=>x.id==='b'?{...x,weight:82}:x));await flush()});assert.deepEqual(server.value,[{id:'a',weight:76},{id:'b',weight:82}]);act(()=>r.unmount());
 console.log(JSON.stringify({duplicateRendersAvoided:3,duplicateCacheWritesAvoided:3,staleEventsIgnored:true,concurrentStaffEditPreserved:true,rejectedEditRestored:true,queuedEditsPreserved:true,noOpWritesAvoided:true,productionRequests:0}));
}finally{globalThis.window=savedWindow;globalThis.__saveSyncClient=savedClient;await fs.unlink(file).catch(()=>{})}
