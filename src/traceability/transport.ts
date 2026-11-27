import { supabase } from '../lib/supabase';
import type { TraceCommand } from './server/commands';
const attempts=new Map<string,TraceCommand>();
function signature(kind:string,payload:any){
 if(kind!=='activity')return JSON.stringify({kind,payload});
 const {expectedRound,event,updates,...rest}=payload;
 const volatile=new Set(['pressingStartedAt','coolingStartedAt','restingStartedAt','freezeStartedAt','completedAt','clingwrappedAt']);
 return JSON.stringify({kind,payload:{...rest,updates:Object.fromEntries(Object.entries(updates||{}).filter(([key])=>!volatile.has(key))),event:{type:event.type,stage:event.stage,source:event.source,details:event.details}}});
}
export async function runTraceCommand(kind:string,payload:any,id?:string){
 if(!supabase)throw Error('Shared production saving is unavailable. No browser-only production record was created.');
 const key=id||signature(kind,payload),command=attempts.get(key)||{id:id||crypto.randomUUID(),kind,payload};attempts.set(key,command);
 const {data,error}=await supabase.functions.invoke('paneer-traceability',{body:command});
 if(error||!data?.ok){let detail=data?.error||error?.message||'The server did not confirm this save.';
  if(error&&'context' in error){try{const body=await (error as any).context.json();detail=body.error||detail;if(!body.uncertain)attempts.delete(key);}catch{}}
  else if(data&&!data.uncertain)attempts.delete(key);
  throw Error(`${detail} Keep this form open and retry the same save.`);
 }
 for(const row of data.rows||[])window.dispatchEvent(new CustomEvent('vejoy:committed-app-state',{detail:row}));
 attempts.delete(key);return data.result;
}
