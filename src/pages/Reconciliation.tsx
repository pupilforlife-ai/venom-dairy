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
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { supabase } from '../lib/supabase';
import { getGheeRoundInput, getMilkLotAccounting, getMilkLotProductionReconciliation, getRoundMilkInput, isMilkProductionRound } from '../data/mockData';
import { getPaneerPackWeight, paneerSkuByCode } from '../data/skuConfig';

interface MilkBalanceReviewForm {
  litresReceived: number;
  litresRejected: number;
  litresSpilled: number;
  litresSold: number;
  roundInputs: Record<string, number>;
  wasteEventQuantities: Record<string, number>;
  reason: string;
}

const emptyMilkBalanceReviewForm: MilkBalanceReviewForm = {
  litresReceived: 0,
  litresRejected: 0,
  litresSpilled: 0,
  litresSold: 0,
  roundInputs: {},
  wasteEventQuantities: {},
  reason: '',
};

export default function Reconciliation() {
  const { milkLots, productionRounds, wasteEvents, updateMilkLot, updateProductionRound, updateWasteEvent } = useApp();
  const { showToast } = useToast();
  const [selectedLotCode, setSelectedLotCode] = useState('');
  const [auditIdentity, setAuditIdentity] = useState({ username: '', role: '' });
  const [showMilkBalanceReview, setShowMilkBalanceReview] = useState(false);
  const [milkBalanceReviewForm, setMilkBalanceReviewForm] = useState<MilkBalanceReviewForm>(emptyMilkBalanceReviewForm);
  const latestMilkLot = [...milkLots].sort((a, b) => {
    const aTime = new Date(`${a.receiptDate}T${a.receiptTime || '00:00'}`).getTime();
    const bTime = new Date(`${b.receiptDate}T${b.receiptTime || '00:00'}`).getTime();
    return bTime - aTime;
  })[0];
  const selectedLot = milkLots.find(lot => lot.lotCode === selectedLotCode) ?? latestMilkLot;
  const lotCode = selectedLot?.lotCode ?? '';
  const previousLot = selectedLot
    ? [...milkLots]
      .filter(lot => lot.id !== selectedLot.id && lot.receiptDate < selectedLot.receiptDate)
      .sort((a, b) => b.receiptDate.localeCompare(a.receiptDate))[0]
    : undefined;
  const previousAccounting = previousLot ? getMilkLotAccounting(previousLot, productionRounds) : undefined;
  const previousUnexplained = previousLot && previousAccounting
    ? previousLot.litresReceived - previousAccounting.consumed - previousAccounting.remaining
      - previousLot.litresRejected - previousLot.litresSpilled - previousAccounting.sold
    : 0;
  const lotRounds = productionRounds.filter(r => r.milkLotCode === lotCode || r.milkLotId === selectedLot?.id);
  const completedRounds = lotRounds.filter(r => r.outputWeight > 0 && !['scheduled', 'cancelled', 'spoiled'].includes(r.status));
  const emptyProductionReconciliation = {
    paneerRecorded: 0,
    yieldLPerKg: 0,
    paneerYieldPer100L: 0,
    dRounds: 0,
    csRounds: 0,
    cream: 0,
    pan111: 0,
    paneerForSpp: 0,
    paneerInputLitres: 0,
    completedRounds: 0,
  };
  const productionReconciliation = selectedLot
    ? getMilkLotProductionReconciliation(selectedLot, productionRounds)
    : emptyProductionReconciliation;
  const milkAccounting = selectedLot
    ? getMilkLotAccounting(selectedLot, productionRounds)
    : { consumed: 0, sold: 0, remaining: 0, overdraw: 0, rawRemaining: 0 };
  const consumedByProduction = milkAccounting.consumed;
  const received = selectedLot?.litresReceived ?? 0;
  const remaining = milkAccounting.remaining;
  const rejected = selectedLot?.litresRejected ?? 0;
  const spilled = selectedLot?.litresSpilled ?? 0;
  const accountedOther = milkAccounting.sold;
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
  const hasVariance = Math.abs(recon.unexplainedVariance) > 0.01;
  const reviewableMilkRounds = lotRounds.filter(round =>
    isMilkProductionRound(round) && !['scheduled', 'cancelled'].includes(round.status)
  );
  const linkedMilkWasteEvents = wasteEvents.filter(event => {
    const batchCode = event.batchCode?.trim();
    return event.unit.toLowerCase() === 'l'
      && /milk/i.test(event.product)
      && Boolean(selectedLot && (batchCode === selectedLot.id || batchCode === selectedLot.lotCode));
  });
  const linkedRejectedEvents = linkedMilkWasteEvents.filter(event => !/spill/i.test(event.reason));
  const linkedSpilledEvents = linkedMilkWasteEvents.filter(event => /spill/i.test(event.reason));
  const linkedRejectedTotal = linkedRejectedEvents.reduce((sum, event) => sum + Math.max(0, event.quantity), 0);
  const linkedSpilledTotal = linkedSpilledEvents.reduce((sum, event) => sum + Math.max(0, event.quantity), 0);
  const unlinkedRejectedTotal = Math.max(0, (selectedLot?.litresRejected || 0) - linkedRejectedTotal);
  const unlinkedSpilledTotal = Math.max(0, (selectedLot?.litresSpilled || 0) - linkedSpilledTotal);

  const totalPaneerD = completedRounds.filter(r => r.type === 'D').reduce((s, r) => s + r.outputWeight, 0);
  const totalPaneerCS = completedRounds.filter(r => r.type === 'C/S').reduce((s, r) => s + r.outputWeight, 0);
  const totalHalloumi = completedRounds.filter(r => r.type === 'Halloumi').reduce((s, r) => s + r.outputWeight, 0);
  const completedGheeRounds = completedRounds.filter(round => round.type === 'Ghee');
  const totalGheeInput = completedGheeRounds.reduce((sum, round) => sum + getGheeRoundInput(round), 0);
  const totalGheeAFOilInput = completedGheeRounds.reduce((sum, round) => sum + Math.max(0, round.afOilInput || 0), 0);
  const totalGheeOutput = completedGheeRounds.reduce((sum, round) => sum + Math.max(0, round.outputWeight), 0);
  const totalGheeYield = totalGheeInput > 0 ? (totalGheeOutput / totalGheeInput) * 100 : 0;

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

  const normalizedAuditRole = auditIdentity.role.toLowerCase();
  const canReviewMilkBalance = normalizedAuditRole === 'owner' || normalizedAuditRole === 'admin';
  const isKbOwner = auditIdentity.username.toLowerCase() === 'kb' && normalizedAuditRole === 'owner';
  const auditToleranceKg = 1;
  const paneerAuditRounds = useMemo(
    () => productionRounds.filter(round => (round.milkLotCode === lotCode || round.milkLotId === selectedLot?.id) && (round.type === 'D' || round.type === 'C/S') && (round.actualInput > 0 || round.outputWeight > 0 || round.blockWeights?.length || round.packedSkus?.length)),
    [productionRounds, lotCode, selectedLot?.id],
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
      milkUsed: getRoundMilkInput(round),
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

  const openMilkBalanceReview = () => {
    if (!selectedLot || !canReviewMilkBalance) return;
    setMilkBalanceReviewForm({
      litresReceived: selectedLot.litresReceived,
      litresRejected: selectedLot.litresRejected,
      litresSpilled: selectedLot.litresSpilled,
      litresSold: selectedLot.litresSold || 0,
      roundInputs: Object.fromEntries(reviewableMilkRounds.map(round => [round.id, getRoundMilkInput(round)])),
      wasteEventQuantities: Object.fromEntries(linkedMilkWasteEvents.map(event => [event.id, event.quantity])),
      reason: '',
    });
    setShowMilkBalanceReview(true);
  };

  const projectedConsumed = reviewableMilkRounds.reduce(
    (sum, round) => sum + Math.max(0, milkBalanceReviewForm.roundInputs[round.id] ?? getRoundMilkInput(round)),
    0,
  );
  const projectedRawRemaining = milkBalanceReviewForm.litresReceived
    - projectedConsumed
    - milkBalanceReviewForm.litresRejected
    - milkBalanceReviewForm.litresSpilled
    - milkBalanceReviewForm.litresSold;
  const projectedOverdraw = Math.max(0, -projectedRawRemaining);
  const projectedRemaining = Math.max(0, projectedRawRemaining);

  const changeWasteEventQuantity = (eventId: string, value: number) => {
    setMilkBalanceReviewForm(current => {
      const wasteEventQuantities = { ...current.wasteEventQuantities, [eventId]: Math.max(0, value) };
      const nextRejected = unlinkedRejectedTotal + linkedRejectedEvents.reduce(
        (sum, event) => sum + (wasteEventQuantities[event.id] ?? event.quantity),
        0,
      );
      const nextSpilled = unlinkedSpilledTotal + linkedSpilledEvents.reduce(
        (sum, event) => sum + (wasteEventQuantities[event.id] ?? event.quantity),
        0,
      );
      return {
        ...current,
        wasteEventQuantities,
        litresRejected: nextRejected,
        litresSpilled: nextSpilled,
      };
    });
  };

  const saveMilkBalanceReview = () => {
    if (!selectedLot || !canReviewMilkBalance) {
      showToast('error', 'Only an owner or admin can correct the milk balance');
      return;
    }
    const lotValues = [
      milkBalanceReviewForm.litresReceived,
      milkBalanceReviewForm.litresRejected,
      milkBalanceReviewForm.litresSpilled,
      milkBalanceReviewForm.litresSold,
    ];
    if (lotValues.some(value => !Number.isFinite(value) || value < 0)) {
      showToast('error', 'Milk quantities must be valid values of zero or more');
      return;
    }
    if (reviewableMilkRounds.some(round => {
      const value = milkBalanceReviewForm.roundInputs[round.id];
      return !Number.isFinite(value) || value <= 0;
    })) {
      showToast('error', 'Every started milk-production round must retain a positive input');
      return;
    }
    if (linkedMilkWasteEvents.some(event => {
      const value = milkBalanceReviewForm.wasteEventQuantities[event.id];
      return !Number.isFinite(value) || value < 0;
    })) {
      showToast('error', 'Rejected and spilled milk corrections must be zero or more');
      return;
    }
    if (!milkBalanceReviewForm.reason.trim()) {
      showToast('error', 'Enter a reason for the correction so the review is auditable');
      return;
    }
    const reviewedAt = new Date().toISOString();
    const reviewedBy = auditIdentity.username.trim() || normalizedAuditRole;
    const roundCorrections = reviewableMilkRounds.flatMap(round => {
      const previousInput = getRoundMilkInput(round);
      const correctedInput = milkBalanceReviewForm.roundInputs[round.id];
      if (Math.abs(previousInput - correctedInput) <= 0.001) return [];
      updateProductionRound(round.id, { actualInput: correctedInput });
      return [{
        roundId: round.id,
        shiftNumber: round.shiftNumber,
        roundNumber: round.roundNumber,
        previousInput,
        correctedInput,
      }];
    });
    const wasteCorrections = linkedMilkWasteEvents.flatMap(event => {
      const correctedQuantity = milkBalanceReviewForm.wasteEventQuantities[event.id];
      if (Math.abs(event.quantity - correctedQuantity) <= 0.001) return [];
      updateWasteEvent(event.id, {
        quantity: correctedQuantity,
        correctionHistory: [
          ...(event.correctionHistory || []),
          {
            correctedAt: reviewedAt,
            correctedBy: reviewedBy,
            previousQuantity: event.quantity,
            correctedQuantity,
            reason: milkBalanceReviewForm.reason.trim(),
          },
        ],
      });
      return [{
        wasteEventId: event.id,
        category: /spill/i.test(event.reason) ? 'spilled' as const : 'rejected' as const,
        eventDate: event.date,
        eventReason: event.reason,
        previousQuantity: event.quantity,
        correctedQuantity,
      }];
    });
    const before = {
      received: selectedLot.litresReceived,
      consumed: milkAccounting.consumed,
      rejected: selectedLot.litresRejected,
      spilled: selectedLot.litresSpilled,
      sold: milkAccounting.sold,
      remaining: milkAccounting.remaining,
      overdraw: milkAccounting.overdraw,
    };
    const after = {
      received: milkBalanceReviewForm.litresReceived,
      consumed: projectedConsumed,
      rejected: milkBalanceReviewForm.litresRejected,
      spilled: milkBalanceReviewForm.litresSpilled,
      sold: milkBalanceReviewForm.litresSold,
      remaining: projectedRemaining,
      overdraw: projectedOverdraw,
    };
    updateMilkLot(selectedLot.id, {
      litresReceived: after.received,
      litresConsumed: after.consumed,
      litresRemaining: after.remaining,
      litresRejected: after.rejected,
      litresSpilled: after.spilled,
      litresSold: after.sold,
      milkBalanceReviews: [
        ...(selectedLot.milkBalanceReviews || []),
        {
          id: `milk-review-${Date.now()}`,
          reviewedAt,
          reviewedBy,
          reviewerRole: normalizedAuditRole as 'owner' | 'admin',
          reason: milkBalanceReviewForm.reason.trim(),
          before,
          after,
          roundCorrections,
          wasteCorrections,
        },
      ],
    });
    setShowMilkBalanceReview(false);
    if (projectedOverdraw > 0.01) {
      showToast('info', `Correction saved. ${projectedOverdraw.toFixed(2)} L overdraw remains for further review.`);
    } else {
      showToast('success', `Milk balance reviewed. Corrected remaining balance: ${projectedRemaining.toFixed(2)} L`);
    }
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

          <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800">
          <div className="font-semibold">Received = Consumed + Remaining + Rejected + Spilled + Milk sold + Unexplained</div>
          <div className="mt-1 font-mono">{recon.received.toLocaleString()} = {recon.consumedByProduction.toLocaleString()} + {recon.remaining.toLocaleString()} + {recon.rejected.toLocaleString()} + {recon.spilled.toLocaleString()} + {recon.accountedOther.toLocaleString()} + {recon.unexplainedVariance.toFixed(2)}</div>
          <div className="mt-1 text-blue-700">Consumed uses actual input when recorded; otherwise it uses planned input for a started round. Scheduled and cancelled rounds are excluded.</div>
        </div>

        {hasVariance && (
          <div className="mt-4 flex items-start gap-2 p-3 bg-red-50 rounded-lg">
            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-red-700">Unexplained Variance: {recon.unexplainedVariance} L</p>
              <p className="text-xs text-red-600 mt-0.5">
                Received ({recon.received}) − Sum of accounted movements ({recon.consumedByProduction + recon.remaining + recon.rejected + recon.spilled + recon.accountedOther}) = {recon.unexplainedVariance} L
              </p>
              <p className="text-xs text-red-600 mt-1">
                Owner review required. This may indicate measurement error, unrecorded usage, or system gap.
              </p>
              {milkAccounting.overdraw > 0.01 && (
                <div className="mt-2 rounded border border-red-200 bg-white/70 px-2 py-1 font-semibold text-red-700">
                  Overdraw detected: {milkAccounting.overdraw.toFixed(2)} L. Review the receiving quantity, waste deductions, sales, and each round input below.
                </div>
              )}
              <div className="mt-3">
                {canReviewMilkBalance ? (
                  <button
                    type="button"
                    onClick={openMilkBalanceReview}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700"
                  >
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Review and correct milk balance
                  </button>
                ) : (
                  <span className="inline-flex rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-red-700">
                    Sign in as an owner or admin to correct this balance
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {selectedLot?.milkBalanceReviews && selectedLot.milkBalanceReviews.length > 0 && (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Milk balance review history</h4>
            <div className="mt-2 space-y-2">
              {[...selectedLot.milkBalanceReviews].reverse().map(review => (
                <details key={review.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <summary className="cursor-pointer text-xs font-semibold text-slate-800">
                    {new Date(review.reviewedAt).toLocaleString()} · {review.reviewedBy} ({review.reviewerRole})
                  </summary>
                  <div className="mt-2 space-y-1 text-xs text-slate-600">
                    <p><span className="font-semibold">Reason:</span> {review.reason}</p>
                    <p><span className="font-semibold">Before:</span> {review.before.consumed.toFixed(2)} L consumed · {review.before.remaining.toFixed(2)} L remaining · {review.before.overdraw.toFixed(2)} L overdraw</p>
                    <p><span className="font-semibold">After:</span> {review.after.consumed.toFixed(2)} L consumed · {review.after.remaining.toFixed(2)} L remaining · {review.after.overdraw.toFixed(2)} L overdraw</p>
                    {review.roundCorrections.length > 0 && (
                      <ul className="list-disc pl-4">
                        {review.roundCorrections.map(correction => (
                          <li key={`${review.id}-${correction.roundId}`}>Shift {correction.shiftNumber}, round {correction.roundNumber}: {correction.previousInput.toFixed(2)} L → {correction.correctedInput.toFixed(2)} L</li>
                        ))}
                      </ul>
                    )}
                    {(review.wasteCorrections || []).length > 0 && (
                      <ul className="list-disc pl-4">
                        {(review.wasteCorrections || []).map(correction => (
                          <li key={`${review.id}-${correction.wasteEventId}`}>
                            {correction.category === 'spilled' ? 'Spilled' : 'Rejected'} milk ({correction.eventReason}, {correction.eventDate}): {correction.previousQuantity.toFixed(2)} L → {correction.correctedQuantity.toFixed(2)} L
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </details>
              ))}
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
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Yield</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">Malai Paneer (D)</td>
                <td className="px-4 py-3 text-slate-700 font-medium">{totalPaneerD} kg</td>
                <td className="px-4 py-3 text-slate-500">{productionReconciliation.dRounds}</td>
                <td className="px-4 py-3">
                  <span className="text-emerald-600 font-medium">
                    {productionReconciliation.paneerInputLitres > 0 ? ((totalPaneerD / productionReconciliation.paneerInputLitres) * 100).toFixed(1) : '—'}%
                  </span>
                </td>
              </tr>
              <tr className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">Rozana Paneer (C/S)</td>
                <td className="px-4 py-3 text-slate-700 font-medium">{totalPaneerCS} kg</td>
                <td className="px-4 py-3 text-slate-500">{productionReconciliation.csRounds}</td>
                <td className="px-4 py-3">
                  <span className="text-indigo-600 font-medium">
                    {productionReconciliation.paneerInputLitres > 0 ? ((totalPaneerCS / productionReconciliation.paneerInputLitres) * 100).toFixed(1) : '—'}%
                  </span>
                </td>
              </tr>
              <tr className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">Halloumi</td>
                <td className="px-4 py-3 text-slate-700 font-medium">{totalHalloumi} kg</td>
                <td className="px-4 py-3 text-slate-500">{completedRounds.filter(r => r.type === 'Halloumi').length}</td>
                <td className="px-4 py-3 text-slate-500">—</td>
              </tr>
              <tr className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">Recovered Cream</td>
                <td className="px-4 py-3 text-slate-700 font-medium">{productionReconciliation.cream.toFixed(2)} kg</td>
                <td className="px-4 py-3 text-slate-500">Co-product</td>
                <td className="px-4 py-3 text-slate-500">—</td>
              </tr>
              {completedGheeRounds.length > 0 && (
                <tr className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    Ghee
                    <div className="mt-0.5 text-[10px] font-normal text-slate-500">
                      {totalGheeInput.toFixed(2)} kg input, including {totalGheeAFOilInput.toFixed(2)} kg AF oil
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-700 font-medium">{totalGheeOutput.toFixed(2)} kg</td>
                  <td className="px-4 py-3 text-slate-500">{completedGheeRounds.length}</td>
                  <td className="px-4 py-3 text-indigo-600 font-medium">{totalGheeYield.toFixed(2)}%</td>
                </tr>
              )}
              <tr className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">PAN111 (Recovered)</td>
                <td className="px-4 py-3 text-slate-700 font-medium">{productionReconciliation.pan111.toFixed(2)} kg</td>
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
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Input</th>
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Output (kg)</th>
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Yield %</th>
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Packed</th>
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {completedRounds
                .map(round => {
                  const input = round.type === 'Ghee' ? getGheeRoundInput(round) : getRoundMilkInput(round);
                  const inputUnit = round.type === 'Ghee' || round.type === 'Butter' ? 'kg' : 'L';
                  const yieldPct = input > 0 ? (round.outputWeight / input) * 100 : null;
                  const meetsTarget = yieldPct !== null && (round.type === 'Ghee' ? yieldPct >= 70 : yieldPct >= 14);
                  return (
                    <tr key={round.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-mono text-xs font-bold text-slate-900">
                        {round.batchCode || `${round.milkLotCode}/S${round.shiftNumber}/R${round.roundNumber}`}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-xs font-bold">{round.type}</span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">
                        {input.toFixed(2)} {inputUnit}
                        {round.type === 'Ghee' && (
                          <div className="text-[10px] text-slate-500">
                            {(round.butterInput || round.actualInput || 0).toFixed(2)} butter + {(round.afOilInput || 0).toFixed(2)} AF oil
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">{round.outputWeight} kg</td>
                      <td className="px-4 py-2.5">
                        <span className={`font-medium ${meetsTarget ? 'text-emerald-600' : 'text-amber-600'}`}>
                          {yieldPct !== null ? `${yieldPct.toFixed(2)}%` : '—'}
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
              {completedRounds.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500">
                    No completed rounds are recorded for this milk lot yet.
                  </td>
                </tr>
              )}
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

      {/* Previous lot comparison */}
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
        <h3 className="text-sm font-semibold text-slate-900 mb-3">
          {previousLot ? `Previous Lot Comparison (${previousLot.lotCode})` : 'Previous Lot Comparison'}
        </h3>
        {previousLot && previousAccounting ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
            <div>
              <p className="text-xs text-slate-500">Received</p>
              <p className="text-lg font-bold text-slate-900">{previousLot.litresReceived.toLocaleString()} L</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Consumed</p>
              <p className="text-lg font-bold text-slate-900">{previousAccounting.consumed.toLocaleString()} L</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Rejected</p>
              <p className="text-lg font-bold text-red-600">{previousLot.litresRejected.toLocaleString()} L</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Unexplained</p>
              <p className={`text-lg font-bold ${Math.abs(previousUnexplained) > 0.01 ? 'text-amber-600' : 'text-emerald-600'}`}>{previousUnexplained.toFixed(2)} L</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">No earlier milk lot is available for comparison.</p>
        )}
      </div>

      <Modal
        isOpen={showMilkBalanceReview}
        onClose={() => setShowMilkBalanceReview(false)}
        title={`Review milk balance · ${lotCode}`}
        size="lg"
      >
        <div className="space-y-5">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <p className="font-semibold">Correct the source figures—not the warning.</p>
            <p className="mt-1">Review the receiving ledger, linked Waste &amp; Yield records, and every started milk-production round. Valid corrections can be saved even when another discrepancy remains; the warning stays visible until the full equation balances.</p>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Receiving ledger</h4>
            <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {([
                ['litresReceived', 'Milk received'],
                ['litresRejected', 'Rejected/contaminated'],
                ['litresSpilled', 'Spilled'],
                ['litresSold', 'Milk sold'],
              ] as const).map(([field, label]) => {
                const linkedSourceCount = field === 'litresRejected'
                  ? linkedRejectedEvents.length
                  : field === 'litresSpilled'
                    ? linkedSpilledEvents.length
                    : 0;
                return (
                  <label key={field} className="block">
                    <span className="text-[11px] font-medium text-slate-600">{label} (L)</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={milkBalanceReviewForm[field]}
                      readOnly={linkedSourceCount > 0}
                      onChange={event => setMilkBalanceReviewForm(current => ({
                        ...current,
                        [field]: Math.max(0, Number(event.target.value) || 0),
                      }))}
                      className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm ${linkedSourceCount > 0 ? 'border-slate-200 bg-slate-100 text-slate-600' : 'border-slate-200'}`}
                    />
                    {linkedSourceCount > 0 && (
                      <span className="mt-1 block text-[10px] text-slate-500">Calculated from {linkedSourceCount} Waste &amp; Yield record{linkedSourceCount === 1 ? '' : 's'} below</span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>

          {linkedMilkWasteEvents.length > 0 && (
            <div>
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Linked rejected and spilled milk records</h4>
                <span className="text-[11px] text-slate-500">Updates Waste &amp; Yield and receiving together</span>
              </div>
              <div className="mt-2 overflow-hidden rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr className="text-left">
                      <th className="px-3 py-2 text-[10px] uppercase tracking-wide text-slate-500">Date</th>
                      <th className="px-3 py-2 text-[10px] uppercase tracking-wide text-slate-500">Reason</th>
                      <th className="px-3 py-2 text-[10px] uppercase tracking-wide text-slate-500">Category</th>
                      <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wide text-slate-500">Recorded</th>
                      <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wide text-slate-500">Corrected</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {linkedMilkWasteEvents.map(event => {
                      const correctedQuantity = milkBalanceReviewForm.wasteEventQuantities[event.id] ?? event.quantity;
                      const changed = Math.abs(correctedQuantity - event.quantity) > 0.001;
                      return (
                        <tr key={event.id} className={changed ? 'bg-amber-50/60' : ''}>
                          <td className="px-3 py-2 text-xs text-slate-600">{event.date}</td>
                          <td className="px-3 py-2"><div className="text-xs font-medium text-slate-800">{event.reason}</div><div className="text-[10px] text-slate-500">Recorded by {event.recordedBy}</div></td>
                          <td className="px-3 py-2 text-xs text-slate-600">{/spill/i.test(event.reason) ? 'Spilled' : 'Rejected'}</td>
                          <td className="px-3 py-2 text-right font-medium text-slate-700">{event.quantity.toFixed(2)} L</td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={correctedQuantity}
                              onChange={inputEvent => changeWasteEventQuantity(event.id, Number(inputEvent.target.value) || 0)}
                              className={`ml-auto block w-28 rounded-lg border px-2 py-1.5 text-right text-sm ${changed ? 'border-amber-300 bg-white' : 'border-slate-200'}`}
                              aria-label={`Corrected ${/spill/i.test(event.reason) ? 'spilled' : 'rejected'} milk for ${event.reason}`}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Production inputs</h4>
              <span className="text-[11px] text-slate-500">Scheduled and cancelled rounds do not consume milk</span>
            </div>
            <div className="mt-2 max-h-72 overflow-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-[620px] text-sm">
                <thead className="sticky top-0 bg-slate-50">
                  <tr className="text-left">
                    <th className="px-3 py-2 text-[10px] uppercase tracking-wide text-slate-500">Round</th>
                    <th className="px-3 py-2 text-[10px] uppercase tracking-wide text-slate-500">Status</th>
                    <th className="px-3 py-2 text-[10px] uppercase tracking-wide text-slate-500">Current source</th>
                    <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wide text-slate-500">Current input</th>
                    <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wide text-slate-500">Corrected input</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reviewableMilkRounds.map(round => {
                    const currentInput = getRoundMilkInput(round);
                    const correctedInput = milkBalanceReviewForm.roundInputs[round.id] ?? currentInput;
                    const changed = Math.abs(correctedInput - currentInput) > 0.001;
                    return (
                      <tr key={round.id} className={changed ? 'bg-amber-50/60' : ''}>
                        <td className="px-3 py-2">
                          <div className="font-mono text-xs font-semibold text-slate-900">S{round.shiftNumber}/R{round.roundNumber}</div>
                          <div className="text-[10px] text-slate-500">{round.type}</div>
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-600">{round.status}</td>
                        <td className="px-3 py-2 text-xs text-slate-600">{round.actualInput > 0 ? 'Actual input' : 'Planned fallback'}</td>
                        <td className="px-3 py-2 text-right font-medium text-slate-700">{currentInput.toFixed(2)} L</td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={correctedInput}
                            onChange={event => setMilkBalanceReviewForm(current => ({
                              ...current,
                              roundInputs: {
                                ...current.roundInputs,
                                [round.id]: Math.max(0, Number(event.target.value) || 0),
                              },
                            }))}
                            className={`ml-auto block w-28 rounded-lg border px-2 py-1.5 text-right text-sm ${changed ? 'border-amber-300 bg-white' : 'border-slate-200'}`}
                          />
                        </td>
                      </tr>
                    );
                  })}
                  {reviewableMilkRounds.length === 0 && (
                    <tr><td colSpan={5} className="px-3 py-6 text-center text-sm text-slate-500">No started milk-production rounds are linked to this lot.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className={`rounded-lg border p-3 ${projectedOverdraw > 0.01 ? 'border-red-300 bg-red-50' : 'border-emerald-300 bg-emerald-50'}`}>
            <p className={`text-xs font-semibold ${projectedOverdraw > 0.01 ? 'text-red-800' : 'text-emerald-800'}`}>Projected corrected equation</p>
            <p className="mt-1 font-mono text-xs text-slate-700">
              {milkBalanceReviewForm.litresReceived.toFixed(2)} received − {projectedConsumed.toFixed(2)} consumed − {milkBalanceReviewForm.litresRejected.toFixed(2)} rejected − {milkBalanceReviewForm.litresSpilled.toFixed(2)} spilled − {milkBalanceReviewForm.litresSold.toFixed(2)} sold = {projectedRawRemaining.toFixed(2)} L
            </p>
            <p className={`mt-1 text-sm font-bold ${projectedOverdraw > 0.01 ? 'text-red-700' : 'text-emerald-700'}`}>
              {projectedOverdraw > 0.01 ? `${projectedOverdraw.toFixed(2)} L overdraw remains` : `${projectedRemaining.toFixed(2)} L remaining`}
            </p>
          </div>

          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-600">Reason for correction</span>
            <textarea
              rows={3}
              value={milkBalanceReviewForm.reason}
              onChange={event => setMilkBalanceReviewForm(current => ({ ...current, reason: event.target.value }))}
              placeholder="State what was checked and which source figure was incorrect"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={saveMilkBalanceReview}
              className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              Save reviewed correction
            </button>
            <button type="button" onClick={() => setShowMilkBalanceReview(false)} className="rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-700">Cancel</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
