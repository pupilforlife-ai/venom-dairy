import type { ProductionRound } from '../data/mockData';
import { Link } from 'react-router-dom';
import { paneerStockTrace, roundStockSummary } from './paneerStockTrace';

const number = (v: number) => v.toLocaleString('en-GB', {maximumFractionDigits: 3});
const quantity = (a: {packets: number | null; kg: number | null}) =>
  `${a.packets === null ? '' : `${number(a.packets)} packets · `}${a.kg === null ? 'Weight unknown' : `${number(a.kg)} kg`}`;
const title = {on_site: 'On site', distribution: 'In Distribution', discrepancy: 'Discrepancy'};
const colour = {on_site: 'border-emerald-200 bg-emerald-50 text-emerald-900', distribution: 'border-sky-200 bg-sky-50 text-sky-900', discrepancy: 'border-amber-200 bg-amber-50 text-amber-900'};

export default function PaneerStockCustody({round, report}: {round: ProductionRound; report: ReturnType<typeof paneerStockTrace>}) {
  const summary = roundStockSummary(round, report);
  return <details className="mt-3 min-w-0 rounded-xl border border-violet-200 bg-violet-50/60 p-3">
    <summary className="cursor-pointer font-semibold text-violet-900">Where are this round’s packed goods? · {summary.totals.length} SKU{summary.totals.length === 1 ? '' : 's'}</summary>
    <p className="mt-2 text-xs text-slate-600">Current stock locations after returns. Handover history shows gross movements and is not added again here. Mixed cases show only this round’s packet contribution.</p>
    {!summary.totals.length && <p className="mt-2 text-sm">No finished-paneer packing recorded yet.</p>}
    {summary.totals.map(t => <section key={t.sku} className="mt-3 min-w-0 rounded-xl border border-violet-100 bg-white p-3">
      <strong>{t.sku} · Original packing: {quantity({packets: t.originalPackets, kg: t.originalKg})}</strong>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {(['on_site', 'distribution', 'discrepancy'] as const).map(category => <div key={category} className={`min-w-0 rounded-lg border p-2 ${colour[category]}`}>
          <p className="text-xs font-semibold">{title[category]}</p><p className="break-words text-sm">{quantity(t[category === 'on_site' ? 'onSite' : category])}</p>
        </div>)}
      </div>
      <p className={`mt-2 text-xs ${t.differencePackets || t.differenceKg ? 'font-semibold text-red-700' : 'text-emerald-700'}`}>
        {(t.differencePackets === 0 || t.differencePackets === null) && t.differenceKg === 0 ? 'Recorded packing matches current stock classifications.' : 'Difference needs review.'}
        {' '}Unmatched: {quantity({packets: t.differencePackets, kg: t.differenceKg})}. No adjustment has been made.
      </p>
    </section>)}
    <div className="mt-3 space-y-2">{summary.rows.map(line => <div key={line.id} className={`min-w-0 rounded-lg border p-2 ${colour[line.category]}`}>
      <p className="break-words text-sm font-semibold">{line.sku} · {quantity(line)} · {title[line.category]}{line.returned ? ' · Returned to production' : ''}</p>
      <p className="break-words text-xs">{line.location} · Case label: {line.caseBatchCode || 'Not recorded'}</p>
      {line.mixedCaseId && <p className="text-xs"><Link className="underline" to={`/traceability?q=${encodeURIComponent(line.mixedCaseId)}`}>Mixed case source detail</Link> · {line.packets} of {line.totalPackets} packets across {line.physicalCases} physical case(s). These are existing packets, not extra production.</p>}
      <p className="break-all text-xs opacity-75">Packet label: {[...new Set(line.shares.map(s => s.packetBatchCode || 'Not recorded'))].join(', ')} · Stock ID: {line.id}</p>
    </div>)}</div>
    <Link className="mt-3 inline-block text-xs font-semibold text-violet-800 underline" to="/distribution">View handover and return records in Distribution →</Link>
  </details>;
}
