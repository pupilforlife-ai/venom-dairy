import { useState } from 'react';
import { addNumberedCases, type IngredientReadiness } from './domain';

export default function CaseBagEntry({ingredient,row,onChange}:{ingredient:string;row:IngredientReadiness;onChange:(value:IngredientReadiness)=>void}) {
  const [count,setCount]=useState(''),[weight,setWeight]=useState('25'),[batch,setBatch]=useState(''),[error,setError]=useState('');
  const total=Number(count)*Number(weight);
  function add(){try{
    const next=addNumberedCases(row,Number(count),Number(weight),batch,crypto.randomUUID());
    onChange(next);setCount('');setBatch('');setError('');
  }catch(e){setError((e as Error).message);}}
  return <div className="trace-case-group"><h4>Add cases / bags of one batch</h4>
    <div className="trace-fields">
      <label>{ingredient} number of cases<input type="number" min="1" step="1" inputMode="numeric" value={count} onChange={e=>setCount(e.target.value)} placeholder="e.g. 40"/></label>
      <label>{ingredient} weight per case (kg)<input type="number" min="0.001" step="any" inputMode="decimal" value={weight} onChange={e=>setWeight(e.target.value)}/></label>
      <label>{ingredient} cases batch/lot code<input value={batch} onChange={e=>setBatch(e.target.value)} placeholder="e.g. 233769"/></label>
    </div>
    <p><strong>{count&&Number.isFinite(total)&&total>0?`${count} cases × ${weight} kg = ${Math.round(total*1e9)/1e9} kg`:'Enter the case count, case weight and batch code once.'}</strong></p>
    <button onClick={add}>Add cases of this batch</button>
    <p className="trace-help">Each case keeps its own number for automatic usage. Different batch codes can be entered as separate groups. The floor remainder stays Bag 0.</p>
    {error&&<p role="alert" className="trace-warning">{error}</p>}
  </div>;
}
