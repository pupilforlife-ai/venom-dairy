// One-time OWNER-APPROVED source allocation correction, never a collection restore.
// Default is a rollback-only rehearsal. --apply commits the same asserted transition.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const root=path.resolve(new URL('..',import.meta.url).pathname),ref='pgvoixprzecvdrueaxgk',lotId='ml-1792993001303';
if((await fs.readFile(path.join(root,'supabase/.temp/project-ref'),'utf8')).trim()!==ref)throw Error('Unexpected linked project');
if(process.argv.slice(2).some(arg=>arg!=='--apply'))throw Error('Use no arguments for rehearsal, or --apply for the approved correction');
const apply=process.argv.includes('--apply');
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'vejoy-reconcile-internal-butter-'));await fs.chmod(dir,0o700);
function query(args){try{return JSON.parse(execFileSync('supabase',['db','query','--linked','--project-ref',ref,...args,'--output','json'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:40*1024*1024}))}catch(error){throw Error(String(error.stderr||'Database query failed; no success was confirmed').slice(0,2000))}}
const snapshot=query([`select now() as captured_at,(select jsonb_agg(to_jsonb(s)) from public.app_state s where key in ('vejoy_productionRounds','vejoy_milkLots','vejoy_creamLots','vejoy_finishedStock')) as state`]);
const recovery=path.join(dir,'before.json');await fs.writeFile(recovery,JSON.stringify(snapshot),{mode:0o600});
const state=snapshot.rows[0].state,rounds=state.find(s=>s.key==='vejoy_productionRounds').value;
const lot=state.find(s=>s.key==='vejoy_milkLots').value.find(l=>l.id===lotId);
if(lot?.lotCode!=='261026')throw Error('Milk lot identity mismatch');
const relevant=rounds.filter(r=>r.milkLotId===lotId&&['Butter','Ghee'].includes(r.type));
const literal=value=>"'"+JSON.stringify(value).replaceAll("'","''")+"'::jsonb";
const sql=`begin;
set local lock_timeout='3s';
set local statement_timeout='15s';
create temporary table _butter_correction_result(value jsonb) on commit drop;
do $correct$
declare rounds jsonb; original jsonb; lots jsonb; original_lots jsonb; lot jsonb; updated_lot jsonb; actual_relevant jsonb; result jsonb;
  expected jsonb:=${literal(relevant)}; expected_pool jsonb:=${literal(lot.butterPool)};
  targets text[]:=array['ghee-99df3f9b-d325-4918-88c3-65089b30eafd','ghee-8645d825-650c-496e-a2d9-398e135e4af4','ghee-5e19fcfb-1d34-47fc-805c-40615d3ca2c0'];
  target text; r jsonb; old_r jsonb; allowed text[]; pending numeric; available numeric; n integer; changes integer:=0;
begin
  perform 1 from public.app_state where key in ('vejoy_milkLots','vejoy_productionRounds') order by key for update;
  select value into strict rounds from public.app_state where key='vejoy_productionRounds';original:=rounds;
  select value into strict lots from public.app_state where key='vejoy_milkLots';original_lots:=lots;
  select x into strict lot from jsonb_array_elements(lots) x where x->>'id'='${lotId}' and x->>'lotCode'='261026';
  select jsonb_agg(x order by ord) into actual_relevant from jsonb_array_elements(rounds) with ordinality t(x,ord) where x->>'milkLotId'='${lotId}' and x->>'type' in ('Butter','Ghee');
  if actual_relevant<>expected or lot->'butterPool'<>expected_pool then raise exception 'Live butter/ghee records changed since backup; correction stopped. Refresh and review';end if;
  if (select count(*) from jsonb_array_elements(rounds))<>(select count(distinct x->>'id') from jsonb_array_elements(rounds) x) then raise exception 'Duplicate round IDs; correction stopped';end if;
  foreach target in array targets loop
    select x into r from jsonb_array_elements(rounds) x where x->>'id'=target;
    if r is null or r->>'type'<>'Ghee' or r->>'milkLotId'<>'${lotId}' or nullif(r->>'sourceCreamLotId','') is not null
      or (r->>'butterInput')::numeric<>92.5 then raise exception 'Target ghee identity/input changed: %',target;end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(rounds) x where x->>'type'='Ghee' and x->>'milkLotId'='${lotId}'
    and nullif(x->>'sourceCreamLotId','') is null and coalesce((x->>'butterOverdrawKg')::numeric,0)>0 and not (x->>'id'=any(targets))) then
    raise exception 'Additional pending ghee claim outside approved scope';end if;
  select coalesce(sum((x->>'butterOverdrawKg')::numeric),0) into pending from jsonb_array_elements(rounds) x where x->>'id'=any(targets);
  if pending<0 or pending>267.3 then raise exception 'Outstanding quantity exceeds approved scope';end if;
  select coalesce(sum((x->>'remainingBalance')::numeric),0) into available from jsonb_array_elements(rounds) x where x->>'type'='Butter'
    and x->>'milkLotId'='${lotId}' and coalesce(x->>'creamSource','internal')<>'external' and nullif(x->>'blendedPoolId','') is null
    and coalesce(x->>'status','') not in ('cancelled','discarded','spoiled') and (x->>'butterOutput')::numeric>0;
  if available<pending then raise exception 'Insufficient recorded internal butter to settle these three claims';end if;
  result:=public.settle_late_internal_butter(rounds,'milk:${lotId}','owner-approved-261026-20261105','System (owner-approved late-butter reconciliation)',clock_timestamp());
  rounds:=result->'rounds';
  if (result->>'matchedKg')::numeric<>pending then raise exception 'Expected exact outstanding quantity to be settled';end if;
  if jsonb_array_length(rounds)<>jsonb_array_length(original) then raise exception 'Round count changed';end if;
  for r in select x from jsonb_array_elements(rounds) x loop
    select x into strict old_r from jsonb_array_elements(original) x where x->>'id'=r->>'id';
    if r=old_r then continue;end if;changes:=changes+1;
    if r->>'id'=any(targets) then
      allowed:=array['butterOverdrawKg','butterOriginalOverdrawKg','butterSourceAllocations','butterSettlementHistory'];
      if (r->>'butterOverdrawKg')::numeric<>0 then raise exception 'Target remains outstanding';end if;
    elsif r->>'type'='Butter' and r->>'milkLotId'='${lotId}' and coalesce(r->>'creamSource','internal')<>'external' and nullif(r->>'blendedPoolId','') is null then
      allowed:=array['remainingBalance','usedInGhee','destination','butterSettlementHistory'];
      if (old_r->>'remainingBalance')::numeric-(r->>'remainingBalance')::numeric<>(r->>'usedInGhee')::numeric-coalesce((old_r->>'usedInGhee')::numeric,0) then raise exception 'Butter deduction does not match its ghee use';end if;
    else raise exception 'Unrelated or external round changed: %',r->>'id';end if;
    if (r-allowed)<>(old_r-allowed) then raise exception 'Production/packing/source data changed outside allocation fields';end if;
  end loop;
  updated_lot:=public.sync_internal_butter_pool(lot,rounds);
  if (updated_lot-'butterPool')<>(lot-'butterPool') or ((updated_lot->'butterPool')-array['availableBalance','lateButterAccountingVersion'])<>((lot->'butterPool')-array['availableBalance','lateButterAccountingVersion']) then
    raise exception 'Lot metadata, production totals or previous usage counters unexpectedly changed';end if;
  if (updated_lot#>>'{butterPool,availableBalance}')::numeric<>available-pending then raise exception 'Net balance equation failed';end if;
  if pending>0 then
    perform set_config('app.atomic_ghee_round','on',true);
    update public.app_state set value=rounds where key='vejoy_productionRounds';get diagnostics n=row_count;if n<>1 then raise exception 'Round save not confirmed';end if;
    update public.app_state set value=(select jsonb_agg(case when x->>'id'='${lotId}' then updated_lot else x end order by ord) from jsonb_array_elements(value) with ordinality t(x,ord)) where key='vejoy_milkLots';get diagnostics n=row_count;if n<>1 then raise exception 'Lot save not confirmed';end if;
    perform set_config('app.atomic_ghee_round','off',true);
  end if;
  insert into _butter_correction_result values(jsonb_build_object('applied',${apply},'matchedKg',pending,'availableBeforeKg',available,'availableAfterKg',available-pending,
    'totalButterProducedKg',updated_lot#>'{butterPool,totalButterProduced}','recordedGheeInputKg',updated_lot#>'{butterPool,usedInGhee}',
    'changedRounds',changes,'roundCountBefore',jsonb_array_length(original),'roundCountAfter',jsonb_array_length(rounds),'externalSourcesChanged',0,'productionAndPackingPreserved',true));
end;$correct$;
select value as result from _butter_correction_result;
${apply?'commit;':'rollback;'}
`;
const file=path.join(dir,apply?'approved-correction.sql':'rollback-rehearsal.sql');await fs.writeFile(file,sql,{mode:0o600});
const result=query(['--file',file]);await fs.writeFile(path.join(dir,'result.json'),JSON.stringify(result),{mode:0o600});
console.log(JSON.stringify({recoverySnapshot:recovery,sqlFile:file,...result}));
