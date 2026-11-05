import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const root=path.resolve(new URL('..',import.meta.url).pathname);
if((await fs.readFile(path.join(root,'supabase/.temp/project-ref'),'utf8')).trim()!=='pgvoixprzecvdrueaxgk')throw Error('Unexpected project');
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'vejoy-late-butter-'));await fs.chmod(dir,0o700);
const query=args=>{try{return execFileSync('supabase',['db','query','--linked','--project-ref','pgvoixprzecvdrueaxgk',...args,'--output','json'],{cwd:root,encoding:'utf8',maxBuffer:40*1024*1024,stdio:['ignore','pipe','pipe']})}catch(error){throw Error(String(error.stderr||'Supabase query failed').slice(0,2000))}};
if(process.argv.includes('--snapshot')){
 const data=query([`select now() as captured_at,
 (select jsonb_agg(to_jsonb(s)) from public.app_state s where key in ('vejoy_productionRounds','vejoy_milkLots','vejoy_creamLots','vejoy_finishedStock')) as state,
 (select jsonb_agg(jsonb_build_object('name',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('prepare_ghee_round','prepare_ghee_round_without_late_settlement','settle_late_internal_butter','sync_internal_butter_pool','record_butter_output','enforce_late_butter_accounting')) as definitions`]);
 JSON.parse(data);const file=path.join(dir,'recovery-snapshot.json');await fs.writeFile(file,data,{mode:0o600});console.log(JSON.stringify({recoverySnapshot:file,private:true,liveRecordsChanged:false}));
}else{
 const migration=await fs.readFile(path.join(root,'supabase/migrations/20261103170000_settle_late_internal_butter.sql'),'utf8');
 const tests=await fs.readFile(path.join(root,'supabase/tests/late_internal_butter.sql'),'utf8');
 const sql=migration.replace(/commit;\s*$/,'')+tests.replace(/\bbegin;\s*/,'');
 if(!sql.trimEnd().endsWith('rollback;'))throw Error('Tests must roll back');
 const file=path.join(dir,'rollback-test.sql');await fs.writeFile(file,sql,{mode:0o600});console.log(JSON.stringify({...JSON.parse(query(['\n'+sql])),testSql:file}));
}
