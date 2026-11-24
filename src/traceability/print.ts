import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {halloumiPlanningRecipe} from '../lib/halloumiRecipe';
import {liquidChecklistForecast,liquidBrought,liquidStatus,type LiquidIngredientReadiness} from './liquidIngredients';
import { bagEntryGroups, bagGroupLabel, numberedBags, checklistForecast, readinessStatus, storageBagTotal, storageTopUp, type IngredientReadiness, type RecordEntry, type LotTrace } from './domain';
export interface ChecklistPrintOptions { revision:string; revisionNumber:number; checks:Record<string,RecordEntry<IngredientReadiness>>;liquidChecks?:Record<string,RecordEntry<LiquidIngredientReadiness>> }
export function buildForecastPdf(lotCode:string,plan:LotTrace,options?:ChecklistPrintOptions) {
  const doc=new jsPDF();doc.setFontSize(17);doc.text('Ingredient checklist',14,18);
  const names=[...new Set([...Object.values(options?.checks||{}),...Object.values(options?.liquidChecks||{})].map(c=>c.value.responsible).filter(Boolean))];
  let y=27;doc.setFontSize(10);
  const line=(text:string)=>{const lines=doc.splitTextToSize(text,181);doc.text(lines,14,y);y+=lines.length*4.5+3;};
  line(`Person: ${names.join(', ')||'____________________________'}`);
  line(`Milk lot ${lotCode} | Start of production date ${plan.productionDate||'Not confirmed'}`);
  line(`C/S ${plan.planCsLitres.toLocaleString()} L + Direct ${plan.planDirectLitres.toLocaleString()} L + Halloumi ${(plan.planHalloumiLitres??0).toLocaleString()} L | Plan revision ${options?.revisionNumber||'Draft'}`);
  const halloumi=halloumiPlanningRecipe(plan.planHalloumiLitres??0,plan.halloumiSaltGPer240L);
  if(halloumi.milkLitres>0){line(`Halloumi salt allowance: ${halloumi.saltGPer240L} g per 240 L (editable).`);line(`Halloumi solution water: ${halloumi.calciumWaterLitres} L for calcium chloride + ${halloumi.rennetWaterLitres} L for rennet.`);}
  line(`Printed ${new Date().toLocaleString('en-GB',{timeZone:'Africa/Johannesburg'})} SAST | Weights in kg; rennet in mL`);
  const rows=checklistForecast(plan.planCsLitres,plan.planDirectLitres,plan.planHalloumiLitres??0,plan.halloumiSaltGPer240L),liquids=liquidChecklistForecast(plan);
  const amount=(value:number|null|undefined,unit:string)=>value==null?'':`${value} ${unit}`;
  const weightRows=rows.map(r=>{const c=options?.checks[r.id]?.value,status=readinessStatus(c,options?.revision||'',r.total);return [status==='Ready'?'[X]':'[  ]',r.name,amount(r.total,'kg'),amount(c?.floorBalanceKg,'kg'),amount(storageTopUp(r.total,c?.floorBalanceKg??null),'kg'),amount(c?.storageBags!==undefined?storageBagTotal(c.storageBags):c?.broughtFromStorageKg,'kg')];});
  const liquidRows=liquids.map(r=>{const c=options?.liquidChecks?.[r.id]?.value;return [liquidStatus(c,options?.revision||'',r.total)==='Ready'?'[X]':'[  ]',r.name,amount(r.total,'mL'),amount(c?.floorBalanceMl,'mL'),amount(c?.floorBalanceMl==null?null:Math.max(0,Math.round((r.total-c.floorBalanceMl)*1e9)/1e9),'mL'),amount(c?liquidBrought(c):null,'mL')];});
  autoTable(doc,{startY:y+2,head:[['Ready','Ingredient','Required','Floor balance','Minimum extra','Actually brought']],body:[...weightRows,...liquidRows],styles:{fontSize:9},headStyles:{fillColor:[99,58,180]}});
  const batchRows:string[][]=[];
  rows.forEach(r=>{const c=options?.checks[r.id]?.value;
    if(!c){batchRows.push([r.name,'Bag / floor balance','________ kg','________________']);return;}
    if(c.storageBags!==undefined) {
      if(c.floorBalanceKg&&c.floorBalanceKg>0)batchRows.push([r.name,'Bag 0 - already on floor',`${c.floorBalanceKg} kg`,c.floorBatchCodes||'Not recorded']);
      bagEntryGroups(numberedBags(c.storageBags)).forEach(group=>batchRows.push([r.name,group.length>1?`${bagGroupLabel(group)} (${group.length} x ${group[0].weightKg} kg)`:bagGroupLabel(group),amount(storageBagTotal(group),'kg')||'Not recorded',group[0].batchCode||'Not recorded']));
      if(!c.storageBags.length&&!c.floorBalanceKg)batchRows.push([r.name,'No bags recorded','','']);
    } else batchRows.push([r.name,'Earlier transfer - individual bags not recorded',amount(c.broughtFromStorageKg,'kg'),c.supplierBatches||'Not recorded']);
  });
  liquids.forEach(r=>{const c=options?.liquidChecks?.[r.id]?.value;if(!c){batchRows.push([r.name,'Bottle / floor balance','________ mL','________________']);return;}
    if(c.floorBalanceMl&&c.floorBalanceMl>0)batchRows.push([r.name,'Floor bottle',amount(c.floorBalanceMl,'mL'),c.floorBatchCodes||'Not recorded']);
    c.containers.forEach((b,i)=>batchRows.push([r.name,`Storage bottle ${i+1}`,amount(b.volumeMl,'mL')||'Not recorded',b.batchCode||'Not recorded']));
    if(!c.containers.length&&!c.floorBalanceMl)batchRows.push([r.name,'No bottles recorded','','']);
  });
  autoTable(doc,{startY:(doc as any).lastAutoTable.finalY+10,head:[['Ingredient','Source / bag / bottle','Quantity','Batch/lot code']],body:batchRows,styles:{fontSize:9,overflow:'linebreak'},headStyles:{fillColor:[8,132,145]},rowPageBreak:'avoid'});
  const recorded=[...Object.values(options?.checks||{}),...Object.values(options?.liquidChecks||{})].map(c=>`${c.value.checkedBy} - ${new Date(c.value.checkedAt).toLocaleString('en-GB',{timeZone:'Africa/Johannesburg'})} SAST`);
  let bottom=(doc as any).lastAutoTable.finalY+12;if(bottom>248){doc.addPage();bottom=18;}
  doc.setFontSize(9);doc.text('Minimum extra = max(0, required - floor balance). Whole bags/bottles may exceed this.',14,bottom);
  doc.text('Preparation checklist only; actual production consumption is recorded separately.',14,bottom+8);
  doc.text('Recorded: '+([...new Set(recorded)].length===1?recorded[0]:'See checklist history for individual check times.'),14,bottom+16);
  doc.text('Reviewed by: __________________',14,bottom+24);
  return doc;
}
export function printForecast(lotCode:string,plan:LotTrace,options?:ChecklistPrintOptions) {
  buildForecastPdf(lotCode,plan,options).save(`Ingredient-checklist-${lotCode}-r${options?.revisionNumber||'draft'}.pdf`);
}
export function printLabels(sku:string,packet:string,outer:string,productionDate:string) {
  const doc=new jsPDF();doc.setFontSize(18);doc.text(`${sku} - proposed batch labels`,14,20);
  doc.setFontSize(11);doc.text(`Start of production date: ${productionDate}`,14,30);
  autoTable(doc,{startY:40,head:[['Label','Batch code']],body:[['Packet (includes round)',packet],['Outer case (one shift)',outer]],styles:{fontSize:13},headStyles:{fillColor:[32,62,80]}});
  doc.setFontSize(10);doc.text('Mixed shifts: use the shift supplying most packets on the case.',14,92);
  doc.text('Keep every packet\'s original round code and all contributing sources.',14,99);
  doc.save(`Batch-labels-${sku}-${packet}.pdf`);
}
