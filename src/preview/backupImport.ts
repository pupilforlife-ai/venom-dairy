import { PREFIX } from './storage';
export function parseTestBackup(text:string) {
 const file=JSON.parse(text);
 if(file?.format!=='vejoy-traceability-local-v1'||!file.data||typeof file.data!=='object'||Array.isArray(file.data))throw Error('Choose a downloaded paneer test backup JSON file.');
 const values:Record<string,unknown>={};
 for(const [key,raw] of Object.entries(file.data)){
  if(key===PREFIX+'initialized')continue;
  const name=key.startsWith(PREFIX)?key.slice(PREFIX.length):'';
  if(!/^vejoy_[A-Za-z][A-Za-z0-9_]*$/.test(name)||typeof raw!=='string')throw Error('This backup contains keys outside this isolated paneer test.');
  values[name]=JSON.parse(raw);
 }
 for(const name of ['vejoy_milkLots','vejoy_productionRounds','vejoy_productionShifts'])if(!Array.isArray(values[name]))throw Error('The backup is missing its milk lots, shifts or rounds.');
 if(values.vejoy_traceability&&((values.vejoy_traceability as {schema:number}).schema!==1))throw Error('Unsupported traceability backup version.');
 return values;
}
export function assertFreshTestBrowser(read:(key:string,fallback:any)=>any) {
 const seed=read('__seedSnapshot',null);
 if(!seed||Object.entries(seed).some(([k,v])=>JSON.stringify(read(k,null))!==JSON.stringify(v)))throw Error('This browser is not an untouched test seed. Existing entries will not be overwritten.');
 const lots=read('vejoy_milkLots',[]),rounds=read('vejoy_productionRounds',[]),trace=read('vejoy_traceability',{});
 if(lots.length!==1||lots[0].id!=='trace-demo-milk'||lots[0].invoiceNo!=='DEMO-ONLY'||lots[0].litresReceived!==12000||rounds.length!==2||rounds.some((r:any)=>!['trace-demo-round-1','trace-demo-round-2'].includes(r.id)||r.status!=='scheduled'||r.packedSkus?.length||r.blockWeights?.length)||Object.keys(trace).some(k=>k!=='schema'&&Object.keys(trace[k]||{}).length))throw Error('This browser already contains test work. Import into a fresh test address/browser so existing entries are not overwritten.');
 for(const key of ['creamLots','intermediateLots','finishedStock','temperatureReadings','wasteEvents','utilityLogs','cipRecords','butterLotClosures','crumbingBatches','distributionHandovers','breadDoughBatches','factoryChecklists','instructions'])if(read('vejoy_'+key,[]).length)throw Error('This browser already contains test work. Existing entries will not be overwritten.');
}
