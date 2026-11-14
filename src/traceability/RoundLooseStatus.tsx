import { Link } from 'react-router-dom';
import type { ProductionRound } from '../data/mockData';
import type { TraceState } from './domain';
import { packingSourceKey } from './mixedPaneerCases';
export default function RoundLooseStatus({round,state}:{round:ProductionRound;state:TraceState}) {
 const assemblies=Object.values(state.mixedCases||{}).filter(c=>!c.voided&&c.parts.some(p=>p.source.roundId===round.id));
 const entries=(round.packedSkus||[]).flatMap((pack,index)=>{
  if(pack.weightKg!==undefined||pack.looseWeightKg!==undefined)return [];
  const parts=assemblies.flatMap(c=>c.parts.filter(p=>p.source.key===packingSourceKey(round.id,pack,index)).map(p=>({c,packets:p.packets}))),used=parts.reduce((n,p)=>n+p.packets,0);
  return (pack.loose||used)?[{pack,index,parts,used,remaining:(pack.loose||0)-used}]:[];
 });
 if(!entries.length)return null;
 return <div className="mt-1 rounded-lg border border-cyan-200 bg-cyan-50 p-2 text-xs text-cyan-900">{entries.map(e=><div key={e.index}><strong>{e.pack.sku}: {e.remaining} loose remaining</strong>{e.parts.map(({c,packets})=><p key={c.id}><Link className="underline" to={`/traceability?q=${encodeURIComponent(c.id)}`}>{packets} used in mixed case {c.number}</Link></p>)}{e.remaining<0&&<p className="text-red-700">Source packing correction needs owner review.</p>}</div>)}</div>;
}
