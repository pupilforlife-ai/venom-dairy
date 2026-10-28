import { paneerSkuByCode } from '../data/skuConfig';
import type { buildMilkLotPackedSummary } from '../lib/milkLotPackedSummary';

export function MilkLotPackedSummary({ summary, loading = false }: { summary: ReturnType<typeof buildMilkLotPackedSummary>; loading?: boolean }) {
  return <div className="space-y-4">
    <p className="text-xs text-slate-500">Recorded packed production for this milk lot—not stock remaining after transfers. Weights use SKU pack sizes and recorded case weights. Halloumi shows kg vacuum packed. Standalone JP and unlinked batches are not assigned to this milk lot.</p>
    {loading && <p role="status" className="text-xs text-slate-500">Loading crumbing records…</p>}
    {summary.mixedLotPackingEntries > 0 && <p role="status" className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">{summary.mixedLotPackingEntries} mixed-source crumbing packing {summary.mixedLotPackingEntries === 1 ? 'entry is' : 'entries are'} excluded from these lot totals: no exact per-milk-lot case/weight split was recorded. Review the combined packing record on the Production Board.</p>}
    {summary.groups.map(group => <section key={group.id} aria-label={`${group.label} packed summary`} className="overflow-hidden rounded-lg border border-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 px-3 py-2">
        <h4 className="text-sm font-bold text-slate-900">{group.label}</h4>
        <span className="text-sm font-bold text-slate-900">{group.missingWeight ? 'Known weight: ' : 'Total weight: '}{group.weightKg.toFixed(2)} kg{group.missingWeight ? ' · incomplete' : ''}</span>
      </div>
      {group.lines.length === 0 ? <p className="px-3 py-4 text-xs text-slate-500">No packing recorded for this category.</p> : <div className="overflow-x-auto"><table className="w-full text-sm">
        <thead><tr className="border-b border-slate-200">
          <th className="px-2 py-2 text-left text-[10px] uppercase tracking-wider text-slate-500">SKU / packing record</th>
          <th className="px-2 py-2 text-right text-[10px] uppercase tracking-wider text-slate-500">Cases</th>
          <th className="px-2 py-2 text-right text-[10px] uppercase tracking-wider text-slate-500">Loose</th>
          <th className="px-2 py-2 text-right text-[10px] uppercase tracking-wider text-slate-500">Weight</th>
        </tr></thead>
        <tbody className="divide-y divide-slate-100">{group.lines.map(line => <tr key={line.sku}>
          <td className="px-2 py-3 font-mono font-semibold text-slate-900">{line.sku}</td>
          <td className="px-2 py-3 text-right font-bold text-slate-900">{line.weightOnly ? '—' : line.cases.toLocaleString()}{Object.keys(line.caseWeights).length > 0 && <div className="mt-1 text-[10px] font-normal text-slate-500">{Object.entries(line.caseWeights).map(([kg, count]) => `${count} × ${kg} kg`).join(' · ')}</div>}</td>
          <td className="px-2 py-3 text-right font-bold text-slate-900">{line.weightOnly ? '—' : paneerSkuByCode[line.sku]?.packMode === 'weight_loose' ? `${line.looseWeightKg.toFixed(2)} kg` : line.loose.toLocaleString()}</td>
          <td className="px-2 py-3 text-right font-bold text-slate-900">{line.weightKg.toFixed(2)} kg{line.missingWeight && <div className="text-[10px] font-normal text-amber-700">Weight missing for some entries</div>}</td>
        </tr>)}</tbody>
        <tfoot><tr className="border-t border-slate-200 bg-slate-50"><th colSpan={3} className="px-2 py-2 text-left text-xs text-slate-700">{group.label} · {group.missingWeight ? 'known packed weight' : 'total packed weight'}</th><td className="px-2 py-2 text-right text-sm font-bold text-slate-900">{group.weightKg.toFixed(2)} kg</td></tr></tfoot>
      </table></div>}
    </section>)}
  </div>;
}
