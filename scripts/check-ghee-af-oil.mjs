// Every test write targets TEMP copies, including the full live trigger chain.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
const root=path.resolve(new URL('..',import.meta.url).pathname),ref='pgvoixprzecvdrueaxgk';
if((await fs.readFile(path.join(root,'supabase/.temp/project-ref'),'utf8')).trim()!==ref)throw Error('Unexpected linked project');
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'vejoy-ghee-af-oil-'));await fs.chmod(dir,0o700);
function query(args){try{return JSON.parse(execFileSync('supabase',['db','query','--linked','--project-ref',ref,...args,'--output','json'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:40*1024*1024}))}catch(error){throw Error(String(error.stderr||'Database check failed').slice(0,3000))}}
if(process.argv.includes('--snapshot')){
 const data=query([`select now() as captured_at,(select jsonb_agg(to_jsonb(s)) from public.app_state s where key in ('vejoy_productionRounds','vejoy_milkLots','vejoy_creamLots','vejoy_finishedStock','vejoy_crumbingBatches')) as state,
 (select jsonb_agg(jsonb_build_object('name',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('prepare_ghee_round','prepare_ghee_round_before_af_oil','prepare_ghee_af_oil','commit_ghee_af_oil','record_ghee_af_oil','review_ghee_af_oil','guard_ghee_af_oil_state','create_ghee_round','record_butter_output')) as definitions`]);
 const file=path.join(dir,'recovery.json');await fs.writeFile(file,JSON.stringify(data),{mode:0o600});console.log(JSON.stringify({recoverySnapshot:file,operationalRecordsChanged:false}));
}else{
 const tests=await fs.readFile(path.join(root,'supabase/tests/ghee_af_oil.sql'),'utf8');
 const migration=process.argv.includes('--installed')?'':await fs.readFile(path.join(root,'supabase/migrations/20261105130000_audited_ghee_af_oil.sql'),'utf8');
 const sql=migration?migration.replace(/commit;\s*$/,'')+tests.replace(/\bbegin;\s*/,''):tests;
 if(!sql.trimEnd().endsWith('rollback;'))throw Error('Tests must roll back');
 const file=path.join(dir,'rollback-tests.sql');await fs.writeFile(file,sql,{mode:0o600});console.log(JSON.stringify({sqlFile:file,...query(['--file',file])}));
}
