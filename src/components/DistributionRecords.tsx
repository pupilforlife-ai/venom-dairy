import { DistributionHandover } from '../data/mockData';

export type DistributionRecordGroups = Array<[string, DistributionHandover[]]>;

export function DistributionRecords({ groups, discrepancy = false }: { groups: DistributionRecordGroups; discrepancy?: boolean }) {
  return <section className="overflow-hidden rounded-xl border border-slate-200 bg-white" aria-label={discrepancy ? 'Discrepancy' : 'Distribution handover history'}>
    <header className="border-b border-slate-200 px-4 py-3">
      <h3 className="text-sm font-semibold text-slate-900">{discrepancy ? 'Discrepancy' : 'Distribution handover history'}</h3>
      <p className="mt-0.5 text-xs text-slate-500">{discrepancy ? 'Quantities cleared as incorrectly recorded. These are excluded from stock awaiting handover.' : 'Actual quantities handed over, grouped by milk lot with the latest lot first.'}</p>
    </header>
    {groups.length === 0 ? <p className="p-6 text-center text-sm text-slate-500">{discrepancy ? 'No incorrectly recorded quantities have been cleared.' : 'No distribution handovers recorded yet.'}</p> :
      <div className="space-y-4 p-3">{groups.map(([label, records]) => <section key={label} className="overflow-hidden rounded-lg border border-slate-200">
        <h4 className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-800">{label}</h4>
        <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm">
          <thead><tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
            <th className="px-3 py-2">Product / SKU</th><th className="px-3 py-2">Batch codes</th><th className="px-3 py-2">{discrepancy ? 'Incorrect quantity' : 'Transferred quantity'}</th>
            <th className="px-3 py-2">{discrepancy ? 'Reason' : 'Receiving location'}</th><th className="px-3 py-2">Recorded by</th><th className="px-3 py-2">Date</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">{[...records].sort((a, b) => b.handedOverAt.localeCompare(a.handedOverAt)).map(record => <tr key={record.id} className="align-top hover:bg-slate-50">
            <td className="px-3 py-3 font-medium text-slate-900">{record.productName}{record.sku && <div className="mt-1 font-mono text-xs text-indigo-700">{record.sku}</div>}</td>
            <td className="px-3 py-3 text-xs"><div className="font-mono font-semibold text-emerald-700">{record.finishedGoodsBatchCode || 'Finished batch not assigned'}</div><div className="mt-1 text-slate-500">Source: {(record.sourceBatchCodes?.length ? record.sourceBatchCodes : [record.batchCode]).join(', ')}</div>{record.finishedGoodsBatchCodeReviewedBy && <div className="mt-1 text-indigo-700">Batch code reviewed by {record.finishedGoodsBatchCodeReviewedBy}</div>}</td>
            <td className={`px-3 py-3 font-semibold ${discrepancy ? 'text-red-700' : 'text-slate-900'}`}>
              {(discrepancy ? record.partialRemainderQuantity || 0 : record.quantity).toFixed(record.unit === 'kg' ? 2 : 0)} {record.unit}
              {!discrepancy && record.cases !== undefined && <div className="text-xs font-normal text-slate-500">{record.cases} cases · {record.looseQuantity || 0} loose</div>}
              {!discrepancy && record.quantityVerified && <div className="mt-1 text-xs font-normal text-emerald-700">Physically verified{record.quantityVerifiedBy ? ` by ${record.quantityVerifiedBy}` : ''}</div>}
            </td>
            <td className="px-3 py-3 text-xs text-slate-600">{discrepancy ? record.partialDispositionReason || 'Reason not recorded' : record.storageLocation || record.destination}</td>
            <td className="px-3 py-3 text-xs text-slate-600">{discrepancy ? record.partialReviewedBy || record.handedOverBy : record.handedOverBy}</td>
            <td className="px-3 py-3 text-xs text-slate-500">{new Date(record.handedOverAt).toLocaleString()}</td>
          </tr>)}</tbody>
        </table></div>
      </section>)}</div>}
  </section>;
}
