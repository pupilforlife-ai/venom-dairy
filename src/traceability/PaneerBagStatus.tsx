import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Modal } from '../components/Modal';
import { useApp } from '../store/AppContext';
import { getPaneerRecipe } from '../lib/paneerRecipe';
import { useTraceability } from './useTraceability';
import { currentPaneerBags, paneerBagSequence, type BagCorrectionRequest } from './automaticPaneer';

export default function PaneerBagStatus({lotId}:{lotId:string}) {
  const {productionRounds,recordPaneerBagCorrection}=useApp(),{state}=useTraceability();
  const [ingredient,setIngredient]=useState(''),[roundId,setRoundId]=useState(''),[bag,setBag]=useState(''),[previous,setPrevious]=useState(''),[remaining,setRemaining]=useState('');
  const [during,setDuring]=useState(false),[reason,setReason]=useState('Physical bag differs from recipe-based estimate'),[operationId,setOperationId]=useState(''),[message,setMessage]=useState('');
  const [openedSequence,setOpenedSequence]=useState(0),[selectedCheckId,setSelectedCheckId]=useState('');
  const lines=getPaneerRecipe('C/S',500).lines;
  const rounds=productionRounds.filter(r=>r.milkLotId===lotId&&r.paneerAutomaticTrace).sort((a,b)=>b.paneerAutomaticTrace!.sequence-a.paneerAutomaticTrace!.sequence);
  const applicable=rounds.filter(r=>r.paneerAutomaticTrace!.ingredients.some(i=>i.id===ingredient));
  const current=ingredient?currentPaneerBags(productionRounds,state,lotId,ingredient):undefined;
  function open(id:string) {
    setIngredient(id);setRoundId(rounds.find(r=>r.paneerAutomaticTrace!.ingredients.some(i=>i.id===id))?.id||'');
    setBag('');setPrevious('');setRemaining('');setDuring(false);setReason('Physical bag differs from recipe-based estimate');setMessage('');setOperationId(crypto.randomUUID());
    setOpenedSequence(paneerBagSequence(productionRounds,lotId));setSelectedCheckId('');
  }
  function save() {try {
    if(!roundId||bag===''||remaining==='')throw Error('Select the round, bag number and weighed remaining amount.');
    const request:BagCorrectionRequest={id:operationId,roundId,ingredientId:ingredient,bagNumber:Number(bag),previousBagNumber:during&&previous!==''?Number(previous):undefined,remainingKg:Number(remaining),duringRound:during,reason,expectedSequence:openedSequence,expectedCheckId:selectedCheckId};
    recordPaneerBagCorrection(request);setIngredient('');setMessage('Physical bag and weighed balance saved. Future rounds will use the corrected estimate.');
  }catch(e){setMessage((e as Error).message);} }
  return <section className="trace-card trace-bag-status"><details><summary><strong>Automatic ingredient tracking</strong> · Bag 0 → 1 → 2</summary>
    <p className="trace-help">Normal production starts calculate recipe quantities and expected bag changes. Only correct this when the physical bag differs. These are recipe-based estimates, not measured consumption.</p>
    <div className="trace-table-scroll"><table><thead><tr><th>Ingredient</th><th>Expected bag / batch</th><th>Estimated remaining</th><th>Exception only</th></tr></thead><tbody>{lines.map(line=>{
      const status=currentPaneerBags(productionRounds,state,lotId,line.id);
      return <tr key={line.id}><td>{line.name}</td><td>{status.source?`Bag ${status.source.number} · ${status.source.batchCodes.join(', ')||'Batch code pending'}`:'Bag details pending'}</td><td>{status.remainingKg===null?'Not known':`${status.remainingKg} kg`}</td><td><button disabled={!rounds.some(r=>r.paneerAutomaticTrace!.ingredients.some(i=>i.id===line.id))} onClick={()=>open(line.id)}>Correct bag / balance</button></td></tr>;
    })}</tbody></table></div>
    <Link to="/milk-receiving?section=planning">Prepare numbered bags in Planning</Link>
  </details>{message&&!ingredient&&<p role="status">{message}</p>}
  <Modal isOpen={!!ingredient} onClose={()=>setIngredient('')} title="Correct physical ingredient bag">
    <div className="trace-form"><p>Weigh what remains in the open bag now. This resets the calculation for future rounds and keeps the earlier estimates in history. Packing and paneer output quantities are unchanged.</p>
    <label>Round where the difference was noticed<select value={roundId} onChange={e=>setRoundId(e.target.value)}>{applicable.map(r=><option key={r.id} value={r.id}>Shift {r.shiftNumber} / Round {r.roundNumber}</option>)}</select></label>
    <label>Physical bag now in use<select value={bag} onChange={e=>{setBag(e.target.value);setSelectedCheckId(current?.queue.find(b=>b.number===Number(e.target.value))?.checkId||'');}}><option value="">Choose numbered bag</option>{current?.queue.map(b=><option key={b.number} value={b.number}>Bag {b.number} · {b.batchCodes.join(', ')||'Batch code missing'}</option>)}</select></label>
    <label>Weighed remaining amount now (kg)<input type="number" min="0" step="any" value={remaining} onChange={e=>setRemaining(e.target.value)}/></label>
    <label><input type="checkbox" checked={during} onChange={e=>setDuring(e.target.checked)}/> The new bag was used during this round — link both bag codes.</label>
    {!during&&<p className="trace-help">Unchecked: the selected round’s sources stay unchanged; the new bag applies to future starts.</p>}
    {during&&<label>Previous bag actually used in this round<select value={previous} onChange={e=>setPrevious(e.target.value)}><option value="">Choose previous bag</option>{current?.queue.map(b=><option key={b.number} value={b.number}>Bag {b.number} · {b.batchCodes.join(', ')||'Batch code missing'}</option>)}</select></label>}
    <label>Reason<input value={reason} onChange={e=>setReason(e.target.value)}/></label>
    <div className="trace-buttons"><button className="trace-primary" onClick={save}>Save bag correction</button><button onClick={()=>setIngredient('')}>Cancel</button></div>{message&&<p role="alert">{message}</p>}
    </div>
  </Modal></section>;
}
