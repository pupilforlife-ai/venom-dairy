import { useRef,useState } from 'react';
import type { ProductionRound } from '../data/mockData';
import { currentTrayRegister, SCRAMBLE_LOCATIONS } from './paneerStorage';
import type { CuttingTrace } from './domain';

export default function PaneerCutDetailsForm({value,onChange,blockKg,packetBatchCode,phase='weighing',roundId='',rounds=[]}:{value:CuttingTrace;onChange:(value:CuttingTrace)=>void;blockKg:number;packetBatchCode:string;phase?:'weighing'|'after_cutting';roundId?:string;rounds?:ProductionRound[]}) {
 const number=(text:string)=>text===''?null:Number(text),trayPicker=useRef<HTMLDetailsElement>(null);
 const occupied=new Map(currentTrayRegister(rounds).filter(t=>t.round&&t.round.id!==roundId).map(t=>[t.number,t.round!]));
 const [clothEntry,setClothEntry]=useState(false);
 const hasCloth=clothEntry||(value.clothKg!==null&&value.clothKg>0);
 return <section className="trace-cut-checks" aria-label="Cutting quick checks">
  <h4>{phase==='weighing'?'Block & cloth weights':'After cutting'}</h4>
  {phase==='weighing'&&<div className="trace-cut-row"><span className="trace-cut-label">Cloth</span><div className="trace-cut-controls">
   <button type="button" aria-pressed={value.clothKg===0&&!clothEntry} onClick={()=>{setClothEntry(false);onChange({...value,clothKg:0});}}>No cloth</button>
   <button type="button" aria-pressed={hasCloth} onClick={()=>{setClothEntry(true);onChange({...value,clothKg:value.clothKg&&value.clothKg>0?value.clothKg:null});}}>Enter kg</button>
   {hasCloth&&<input aria-label="Cloth weight (kg)" type="number" min="0" step="any" inputMode="decimal" placeholder="Cloth kg" value={value.clothKg??''} onChange={e=>onChange({...value,clothKg:number(e.target.value)})}/>}
   {value.clothKg===null&&!hasCloth&&<span className="trace-cut-pending">Choose one</span>}
  </div></div>}
  {phase==='after_cutting'&&<>
  <div className="trace-cut-row"><span className="trace-cut-label">Trays</span><details ref={trayPicker} className="trace-cut-trays"><summary>{value.trayNumbers?.length?`Trays ${value.trayNumbers.join(', ')} · ${value.trayNumbers.length} selected`:'Select tray numbers 1–20'}</summary>
   <div className="trace-cut-tray-grid">{Array.from({length:20},(_,i)=>i+1).map(n=><label key={n} className={occupied.has(n)?'trace-cut-tray-occupied':value.trayNumbers?.includes(n)?'trace-cut-tray-selected':''} title={occupied.has(n)?`In use · ${occupied.get(n)!.milkLotCode} S${occupied.get(n)!.shiftNumber}/R${occupied.get(n)!.roundNumber}`:'Available'}><input type="checkbox" checked={value.trayNumbers?.includes(n)||false} onChange={e=>{const numbers=e.target.checked?[...(value.trayNumbers||[]),n].sort((a,b)=>a-b):(value.trayNumbers||[]).filter(id=>id!==n);onChange({...value,trayNumbers:numbers,trays:numbers.length});}}/><span>{n}{occupied.has(n)&&<small className="block">In use</small>}</span></label>)}</div>
   <p className="trace-cut-note">Amber trays are in use by another round. Check with packing before reuse; recording reuse flags the earlier unfinished round.</p>
   <button type="button" onClick={()=>{if(trayPicker.current)trayPicker.current.open=false;}}>Done</button>
  </details></div>
  <div className="trace-cut-row"><label className="trace-cut-label" htmlFor="cut-scramble-weight">Scramble / PAN111</label><div className="trace-cut-scramble"><input id="cut-scramble-weight" aria-label="Scramble weighed at cutting (kg)" type="number" min="0" step="any" inputMode="decimal" placeholder="kg, if weighed" value={value.scrambleKg??''} onChange={e=>onChange({...value,scrambleKg:number(e.target.value)})}/><select aria-label="Scramble storage" value={value.scrambleLocation} onChange={e=>onChange({...value,scrambleLocation:e.target.value})}>{!SCRAMBLE_LOCATIONS.includes(value.scrambleLocation as typeof SCRAMBLE_LOCATIONS[number])&&<option value={value.scrambleLocation}>{value.scrambleLocation||'Not recorded'}</option>}{SCRAMBLE_LOCATIONS.map(location=><option key={location} value={location}>{location}</option>)}</select></div></div>
  <div className="trace-cut-row"><label className="trace-cut-label" htmlFor="cut-sample-count">Samples</label><div className="trace-cut-samples"><input id="cut-sample-count" aria-label="Retention sample pieces" type="number" min="0" step="1" inputMode="numeric" placeholder="Pieces" value={value.samplePieces??''} onChange={e=>onChange({...value,samplePieces:number(e.target.value)})}/><span><strong>Packet: {value.samplePacketBatchCode||packetBatchCode||'Round code pending'}</strong><br/>Crate: {value.sampleCrateCode||'Pending'} · {value.sampleLocation||'Container'}</span></div></div>
  </>}
  {phase==='weighing'&&<p className="trace-cut-note">Save the weights now. Use “After cutting” on this round later to record trays, scramble and sample pieces.</p>}
  {phase==='weighing'&&value.clothKg!==null&&<p className="trace-cut-note">Net after cloth: <strong>{Math.round((blockKg-value.clothKg)*1e9)/1e9} kg</strong></p>}
 </section>;
}
