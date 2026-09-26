import {
  Milk,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  GitBranch,
  Scale,
  ShieldCheck,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../store/AppContext';
import { supabase } from '../lib/supabase';
import { getPaneerPackWeight, paneerSkuByCode } from '../data/skuConfig';

export default function Reconciliation() {
  const { milkLots, productionRounds, updateProductionRound } = useApp();
  const [selectedLotCode, setSelectedLotCode] = useState('');
  const [auditIdentity, setAuditIdentity] = useState({ username: '', role: '' });
  const selectedLot = milkLots.find(lot => lot.lotCode === selectedLotCode) ?? milkLots[0];
  const lotCode = selectedLot?.lotCode ?? '';
  const currentWeekRounds = productionRounds.filter(r => r.milkLotCode === lotCode && r.outputWeight > 0);
  const consumedByProduction = currentWeekRounds.reduce((total, round) => total + round.actualInput, 0);
  const received = selectedLot?.litresReceived ?? 0;
  const remaining = selectedLot?.litresRemaining ?? 0;
  const rejected = selectedLot?.litresRejected ?? 0;
  const spilled = selectedLot?.litresSpilled ?? 0;
  const accountedOther = selectedLot?.litresSold ?? 0;
  const unexplainedVariance = received - (consumedByProduction + remaining + rejected + spilled + accountedOther);
  const recon = {
    lotCode,
    received,
    consumedByProduction,
    remaining,
    rejected,
    spilled,
    accountedOther,
    unexplainedVariance,
  };
  const hasVariance = recon.unexplainedVariance !== 0;

  const totalPaneerD = currentWeekRounds.filter(r => r.type === 'D').reduce((s, r) => s + r.outputWeight, 0);
  const totalPaneerCS = currentWeekRounds.filter(r => r.type === 'C/S').reduce((s, r) => s + r.outputWeight, 0);
  const totalHalloumi = currentWeekRounds.filter(r => r.type === 'Halloumi').reduce((s, r) => s + r.outputWeight, 0);

  useEffect(() => {
    const fallback = {
      username: window.localStorage.getItem('vejoy_user_username') || '',
      role: window.localStorage.getItem('vejoy_user_role') || '',
    };
    setAuditIdentity(fallback);
    const client = supabase;
    if (!client) return;
    void client.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: profile } = await client
        .from('profiles')
        .select('username, role')
        .eq('id', data.user.id)
        .maybeSingle<{ username: string; role: string }>();
      if (profile) setAuditIdentity({ username: profile.username || '', role: profile.role || '' });
    });
  }, []);

  const isKbOwner = auditIdentity.username.toLowerCase() === 'kb' && auditIdentity.role.toLowerCase() === 'owner';
  const auditToleranceKg = 1;
  const paneerAuditRounds = useMemo(
    () => productionRounds.filter(round => round.milkLotCode === lotCode && (round.type === 'D' || round.type === 'C/S') && (round.actualInput > 0 || round.outputWeight > 0 || round.blockWeights?.length || round.packedSkus?.length)),
    [productionRounds, lotCode],
  );
  const getPackWeight = (pack: { sku: string; cases: number; loose?: number; looseWeightKg?: number; weightKg?: number }) =>
    getPaneerPackWeight(paneerSkuByCode[pack.sku], pack.cases || 0, pack.loose || 0, pack.looseWeightKg || 0, pack.weightKg || 0);
  const getBlockTotal = (round: typeof productionRounds[number]) => (round.blockWeights || []).reduce((sum, weight) => sum + weight, 0);
  const getStaffPackedWeight = (round: typeof productionRounds[number]) => (round.packedSkus || []).reduce((sum, pack) => sum + getPackWeight(pack), 0);
  const getVerifiedSkuWeight = (round: typeof productionRounds[number]) => (round.verifiedPackedSkus || []).filter(pack => pack.sku !== 'PAN111').reduce((sum, pack) => sum + getPackWeight(pack), 0);
  const getApprovedPan111Weight = (round: typeof productionRounds[number]) => round.pan111ApprovalStatus === 'approved'
    ? round.pan111RequestedWeight || round.packedSkus?.find(pack => pack.sku === 'PAN111')?.weightKg || 0
    : 0;
  const auditRows = paneerAuditRounds.map(round => {
    const blockWeight = getBlockTotal(round);
    const staffOutput = round.outputWeight || 0;
    const staffPacked = getStaffPackedWeight(round);
    const verifiedOutput = getVerifiedSkuWeight(round) + getApprovedPan111Weight(round);
    return {
      round,
      milkUsed: round.actualInput || round.plannedInput || 0,
      staffOutput,
      blockWeight,
      staffPacked,
      verifiedOutput,
      staffVsBlocks: blockWeight - staffOutput,
      blocksVsVerified: blockWeight - verifiedOutput,
      skuStatus: round.verifiedPackedSkus ? 'Verified' : getApprovedPan111Weight(round) > 0 ? 'PAN111 approved' : 'Pending verification',
    };
  });
  const auditSummary = auditRows.reduce((summary, row) => ({
    milkUsed: summary.milkUsed + row.milkUsed,
    staffOutput: summary.staffOutput + row.staffOutput,
    blockWeight: summary.blockWeight + row.blockWeight,
    staffPacked: summary.staffPacked + row.staffPacked,
    verifiedOutput: summary.verifiedOutput + row.verifiedOutput,
  }), { milkUsed: 0, staffOutput: 0, blockWeight: 0, staffPacked: 0, verifiedOutput: 0 });
  const verifyRoundSkus = (round: typeof productionRounds[number]) => {
    if (!isKbOwner || !round.packedSkus?.length) return;
    updateProductionRound(round.id, {
      verifiedPackedSkus: round.packedSkus.filter(pack => pack.sku !== 'PAN111'),
      verifiedSkuAt: new Date().toISOString(),
      verifiedSkuBy: 'kb',
    });
  };

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
          <select value={lotCode} onChange={(event) => setSelectedLotCode(event.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white">
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
                        {round.milkLotCode}/S{round.shiftNumber}/R{round.roundNumber}
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
                        {round.packedSkus && round.packedSkus.length > 0 
                          ? round.packedSkus.map(p => `${p.cases}c + ${p.loose}l ${p.sku}`).join(', ')
                          : '—'}
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

      {isKbOwner && (
        <section className="bg-white rounded-xl border border-indigo-200 overflow-hidden">
          <div className="px-4 py-4 border-b border-indigo-200 bg-indigo-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-indigo-950 flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> Owner Audit — production to verified SKU</h3>
              <p className="text-xs text-indigo-700 mt-1">KB-only view. Values are compared exactly; differences above ±{auditToleranceKg} kg are flagged.</p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-600 px-2.5 py-1 text-[11px] font-semibold text-white"><ShieldCheck className="w-3 h-3" /> KB owner</span>
          </div>
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><p className="text-[11px] uppercase tracking-wide text-slate-500">Paneer rounds</p><p className="mt-1 text-lg font-bold text-slate-900">{auditRows.length}</p></div>
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3"><p className="text-[11px] uppercase tracking-wide text-blue-700">Milk used</p><p className="mt-1 text-lg font-bold text-blue-900">{auditSummary.milkUsed.toFixed(1)} L</p></div>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3"><p className="text-[11px] uppercase tracking-wide text-emerald-700">Block weight</p><p className="mt-1 text-lg font-bold text-emerald-900">{auditSummary.blockWeight.toFixed(2)} kg</p></div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3"><p className="text-[11px] uppercase tracking-wide text-amber-700">Verified SKUs</p><p className="mt-1 text-lg font-bold text-amber-900">{auditSummary.verifiedOutput.toFixed(2)} kg</p></div>
              <div className="rounded-lg border border-purple-200 bg-purple-50 p-3"><p className="text-[11px] uppercase tracking-wide text-purple-700">L per verified kg</p><p className="mt-1 text-lg font-bold text-purple-900">{auditSummary.verifiedOutput > 0 ? (auditSummary.milkUsed / auditSummary.verifiedOutput).toFixed(3) : '—'}</p></div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm min-w-[980px]">
                <thead>
                  <tr className="bg-slate-50 text-left">
                    <th className="px-3 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Round</th>
                    <th className="px-3 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Milk used</th>
                    <th className="px-3 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Staff output</th>
                    <th className="px-3 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Block weights</th>
                    <th className="px-3 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Staff packed</th>
                    <th className="px-3 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Verified SKUs</th>
                    <th className="px-3 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Variances</th>
                    <th className="px-3 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Review</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {auditRows.map(({ round, milkUsed, staffOutput, blockWeight, staffPacked, verifiedOutput, staffVsBlocks, blocksVsVerified, skuStatus }) => {
                    const staffFlag = Math.abs(staffVsBlocks) > auditToleranceKg;
                    const verifiedFlag = Math.abs(blocksVsVerified) > auditToleranceKg;
                    return (
                      <tr key={round.id} className="align-top hover:bg-slate-50/70">
                        <td className="px-3 py-3"><div className="font-mono text-xs font-bold text-slate-900">{round.milkLotCode} · {round.type} R{round.roundNumber}</div><div className="mt-1 text-[11px] text-slate-500">{round.cutBy ? `Cut by ${round.cutBy}` : 'Cutter not recorded'}</div></td>
                        <td className="px-3 py-3 text-slate-700">{milkUsed.toFixed(1)} L</td>
                        <td className="px-3 py-3 text-slate-700">{staffOutput.toFixed(2)} kg</td>
                        <td className="px-3 py-3"><div className="font-semibold text-slate-800">{blockWeight.toFixed(2)} kg</div><div className="text-[11px] text-slate-500">{round.blockWeights?.length || 0} blocks</div></td>
                        <td className="px-3 py-3 text-slate-700">{staffPacked.toFixed(2)} kg</td>
                        <td className="px-3 py-3"><div className="font-semibold text-amber-800">{verifiedOutput.toFixed(2)} kg</div><div className={`text-[11px] ${skuStatus === 'Pending verification' ? 'text-amber-600' : 'text-emerald-600'}`}>{skuStatus}</div></td>
                        <td className="px-3 py-3 space-y-1">
                          <div className={`text-[11px] font-semibold ${staffFlag ? 'text-red-700' : 'text-emerald-700'}`}>Output vs blocks: {staffVsBlocks >= 0 ? '+' : ''}{staffVsBlocks.toFixed(2)} kg</div>
                          <div className={`text-[11px] font-semibold ${verifiedFlag ? 'text-red-700' : 'text-emerald-700'}`}>Blocks vs verified: {blocksVsVerified >= 0 ? '+' : ''}{blocksVsVerified.toFixed(2)} kg</div>
                        </td>
                        <td className="px-3 py-3">{round.packedSkus?.length ? <button onClick={() => verifyRoundSkus(round)} className="rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100">{round.verifiedPackedSkus ? 'Re-verify SKUs' : 'Verify SKUs'}</button> : <span className="text-[11px] text-slate-400">No SKU record</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {auditRows.length === 0 && <div className="p-6 text-center text-sm text-slate-500">No paneer records are available for this milk lot.</div>}
            </div>
            <p className="text-xs text-slate-500">“Verify SKUs” snapshots the staff packing record after KB physically checks it. Approved PAN111 is included automatically; pending or rejected PAN111 is excluded from verified output.</p>
          </div>
        </section>
      )}

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
