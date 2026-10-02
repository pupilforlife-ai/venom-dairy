import { useMemo, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  GitBranch,
  Package,
  Plus,
  Snowflake,
  Truck,
} from 'lucide-react';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { useSupabaseState } from '../hooks/useSupabaseState';
import { DistributionHandover, DistributionHandoverSource } from '../data/mockData';
import { useApp } from '../store/AppContext';

type CandidateUnit = 'kg' | 'packets' | 'bottles';

interface DistributionCandidate {
  id: string;
  sourceType: Exclude<DistributionHandoverSource, 'manual'>;
  sourceId: string;
  productName: string;
  batchCode: string;
  quantity: number;
  unit: CandidateUnit;
  cases?: number;
  looseQuantity?: number;
  storageLocation?: string;
  detail: string;
}

interface DistributionCrumbingBatch {
  id: string;
  batchCode: string;
  type: 'SPP' | 'JP' | 'HCP';
  status: string;
  traysPacked: number;
  packedSkus?: Array<{ sku: string; cases: number; loose: number }>;
}

interface HandoverForm {
  productName: string;
  batchCode: string;
  quantity: number;
  unit: CandidateUnit;
  destination: string;
  handedOverBy: string;
  notes: string;
}

const emptyForm: HandoverForm = {
  productName: '',
  batchCode: '',
  quantity: 0,
  unit: 'kg',
  destination: 'Distribution',
  handedOverBy: '',
  notes: '',
};

const roundProductNames: Record<string, string> = {
  Butter: 'Butter',
  Ghee: 'Ghee',
  Amassi: 'Amassi',
};

function formatQuantity(quantity: number, unit: CandidateUnit) {
  return `${quantity.toFixed(unit === 'kg' ? 2 : 0)} ${unit}`;
}

