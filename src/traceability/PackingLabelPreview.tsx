import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { MilkLot, ProductionRound, PackedSku } from '../data/mockData';
import { paneerSkuByCode } from '../data/skuConfig';
import { useTraceability } from './useTraceability';
import { labelsForPacking } from './labels';
import { printLabels } from './print';
import { packetLabelPlan } from './packetLabelPlan';
export default function PackingLabelPreview({round,lot,sku,savedPack}:{round?:ProductionRound;lot?:MilkLot;sku:string;savedPack?:PackedSku}) {
 const {state}=useTraceability();
 const [weightText,setWeightText]=useState(()=>{try{return round ? String(packetLabelPlan(round,sku)?.weightKg??'') : '';}catch{return '';}});
 if(!round||!sku) return null;
 const labels=labelsForPacking(round,sku,lot,state,savedPack);
 const unitBased=paneerSkuByCode[sku]?.packMode==='units';
 let plan:ReturnType<typeof packetLabelPlan>=null,error='';
 if(unitBased&&!savedPack){try {if(!weightText.trim())throw Error('Enter the weight to estimate labels.');plan=packetLabelPlan(round,sku,Number(weightText));}catch(e){error=(e as Error).message;}}
 const content=<section className="min-w-0 rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50 to-cyan-50 p-3 text-sm" aria-label="Packet labels to print">
  <strong className="text-violet-900">{savedPack?'Recorded packing labels':'Packet labels to print'} · S{round.shiftNumber}/R{round.roundNumber} · {sku}</strong>
  {labels.packetBatchCode?<><p className="mt-2 text-xs text-violet-800">Full packet batch code</p><p className="break-all font-mono text-lg font-bold text-violet-900">{labels.packetBatchCode}</p>
  {unitBased&&!savedPack&&<div className="mt-2 space-y-2">
   <label className="block text-xs font-medium text-slate-700">Weight for labels (kg)<input aria-label="Weight for packet labels (kg)" type="number" inputMode="decimal" min="0" step="0.001" value={weightText} onChange={e=>setWeightText(e.target.value)} className="mt-1 w-full min-w-0 rounded-lg border border-violet-200 bg-white p-2 text-base"/></label>
   {error&&<p role="alert" className="text-xs text-red-700">{error}</p>}
   {plan&&<><p className="rounded-lg bg-white p-2 text-emerald-800" aria-live="polite"><strong className="text-xl">{plan.packets.toLocaleString()} packets / labels</strong><span className="mt-1 block text-xs">{plan.weightKg} kg ÷ {plan.unitWeightKg} kg = {plan.packets} whole packets · {plan.cases} cases + {plan.loose} loose</span></p>
    <p className="text-xs text-slate-600">Recorded balance: {plan.balanceKg.toFixed(3)} kg.{plan.remainderKg>0?` Less than one packet remains: ${plan.remainderKg.toFixed(6).replace(/0+$/,'')} kg.`:''}</p>
    {plan.exceedsBalance&&<p className="text-xs font-semibold text-amber-800">This weight exceeds the recorded balance. Check the physical weight and source records before printing.</p>}
   </>}
   <p className="text-xs text-slate-600">Estimate only; allow for trim and samples. Record actual cases and loose packets below.</p>
  </div>}
  {!unitBased&&<p className="mt-2 text-xs text-slate-600">This SKU is recorded by weight; a fixed packet count cannot be calculated.</p>}
  <details className="mt-2 text-xs text-violet-800"><summary className="cursor-pointer font-semibold">Case code and label preview</summary><p className="mt-2 break-all">Single-shift case: <strong>{labels.caseBatchCode}</strong></p><p className="mt-1">Start of production: {labels.traceabilityProductionDate}. Mixed cases use the majority shift and retain every source.</p><button type="button" className="mt-2 rounded-lg border border-violet-300 bg-white px-3 py-2 font-semibold" onClick={()=>printLabels(sku,labels.packetBatchCode,labels.caseBatchCode,labels.traceabilityProductionDate)}>Download label preview PDF</button></details>
  </>:<p className="mt-2 text-xs text-amber-800">{labels.traceabilityGap} Packing may still be saved; the missing code remains flagged in the register.</p>}
  <p className="mt-2 text-xs text-violet-700"><Link to={`/traceability?q=${encodeURIComponent(round.id)}`}>View round sources and outputs →</Link></p>
 </section>;
 return <><details className="min-w-0 rounded-lg border border-violet-200 bg-violet-50 p-2 text-violet-900 md:hidden"><summary className="cursor-pointer break-words text-xs font-semibold">{savedPack?'Recorded packet code':'Packet labels'} · {labels.packetBatchCode||'Code pending'}{plan?` · ${plan.packets.toLocaleString()} labels`:''}<span className="mt-1 block font-normal">Tap for weight calculation and label preview</span></summary><div className="mt-2">{content}</div></details><div className="hidden md:block">{content}</div></>;
}
