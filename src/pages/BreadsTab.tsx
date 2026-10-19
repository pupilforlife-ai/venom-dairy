import { useMemo, useState } from 'react';
import { AlertTriangle, ClipboardCheck, PackagePlus, Plus } from 'lucide-react';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { useSupabaseState } from '../hooks/useSupabaseState';
import {
  BreadDoughBatch,
  BreadPackingEntry,
  BreadProductCode,
  BreadProductionRound,
  BreadSkuCode,
  breadSkuDefinitions,
  getBreadRecipe,
  getBreadRoundTotals,
  getBreadSku,
} from '../lib/breadProduction';

function makeId(prefix: string) {
  const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `${prefix}-${id}`;
}

function currentActor() {
  return typeof window === 'undefined'
    ? 'System'
    : window.localStorage.getItem('vejoy_user_username') || window.localStorage.getItem('vejoy_user_role') || 'User';
}

function formatAmount(amount: number, unit: 'g' | 'kg') {
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(amount)} ${unit}`;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

export default function BreadsTab() {
  const [batches, setBatches] = useSupabaseState<BreadDoughBatch[]>('vejoy_breadDoughBatches', []);
  const { showToast } = useToast();
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [showRoundModal, setShowRoundModal] = useState(false);
  const [showPackingModal, setShowPackingModal] = useState(false);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [selectedRoundId, setSelectedRoundId] = useState<string | null>(null);
  const [batchProduct, setBatchProduct] = useState<BreadProductCode>('TBN');
  const [flourKg, setFlourKg] = useState(12.5);
  const [roundForm, setRoundForm] = useState({ producedPieces: '', manufacturingRejectPieces: '' });
  const [packingForm, setPackingForm] = useState({ sku: 'TN3' as BreadSkuCode, cases: '', loosePackets: '', rejectedPieces: '' });

  const sortedBatches = useMemo(() => [...batches].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [batches]);
  const selectedBatch = batches.find(batch => batch.id === selectedBatchId);
  const selectedRound = selectedBatch?.rounds.find(round => round.id === selectedRoundId);

  const openRound = (batch: BreadDoughBatch) => {
    setSelectedBatchId(batch.id);
    setRoundForm({ producedPieces: '', manufacturingRejectPieces: '' });
    setShowRoundModal(true);
  };

  const openPacking = (batch: BreadDoughBatch, round: BreadProductionRound) => {
    setSelectedBatchId(batch.id);
    setSelectedRoundId(round.id);
    const defaultSku: BreadSkuCode = batch.product === 'TBN' ? 'TN3' : 'GN3';
    setPackingForm({ sku: defaultSku, cases: '', loosePackets: '', rejectedPieces: '' });
    setShowPackingModal(true);
  };

  const createBatch = () => {
    if (!Number.isFinite(flourKg) || flourKg <= 0) {
      showToast('error', 'Enter a flour quantity greater than zero');
      return;
    }
    const createdAt = new Date().toISOString();
    const dateCode = createdAt.slice(0, 10).replace(/-/g, '');
    const dailySequence = batches.filter(batch => batch.createdAt.slice(0, 10) === createdAt.slice(0, 10)).length + 1;
    const batch: BreadDoughBatch = {
      id: makeId('bread-batch'),
      batchNumber: `${batchProduct}-${dateCode}-${String(dailySequence).padStart(2, '0')}`,
      product: batchProduct,
      flourKg,
      createdAt,
      createdBy: currentActor(),
      checkedIngredients: {},
      checklistHistory: [],
      rounds: [],
    };
    setBatches(current => [...current, batch]);
    setShowBatchModal(false);
    setFlourKg(12.5);
    showToast('success', `${batchProduct} dough batch created`);
  };

  const toggleIngredient = (batchId: string, ingredientId: string) => {
    const occurredAt = new Date().toISOString();
    const actor = currentActor();
    setBatches(current => current.map(batch => {
      if (batch.id !== batchId) return batch;
      const checked = !batch.checkedIngredients[ingredientId];
      return {
        ...batch,
        checkedIngredients: { ...batch.checkedIngredients, [ingredientId]: checked },
        checklistHistory: [...batch.checklistHistory, {
          id: makeId('bread-check'), ingredientId, checked, occurredAt, recordedBy: actor,
        }],
      };
    }));
  };

  const createProductionRound = () => {
    const batch = batches.find(item => item.id === selectedBatchId);
    if (!batch) return;
    const producedPieces = Number(roundForm.producedPieces) || 0;
    const manufacturingRejectPieces = Number(roundForm.manufacturingRejectPieces) || 0;
    if (!Number.isInteger(producedPieces) || !Number.isInteger(manufacturingRejectPieces) || producedPieces < 0 || manufacturingRejectPieces < 0 || producedPieces + manufacturingRejectPieces <= 0) {
      showToast('error', 'Enter whole naan-piece counts; record at least one piece made or rejected');
      return;
    }
    const round: BreadProductionRound = {
      id: makeId('bread-round'),
      roundNumber: batch.rounds.reduce((highest, item) => Math.max(highest, item.roundNumber), 0) + 1,
      producedPieces,
      manufacturingRejectPieces,
      recordedAt: new Date().toISOString(),
      recordedBy: currentActor(),
      packingEntries: [],
    };
    setBatches(current => current.map(item => item.id === batch.id ? { ...item, rounds: [...item.rounds, round] } : item));
    setShowRoundModal(false);
    showToast('success', `${batch.product} production round ${round.roundNumber} recorded`);
  };

  const recordPacking = () => {
    if (!selectedBatch || !selectedRound) return;
    const cases = Number(packingForm.cases) || 0;
    const loosePackets = Number(packingForm.loosePackets) || 0;
    const rejectedPieces = Number(packingForm.rejectedPieces) || 0;
    if (![cases, loosePackets, rejectedPieces].every(Number.isInteger) || cases < 0 || loosePackets < 0 || rejectedPieces < 0 || cases + loosePackets + rejectedPieces <= 0) {
      showToast('error', 'Enter whole non-negative cases, packets, and rejected naan pieces');
      return;
    }
    if (getBreadSku(packingForm.sku).product !== selectedBatch.product) {
      showToast('error', 'That pack format does not match this dough batch');
      return;
    }
    const entry: BreadPackingEntry = {
      id: makeId('bread-pack'),
      sku: packingForm.sku,
      cases,
      loosePackets,
      rejectedPieces,
      recordedAt: new Date().toISOString(),
      recordedBy: currentActor(),
    };
    setBatches(current => current.map(batch => batch.id === selectedBatch.id ? {
      ...batch,
      rounds: batch.rounds.map(round => round.id === selectedRound.id ? { ...round, packingEntries: [...round.packingEntries, entry] } : round),
    } : batch));
    setShowPackingModal(false);
    showToast('success', `${packingForm.sku} packing recorded`);
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-900">Bread Production</h3>
          <p className="mt-1 text-sm text-slate-500">Standalone dough batches, ingredient checks, manufacturing losses, and packing rounds. Not linked to a milk lot.</p>
        </div>
        <button type="button" onClick={() => setShowBatchModal(true)} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">
          <Plus className="h-4 w-4" /> New dough batch
        </button>
      </div>

      {sortedBatches.map(batch => {
        const recipe = getBreadRecipe(batch.product, batch.flourKg);
        const requiredIngredients = recipe.filter(line => !line.optional);
        const checkedRequired = requiredIngredients.filter(line => batch.checkedIngredients[line.id]).length;
        const allowedSkus = breadSkuDefinitions.filter(definition => definition.product === batch.product);
        return (
          <article key={batch.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <header className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="font-bold text-slate-900">{batch.batchNumber}</h4>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${batch.product === 'TBN' ? 'bg-amber-100 text-amber-800' : 'bg-orange-100 text-orange-800'}`}>{batch.product === 'TBN' ? 'Tandoori Butter Naan' : 'Garlic Butter Naan'}</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">Dough batch recorded {formatDateTime(batch.createdAt)} by {batch.createdBy} · Flour {formatAmount(batch.flourKg, 'kg')}</p>
              </div>
              <button type="button" onClick={() => openRound(batch)} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700"><Plus className="h-4 w-4" /> Production round</button>
            </header>

            <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
              <section>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h5 className="flex items-center gap-2 text-sm font-semibold text-slate-800"><ClipboardCheck className="h-4 w-4 text-emerald-600" /> Ingredient checklist</h5>
                  <span className="text-xs text-slate-500">{checkedRequired}/{requiredIngredients.length} core ingredients checked</span>
                </div>
                <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                  {recipe.map(line => (
                    <label key={line.id} className="flex cursor-pointer items-center gap-3 p-2.5 hover:bg-slate-50">
                      <input type="checkbox" checked={Boolean(batch.checkedIngredients[line.id])} onChange={() => toggleIngredient(batch.id, line.id)} className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
                      <span className="min-w-0 flex-1 text-sm text-slate-700">{line.name}{line.optional && <span className="ml-1 text-xs text-slate-400">(optional · amount not configured)</span>}</span>
                      <span className="shrink-0 text-sm font-semibold text-slate-800">{line.optional ? '—' : formatAmount(line.baseAmount, line.unit)}</span>
                    </label>
                  ))}
                </div>
                {checkedRequired > 0 && batch.checklistHistory.length > 0 && <p className="mt-2 text-[11px] text-slate-400">Latest checklist action: {formatDateTime(batch.checklistHistory[batch.checklistHistory.length - 1].occurredAt)} by {batch.checklistHistory[batch.checklistHistory.length - 1].recordedBy}</p>}
                <div className="mt-3 rounded-lg bg-slate-50 p-3">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Packing formats</p>
                  {allowedSkus.map(definition => <p key={definition.sku} className="text-xs text-slate-600"><strong>{definition.sku}</strong> · {definition.packetsPerCase} packets/case × {definition.piecesPerPacket} pieces/packet · {definition.saleType}{definition.promotionWith ? ` with ${definition.promotionWith.join(' / ')}` : ''}</p>)}
                </div>
              </section>

              <section className="space-y-3">
                <h5 className="text-sm font-semibold text-slate-800">Production and packing rounds</h5>
                {batch.rounds.length === 0 ? <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">No production rounds recorded yet.</div> : batch.rounds.map(round => {
                  const totals = getBreadRoundTotals(round);
                  return (
                    <div key={round.id} className="rounded-lg border border-slate-200 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <h6 className="font-semibold text-slate-900">Round {round.roundNumber}</h6>
                          <p className="text-xs text-slate-500">Recorded {formatDateTime(round.recordedAt)} by {round.recordedBy}</p>
                        </div>
                        <button type="button" onClick={() => openPacking(batch, round)} className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"><PackagePlus className="h-3.5 w-3.5" /> Record packing</button>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                        <div className="rounded bg-slate-50 p-2"><span className="block text-slate-500">Naan produced</span><strong>{round.producedPieces}</strong></div>
                        <div className="rounded bg-rose-50 p-2"><span className="block text-rose-700">Manufacturing rejects</span><strong>{round.manufacturingRejectPieces}</strong></div>
                        <div className="rounded bg-emerald-50 p-2"><span className="block text-emerald-700">Usable after manufacture</span><strong>{totals.usableAfterManufacturing}</strong></div>
                        <div className="rounded bg-indigo-50 p-2"><span className="block text-indigo-700">Packed naan pieces</span><strong>{totals.packedPieces}</strong><span className="block">{totals.packedPackets} packets total</span></div>
                        <div className="rounded bg-rose-50 p-2"><span className="block text-rose-700">Packing rejects</span><strong>{totals.packingRejectPieces}</strong></div>
                        <div className={`rounded p-2 ${totals.balancePieces < 0 ? 'bg-red-100 text-red-800' : 'bg-amber-50 text-amber-800'}`}><span className="block">Unpacked balance</span><strong>{totals.balancePieces} pieces</strong></div>
                      </div>
                      {totals.balancePieces < 0 && <p className="mt-2 flex items-center gap-1 text-xs font-medium text-red-700"><AlertTriangle className="h-3.5 w-3.5" /> Packed/rejected quantity exceeds the available round output; recorded for review, not blocked.</p>}
                      {totals.usableAfterManufacturing < 0 && <p className="mt-2 flex items-center gap-1 text-xs font-medium text-red-700"><AlertTriangle className="h-3.5 w-3.5" /> Manufacturing rejects exceed the pieces recorded as produced; recorded for review, not blocked.</p>}
                      {round.packingEntries.length > 0 && <div className="mt-3 space-y-1 border-t border-slate-100 pt-2">
                        {round.packingEntries.map(entry => {
                          const sku = getBreadSku(entry.sku);
                          return <p key={entry.id} className="text-xs text-slate-600"><strong>{entry.sku}</strong>: {entry.cases} cases + {entry.loosePackets} packets ({(entry.cases * sku.packetsPerCase + entry.loosePackets) * sku.piecesPerPacket} naan pieces) · {entry.rejectedPieces} rejects · {formatDateTime(entry.recordedAt)} by {entry.recordedBy}</p>;
                        })}
                      </div>}
                    </div>
                  );
                })}
              </section>
            </div>
          </article>
        );
      })}

      {sortedBatches.length === 0 && <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">No bread dough batches recorded. Start a TBN or GBN batch to create its scaled recipe checklist.</div>}

      <Modal isOpen={showBatchModal} onClose={() => setShowBatchModal(false)} title="Create bread dough batch">
        <div className="space-y-4">
          <label className="block"><span className="text-xs font-medium uppercase tracking-wide text-slate-600">Bread product</span><select value={batchProduct} onChange={event => setBatchProduct(event.target.value as BreadProductCode)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"><option value="TBN">Tandoori Butter Naan (TBN)</option><option value="GBN">Garlic Butter Naan (GBN)</option></select></label>
          <label className="block"><span className="text-xs font-medium uppercase tracking-wide text-slate-600">Flour (kg)</span><input type="number" min="0.01" step="0.01" value={flourKg} onChange={event => setFlourKg(Number(event.target.value))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
          <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">Ingredient targets will scale proportionally from the 12.5 kg flour recipe. Staff can check off ingredients as they are added.</div>
          <div className="flex gap-2"><button type="button" onClick={createBatch} className="flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white">Create dough batch</button><button type="button" onClick={() => setShowBatchModal(false)} className="rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700">Cancel</button></div>
        </div>
      </Modal>

      <Modal isOpen={showRoundModal} onClose={() => setShowRoundModal(false)} title={`Record ${selectedBatch?.product || 'bread'} production round`}>
        <div className="space-y-4">
          <p className="text-sm text-slate-500">Record whole individual naan pieces. Manufacturing rejects are recorded here before packing.</p>
          <label className="block"><span className="text-xs font-medium uppercase tracking-wide text-slate-600">Total naan pieces made (before manufacturing rejects)</span><input type="number" min="0" step="1" value={roundForm.producedPieces} onChange={event => setRoundForm(current => ({ ...current, producedPieces: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
          <label className="block"><span className="text-xs font-medium uppercase tracking-wide text-slate-600">Manufacturing rejects / losses (pieces)</span><input type="number" min="0" step="1" value={roundForm.manufacturingRejectPieces} onChange={event => setRoundForm(current => ({ ...current, manufacturingRejectPieces: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
          <div className="flex gap-2"><button type="button" onClick={createProductionRound} className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white">Save production round</button><button type="button" onClick={() => setShowRoundModal(false)} className="rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700">Cancel</button></div>
        </div>
      </Modal>

      <Modal isOpen={showPackingModal} onClose={() => setShowPackingModal(false)} title={`Record packing · ${selectedBatch?.batchNumber || ''} / R${selectedRound?.roundNumber || ''}`}>
        <div className="space-y-4">
          {selectedRound && <div className="rounded-lg bg-slate-50 p-3 text-sm">Available after manufacturing: <strong>{getBreadRoundTotals(selectedRound).usableAfterManufacturing}</strong> naan pieces</div>}
          <label className="block"><span className="text-xs font-medium uppercase tracking-wide text-slate-600">Pack SKU</span><select value={packingForm.sku} onChange={event => setPackingForm(current => ({ ...current, sku: event.target.value as BreadSkuCode }))} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">{breadSkuDefinitions.filter(definition => definition.product === selectedBatch?.product).map(definition => <option key={definition.sku} value={definition.sku}>{definition.sku} · {definition.packetsPerCase} packets/case × {definition.piecesPerPacket} pieces/packet · {definition.saleType}</option>)}</select></label>
          <div className="grid grid-cols-2 gap-3"><label className="block"><span className="text-xs font-medium uppercase tracking-wide text-slate-600">Cases (15 packets each)</span><input type="number" min="0" step="1" value={packingForm.cases} onChange={event => setPackingForm(current => ({ ...current, cases: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label><label className="block"><span className="text-xs font-medium uppercase tracking-wide text-slate-600">Loose packets</span><input type="number" min="0" step="1" value={packingForm.loosePackets} onChange={event => setPackingForm(current => ({ ...current, loosePackets: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label></div>
          <label className="block"><span className="text-xs font-medium uppercase tracking-wide text-slate-600">Rejects during packing (individual naan pieces)</span><input type="number" min="0" step="1" value={packingForm.rejectedPieces} onChange={event => setPackingForm(current => ({ ...current, rejectedPieces: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
          <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-3 text-sm text-indigo-900">This entry records <strong>{(Number(packingForm.cases) * 15 + Number(packingForm.loosePackets)) * getBreadSku(packingForm.sku).piecesPerPacket}</strong> packed naan pieces.</div>
          <div className="flex gap-2"><button type="button" onClick={recordPacking} className="flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white">Save packing entry</button><button type="button" onClick={() => setShowPackingModal(false)} className="rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700">Cancel</button></div>
        </div>
      </Modal>
    </section>
  );
}