export default function Distribution() {
  const {
    finishedStock,
    milkLots,
    productionRounds,
    updateFinishedStock,
    updateMilkLot,
    updateProductionRound,
  } = useApp();
  const { showToast } = useToast();
  const [handovers, setHandovers] = useSupabaseState<DistributionHandover[]>('vejoy_distributionHandovers', []);
  const [crumbingBatches, setCrumbingBatches] = useSupabaseState<DistributionCrumbingBatch[]>('vejoy_crumbingBatches', []);
  const [showHandoverModal, setShowHandoverModal] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<DistributionCandidate | null>(null);
  const [form, setForm] = useState<HandoverForm>(emptyForm);

  const candidates = useMemo<DistributionCandidate[]>(() => {
    const finishedCandidates: DistributionCandidate[] = finishedStock
      .filter(stock => stock.status === 'awaiting_handover')
      .map(stock => {
        const weight = stock.weightKg ?? stock.looseWeightKg;
        const isWeightStock = weight !== undefined;
        return {
          id: `finished:${stock.id}`,
          sourceType: 'finished_stock',
          sourceId: stock.id,
          productName: stock.productName,
          batchCode: (stock.sourceBatchCodes || [])[0] || stock.sku,
          quantity: isWeightStock ? weight : stock.totalPackets,
          unit: isWeightStock ? 'kg' : 'packets',
          cases: stock.cases,
          looseQuantity: stock.loosePackets,
          storageLocation: stock.storageLocation,
          detail: isWeightStock
            ? `${weight.toFixed(2)} kg finished stock`
            : `${stock.cases} cases · ${stock.loosePackets} loose packets`,
        };
      });

    const halloumiCandidates: DistributionCandidate[] = milkLots
      .filter(lot => {
        const pool = lot.halloumiPool;
        return Boolean(pool && pool.vacuumPacked > 0 && pool.availableForCrumbing > 0);
      })
      .map(lot => {
        const pool = lot.halloumiPool!;
        return {
          id: `halloumi:${lot.id}`,
          sourceType: 'halloumi_pool',
          sourceId: lot.id,
          productName: 'Halloumi (vacuumed chilled stock)',
          batchCode: pool.batchId,
          quantity: Math.max(0, pool.availableForCrumbing),
          unit: 'kg',
          storageLocation: 'Chiller',
          detail: `Milk lot ${lot.lotCode} · ${pool.vacuumPacked.toFixed(2)} kg vacuumed`,
        };
      });

    const crumbingCandidates: DistributionCandidate[] = crumbingBatches
      .filter(batch => batch.status === 'packed' && batch.traysPacked > 0)
      .map(batch => {
        const cases = (batch.packedSkus || []).reduce((sum, packed) => sum + packed.cases, 0);
        const loose = (batch.packedSkus || []).reduce((sum, packed) => sum + packed.loose, 0);
        const quantity = cases * 12 + loose || batch.traysPacked;
        const productName = batch.type === 'SPP'
          ? 'Spicy Paneer Poppers'
          : batch.type === 'JP'
            ? 'Jalapeno Poppers'
            : 'Halloumi Cheese Poppers';
        return {
          id: `crumbing:${batch.id}`,
          sourceType: 'crumbing_batch',
          sourceId: batch.id,
          productName,
          batchCode: batch.batchCode,
          quantity,
          unit: 'packets',
          cases,
          looseQuantity: loose,
          storageLocation: 'Coldroom',
          detail: `${batch.type} finished batch · ${cases} cases · ${loose} loose`,
        };
      });

    // Butter, Ghee, and Amassi are produced in their own tabs and do not all
    // create a FinishedStock row. Their final output remains handover-ready
    // here, while Paneer is represented by packed FinishedStock and Halloumi
    // by its vacuumed common pool above.
    const productionCandidates: DistributionCandidate[] = productionRounds
      .filter(round => {
        if (!roundProductNames[round.type] || round.status === 'handed_over') return false;
        if (!['packed', 'stored_in_chiller'].includes(round.status)) return false;
        if (round.type === 'Amassi') return Boolean(round.amassiPacked?.length);
        return round.outputWeight > 0;
      })
      .map(round => {
        const batchCode = round.batchCode || `${round.milkLotCode}/S${round.shiftNumber}/R${round.roundNumber}/${round.type}`;
        if (round.type === 'Amassi') {
          const bottles = (round.amassiPacked || []).reduce((sum, packed) => sum + packed.bottles, 0);
          const skuSummary = (round.amassiPacked || []).map(packed => `${packed.sku}: ${packed.bottles}`).join(' · ');
          return {
            id: `round:${round.id}`,
            sourceType: 'production_round',
            sourceId: round.id,
            productName: `${roundProductNames[round.type]} ${round.amassiType || ''}`.trim(),
            batchCode,
            quantity: bottles,
            unit: 'bottles',
            storageLocation: 'Coldroom',
            detail: skuSummary || 'Bottled Amassi output',
          };
        }
        return {
          id: `round:${round.id}`,
          sourceType: 'production_round',
          sourceId: round.id,
          productName: roundProductNames[round.type],
          batchCode,
          quantity: round.outputWeight,
          unit: 'kg',
          storageLocation: round.type === 'Ghee' ? 'Coldroom' : 'Chiller',
          detail: `${round.type} production round · Milk lot ${round.milkLotCode}`,
        };
      });

    return [...finishedCandidates, ...halloumiCandidates, ...crumbingCandidates, ...productionCandidates];
  }, [crumbingBatches, finishedStock, milkLots, productionRounds]);

  const pendingKg = candidates.filter(candidate => candidate.unit === 'kg').reduce((sum, candidate) => sum + candidate.quantity, 0);
  const pendingPackets = candidates.filter(candidate => candidate.unit === 'packets').reduce((sum, candidate) => sum + candidate.quantity, 0);

  const openCandidate = (candidate: DistributionCandidate) => {
    setSelectedCandidate(candidate);
    setForm({
      productName: candidate.productName,
      batchCode: candidate.batchCode,
      quantity: candidate.quantity,
      unit: candidate.unit,
      destination: 'Distribution',
      handedOverBy: '',
      notes: '',
    });
    setShowHandoverModal(true);
  };

  const openManualHandover = () => {
    setSelectedCandidate(null);
    setForm(emptyForm);
    setShowHandoverModal(true);
  };

  const closeModal = () => {
    setShowHandoverModal(false);
    setSelectedCandidate(null);
    setForm(emptyForm);
  };

  const recordHandover = () => {
    const productName = form.productName.trim();
    const batchCode = form.batchCode.trim();
    const handedOverBy = form.handedOverBy.trim();
    if (!productName || !batchCode || !handedOverBy || form.quantity <= 0) {
      showToast('error', 'Enter the product, batch, quantity, and person handing it over');
      return;
    }
    if (selectedCandidate && form.quantity > selectedCandidate.quantity + 0.01) {
      showToast('error', `Only ${formatQuantity(selectedCandidate.quantity, selectedCandidate.unit)} is available`);
      return;
    }
    if (selectedCandidate?.sourceType === 'finished_stock' && Math.abs(form.quantity - selectedCandidate.quantity) > 0.01) {
      showToast('error', 'Finished stock must be handed over as a complete packed stock line');
      return;
    }

    if (selectedCandidate?.sourceType === 'finished_stock') {
      updateFinishedStock(selectedCandidate.sourceId, { status: 'handed_over' });
    }

    if (selectedCandidate?.sourceType === 'halloumi_pool') {
      const milkLot = milkLots.find(lot => lot.id === selectedCandidate.sourceId);
      const pool = milkLot?.halloumiPool;
      const available = Math.max(0, pool?.availableForCrumbing || 0);
      if (!milkLot || !pool || form.quantity > available + 0.01) {
        showToast('error', 'The Halloumi pool changed. Refresh the page and try again');
        return;
      }
      updateMilkLot(milkLot.id, {
        halloumiPool: {
          ...pool,
          handedOverWeight: (pool.handedOverWeight || 0) + form.quantity,
          availableForCrumbing: Math.max(0, available - form.quantity),
        },
      });
    }

    if (selectedCandidate?.sourceType === 'production_round') {
      updateProductionRound(selectedCandidate.sourceId, {
        status: 'handed_over',
        locked: true,
        completedAt: new Date().toISOString(),
      });
    }

    if (selectedCandidate?.sourceType === 'crumbing_batch') {
      setCrumbingBatches(current => current.map(batch => batch.id === selectedCandidate.sourceId
        ? { ...batch, status: 'handed_over' }
        : batch
      ));
    }

    const record: DistributionHandover = {
      id: `dist-${Date.now()}`,
      sourceType: selectedCandidate?.sourceType || 'manual',
      sourceId: selectedCandidate?.sourceId,
      productName,
      batchCode,
      quantity: form.quantity,
      unit: form.unit,
      cases: selectedCandidate?.cases,
      looseQuantity: selectedCandidate?.looseQuantity,
      storageLocation: selectedCandidate?.storageLocation,
      destination: form.destination.trim() || 'Distribution',
      handedOverBy,
      handedOverAt: new Date().toISOString(),
      notes: form.notes.trim() || undefined,
    };
    setHandovers(current => [...current, record]);
    showToast('success', `${productName} recorded as handed over to ${record.destination}`);
    closeModal();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Distribution</h2>
          <p className="mt-0.5 text-sm text-slate-500">Record finished products transferred from Production to Distribution, including vacuumed Halloumi.</p>
        </div>
        <button type="button" onClick={openManualHandover} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700">
          <Plus className="h-4 w-4" /> Record product handover
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center"><Clock className="mx-auto mb-1 h-5 w-5 text-amber-600" /><p className="text-2xl font-bold text-amber-700">{candidates.length}</p><p className="text-xs text-amber-700">Ready to transfer</p></div>
        <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4 text-center"><Snowflake className="mx-auto mb-1 h-5 w-5 text-cyan-600" /><p className="text-2xl font-bold text-cyan-700">{pendingKg.toFixed(1)}</p><p className="text-xs text-cyan-700">kg ready</p></div>
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-center"><Package className="mx-auto mb-1 h-5 w-5 text-indigo-600" /><p className="text-2xl font-bold text-indigo-700">{pendingPackets}</p><p className="text-xs text-indigo-700">packed units</p></div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center"><CheckCircle2 className="mx-auto mb-1 h-5 w-5 text-emerald-600" /><p className="text-2xl font-bold text-emerald-700">{handovers.length}</p><p className="text-xs text-emerald-700">recorded transfers</p></div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div><h3 className="text-sm font-semibold text-slate-900">Ready for distribution</h3><p className="mt-0.5 text-xs text-slate-500">Select a manufactured output to record its handover. Halloumi is taken from the vacuumed chilled common pool.</p></div>
          <Truck className="h-5 w-5 text-slate-400" />
        </div>
        {candidates.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">No products are awaiting distribution handover.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead><tr className="border-b border-slate-100 text-left"><th className="px-3 py-2 text-xs uppercase tracking-wide text-slate-500">Product</th><th className="px-3 py-2 text-xs uppercase tracking-wide text-slate-500">Batch / source</th><th className="px-3 py-2 text-xs uppercase tracking-wide text-slate-500">Quantity</th><th className="px-3 py-2 text-xs uppercase tracking-wide text-slate-500">Location</th><th className="px-3 py-2 text-xs uppercase tracking-wide text-slate-500">Action</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {candidates.map(candidate => (
                  <tr key={candidate.id} className="hover:bg-slate-50">
                    <td className="px-3 py-3"><div className="font-medium text-slate-900">{candidate.productName}</div><div className="mt-1 text-xs text-slate-500">{candidate.detail}</div></td>
                    <td className="px-3 py-3"><div className="inline-flex items-center gap-1 text-xs text-slate-600"><GitBranch className="h-3 w-3" /><code>{candidate.batchCode}</code></div></td>
                    <td className="px-3 py-3 font-semibold text-slate-900">{formatQuantity(candidate.quantity, candidate.unit)}{candidate.cases !== undefined && <div className="text-xs font-normal text-slate-500">{candidate.cases} cases · {candidate.looseQuantity || 0} loose</div>}</td>
                    <td className="px-3 py-3 text-xs text-slate-600">{candidate.storageLocation || '—'}</td>
                    <td className="px-3 py-3"><button type="button" onClick={() => openCandidate(candidate)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100">Hand over <ArrowRight className="h-3 w-3" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3"><div><h3 className="text-sm font-semibold text-slate-900">Distribution handover history</h3><p className="mt-0.5 text-xs text-slate-500">Every new transfer is stored as a traceable record.</p></div><ClipboardCheck className="h-5 w-5 text-slate-400" /></div>
        {handovers.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">No new distribution handovers recorded yet.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-sm"><thead><tr className="border-b border-slate-100 text-left"><th className="px-4 py-2.5 text-xs uppercase tracking-wide text-slate-500">Product</th><th className="px-4 py-2.5 text-xs uppercase tracking-wide text-slate-500">Batch</th><th className="px-4 py-2.5 text-xs uppercase tracking-wide text-slate-500">Quantity</th><th className="px-4 py-2.5 text-xs uppercase tracking-wide text-slate-500">Destination</th><th className="px-4 py-2.5 text-xs uppercase tracking-wide text-slate-500">Recorded by</th><th className="px-4 py-2.5 text-xs uppercase tracking-wide text-slate-500">Date</th></tr></thead><tbody className="divide-y divide-slate-100">{[...handovers].reverse().map(record => <tr key={record.id} className="hover:bg-slate-50"><td className="px-4 py-3 font-medium text-slate-900">{record.productName}</td><td className="px-4 py-3 font-mono text-xs text-slate-600">{record.batchCode}</td><td className="px-4 py-3 font-semibold text-slate-900">{formatQuantity(record.quantity, record.unit)}</td><td className="px-4 py-3 text-slate-700">{record.destination}</td><td className="px-4 py-3 text-slate-600">{record.handedOverBy}</td><td className="px-4 py-3 text-xs text-slate-500">{new Date(record.handedOverAt).toLocaleString()}</td></tr>)}</tbody></table></div>}
      </div>

      <Modal isOpen={showHandoverModal} onClose={closeModal} title={selectedCandidate ? `Hand over ${selectedCandidate.productName}` : 'Record product handover'}>
        <div className="space-y-4">
          <p className="text-xs text-slate-500">This records a physical transfer to Distribution. It is separate from recording a Halloumi sale; vacuumed Halloumi remains chilled stock until an explicit transfer or allocation is recorded.</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div><label className="text-xs font-medium uppercase tracking-wide text-slate-600">Product</label><input value={form.productName} disabled={Boolean(selectedCandidate)} onChange={event => setForm({ ...form, productName: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50" placeholder="e.g. Halloumi" /></div>
            <div><label className="text-xs font-medium uppercase tracking-wide text-slate-600">Batch / lot</label><input value={form.batchCode} disabled={Boolean(selectedCandidate)} onChange={event => setForm({ ...form, batchCode: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm disabled:bg-slate-50" placeholder="Batch code" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium uppercase tracking-wide text-slate-600">Quantity</label><input type="number" min="0" step={form.unit === 'kg' ? '0.01' : '1'} max={selectedCandidate?.quantity} value={form.quantity || ''} onChange={event => setForm({ ...form, quantity: Number(event.target.value) || 0 })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />{selectedCandidate && <p className="mt-1 text-[11px] text-slate-500">Available: {formatQuantity(selectedCandidate.quantity, selectedCandidate.unit)}</p>}</div>
            <div><label className="text-xs font-medium uppercase tracking-wide text-slate-600">Unit</label><select value={form.unit} disabled={Boolean(selectedCandidate)} onChange={event => setForm({ ...form, unit: event.target.value as CandidateUnit })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm disabled:bg-slate-50"><option value="kg">kg</option><option value="packets">packets</option><option value="bottles">bottles</option></select></div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div><label className="text-xs font-medium uppercase tracking-wide text-slate-600">Destination</label><input value={form.destination} onChange={event => setForm({ ...form, destination: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Distribution" /></div>
            <div><label className="text-xs font-medium uppercase tracking-wide text-slate-600">Handed over by</label><input value={form.handedOverBy} onChange={event => setForm({ ...form, handedOverBy: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Staff name" /></div>
          </div>
          <div><label className="text-xs font-medium uppercase tracking-wide text-slate-600">Notes (optional)</label><textarea value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} rows={2} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Condition, recipient, or delivery note" /></div>
          <div className="flex gap-2 pt-2"><button type="button" onClick={recordHandover} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700"><CheckCircle2 className="h-4 w-4" /> Confirm handover</button><button type="button" onClick={closeModal} className="rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-200">Cancel</button></div>
        </div>
      </Modal>
    </div>
  );
}
