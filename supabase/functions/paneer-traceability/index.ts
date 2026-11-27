import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.98.0';
import {prepareTraceCommand,traceKeys,compactCommittedReply} from '../_shared/paneerCommands.js';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Content-Type':'application/json'};
Deno.serve(async(request)=>{
 if(request.method==='OPTIONS')return new Response('ok',{headers});
 const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});let commitAttempted=false;
 try{
  if(request.method!=='POST')return reply({error:'POST required'},405);
  const auth=request.headers.get('Authorization');if(!auth?.startsWith('Bearer '))return reply({error:'Sign in before saving.'},401);
  const userClient=createClient(Deno.env.get('SUPABASE_URL'),Deno.env.get('SUPABASE_ANON_KEY'),{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error:authError}=await userClient.auth.getUser();if(authError||!user)return reply({error:'Your session expired. Sign in before retrying.'},401);
  const db=createClient(Deno.env.get('SUPABASE_URL'),Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:profile,error:profileError}=await db.from('profiles').select('username,role,status').eq('id',user.id).single();
  if(profileError||profile?.status!=='approved'||!['owner','admin','staff'].includes(profile.role))return reply({error:'Approved production access required.'},403);
  const submitted=await request.json();const command={...submitted,_role:profile.role};if(command.kind==='ping'){const {error}=await db.from('paneer_traceability_commands').select('id').limit(0);if(error)throw error;return reply({ok:true,ready:true});}if(JSON.stringify(command).length>2_000_000)return reply({error:'The save is too large.'},400);
  // Replay before recalculation: a lost response never repeats the operation.
  const {data:receipt}=await db.from('paneer_traceability_commands').select('actor_id,request,result').eq('id',command.id).maybeSingle();
  if(receipt){commitAttempted=true;const {data,error}=await db.rpc('commit_paneer_traceability',{actor_id:user.id,command,expected:[],changes:{},command_result:null});if(error)throw error;return reply(data);}
  for(let attempt=0;attempt<5;attempt++){
   // Shift dates are a read-only dependency for historical loose-case labels.
   const readKeys=command.kind==='assemble'?[...traceKeys,'vejoy_productionShifts']:traceKeys;
   const {data:rows,error:readError}=await db.from('app_state').select('key,value,version').in('key',readKeys);if(readError)throw readError;
   const documents=Object.fromEntries(readKeys.map(key=>[key,rows.find(x=>x.key===key)?.value||(key==='vejoy_traceability'?{schema:1,lots:{},rounds:{},prefixes:{}}:[])]));
   const prepared=prepareTraceCommand(documents,command,profile.username,profile.role,new Date().toISOString());
   const changes=Object.fromEntries(traceKeys.filter(key=>JSON.stringify(prepared.documents[key])!==JSON.stringify(documents[key])).map(key=>[key,prepared.documents[key]]));
   const expected=readKeys.map(key=>({key,version:rows.find(x=>x.key===key)?.version??null}));
   commitAttempted=true;const {data,error}=await db.rpc('commit_paneer_traceability',{actor_id:user.id,command,expected,changes,command_result:prepared.result});
   if(!error)return reply(compactCommittedReply(data,rows));if(error.code!=='40001')throw error;
  }
  throw Error('Production is busy. Retry this same save.');
 }catch(error){return reply({error:error?.message||'Save was not confirmed.',uncertain:commitAttempted&&!error?.code},400);}
});
