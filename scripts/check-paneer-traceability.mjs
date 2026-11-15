import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
const root=process.cwd(),main=path.resolve(root,'../..'),ref='pgvoixprzecvdrueaxgk';
const captured=JSON.parse(await fs.readFile(path.join(main,'backups/traceability-local-20261115/production-before-paneer-integration.json'),'utf8')).rows[0];
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'vejoy-paneer-server-'));await fs.chmod(dir,0o700);
let migration=await fs.readFile('supabase/migrations/20261115120000_shared_paneer_traceability.sql','utf8');
const translate=s=>s.replaceAll('public.app_state_history','pg_temp.history_test').replaceAll('public.app_state','pg_temp.state_test').replaceAll('public.profiles','pg_temp.profiles_test').replaceAll('public.paneer_traceability_commands','pg_temp.commands_test').replaceAll('public.commit_paneer_traceability','pg_temp.commit_paneer_traceability').replaceAll('public.guard_paneer_traceability','pg_temp.guard_paneer_traceability').replaceAll('public.commit_paneer_packing_before_traceability','pg_temp.commit_paneer_packing_before_traceability').replaceAll('public.commit_paneer_packing','pg_temp.commit_paneer_packing').replaceAll('app_state.value','state_test.value');
const packing=captured.functions.find(f=>f.name==='commit_paneer_packing').definition.replace('public.commit_paneer_packing(','public.commit_paneer_packing_before_traceability(');
migration=migration.replace(/do \$\$ begin\s*if to_regprocedure\('public.commit_paneer_packing_before_traceability\(jsonb\)'\)[\s\S]*?end \$\$;/,packing+';\n');
migration=translate(migration).replace(/^begin;$/m,'').replace(/^commit;$/m,'');
let sql=`begin isolation level repeatable read;
set local lock_timeout='3s';
create temporary table state_test (like public.app_state including defaults including constraints including indexes);
create temporary table profiles_test as select * from public.profiles where status='approved' and role='owner' limit 1;
create temporary table history_test(key text,operation text,old_value jsonb,new_value jsonb,old_version bigint,new_version bigint,changed_by uuid);
`;
for(const f of captured.functions.filter(f=>!f.name.startsWith('commit_'))){sql+=translate(f.definition.replace('public.'+f.name+'(','pg_temp.'+f.name+'('))+';\n';}
for(const t of captured.triggers){let def=translate(t.definition);for(const f of captured.functions.filter(f=>!f.name.startsWith('commit_')))def=def.replace('public.'+f.name+'(','pg_temp.'+f.name+'(').replace('EXECUTE FUNCTION '+f.name+'(','EXECUTE FUNCTION pg_temp.'+f.name+'(');sql+=def+';\n';}
sql+=migration;
sql+=await fs.readFile('supabase/tests/paneer_traceability.sql','utf8');
sql+='\nrollback;\n';const file=path.join(dir,'paneer-rollback.sql');await fs.writeFile(file,sql,{mode:0o600});
try{const output=execFileSync('supabase',['db','query','--linked','--project-ref',ref,'--file',file,'--output','json'],{cwd:main,encoding:'utf8',maxBuffer:4*1024*1024,stdio:['ignore','pipe','pipe']});const result=JSON.parse(output);console.log(JSON.stringify({sqlFile:file,rows:result.rows,rolledBack:true}));}catch(e){throw Error(String(e.stderr||e.message).slice(0,4500));}
