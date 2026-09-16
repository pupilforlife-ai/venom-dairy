import { useState } from 'react';
import {
  Scissors,
  Plus,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  Package,
  Snowflake,
  Thermometer,
} from 'lucide-react';
import { useApp } from '../store/AppContext';
import { useToast } from '../components/Toast';
import { Modal } from '../components/Modal';

export default function Cutting() {
  const { productionRounds, intermediateLots, addIntermediateLot, updateProductionRound } = useApp();
  const { showToast } = useToast();

  const [showCutModal, setShowCutModal] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState('');

  // Get rounds that are ready for cutting (pressed but not yet cut)
  const readyForCutting = productionRounds.filter(
    (r) => r.status === 'pressing' || r.status === 'ready_cutting'
  );

  // Get rounds that have been cut but not yet frozen
  const cutNotFrozen = productionRounds.filter(
    (r) => r.status === 'cut' && (r.intermediateBalance || 0) > 0
  );

  // Cut form state
  const [cutForm, setCutForm] = useState({
    batchId: '',
    cutBy: '',
    cutType: '400g blocks',
    outputWeight: 0,
    pan111Weight: 0,
    wasteWeight: 0,
    notes: '',
  });

  const handleCut = () => {
    if (!cutForm.batchId || !cutForm.cutBy) {
      showToast('error', 'Please fill in all required fields');
      return;
    }

    const round = productionRounds.find((r) => r.id === cutForm.batchId);
    if (!round) return;

    // Update round status to 'cut'
    updateProductionRound(round.id, {
      status: 'cut',
      cutBy: cutForm.cutBy,
      cuttingType: cutForm.cutType,
      intermediateBalance: cutForm.outputWeight,
      notes: cutForm.notes || round.notes,
    });

    // Create intermediate lot for the cut product
    addIntermediateLot({
      lotCode: `IL-${round.milkLotCode}-S${round.shiftNumber}-R${round.roundNumber}-${round.type}-001`,
      productId: `paneer-${round.type.toLowerCase()}-cut`,
      productName: `${round.type === 'D' ? 'Malai' : 'Rozana'} Paneer (Cut)`,
      productClass: 'intermediate',
      sourceBatchId: round.id,
      sourceBatchCode: `${round.milkLotCode}/S${round.shiftNumber}/R${round.roundNumber}/${round.type}`,
      producedQuantity: cutForm.outputWeight,
      currentQuantity: cutForm.outputWeight,
      uom: 'kg',
      storageLocation: 'Chiller',
      status: 'available',
      producedAt: new Date().toISOString(),
      sourceMilkLotCode: round.milkLotCode,
      sourceShift: round.shiftNumber,
      sourceRound: round.roundNumber,
    });

    // Create PAN111 intermediate lot if applicable
    if (cutForm.pan111Weight > 0) {
      addIntermediateLot({
        lotCode: `PAN111-${round.milkLotCode}-S${round.shiftNumber}-R${round.roundNumber}`,
        productId: 'pan111',
        productName: 'PAN111 (Recovered Paneer)',
        productClass: 'intermediate',
        sourceBatchId: round.id,
        sourceBatchCode: `${round.milkLotCode}/S${round.shiftNumber}/R${round.roundNumber}/${round.type}`,
        producedQuantity: cutForm.pan111Weight,
        currentQuantity: cutForm.pan111Weight,
        uom: 'kg',
        storageLocation: 'Chiller',
        status: 'available',
        producedAt: new Date().toISOString(),
        sourceMilkLotCode: round.milkLotCode,
        sourceShift: round.shiftNumber,
        sourceRound: round.roundNumber,
      });
    }

    showToast('success', `Cutting recorded: ${cutForm.outputWeight} kg cut, ${cutForm.pan111Weight} kg PAN111`);
    setShowCutModal(false);
    setCutForm({ batchId: '', cutBy: '', cutType: '400g blocks', outputWeight: 0, pan111Weight: 0, wasteWeight: 0, notes: '' });
  };

  // Freeze action
  const handleFreeze = (lotId: string) => {
    const lot = intermediateLots.find((l) => l.id === lotId);
    if (!lot) return;

    // Update lot location to freezer
    // In real app, this would be a stock movement
    showToast('success', `${lot.productName} moved to freezer`);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Cutting & Transformations</h2>
          <p className="text-sm text-slate-500 mt-0.5">Cut paneer, record PAN111, and manage intermediate stock</p>
        </div>
        <button
          onClick={() => setShowCutModal(true)}
          disabled={readyForCutting.length === 0}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed"
        >
          <Scissors className="w-4 h-4" />
          Record Cutting
        </button>
      </div>

      {/* Workflow reminder */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center gap-2">
        <div className="flex items-center gap-2 text-xs text-blue-700">
          <span className="font-medium">Workflow:</span>
          <span className="px-2 py-0.5 bg-purple-100 rounded">Pressing</span>
          <ArrowRight className="w-3 h-3" />
          <span className="px-2 py-0.5 bg-amber-100 rounded">Cut</span>
          <ArrowRight className="w-3 h-3" />
          <span className="px-2 py-0.5 bg-indigo-100 rounded">Freeze</span>
          <ArrowRight className="w-3 h-3" />
          <span className="px-2 py-0.5 bg-teal-100 rounded">Pack</span>
        </div>
      </div>

      {/* Ready for cutting */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 bg-amber-50">
          <h3 className="text-sm font-semibold text-amber-900 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Ready for Cutting ({readyForCutting.length})
          </h3>
        </div>
        {readyForCutting.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {readyForCutting.map((round) => (
              <div key={round.id} className="p-4 flex items-center justify-between hover:bg-slate-50">
                <div>
                  <p className="font-mono text-sm font-bold text-slate-900">
                    {round.milkLotCode}/S{round.shiftNumber}/R{round.roundNumber}/{round.type}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Output: {round.outputWeight} kg • Team: {round.team.join(', ')}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setCutForm({ ...cutForm, batchId: round.id });
                    setShowCutModal(true);
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 bg-amber-100 text-amber-700 rounded-lg text-sm font-medium hover:bg-amber-200 transition-colors"
                >
                  <Scissors className="w-4 h-4" />
                  Cut
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 text-center text-slate-400 text-sm">No batches ready for cutting</div>
        )}
      </div>

      {/* Cut but not frozen */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 bg-indigo-50">
          <h3 className="text-sm font-semibold text-indigo-900 flex items-center gap-2">
            <Snowflake className="w-4 h-4" />
            Cut - Awaiting Freezing ({cutNotFrozen.length})
          </h3>
        </div>
        {cutNotFrozen.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {cutNotFrozen.map((round) => (
              <div key={round.id} className="p-4 flex items-center justify-between hover:bg-slate-50">
                <div>
                  <p className="font-mono text-sm font-bold text-slate-900">
                    {round.milkLotCode}/S{round.shiftNumber}/R{round.roundNumber}/{round.type}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Cut by: {round.cutBy} • Type: {round.cuttingType} • Balance: {round.intermediateBalance} kg
                  </p>
                </div>
                <button
                  onClick={() => {
                    const lot = intermediateLots.find(
                      (l) => l.sourceBatchId === round.id && l.productName.includes('Paneer')
                    );
                    if (lot) handleFreeze(lot.id);
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 bg-indigo-100 text-indigo-700 rounded-lg text-sm font-medium hover:bg-indigo-200 transition-colors"
                >
                  <Snowflake className="w-4 h-4" />
                  Move to Freezer
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 text-center text-slate-400 text-sm">No batches awaiting freezing</div>
        )}
      </div>

      {/* Intermediate stock from cutting */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900">Intermediate Stock (Cut Products)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Lot Code</th>
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Product</th>
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Source Batch</th>
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Quantity</th>
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Location</th>
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {intermediateLots.map((lot) => (
                <tr key={lot.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-700">{lot.lotCode}</td>
                  <td className="px-4 py-2.5 font-medium text-slate-900">{lot.productName}</td>
                  <td className="px-4 py-2.5">
                    <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">{lot.sourceBatchCode}</code>
                  </td>
                  <td className="px-4 py-2.5 text-slate-700">{lot.currentQuantity} {lot.uom}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex items-center gap-1 text-xs font-medium ${
                      lot.storageLocation.includes('Freezer') ? 'text-indigo-600' : 'text-blue-600'
                    }`}>
                      {lot.storageLocation.includes('Freezer') ? <Snowflake className="w-3 h-3" /> : <Thermometer className="w-3 h-3" />}
                      {lot.storageLocation}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      lot.status === 'available' ? 'bg-emerald-100 text-emerald-700' :
                      lot.status === 'reserved' ? 'bg-amber-100 text-amber-700' :
                      'bg-slate-100 text-slate-600'
                    }`}>
                      {lot.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cut Modal */}
      <Modal isOpen={showCutModal} onClose={() => setShowCutModal(false)} title="Record Cutting" size="lg">
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Batch to Cut</label>
            <select
              value={cutForm.batchId}
              onChange={(e) => setCutForm({ ...cutForm, batchId: e.target.value })}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
            >
              <option value="">Select a batch...</option>
              {readyForCutting.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.milkLotCode}/S{r.shiftNumber}/R{r.roundNumber}/{r.type} - {r.outputWeight} kg
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Cut By</label>
            <input
              type="text"
              value={cutForm.cutBy}
              onChange={(e) => setCutForm({ ...cutForm, cutBy: e.target.value })}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              placeholder="e.g. Rajesh"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Cut Type</label>
            <select
              value={cutForm.cutType}
              onChange={(e) => setCutForm({ ...cutForm, cutType: e.target.value })}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
            >
              <option value="400g blocks">400g blocks</option>
              <option value="200g format">200g format</option>
              <option value="SPP pieces">SPP pieces</option>
              <option value="1kg blocks">1kg blocks</option>
            </select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Cut Output (kg)</label>
              <input
                type="number"
                value={cutForm.outputWeight || ''}
                onChange={(e) => setCutForm({ ...cutForm, outputWeight: parseFloat(e.target.value) })}
                className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                step="0.1"
                min="0"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">PAN111 (kg)</label>
              <input
                type="number"
                value={cutForm.pan111Weight || ''}
                onChange={(e) => setCutForm({ ...cutForm, pan111Weight: parseFloat(e.target.value) })}
                className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                step="0.1"
                min="0"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Waste (kg)</label>
              <input
                type="number"
                value={cutForm.wasteWeight || ''}
                onChange={(e) => setCutForm({ ...cutForm, wasteWeight: parseFloat(e.target.value) })}
                className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                step="0.1"
                min="0"
              />
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-xs text-blue-700">
              <strong>Note:</strong> PAN111 is recovered usable paneer (offcuts, broken pieces, soft paneer). It is NOT waste — it's an intermediate material used in Jalapeño Popper filling.
            </p>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Notes (optional)</label>
            <textarea
              value={cutForm.notes}
              onChange={(e) => setCutForm({ ...cutForm, notes: e.target.value })}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              rows={2}
              placeholder="Any notes about the cutting process..."
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={handleCut}
              className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors"
            >
              Record Cutting
            </button>
            <button
              onClick={() => setShowCutModal(false)}
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
