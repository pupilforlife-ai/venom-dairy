import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { bagEntryGroups, bagGroupLabel, numberedBags, checklistForecast, readinessStatus, storageBagTotal, storageTopUp, type IngredientReadiness, type RecordEntry, type LotTrace } from './domain';
export interface ChecklistPrintOptions { revision:string; revisionNumber:number; checks:Record<string,RecordEntry<IngredientReadiness>> }
export function buildForecastPdf(lotCode:string,plan:LotTrace,options?:ChecklistPrintOptions) {
  const doc=new jsPDF();doc.setFontSize(17);doc.text('Ingredient checklist',14,18);
  const names=[...new Set(Object.values(options?.checks||{}).map(c=>c.value.responsible).filter(Boolean))];
  doc.setFontSize(11);doc.text(doc.splitTextToSize(`Person: ${names.join(', ')||'____________________________'}`,181),14,27);
  doc.setFontSize(10);doc.text(`Milk lot ${lotCode} | Start of production date ${plan.productionDate || 'Not confirmed'}`,14,39);
  doc.text(`C/S ${plan.planCsLitres.toLocaleString()} L + Direct ${plan.planDirectLitres.toLocaleString()} L | Plan revision ${options?.revisionNumber||'Draft'}`,14,46);
  doc.text(`Printed ${new Date().toLocaleString('en-GB',{timeZone:'Africa/Johannesburg'})} SAST | All weights in kg`,14,53);
  const rows=checklistForecast(plan.planCsLitres,plan.planDirectLitres);
  autoTable(doc,{startY:61,head:[['Ready','Ingredient','Required\n(kg)','Floor balance\n(kg)','Minimum extra\n(kg)','Actually brought\n(kg)']],
    body:rows.map(r=>{const c=options?.checks[r.id]?.value,status=readinessStatus(c,options?.revision||'',r.total);return [status==='Ready'?'[X]':'[  ]',r.name,String(r.total),c?.floorBalanceKg??'',storageTopUp(r.total,c?.floorBalanceKg??null)??'',c?.storageBags!==undefined?(storageBagTotal(c.storageBags)??''):c?.broughtFromStorageKg??''];}),styles:{fontSize:9},headStyles:{fillColor:[32,62,80]}});
  const batchRows:string[][]=[];
  rows.forEach(r=>{const c=options?.checks[r.id]?.value;
    if(!c){batchRows.push([r.name,'Bag / floor balance','________','________________']);return;}
    if(c.storageBags!==undefined) {
      if(c.floorBalanceKg&&c.floorBalanceKg>0)batchRows.push([r.name,'Bag 0 - already on floor',String(c.floorBalanceKg),c.floorBatchCodes||'Not recorded']);
      bagEntryGroups(numberedBags(c.storageBags)).forEach(group=>batchRows.push([r.name,group.length>1?`${bagGroupLabel(group)} (${group.length} x ${group[0].weightKg} kg)`:bagGroupLabel(group),storageBagTotal(group)===null?'Not recorded':String(storageBagTotal(group)),group[0].batchCode||'Not recorded']));
      if(!c.storageBags.length&&!c.floorBalanceKg)batchRows.push([r.name,'No bags recorded','','']);
    } else batchRows.push([r.name,'Earlier transfer - individual bags not recorded',String(c.broughtFromStorageKg??''),c.supplierBatches||'Not recorded']);
  });
  autoTable(doc,{startY:(doc as any).lastAutoTable.finalY+10,head:[['Ingredient','Source / bag','Weight (kg)','Batch/lot code']],body:batchRows,styles:{fontSize:9,overflow:'linebreak'},headStyles:{fillColor:[32,62,80]},rowPageBreak:'avoid'});
  const recorded=Object.values(options?.checks||{}).map(c=>`${c.value.checkedBy} - ${new Date(c.value.checkedAt).toLocaleString('en-GB',{timeZone:'Africa/Johannesburg'})} SAST`);
  let bottom=(doc as any).lastAutoTable.finalY+12;if(bottom>248){doc.addPage();bottom=18;}
  doc.setFontSize(10);doc.text('Minimum extra = max(0, required - weighed floor balance). Whole bags can exceed this.',14,bottom);
  doc.text('These are preparation checks; actual production consumption is recorded separately.',14,bottom+8);
  doc.text('Recorded: '+([...new Set(recorded)].length===1?recorded[0]:'See saved checklist history for individual check times.'),14,bottom+16);
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
