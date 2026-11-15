// Compare historical source accounting without making any network/write call.
import fs from 'node:fs/promises';import path from 'node:path';import {build} from 'esbuild';
const root=process.cwd(),main=path.resolve('../..');
const sample=JSON.parse(await fs.readFile(path.join(main,'backups/traceability-local-20261115/production-before-paneer-integration.json'),'utf8')).rows[0].state;
const docs=Object.fromEntries(sample.map(row=>[row.key,row.value])),rounds=docs.vejoy_productionRounds,stock=docs.vejoy_finishedStock,lots=docs.vejoy_milkLots;
async function load(file){const compiled=await build({entryPoints:[file],bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});return import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));}
const baseline=await load(path.join(main,'src/lib/finishedStock.ts')),candidate=await load(path.join(root,'src/lib/finishedStock.ts'));
const canonical=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
if(canonical(baseline.reconcileFinishedStock(rounds,stock))!==canonical(candidate.reconcileFinishedStock(rounds,stock)))throw Error('Historical stock projection differs. Stop release and review.');
const oldSummary=await load(path.join(main,'src/lib/milkLotPackedSummary.ts')),newSummary=await load(path.join(root,'src/lib/milkLotPackedSummary.ts'));
for(const lot of lots){const old=oldSummary.buildMilkLotPackedSummary(lot,rounds,[]),next=newSummary.buildMilkLotPackedSummary(lot,rounds,[],{schema:1,lots:{},rounds:{},prefixes:{}});if(canonical(old.groups)!==canonical(next.groups)||old.mixedLotPackingEntries!==next.mixedLotPackingEntries)throw Error('Historical milk-lot packed totals differ: '+lot.lotCode);}
console.log(JSON.stringify({historicalRoundCount:rounds.length,historicalFinishedStockCount:stock.length,milkLotCount:lots.length,historicalStockAndPackedTotalsUnchanged:true,networkCalls:0,writes:0}));
