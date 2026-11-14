import { getPaneerRecipe, type PaneerRecipeType } from '../lib/paneerRecipe';

export const TRACE_VERSION = 'proposed-20261111-v1';
export const shifts = ['A','B','C','D','F','G','H','J','M','N'] as const;
export const agreedPrefixes: Record<string,string> = { 'C/S':'90', D:'80', MPAN111:'08', RPAN111:'09', RSPP:'91', MSPP:'81', Cream:'92', Halloumi:'93', Butter:'50', PUBBB:'53', PSBBB:'54', Ghee:'60', MPAN100:'11', MPAN200:'12', MPAN400:'13', VJPAN:'14', RPAN100:'21', RPAN200:'22', RPAN400:'23', SPP:'31', 'ROZ SPP':'41' };
export const ingredientPrefixes: Record<string,string> = { calcium_chloride:'C', gdl:'G', potassium_sorbate:'K', fis:'F', af_oil:'AF' };
export function validDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(date+'T12:00:00Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10) === date;
}
export function milkCode(date: string) {
  if (!validDate(date)) throw Error('Enter a valid receiving date.');
  return date.slice(8,10)+date.slice(5,7)+date.slice(2,4);
}
export function batchCode(prefix: string, date: string, shift: number, round?: number) {
  if (!/^[A-Z0-9]{1,8}$/.test(prefix)) throw Error('Confirm a product prefix first.');
  if (!validDate(date)) throw Error('Confirm the start of production date in Milk Receiving.');
  if (!Number.isInteger(shift) || shift < 1 || shift > shifts.length) throw Error('Shift letter is not configured for this shift.');
  if (round !== undefined && (!Number.isInteger(round) || round < 1)) throw Error('Round must be a positive whole number.');
  return `${prefix}-${date.slice(8,10)}${date.slice(5,7)}${shifts[shift-1]}${round ?? ''}`;
}
export function safeCode(prefix: string | undefined, date: string, shift: number, round?: number) {
  try { return { code: batchCode(prefix || '', date, shift, round), gap: '' }; }
  catch (e) { return { code: '', gap: (e as Error).message }; }
}
export interface IngredientUse { id: string; ingredientId: string; name: string; quantity: number | null; unit: 'g'|'kg'; supplier: string; supplierProductCode: string; supplierBatch: string; preparation?: {lotId:string;ingredientId:string;checkId:string;planRevision:string;batchCode:string} }
export interface VesselDraw { vessel: string; litres: number }
export interface CuttingTrace { pendingAcknowledged?:boolean; trayNumbers?:number[];sampleCrateCode?:string;samplePacketBatchCode?:string; clothKg: number | null; trays: number | null; scrambleKg: number | null; samplePieces: number | null; sampleLocation: string; scrambleLocation: string }
export interface RoundTrace { productionDate: string; vessels: VesselDraw[]; ingredients: IngredientUse[]; cutting: CuttingTrace; note: string }
export interface LotTrace { productionDate: string; planCsLitres: number; planDirectLitres: number }
export interface Audit { id: string; at: string; actor: string; role: string; reason: string; before: unknown; after: unknown }
export interface RecordEntry<T> { value: T; audit: Audit[] }
export interface IngredientBag { id:string; number?:number; weightKg:number|null; batchCode:string; caseGroupId?:string }
export interface IngredientReadiness { planRevision: string; requiredKg: number; availableKg: number | null; floorBalanceKg?: number | null; floorBatchCodes?: string; storageBags?: IngredientBag[]; nextBagNumber?:number; broughtFromStorageKg?: number | null; supplier: string; supplierProductCode: string; supplierBatches: string; responsible: string; onSite: boolean; checkedBy: string; checkedAt: string }
export interface TraceState { stockEvents?:Record<string,import('./mixedCaseStock').TraceStockEvent>; retentionTransfers?:Record<string,import('./paneerStorage').RetentionTransfer>; mixedCases?:Record<string,import('./mixedPaneerCases').MixedPaneerCase>; schema: 1; lots: Record<string,RecordEntry<LotTrace>>; rounds: Record<string,RecordEntry<RoundTrace>>; prefixes: Record<string,RecordEntry<string>>; readiness?: Record<string,Record<string,RecordEntry<IngredientReadiness>>> }
export const emptyTraceState: TraceState = {schema:1,lots:{},rounds:{},prefixes:{}};
export function emptyRoundTrace(date = ''): RoundTrace { return { productionDate:date,vessels:[],ingredients:[],cutting:{clothKg:null,trays:null,scrambleKg:null,samplePieces:null,sampleLocation:'',scrambleLocation:''},note:'' }; }
export function forecast(cs: number, direct: number) {
  if (![cs,direct].every(n=>Number.isFinite(n)&&n>=0)) throw Error('Milk quantities must be zero or positive.');
  const rows = new Map<string,{id:string;name:string;unit:'g'|'kg';cs:number;direct:number;total:number}>();
  for (const [type, litres, column] of [['C/S',cs,'cs'],['D',direct,'direct']] as const) {
    if (!litres) continue;
    getPaneerRecipe(type,litres).lines.forEach(line=>{
      const row=rows.get(line.id) || {id:line.id,name:line.name,unit:line.unit,cs:0,direct:0,total:0};
      row[column]=line.quantity; row.total=Math.round((row.cs+row.direct)*1e6)/1e6;rows.set(line.id,row);
    });
  }
  return [...rows.values()];
}
// Checklist units are always kg. Individual round recipes retain their g/kg units.
export function checklistForecast(cs: number, direct: number) {
  return forecast(cs,direct).map(row=>{
    const factor=row.unit==='g'?0.001:1;
    const kg=(value:number)=>Math.round(value*factor*1e9)/1e9;
    return {...row,unit:'kg' as const,cs:kg(row.cs),direct:kg(row.direct),total:kg(row.total)};
  });
}
export function planRevision(plan:RecordEntry<LotTrace>|undefined) { return plan?.audit[plan.audit.length-1]?.id||''; }
export function storageTopUp(requiredKg:number,floorBalanceKg:number|null) {
  if(!Number.isFinite(requiredKg)||requiredKg<0)throw Error('Required quantity must be zero or positive.');
  if(floorBalanceKg===null)return null;
  if(!Number.isFinite(floorBalanceKg)||floorBalanceKg<0)throw Error('Factory floor balance must be zero or positive, in kg.');
  return Math.max(0,Math.round((requiredKg-floorBalanceKg)*1e9)/1e9);
}
export function storageBagTotal(bags:IngredientBag[]):number|null {
  if(bags.some(b=>b.weightKg===null))return null;
  return Math.round(bags.reduce((sum,b)=>sum+(b.weightKg||0),0)*1e9)/1e9;
}
export function numberedBags(bags:IngredientBag[]) {
  const used=new Set(bags.flatMap(b=>b.number===undefined?[]:[b.number]));let candidate=1;
  return bags.map(bag=>{
    if(bag.number!==undefined)return {...bag};
    while(used.has(candidate))candidate++;
    const number=candidate++;used.add(number);return {...bag,number};
  });
}
export function addNumberedBag(row:IngredientReadiness,weightKg:number|null,batchCode:string,id:string):IngredientReadiness {
  const bags=numberedBags(row.storageBags||[]);
  const number=Math.max(row.nextBagNumber||1,...bags.map(b=>(b.number||0)+1));
  return {...row,storageBags:[...bags,{id,number,weightKg,batchCode}],nextBagNumber:number+1,onSite:false};
}
// Keep physical containers individually numbered; grouping is entry/display metadata only.
export function addNumberedCases(row:IngredientReadiness,count:number,weightKg:number,batchCode:string,groupId:string):IngredientReadiness {
  if(!Number.isInteger(count)||count<1||count>10000)throw Error('Enter a whole number of cases between 1 and 10,000.');
  if(!Number.isFinite(weightKg)||weightKg<=0||!Number.isFinite(count*weightKg))throw Error('Enter a positive weight per case in kg.');
  if(!batchCode.trim())throw Error('Enter the batch/lot code for these cases.');
  const bags=numberedBags(row.storageBags||[]);
  if(!groupId||bags.some(b=>b.caseGroupId===groupId||b.id.startsWith(groupId+':')))throw Error('These cases were already added.');
  const first=Math.max(row.nextBagNumber||1,...bags.map(b=>(b.number||0)+1));
  const added=Array.from({length:count},(_,i)=>({id:`${groupId}:${i+1}`,number:first+i,weightKg,batchCode:batchCode.trim(),caseGroupId:groupId}));
  return {...row,storageBags:[...bags,...added],nextBagNumber:first+count,onSite:false};
}
export function bagEntryGroups(bags:IngredientBag[]):IngredientBag[][] {
  const groups:IngredientBag[][]=[];
  for(const bag of bags){const previous=groups[groups.length-1];
    if(bag.caseGroupId&&previous?.[0].caseGroupId===bag.caseGroupId&&previous[0].weightKg===bag.weightKg&&previous[0].batchCode===bag.batchCode)previous.push(bag);
    else groups.push([bag]);
  }
  return groups;
}
export function bagGroupLabel(group:IngredientBag[]) {
  return group.length>1?`Cases ${group[0].number}–${group[group.length-1].number}`:`Bag ${group[0].number}`;
}
export function preparationBatchCodes(row:IngredientReadiness):string[] {
  const split=(text:string)=>text.split(/[,;\n]+/).map(code=>code.trim()).filter(Boolean);
  if(row.storageBags===undefined)return [...new Set(split(row.supplierBatches))];
  return [...new Set([...(row.floorBalanceKg&&row.floorBalanceKg>0?split(row.floorBatchCodes||''):[]),...row.storageBags.filter(b=>b.weightKg!==null&&b.weightKg>0).map(b=>b.batchCode.trim()).filter(Boolean)])];
}
export function preparedQuantity(row:IngredientReadiness) {
  if(row.floorBalanceKg===undefined&&row.broughtFromStorageKg===undefined&&row.storageBags===undefined)return row.availableKg;
  const brought=row.storageBags===undefined?row.broughtFromStorageKg:storageBagTotal(row.storageBags);
  if(row.floorBalanceKg==null||brought==null)return null;
  return Math.round((row.floorBalanceKg+brought)*1e9)/1e9;
}
export function readinessGaps(row:IngredientReadiness,requiredKg:number):string[] {
  const gaps:string[]=[];
  if(!row.responsible.trim())gaps.push('Enter the responsible person’s name.');
  if(row.storageBags!==undefined){
    if(row.floorBalanceKg==null)gaps.push('Enter the weighed Bag 0 floor balance, or 0 if none.');
    if(row.floorBalanceKg!=null&&row.floorBalanceKg>0&&!(row.floorBatchCodes||'').trim())gaps.push('Enter Bag 0’s batch/lot code.');
    const incomplete=row.storageBags.filter(b=>b.weightKg===null||!b.batchCode.trim());
    if(incomplete.length)gaps.push(`Enter weight and batch/lot code for ${incomplete.length} incomplete bag(s).`);
  }
  const prepared=preparedQuantity(row);
  if(prepared===null&&!gaps.length)gaps.push('Record the weighed floor balance and quantity brought from storage.');
  if(!preparationBatchCodes(row).length&&!gaps.length)gaps.push('Record the ingredient batch/lot code.');
  if(prepared!==null&&prepared+1e-9<requiredKg)gaps.push(`Shortfall: ${Math.round((requiredKg-prepared)*1e9)/1e9} kg (${prepared} kg prepared / ${requiredKg} kg required).`);
  return gaps;
}
// Saving progress never certifies an incomplete ingredient as ready and never changes weights or codes.
export function readinessProgress(row:IngredientReadiness,requiredKg:number) {
  const gaps=readinessGaps(row,requiredKg);
  return {value:{...row,onSite:row.onSite&&gaps.length===0},gaps};
}
export function readinessStatus(row:IngredientReadiness|undefined,revision:string,requiredKg:number) {
  if(!row)return 'Not checked';
  const prepared=preparedQuantity(row);
  if(prepared!==null&&prepared+1e-9<requiredKg)return 'Shortfall';
  if(row.planRevision!==revision||Math.abs(row.requiredKg-requiredKg)>1e-9)return 'Recheck revised plan';
  return row.onSite&&readinessGaps(row,requiredKg).length===0?'Ready':'Not ready';
}
export function recordReadiness(state:TraceState,lotId:string,ingredientId:string,draft:IngredientReadiness,expectedPlanRevision:string,expectedCheckId:string,actor:string,role:string,at:string,id:string):TraceState {
  const plan=state.lots[lotId],revision=planRevision(plan);
  if(!plan||!revision||revision!==expectedPlanRevision)throw Error('The production plan changed. Reload the checklist and check the latest requirements.');
  const previous=state.readiness?.[lotId]?.[ingredientId];
  if((previous?.audit[previous.audit.length-1]?.id||'')!==expectedCheckId)throw Error('This ingredient check changed elsewhere. Reload before saving.');
  const required=checklistForecast(plan.value.planCsLitres,plan.value.planDirectLitres).find(r=>r.id===ingredientId);
  if(!required)throw Error('This ingredient is not required by the latest plan.');
  for(const quantity of [draft.availableKg,draft.floorBalanceKg,draft.broughtFromStorageKg])if(quantity!==null&&quantity!==undefined&&(!Number.isFinite(quantity)||quantity<0))throw Error('Ingredient weights must be zero or positive, in kg.');
  if(draft.storageBags!==undefined) {
    if(new Set(draft.storageBags.map(b=>b.id)).size!==draft.storageBags.length)throw Error('Each bag must have a separate entry.');
    const numbers=draft.storageBags.flatMap(b=>b.number===undefined?[]:[b.number]);
    if(numbers.some(n=>!Number.isInteger(n)||n<1)||new Set(numbers).size!==numbers.length)throw Error('Storage bag numbers must be unique positive whole numbers; Bag 0 is the floor balance.');
    if(draft.storageBags.some(b=>!b.id||(b.weightKg!==null&&(!Number.isFinite(b.weightKg)||b.weightKg<=0))))throw Error('Enter a positive weight for each bag.');
    
  }
  const prepared=preparedQuantity(draft);
  const gaps=readinessGaps(draft,required.total);
  if(draft.onSite&&gaps.length)throw Error(`${required.name}: ${gaps.join(' ')}`);
  if(!['owner','admin'].includes(role)&&draft.supplier!==(previous?.value.supplier||''))throw Error('Only owner/admin can enter or change the supplier.');
  if(previous&&previous.value.checkedBy!==actor&&previous.value.planRevision===revision&&!['owner','admin'].includes(role))throw Error('Only the original checker or owner/admin may revise this check.');
  const value={...draft,...(draft.storageBags!==undefined?{broughtFromStorageKg:storageBagTotal(draft.storageBags),supplierBatches:preparationBatchCodes(draft).join('; ')}:{}),availableKg:prepared,planRevision:revision,requiredKg:required.total,checkedBy:actor,checkedAt:at};
  if(previous) {
    const physical=(v:IngredientReadiness)=>({...v,supplier:'',checkedBy:'',checkedAt:''});
    if(JSON.stringify(physical(previous.value))===JSON.stringify(physical(value))) {
      value.checkedBy=previous.value.checkedBy;value.checkedAt=previous.value.checkedAt;
    }
  }
  if(previous&&JSON.stringify({...previous.value,checkedBy:'',checkedAt:''})===JSON.stringify({...value,checkedBy:'',checkedAt:''}))return state;
  const audit:Audit={id,at,actor,role,reason:draft.onSite?'Confirmed ready at factory':'Readiness progress recorded',before:previous?.value??null,after:value};
  const entry={value,audit:[...(previous?.audit||[]),audit]};
  return {...state,readiness:{...state.readiness,[lotId]:{...state.readiness?.[lotId],[ingredientId]:entry}}};
}
export function recordChecklist(state:TraceState,lotId:string,entries:{ingredientId:string;draft:IngredientReadiness;expectedCheckId:string}[],revision:string,actor:string,role:string,at:string,id:string) {
  // Build every change before publishing: one invalid/stale row aborts the whole save.
  return entries.reduce((next,entry,index)=>recordReadiness(next,lotId,entry.ingredientId,entry.draft,revision,entry.expectedCheckId,actor,role,at,`${id}:${index}`),state);
}
export function ingredientTemplate(type: PaneerRecipeType,milk: number): IngredientUse[] {
  return getPaneerRecipe(type,milk).lines.map(line=>({ id:line.id+'-first', ingredientId:line.id,name:line.name,quantity:null,unit:line.unit,supplier:'',supplierProductCode:'',supplierBatch:'' }));
}
export function consumedTotals(uses: IngredientUse[]) {
  const totals: Record<string,number>={};
  uses.forEach(use=>{ if(use.quantity === null) return;
    if (!Number.isFinite(use.quantity)||use.quantity<0) throw Error('Consumed quantities must be zero or positive.');
    totals[use.ingredientId]=(totals[use.ingredientId]||0)+use.quantity*(use.unit==='g'?0.001:1);
  }); return totals;
}
export function roundGaps(trace: RoundTrace, milkLitres:number, type:PaneerRecipeType) {
  const gaps:string[]=[];
  if(!validDate(trace.productionDate)) gaps.push('Start of production date missing');
  if(!trace.vessels.length) gaps.push('Actual vessel source missing');
  else if(Math.abs(trace.vessels.reduce((n,v)=>n+v.litres,0)-milkLitres)>0.001) gaps.push('Vessel litres differ from round milk');
  const ids=getPaneerRecipe(type,milkLitres).lines.map(l=>l.id);
  for(const id of ids) {
    const entries=trace.ingredients.filter(i=>i.ingredientId===id&&i.quantity!==null);
    if(!entries.length) gaps.push(`${id.replace(/_/g,' ')} consumption missing`);
    else if(entries.some(i=>!i.supplierBatch.trim())) gaps.push(`${id.replace(/_/g,' ')} batch references missing`);
  }
  return gaps;
}
// Staff may complete previously blank details, but may not replace known values.
export function onlyCompletesMissing(before:unknown,after:unknown):boolean {
  if(before===null||before===undefined||before==='') return true;
  if(Array.isArray(before)) {
    if(!Array.isArray(after)||after.length<before.length)return false;
    return before.every((item,index)=>{
      const id=item&&typeof item==='object'&&'id' in item?(item as {id:string}).id:undefined;
      const next=id?after.find(x=>x&&typeof x==='object'&&x.id===id):after[index];
      return next!==undefined&&onlyCompletesMissing(item,next);
    });
  }
  if(typeof before==='object'&&before!==null) return typeof after==='object'&&after!==null&&Object.entries(before).every(([key,value])=>onlyCompletesMissing(value,(after as Record<string,unknown>)[key]));
  return Object.is(before,after);
}
export function changeRecord<T>(previous: RecordEntry<T>|undefined,value:T,actor:string,role:string,reason:string,at:string,id:string,allowCompletion=false): RecordEntry<T> {
  if(previous && JSON.stringify(previous.value)===JSON.stringify(value)) return previous;
  const completing=Boolean(previous&&allowCompletion&&onlyCompletesMissing(previous.value,value));
  if(previous && !completing && !['owner','admin'].includes(role)) throw Error('Owner/admin must correct an existing traceability record.');
  if(previous && !completing && reason.trim().length<5) throw Error('Enter a correction reason of at least 5 characters.');
  return {value,audit:[...(previous?.audit||[]),{id,at,actor,role,reason:reason.trim()||(previous?'Completed missing details':'Initial entry'),before:previous?.value??null,after:value}]};
}
