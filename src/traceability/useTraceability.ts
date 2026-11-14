import { assembleMixedCaseStock,cancelMixedCaseStock,linkExistingMixedCaseStock,returnMixedCaseStock,type ReturnMixedCaseRequest } from './mixedCaseStock';
import type { FinishedStockLot } from '../data/mockData';
import { transferRetentionSamples, reviewRetentionTransfer } from './paneerStorage';
import { readPreviewState, usePreviewState, batchPreviewWrites, writePreviewState } from '../preview/storage';
import type { MilkLot, ProductionRound } from '../data/mockData';
import { recordMixedPaneerCase, voidMixedPaneerCase, type MixedCaseRequest } from './mixedPaneerCases';
import { changeRecord, emptyTraceState, planRevision, recordChecklist, recordReadiness, type IngredientReadiness, type LotTrace, type RoundTrace, type TraceState } from './domain';
export function useTraceability() {
  const [state,setState]=usePreviewState<TraceState>('vejoy_traceability',emptyTraceState);
  const save=(kind:'lots'|'rounds'|'prefixes',id:string,value:LotTrace|RoundTrace|string,reason:string,expectedRevision?:string)=>{
    const actor=localStorage.getItem('vejoy_user_username')||'Local tester',role=localStorage.getItem('vejoy_user_role')||'';
    const at=new Date().toISOString(),operationId=crypto.randomUUID();
    let savedRevision:string=operationId;
    setState(current=>{
      if(kind==='lots') {
        if(expectedRevision!==undefined&&planRevision(current.lots[id])!==expectedRevision)throw Error('The plan changed elsewhere. Undo unsaved changes to load the latest plan before editing.');
        const entry=changeRecord(current.lots[id],value as LotTrace,actor,role,reason,at,operationId);savedRevision=planRevision(entry);
        return {...current,lots:{...current.lots,[id]:entry}};
      }
      if(kind==='rounds') {
        const history=current.rounds[id]?.audit||[];
        if(expectedRevision!==undefined&&(history[history.length-1]?.id||'')!==expectedRevision)throw Error('This round traceability record changed elsewhere. Close and reopen it before saving.');
        return {...current,rounds:{...current.rounds,[id]:changeRecord(current.rounds[id],value as RoundTrace,actor,role,reason,at,operationId,true)}};
      }
      if(!['owner','admin'].includes(role)) throw Error('Only owner/admin can configure prefixes.');
      return {...current,prefixes:{...current.prefixes,[id]:changeRecord(current.prefixes[id],value as string,actor,role,reason,at,operationId)}};
    });
    return savedRevision;
  };
  const saveReadiness=(lotId:string,ingredientId:string,draft:IngredientReadiness,revision:string,checkId:string)=>{
    const actor=localStorage.getItem('vejoy_user_username')||'Local tester',role=localStorage.getItem('vejoy_user_role')||'';
    const at=new Date().toISOString(),id=crypto.randomUUID();
    setState(current=>recordReadiness(current,lotId,ingredientId,draft,revision,checkId,actor,role,at,id));
  };
  const saveChecklist=(lotId:string,entries:Parameters<typeof recordChecklist>[2],revision:string)=>{
    const actor=localStorage.getItem('vejoy_user_username')||'Local tester',role=localStorage.getItem('vejoy_user_role')||'';
    const at=new Date().toISOString(),id=crypto.randomUUID();
    setState(current=>recordChecklist(current,lotId,entries,revision,actor,role,at,id));
  };
  const stockCommand=(command:(current:TraceState,stock:FinishedStockLot[],rounds:ProductionRound[],lots:MilkLot[],actor:string,role:string,at:string)=>{state:TraceState;stock:FinishedStockLot[]})=>batchPreviewWrites(()=>{
    const current=readPreviewState('vejoy_traceability',emptyTraceState),stock=readPreviewState<FinishedStockLot[]>('vejoy_finishedStock',[]),rounds=readPreviewState<ProductionRound[]>('vejoy_productionRounds',[]),lots=readPreviewState<MilkLot[]>('vejoy_milkLots',[]);
    const next=command(current,stock,rounds,lots,localStorage.getItem('vejoy_user_username')||'Local tester',localStorage.getItem('vejoy_user_role')||'',new Date().toISOString());
    if(next.state!==current)writePreviewState('vejoy_traceability',emptyTraceState,next.state);
    if(next.stock!==stock)writePreviewState<FinishedStockLot[]>('vejoy_finishedStock',[],next.stock);
  });
  const saveMixedCase=(request:MixedCaseRequest)=>stockCommand((current,stock,rounds,lots,actor,role,at)=>assembleMixedCaseStock(current,stock,request,rounds,lots,actor,at));
  const cancelMixedCase=(id:string,reason:string)=>stockCommand((current,stock,rounds,lots,actor,role,at)=>cancelMixedCaseStock(current,stock,id,reason,actor,role,at));
  const linkMixedCaseStock=(id:string)=>stockCommand((current,stock,rounds,lots,actor,role,at)=>linkExistingMixedCaseStock(current,stock,id,rounds,lots,actor,role,at));
  const returnMixedStock=(request:ReturnMixedCaseRequest)=>stockCommand((current,stock,rounds,lots,actor,role,at)=>returnMixedCaseStock(current,stock,request,actor,role,at));
  const moveRetentionSamples=(request:Parameters<typeof transferRetentionSamples>[1])=>setState(current=>transferRetentionSamples(current,request,readPreviewState<ProductionRound[]>('vejoy_productionRounds',[]),readPreviewState<MilkLot[]>('vejoy_milkLots',[]),localStorage.getItem('vejoy_user_username')||'Local tester',new Date().toISOString()));
  const reviewRetention=(request:Parameters<typeof reviewRetentionTransfer>[1])=>setState(current=>reviewRetentionTransfer(current,request,readPreviewState<ProductionRound[]>('vejoy_productionRounds',[]),readPreviewState<MilkLot[]>('vejoy_milkLots',[]),localStorage.getItem('vejoy_user_username')||'Local tester',localStorage.getItem('vejoy_user_role')||'',new Date().toISOString()));
  return {state,save,saveReadiness,saveChecklist,saveMixedCase,cancelMixedCase,linkMixedCaseStock,returnMixedStock,moveRetentionSamples,reviewRetention};
}
