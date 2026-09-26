import { useState } from 'react';
import {
  Package,
  Plus,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  Snowflake,
  Thermometer,
  Clock,
} from 'lucide-react';
import { useApp } from '../store/AppContext';
import { useToast } from '../components/Toast';
import { Modal } from '../components/Modal';
import { paneerSkuDefinitions, paneerSkuByCode, getAllowedPaneerSkus, getPaneerPackWeight } from '../data/skuConfig';

export default function Packing() {
  const { intermediateLots, finishedStock, addFinishedStock, updateIntermediateLot, updateProductionRound, productionRounds } = useApp();
  const { showToast } = useToast();

  const [showPackModal, setShowPackModal] = useState(false);
  const [selectedLot, setSelectedLot] = useState('');

  // Get frozen stock available for packing
  const availableForPacking = intermediateLots.filter(
    (lot) => lot.status === 'available' && lot.storageLocation.includes('Freezer')
  );

  // FIFO: Sort by production date (oldest first)
  const fifoOrdered = [...availableForPacking].sort(
    (a, b) => new Date(a.producedAt).getTime() - new Date(b.producedAt).getTime()
  );

  // Pack form state
  const [packForm, setPackForm] = useState({
    lotId: '',
    sku: '',
    cases: 0,
    loosePackets: 0,
    looseWeightKg: 0,
    weightKg: 0,
    notes: '',
  });

  const selectedPackingLot = intermediateLots.find((lot) => lot.id === packForm.lotId);
  const selectedSourceRound = selectedPackingLot ? productionRounds.find((round) => round.id === selectedPackingLot.sourceBatchId) : undefined;
  const allowedSkuDefinitions = selectedPackingLot?.productId === 'pan111'
    ? paneerSkuDefinitions.filter(definition => definition.sku === 'PAN111')
    : selectedSourceRound && (selectedSourceRound.type === 'D' || selectedSourceRound.type === 'C/S')
      ? getAllowedPaneerSkus(selectedSourceRound.type, selectedSourceRound.cuttingType)
      : paneerSkuDefinitions;

  const handlePack = () => {
    if (!packForm.lotId || (!packForm.cases && !packForm.loosePackets && !packForm.looseWeightKg && !packForm.weightKg)) {
      showToast('error', 'Please fill in all required fields');
      return;
    }

    const lot = intermediateLots.find((l) => l.id === packForm.lotId);
    if (!lot) return;

    const definition = paneerSkuByCode[packForm.sku];
    if (!definition || !allowedSkuDefinitions.some(item => item.sku === packForm.sku)) {
      showToast('error', 'That SKU is not permitted for this source lot');
      return;
    }
    if (definition.packMode === 'weight_only' && packForm.weightKg <= 0) {
      showToast('error', 'Enter the PAN111 weight');
      return;
    }
    const totalPackets = definition.packMode === 'units' ? packForm.cases * (definition.unitsPerCase || 0) + packForm.loosePackets : 0;
    const totalWeightKg = getPaneerPackWeight(definition, packForm.cases, packForm.loosePackets, packForm.looseWeightKg, packForm.weightKg);

    // Check if we have enough stock
    if (totalWeightKg > lot.currentQuantity) {
      showToast('error', `Not enough stock. Available: ${lot.currentQuantity} kg, Required: ${totalWeightKg.toFixed(1)} kg`);
      return;
    }

    // Create finished stock
    addFinishedStock({
      sku: packForm.sku,
      productName: definition.productName,
      packingRunId: `pk-${Date.now()}`,
      cases: packForm.cases,
      loosePackets: packForm.loosePackets,
      totalPackets,
      storageLocation: 'Finished Production Stock',
      status: 'awaiting_handover',
      createdAt: new Date().toISOString(),
      sourceBatchCodes: [lot.sourceBatchCode],
      ...(definition.packMode === 'weight_only' ? { weightKg: totalWeightKg } : definition.packMode === 'weight_loose' ? { looseWeightKg: packForm.looseWeightKg } : {}),
    });

    // Update intermediate lot
    const newQuantity = lot.currentQuantity - totalWeightKg;
    updateIntermediateLot(lot.id, {
      currentQuantity: newQuantity,
      status: newQuantity <= 0 ? 'consumed' : 'available',
    });

    // Update production round status if this was the last of the batch
    if (newQuantity <= 0) {
      const round = productionRounds.find((r) => r.id === lot.sourceBatchId);
      if (round) {
        updateProductionRound(round.id, {
          status: 'packed',
          packedSkus: [{ sku: packForm.sku, cases: packForm.cases, loose: packForm.loosePackets, ...(definition.packMode === 'weight_only' ? { weightKg: totalWeightKg } : definition.packMode === 'weight_loose' ? { looseWeightKg: packForm.looseWeightKg } : {}) }],
          intermediateBalance: 0,
        });
      }
    }

    showToast('success', `Packed ${packForm.cases} cases + ${packForm.loosePackets} loose packets of ${definition.productName}`);
    setShowPackModal(false);
    setPackForm({ lotId: '', sku: '', cases: 0, loosePackets: 0, looseWeightKg: 0, weightKg: 0, notes: '' });
  };

  // Check if selected lot is FIFO compliant
  const isFifoCompliant = () => {
    if (!packForm.lotId || fifoOrdered.length === 0) return true;
    const selectedLot = intermediateLots.find((l) => l.id === packForm.lotId);
    if (!selectedLot) return true;
    const oldestLot = fifoOrdered[0];
    return selectedLot.id === oldestLot.id || new Date(selectedLot.producedAt).getTime() <= new Date(oldestLot.producedAt).getTime();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Packing & FIFO</h2>
          <p className="text-sm text-slate-500 mt-0.5">Pack frozen intermediate stock into finished goods</p>
        </div>
        <button
          onClick={() => setShowPackModal(true)}
          disabled={availableForPacking.length === 0}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed"
        >
          <Package className="w-4 h-4" />
          New Packing Run
        </button>
      </div>

      {/* FIFO reminder */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center gap-2">
        <Clock className="w-4 h-4 text-blue-600" />
        <p className="text-xs text-blue-700">
          <strong>FIFO Rule:</strong> Always pack the oldest frozen batch first. System will warn if you select a newer batch.
        </p>
      </div>

      {/* FIFO ordered list */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 bg-emerald-50">
          <h3 className="text-sm font-semibold text-emerald-900 flex items-center gap-2">
            <Snowflake className="w-4 h-4" />
            Frozen Stock - FIFO Order (Oldest First)
          </h3>
        </div>
        {fifoOrdered.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {fifoOrdered.map((lot, index) => (
              <div key={lot.id} className="p-4 flex items-center justify-between hover:bg-slate-50">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                    index === 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {index + 1}
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">{lot.productName}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Source: {lot.sourceBatchCode} • Produced: {new Date(lot.producedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-slate-900">{lot.currentQuantity} kg</p>
                  {index === 0 && (
                    <span className="text-xs text-emerald-600 font-medium">← Pack this first</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 text-center text-slate-400 text-sm">No frozen stock available for packing</div>
        )}
      </div>

      {/* Finished stock */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900">Finished Stock (Awaiting Handover)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">SKU</th>
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Product</th>
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Cases</th>
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Loose</th>
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Total Pkts</th>
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Source Batch</th>
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Packed At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {finishedStock.map((stock) => (
                <tr key={stock.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5">
                    <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-700 font-medium">{stock.sku}</code>
                  </td>
                  <td className="px-4 py-2.5 font-medium text-slate-900">{stock.productName}</td>
                  <td className="px-4 py-2.5 text-slate-700 font-medium">{stock.cases}</td>
                  <td className="px-4 py-2.5 text-slate-700">{stock.loosePackets}</td>
                  <td className="px-4 py-2.5 text-slate-900 font-bold">{stock.totalPackets}</td>
                  <td className="px-4 py-2.5">
                    <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">{stock.sourceBatchCodes[0]}</code>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">{new Date(stock.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {finishedStock.length === 0 && (
          <div className="p-6 text-center text-slate-400 text-sm">No finished stock yet</div>
        )}
      </div>

      {/* Pack Modal */}
      <Modal isOpen={showPackModal} onClose={() => setShowPackModal(false)} title="New Packing Run" size="lg">
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Select Frozen Stock</label>
            <select
              value={packForm.lotId}
              onChange={(e) => { const lot = intermediateLots.find(item => item.id === e.target.value); const sourceRound = lot ? productionRounds.find(round => round.id === lot.sourceBatchId) : undefined; const definitions = lot?.productId === 'pan111' ? paneerSkuDefinitions.filter(definition => definition.sku === 'PAN111') : sourceRound && (sourceRound.type === 'D' || sourceRound.type === 'C/S') ? getAllowedPaneerSkus(sourceRound.type, sourceRound.cuttingType) : paneerSkuDefinitions; setPackForm({ ...packForm, lotId: e.target.value, sku: definitions[0]?.sku || '' }); }}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
            >
              <option value="">Select a batch...</option>
              {fifoOrdered.map((lot, index) => (
                <option key={lot.id} value={lot.id}>
                  {index === 0 ? '⭐ ' : ''}{lot.productName} - {lot.currentQuantity} kg ({lot.sourceBatchCode})
                </option>
              ))}
            </select>
          </div>

          {/* FIFO Warning */}
          {packForm.lotId && !isFifoCompliant() && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-medium text-amber-800">FIFO Warning</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  You're selecting a newer batch while older stock is available. This violates FIFO. Consider packing the oldest batch first.
                </p>
              </div>
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">SKU to Pack</label>
            <select
              value={packForm.sku}
              onChange={(e) => setPackForm({ ...packForm, sku: e.target.value })}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
            >
              <option value="">Select SKU...</option>
              {allowedSkuDefinitions.map((definition) => (
                <option key={definition.sku} value={definition.sku}>
                  {definition.sku} - {definition.productName} {definition.packMode === 'weight_only' ? '(weight only)' : definition.packMode === 'weight_loose' ? '(loose by weight)' : `(${definition.unitsPerCase} packets/case)`}
                </option>
              ))}
            </select>
          </div>

          {paneerSkuByCode[packForm.sku]?.packMode !== 'weight_only' && <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Cases</label>
              <input
                type="number"
                value={packForm.cases || ''}
                onChange={(e) => setPackForm({ ...packForm, cases: parseInt(e.target.value) })}
                className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                min="0"
              />
            </div>
            {paneerSkuByCode[packForm.sku]?.packMode === 'weight_loose' ? <div>
              <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Loose weight (kg)</label>
              <input type="number" value={packForm.looseWeightKg || ''} onChange={(e) => setPackForm({ ...packForm, looseWeightKg: parseFloat(e.target.value) || 0 })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" min="0" step="0.01" />
            </div> : <div>
              <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Loose Packets</label>
              <input
                type="number"
                value={packForm.loosePackets || ''}
                onChange={(e) => setPackForm({ ...packForm, loosePackets: parseInt(e.target.value) })}
                className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                min="0"
              />
            </div>}
          </div>}
          {paneerSkuByCode[packForm.sku]?.packMode === 'weight_only' && <div><label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Weight (kg)</label><input type="number" value={packForm.weightKg || ''} onChange={(e) => setPackForm({ ...packForm, weightKg: parseFloat(e.target.value) || 0 })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" min="0" step="0.01" /></div>}

          {/* Preview */}
          {packForm.sku && paneerSkuByCode[packForm.sku] && (
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-xs text-slate-500 mb-1">Packing Preview:</p>
              <p className="text-sm font-medium text-slate-900">
                {packForm.cases} cases + {packForm.loosePackets} loose ={' '}
                <span className="text-emerald-600 font-bold">
                  {paneerSkuByCode[packForm.sku]?.packMode === 'weight_only' ? `${packForm.weightKg.toFixed(2)} kg` : paneerSkuByCode[packForm.sku]?.packMode === 'weight_loose' ? `${packForm.looseWeightKg.toFixed(2)} kg loose` : `${packForm.cases * (paneerSkuByCode[packForm.sku]?.unitsPerCase || 0) + packForm.loosePackets} total packets`}
                </span>
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Total weight: {getPaneerPackWeight(paneerSkuByCode[packForm.sku], packForm.cases, packForm.loosePackets, packForm.looseWeightKg, packForm.weightKg).toFixed(2)} kg
              </p>
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Notes (optional)</label>
            <textarea
              value={packForm.notes}
              onChange={(e) => setPackForm({ ...packForm, notes: e.target.value })}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              rows={2}
              placeholder="Any notes about the packing run..."
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={handlePack}
              className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors"
            >
              Record Packing
            </button>
            <button
              onClick={() => setShowPackModal(false)}
              className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
