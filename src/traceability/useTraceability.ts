import {createContext,useContext,createElement,type ReactNode} from 'react';
import { useSupabaseState } from '../hooks/useSupabaseState';
import { emptyTraceState,type TraceState,type LotTrace,type RoundTrace,type IngredientReadiness } from './domain';
import { runTraceCommand } from './transport';
import type { MixedCaseRequest } from './mixedPaneerCases';
import type { ReturnMixedCaseRequest } from './mixedCaseStock';
import type { Pan111Request } from './pan111Reconciliation';
import type { transferRetentionSamples,reviewRetentionTransfer } from './paneerStorage';
const TraceContext=createContext<{state:TraceState;loaded:boolean}|null>(null);
export function TraceabilityProvider({children}:{children:ReactNode}){
 const [state,,loaded]=useSupabaseState<TraceState>('vejoy_traceability',emptyTraceState);
 return createElement(TraceContext.Provider,{value:{state,loaded}},children);
}
export function useTraceability(){
 const context=useContext(TraceContext);if(!context)throw Error('Traceability provider is missing.');const {state,loaded}=context;
 const save=(kind:'lots'|'rounds'|'prefixes',id:string,value:LotTrace|RoundTrace|string,reason:string,expectedRevision?:string)=>runTraceCommand('save',{kind,id,value,reason,expectedRevision:expectedRevision??(state.prefixes[id]?.audit[state.prefixes[id].audit.length-1]?.id||'')}) as Promise<string>;
 const saveReadiness=(lotId:string,ingredientId:string,draft:IngredientReadiness,revision:string,checkId:string)=>runTraceCommand('readiness',{lotId,ingredientId,draft,revision,checkId});
 const saveChecklist=(lotId:string,entries:unknown[],revision:string)=>runTraceCommand('checklist',{lotId,entries,revision});
 const saveMixedCase=(p:MixedCaseRequest)=>runTraceCommand('assemble',p,p.id);
 const cancelMixedCase=(id:string,reason:string)=>runTraceCommand('cancel_assembly',{id,reason});
 const linkMixedCaseStock=(id:string)=>runTraceCommand('link_assembly',{id});
 const returnMixedStock=(p:ReturnMixedCaseRequest)=>runTraceCommand('return',p,p.id);
 const savePan111=(p:Pan111Request)=>runTraceCommand('pan111',p,p.id);
 const moveRetentionSamples=(p:Parameters<typeof transferRetentionSamples>[1])=>runTraceCommand('retention_transfer',p,p.id);
 const reviewRetention=(p:Parameters<typeof reviewRetentionTransfer>[1])=>runTraceCommand('retention_review',p);
 return {state,loaded,save,saveReadiness,saveChecklist,saveMixedCase,cancelMixedCase,linkMixedCaseStock,returnMixedStock,savePan111,moveRetentionSamples,reviewRetention};
}
