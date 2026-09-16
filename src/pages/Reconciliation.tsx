import {
  Milk,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  GitBranch,
  Scale,
} from 'lucide-react';
import { milkReconciliation, milkLots, productionRounds } from '../data/mockData';

export default function Reconciliation() {
  const recon = milkReconciliation;
  const hasVariance = recon.unexplainedVariance !== 0;

  // Calculate production outputs from rounds
  const currentWeekRounds = productionRounds.filter(r => r.milkLotCode === '160626' && r.outputWeight > 0);
  const totalPaneerD = currentWeekRounds.filter(r => r.type === 'D').reduce((s, r) => s + r.outputWeight, 0);
  const totalPaneerCS = currentWeekRounds.filter(r => r.type === 'C/S').reduce((s, r) => s + r.outputWeight, 0);
  const totalHalloumi = currentWeekRounds.filter(r => r.type === 'Halloumi').reduce((s, r) => s + r.outputWeight, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Weekly Milk Reconciliation</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Milk Lot: <span className="font-medium text-slate-700">{recon.lotCode}</span> — Auto-calculated from transactions
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white">
            {milkLots.map(lot => (
              <option key={lot.id} value={lot.lotCode}>{lot.lotCode}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Main reconciliation equation */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">Milk Balance Equation</h3>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-center">
            <p className="text-xs text-blue-600">Received</p>
            <p className="text-lg font-bold text-blue-700">{recon.received.toLocaleString()} L</p>
          </div>
          <span className="text-slate-400 font-bold">=</span>
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-center">
            <p className="text-xs text-emerald-600">Consumed</p>
            <p className="text-lg font-bold text-emerald-700">{recon.consumedByProduction.toLocaleString()} L</p>
          </div>
          <span className="text-slate-400 font-bold">+</span>
          <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-center">
            <p className="text-xs text-slate-500">Remaining</p>
            <p className="text-lg font-bold text-slate-700">{recon.remaining.toLocaleString()} L</p>
          </div>
          <span className="text-slate-400 font-bold">+</span>
          <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-center">
            <p className="text-xs text-red-600">Rejected</p>
            <p className="text-lg font-bold text-red-700">{recon.rejected} L</p>
          </div>
          <span className="text-slate-400 font-bold">+</span>
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-center">
            <p className="text-xs text-amber-600">Spilled</p>
            <p className="text-lg font-bold text-amber-700">{recon.spilled} L</p>
          </div>
          <span className="text-slate-400 font-bold">+</span>
          <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-center">
            <p className="text-xs text-slate-500">Other</p>
            <p className="text-lg font-bold text-slate-700">{recon.accountedOther} L</p>
          </div>
          <span className="text-slate-400 font-bold">+</span>
          <div className={`${hasVariance ? 'bg-red-50 border-red-300' : 'bg-emerald-50 border-emerald-200'} border rounded-lg px-3 py-2 text-center`}>
            <p className={`text-xs ${hasVariance ? 'text-red-600' : 'text-emerald-600'}`}>Unexplained</p>
            <p className={`text-lg font-bold ${hasVariance ? 'text-red-700' : 'text-emerald-700'}`}>{recon.unexplainedVariance} L</p>
          </div>
        </div>

        {hasVariance && (
          <div className="mt-4 flex items-start gap-2 p-3 bg-red-50 rounded-lg">
            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-red-700">Unexplained Variance: {recon.unexplainedVariance} L</p>
              <p className="text-xs text-red-600 mt-0.5">
                Received ({recon.received}) − Sum of accounted movements ({recon.consumedByProduction + recon.remaining + recon.rejected + recon.spilled + recon.accountedOther}) = {recon.unexplainedVariance} L
              </p>
              <p className="text-xs text-red-600 mt-1">
                Owner review required. This may indicate measurement error, unrecorded usage, or system gap.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Production outputs from this milk lot */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900">Production Outputs from Lot {recon.lotCode}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Product</th>
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Quantity</th>
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Rounds</th>
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Yield (kg/100L)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">Malai Paneer (D)</td>
                <td className="px-4 py-3 text-slate-700 font-medium">{totalPaneerD} kg</td>
                <td className="px-4 py-3 text-slate-500">{currentWeekRounds.filter(r => r.type === 'D').length}</td>
                <td className="px-4 py-3">
                  <span className="text-emerald-600 font-medium">
                    {recon.consumedByProduction > 0 ? ((totalPaneerD / recon.consumedByProduction) * 100).toFixed(1) : '—'}%
                  </span>
                </td>
              </tr>
              <tr className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">Rozana Paneer (C/S)</td>
                <td className="px-4 py-3 text-slate-700 font-medium">{totalPaneerCS} kg</td>
                <td className="px-4 py-3 text-slate-500">{currentWeekRounds.filter(r => r.type === 'C/S').length}</td>
                <td className="px-4 py-3">
                  <span className="text-indigo-600 font-medium">
                    {recon.consumedByProduction > 0 ? ((totalPaneerCS / recon.consumedByProduction) * 100).toFixed(1) : '—'}%
                  </span>
                </td>
              </tr>
              <tr className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">Halloumi</td>
                <td className="px-4 py-3 text-slate-700 font-medium">{totalHalloumi} kg</td>
                <td className="px-4 py-3 text-slate-500">{currentWeekRounds.filter(r => r.type === 'Halloumi').length}</td>
                <td className="px-4 py-3 text-slate-500">—</td>
              </tr>
              <tr className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">Recovered Cream</td>
                <td className="px-4 py-3 text-slate-700 font-medium">12 L</td>
                <td className="px-4 py-3 text-slate-500">Co-product</td>
                <td className="px-4 py-3 text-slate-500">—</td>
              </tr>
              <tr className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">PAN111 (Recovered)</td>
                <td className="px-4 py-3 text-slate-700 font-medium">4.2 kg</td>
                <td className="px-4 py-3 text-slate-500">Intermediate (not waste)</td>
                <td className="px-4 py-3 text-slate-500">—</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Batch-level reconciliation */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900">Batch Reconciliation — Completed Rounds</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Batch</th>
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Type</th>
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Input (L)</th>
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Output (kg)</th>
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Yield %</th>
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Packed</th>
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {productionRounds
                .filter(r => r.milkLotCode === '160626' && r.locked)
                .map(round => {
                  const yieldPct = round.actualInput > 0 ? ((round.outputWeight / round.actualInput) * 100).toFixed(1) : '—';
                  return (
                    <tr key={round.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-mono text-xs font-bold text-slate-900">
                        {round.milkLotCode}/S{round.shift}/R{round.roundNumber}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-xs font-bold">{round.type}</span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">{round.actualInput} L</td>
                      <td className="px-4 py-2.5 text-slate-600">{round.outputWeight} kg</td>
                      <td className="px-4 py-2.5">
                        <span className={`font-medium ${
                          typeof yieldPct === 'string' && parseFloat(yieldPct) >= 14 ? 'text-emerald-600' : 'text-amber-600'
                        }`}>
                          {yieldPct !== '—' ? `${yieldPct}%` : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">
                        {round.casesPacked ? `${round.casesPacked}c + ${round.loosePacked || 0}l` : '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                          <CheckCircle2 className="w-3 h-3" />
                          Reconciled
                        </span>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Previous week comparison */}
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
        <h3 className="text-sm font-semibold text-slate-900 mb-3">Previous Week Comparison (Lot 090626)</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          <div>
            <p className="text-xs text-slate-500">Received</p>
            <p className="text-lg font-bold text-slate-900">24,000 L</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Consumed</p>
            <p className="text-lg font-bold text-slate-900">23,600 L</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Rejected</p>
            <p className="text-lg font-bold text-red-600">200 L</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Unexplained</p>
            <p className="text-lg font-bold text-amber-600">200 L</p>
          </div>
        </div>
      </div>
    </div>
  );
}
