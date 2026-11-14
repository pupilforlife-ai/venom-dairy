import { it,expect } from 'vitest';
import { parseTestBackup,assertFreshTestBrowser } from './backupImport';
import { PREFIX } from './storage';
it('accepts only same-test backups and retains source data exactly',()=>{
 const data={vejoy_milkLots:[{id:'lot'}],vejoy_productionRounds:[{id:'round',packedSkus:[{cases:12,loose:26}]}],vejoy_productionShifts:[]};
 const file={format:'vejoy-traceability-local-v1',data:Object.fromEntries(Object.entries(data).map(([k,v])=>[PREFIX+k,JSON.stringify(v)]))};
 expect(parseTestBackup(JSON.stringify(file))).toEqual(data);
 expect(()=>parseTestBackup(JSON.stringify({...file,data:{...file.data,production_key:'[]'}}))).toThrow(/outside/);
});
it('never replaces existing test rounds or assemblies',()=>{
 const base:any={vejoy_milkLots:[{id:'trace-demo-milk',invoiceNo:'DEMO-ONLY',litresReceived:12000}],vejoy_productionRounds:[{id:'trace-demo-round-1',status:'scheduled'},{id:'trace-demo-round-2',status:'scheduled'}]};
 const seed=structuredClone(base);base.__seedSnapshot=seed;
 expect(()=>assertFreshTestBrowser((k,f)=>base[k]??f)).not.toThrow();
 expect(()=>assertFreshTestBrowser((k,f)=>k==='vejoy_traceability'?{schema:1,mixedCases:{record:{}}}:base[k]??f)).toThrow(/already|overwritten/);
 base.vejoy_productionRounds[0].status='cut';expect(()=>assertFreshTestBrowser((k,f)=>base[k]??f)).toThrow(/already|overwritten/);
});
