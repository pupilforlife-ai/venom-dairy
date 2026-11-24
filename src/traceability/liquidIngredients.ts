import type {LotTrace,RecordEntry,TraceState,Audit} from './domain';
import {halloumiPlanningRecipe} from '../lib/halloumiRecipe';
export interface LiquidContainer {id:string;volumeMl:number|null;batchCode:string}
export interface LiquidIngredientReadiness {planRevision:string;requiredMl:number;floorBalanceMl:number|null;floorBatchCodes:string;containers:LiquidContainer[];supplier:string;responsible:string;onSite:boolean;checkedBy:string;checkedAt:string}
export interface LiquidCheckRequest {ingredientId:string;draft:LiquidIngredientReadiness;expectedCheckId:string}
const ml=(n:number)=>Math.round(n*1e9)/1e9;
export function liquidChecklistForecast(plan:LotTrace) {
 const recipe=halloumiPlanningRecipe(plan.planHalloumiLitres??0,plan.halloumiSaltGPer240L);
 return recipe.milkLitres>0?[{id:'rennet',name:'Rennet',unit:'mL' as const,total:recipe.rennetMl}]:[];
}
export function liquidPrepared(row:LiquidIngredientReadiness):number|null {
 if(row.floorBalanceMl===null||row.containers.some(c=>c.volumeMl===null))return null;
 return ml(row.floorBalanceMl+row.containers.reduce((n,c)=>n+(c.volumeMl??0),0));
}
export function liquidBrought(row:LiquidIngredientReadiness):number|null {return row.containers.some(c=>c.volumeMl===null)?null:ml(row.containers.reduce((n,c)=>n+(c.volumeMl??0),0));}
export function liquidGaps(row:LiquidIngredientReadiness,requiredMl:number) {
 const gaps:string[]=[];
 if(!row.responsible.trim())gaps.push('Enter the responsible person’s name.');
 if(row.floorBalanceMl===null)gaps.push('Enter the floor balance in mL, or 0 if none.');
 else if(row.floorBalanceMl>0&&!row.floorBatchCodes.trim())gaps.push('Enter the floor bottle’s batch/lot code.');
 if(row.containers.some(c=>c.volumeMl===null||!c.batchCode.trim()))gaps.push('Enter the volume and batch/lot code of each bottle brought from storage.');
 const prepared=liquidPrepared(row);if(prepared!==null&&prepared<requiredMl)gaps.push(`Shortfall: ${ml(requiredMl-prepared)} mL (${prepared} mL prepared / ${requiredMl} mL required).`);
 return gaps;
}
export function liquidStatus(row:LiquidIngredientReadiness|undefined,revision:string,requiredMl:number) {
 if(!row)return 'Not checked';const prepared=liquidPrepared(row);
 if(prepared!==null&&prepared<requiredMl)return 'Shortfall';
 if(row.planRevision!==revision||row.requiredMl!==requiredMl)return 'Recheck revised plan';
 return row.onSite&&liquidGaps(row,requiredMl).length===0?'Ready':'Not ready';
}
export function recordLiquidReadiness(state:TraceState,lotId:string,entry:LiquidCheckRequest,expectedRevision:string,actor:string,role:string,at:string,id:string):TraceState {
 const plan=state.lots[lotId],revision=plan?.audit[plan.audit.length-1]?.id||'';
 if(!plan||!revision||revision!==expectedRevision)throw Error('The production plan changed. Reload the checklist.');
 const required=liquidChecklistForecast(plan.value).find(r=>r.id===entry.ingredientId);if(!required)throw Error('This liquid ingredient is not required by the latest plan.');
 const previous=state.liquidReadiness?.[lotId]?.[entry.ingredientId],draft=entry.draft;
 if((previous?.audit[previous.audit.length-1]?.id||'')!==entry.expectedCheckId)throw Error('This ingredient check changed elsewhere. Reload before saving.');
 if(!draft||!Array.isArray(draft.containers)||typeof draft.responsible!=='string'||typeof draft.floorBatchCodes!=='string'||typeof draft.supplier!=='string'||typeof draft.onSite!=='boolean')throw Error('Enter valid liquid preparation details.');
 for(const n of [draft.floorBalanceMl,...draft.containers.map(c=>c.volumeMl)])if(n!==null&&(!Number.isFinite(n)||n<0))throw Error('Liquid quantities must be zero or positive, in mL.');
 if(new Set(draft.containers.map(c=>c.id)).size!==draft.containers.length||draft.containers.some(c=>!c.id||typeof c.batchCode!=='string'||c.volumeMl===0))throw Error('Each storage bottle needs its own entry and a positive volume.');
 if(!['owner','admin'].includes(role)&&draft.supplier!==(previous?.value.supplier||''))throw Error('Only Owner/Admin can change the supplier.');
 if(previous&&previous.value.checkedBy!==actor&&previous.value.planRevision===revision&&!['owner','admin'].includes(role))throw Error('Only the original checker or Owner/Admin may revise this check.');
 const gaps=liquidGaps(draft,required.total);if(draft.onSite&&gaps.length)throw Error(`Rennet: ${gaps.join(' ')}`);
 const value={...draft,planRevision:revision,requiredMl:required.total,checkedBy:actor,checkedAt:at};
 const physical=(v:LiquidIngredientReadiness)=>({...v,supplier:'',checkedBy:'',checkedAt:''});
 if(previous&&JSON.stringify(physical(previous.value))===JSON.stringify(physical(value))){value.checkedBy=previous.value.checkedBy;value.checkedAt=previous.value.checkedAt;}
 if(previous&&JSON.stringify(previous.value)===JSON.stringify(value))return state;
 const audit:Audit={id,at,actor,role,reason:draft.onSite?'Confirmed ready at factory':'Readiness progress recorded',before:previous?.value??null,after:value};
 const saved:RecordEntry<LiquidIngredientReadiness>={value,audit:[...(previous?.audit||[]),audit]};
 return {...state,liquidReadiness:{...state.liquidReadiness,[lotId]:{...state.liquidReadiness?.[lotId],[entry.ingredientId]:saved}}};
}
