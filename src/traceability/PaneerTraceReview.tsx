import PaneerJourneyView from './PaneerJourneyView';
import { memo, useState } from 'react';
import type { MilkLot,ProductionRound } from '../data/mockData';
import { Modal } from '../components/Modal';
import { latestPaneerIngredientIssue } from '../lib/paneerRecipe';
import { useTraceability } from './useTraceability';
import { agreedPrefixes,safeCode } from './domain';
import { roundIngredientSources } from './automaticPaneer';
import RoundTracePanel from './RoundTracePanel';

function PaneerTraceReview({round,lot}:{round:ProductionRound;lot?:MilkLot}) {
  const [open,setOpen]=useState(false),[manualOpen,setManualOpen]=useState(false),{state}=useTraceability();
  const trace=round.paneerAutomaticTrace,issue=latestPaneerIngredientIssue(round),manual=state.rounds[round.id]?.value;
  const date=trace?.productionDate||round.traceabilityProductionDate||state.lots[round.milkLotId]?.value.productionDate||lot?.traceabilityProductionDate||'';
  const code=trace?.code||safeCode(state.prefixes[round.type]?.value||agreedPrefixes[round.type],date,round.shiftNumber,round.roundNumber).code;
  const owner=['owner','admin'].includes(localStorage.getItem('vejoy_user_role')||'');
  return <div className="trace-round"><button onClick={()=>setOpen(true)}>Traceability history · {code||'Code pending'}</button>
    <Modal isOpen={open} onClose={()=>setOpen(false)} title={`Traceability history · Shift ${round.shiftNumber} / Round ${round.roundNumber}`} size="lg"><div className="trace-form">
      <p><strong>{code||'Batch code pending'}</strong> · Milk lot {round.milkLotCode} · {round.type} paneer · Vat {round.vat?.replace('vat','')||'not recorded'}</p>
      <p>Start of production date: {date||'Not recorded'}</p>
      {trace?<p className="trace-help">Automatically captured {new Date(trace.recordedAt).toLocaleString('en-GB')} by {trace.recordedBy}. Standard recipe quantities are calculated from {issue?.milkLitres||trace.milkLitres} L. They are not separately weighed ingredient quantities.</p>:<p className="trace-warning">No automatic bag snapshot was captured for this round. Its recorded production and any earlier manual traceability details are retained; bag origins have not been invented.</p>}
      {trace&&issue?.id!==trace.recipeIssueId&&<p className="trace-warning">The milk quantity or paneer type was corrected after the original bag estimate. Review the bag links and reweigh the current open bag.</p>}
      <div className="space-y-2 md:hidden" aria-label="Ingredient source cards">{(issue?.lines||trace?.ingredients||[]).map(line=>{
        const sources=roundIngredientSources(round,line.id),warnings=trace?.ingredients.find(i=>i.id===line.id)?.warnings||[];
        const old=manual?.ingredients.filter(i=>i.ingredientId===line.id).map(i=>i.supplierBatch).filter(Boolean)||[];
        return <section key={line.id} className="min-w-0 rounded-lg border border-violet-200 bg-violet-50 p-2 text-sm"><strong>{line.name} · {line.quantity} {line.unit}</strong><div className="mt-1 break-words text-xs">{sources.length?sources.map((s,index)=><p key={`${s.number}:${index}`}>Bag {s.number} · {s.batchCodes.join(', ')||'Batch code missing'}</p>):old.join(', ')||'Source pending'}</div>{warnings.map(w=><p key={w} className="trace-warning">{w}</p>)}</section>;
      })}</div>
      <div className="trace-table-scroll hidden md:block"><table><thead><tr><th>Ingredient</th><th>Standard quantity issued</th><th>Bag number(s) / batch code(s)</th></tr></thead><tbody>{(issue?.lines||trace?.ingredients||[]).map(line=>{
        const sources=roundIngredientSources(round,line.id),warnings=trace?.ingredients.find(i=>i.id===line.id)?.warnings||[];
        const old=manual?.ingredients.filter(i=>i.ingredientId===line.id).map(i=>i.supplierBatch).filter(Boolean)||[];
        return <tr key={line.id}><td>{line.name}</td><td>{line.quantity} {line.unit}</td><td>{sources.length?sources.map((s,index)=><div key={`${s.number}:${index}`}>Bag {s.number} · {s.batchCodes.join(', ')||'Batch code missing'}</div>):old.join(', ')||'Source pending'}{warnings.map(w=><p key={w} className="trace-warning">{w}</p>)}</td></tr>;
      })}</tbody></table></div>
      {!!round.paneerBagCorrections?.length&&<details><summary>Physical bag corrections</summary>{round.paneerBagCorrections.map(c=><p key={c.id}>{new Date(c.recordedAt).toLocaleString('en-GB')} · {c.recordedBy} · {c.ingredientId.replace(/_/g,' ')} · Bag {c.source.number}: {c.source.batchCodes.join(', ')} · {c.remainingKg??'Unknown'} kg remaining · {c.duringRound?'Used during this round; both bag codes linked':'Applies to future starts'} · {c.reason}{c.warnings?.map(w=><span key={w}><br/>{w}</span>)}</p>)}</details>}
      <details className="rounded-lg border border-cyan-200 bg-cyan-50 p-2 md:hidden"><summary>Round journey, cutting &amp; outputs</summary><PaneerJourneyView round={round} lot={lot} state={state}/></details>
      <div className="hidden md:block"><PaneerJourneyView round={round} lot={lot} state={state}/></div>
      <p className="trace-help">Continue recording temperatures, cutting, weights and packing through the normal board buttons. You do not need to fill in a separate traceability form for each round.</p>
    </div></Modal>
    {owner&&<details onToggle={event=>setManualOpen(event.currentTarget.open)}><summary>Owner/Admin · earlier manual records and corrections</summary>{manualOpen&&<RoundTracePanel round={round} lot={lot}/>}</details>}
  </div>;
}

export default memo(PaneerTraceReview);
