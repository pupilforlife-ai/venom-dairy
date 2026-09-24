import { useState } from 'react';
import { Plus, Package, CheckCircle2, Clock } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { useToast } from '../components/Toast';
import { Modal } from '../components/Modal';
import { useSupabaseState } from '../hooks/useSupabaseState';

type CrumbingStatus = 
  | 'scheduled'
  | 'crumbing'
  | 'frozen'
  | 'frying'
  | 'packed'
  | 'handed_over';

type CrumbingType = 'SPP' | 'JP' | 'HCP';

const crumbingStatusLabels: Record<CrumbingStatus, string> = {
  scheduled: 'Scheduled',
  crumbing: 'Crumbing',
  frozen: 'Frozen',
  frying: 'Frying',
  packed: 'Packed',
  handed_over: 'Handed Over',
};

const crumbingStatusColors: Record<CrumbingStatus, string> = {
  scheduled: 'bg-slate-400',
  crumbing: 'bg-orange-500',
  frozen: 'bg-blue-500',
  frying: 'bg-red-500',
  packed: 'bg-emerald-500',
  handed_over: 'bg-emerald-700',
};

interface CrumbingBatch {
  id: string;
  batchCode: string;
  type: CrumbingType;
  sourceBatchId: string;
  sourceBatchCode: string;
  status: CrumbingStatus;
  traysCrumbed: number;
  traysFried: number;
  traysRemaining: number;
  traysPacked: number;
  crumbingTeam?: string;
  fryingTeam?: string;
  fryTemperature?: number;
  fryTime?: number;
  packedSkus?: Array<{
    cases: number;
    loose: number;
  }>;
  notes?: string;
  createdAt: string;
}

export default function CrumbingTab() {
  const { productionRounds, milkLots, intermediateLots } = useApp();
  const { showToast } = useToast();

  const [crumbingBatches, setCrumbingBatches] = useSupabaseState<CrumbingBatch[]>('vejoy_crumbingBatches', []);

  const [showNewBatchModal, setShowNewBatchModal] = useState(false);
  const [showTrayModal, setShowTrayModal] = useState(false);
  const [showPackModal, setShowPackModal] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<CrumbingType>('SPP');

  // Forms
  const [newBatchForm, setNewBatchForm] = useState({
    type: 'SPP' as CrumbingType,
    sourceBatchId: '',
    traysCrumbed: 0,
    crumbingTeam: '',
  });

  const [trayForm, setTrayForm] = useState({
    traysFried: 0,
    fryingTeam: '',
    fryTemperature: 185,
    fryTime: 20,
  });

  const [packForm, setPackForm] = useState({
    traysPacked: 0,
    cases: 0,
    loose: 0,
  });

  // Get available sources
  const getAvailableSources = (type: CrumbingType) => {
    if (type === 'SPP') {
      // Paneer rounds cut as SPP pieces
      return productionRounds.filter(r => 
        r.type === 'C/S' && 
        r.cuttingType === 'SPP pieces' &&
        r.status === 'cut'
      );
    } else if (type === 'JP') {
      // PAN111 from intermediate lots
      return intermediateLots.filter(lot => 
        lot.productId === 'pan111' &&
        lot.status === 'available'
      );
    } else if (type === 'HCP') {
      // Halloumi rounds sent to HCP
      return productionRounds.filter(r => 
        r.type === 'Halloumi' &&
        r.status === 'sent_to_hcp'
      );
    }
    return [];
  };

  // Generate batch code
  const generateBatchCode = (type: CrumbingType, milkLotCode: string) => {
    const typeLower = type.toLowerCase();
    const existingBatches = crumbingBatches.filter(b => 
      b.batchCode.startsWith(`${milkLotCode}-${typeLower}-`)
    );
    const nextNumber = existingBatches.length + 1;
    return `${milkLotCode}-${typeLower}-${String(nextNumber).padStart(3, '0')}`;
  };

  // Handlers
  const handleCreateBatch = () => {
    if (!newBatchForm.sourceBatchId || newBatchForm.traysCrumbed <= 0) {
      showToast('error', 'Please fill all required fields');
      return;
    }

    let sourceBatchCode = '';
    let milkLotCode = '';

    if (newBatchForm.type === 'SPP') {
      const source = productionRounds.find(r => r.id === newBatchForm.sourceBatchId);
      if (source) {
        sourceBatchCode = `${source.milkLotCode}/S${source.shiftNumber}/R${source.roundNumber}/C/S`;
        milkLotCode = source.milkLotCode;
      }
    } else if (newBatchForm.type === 'JP') {
      const source = intermediateLots.find(l => l.id === newBatchForm.sourceBatchId);
      if (source) {
        sourceBatchCode = source.lotCode;
        milkLotCode = source.sourceMilkLotCode;
      }
    } else if (newBatchForm.type === 'HCP') {
      const source = productionRounds.find(r => r.id === newBatchForm.sourceBatchId);
      if (source) {
        sourceBatchCode = `${source.milkLotCode}/S${source.shiftNumber}/R${source.roundNumber}/Halloumi`;
        milkLotCode = source.milkLotCode;
      }
    }

    const batchCode = generateBatchCode(newBatchForm.type, milkLotCode);

    const newBatch: CrumbingBatch = {
      id: `crumb-${Date.now()}`,
      batchCode,
      type: newBatchForm.type,
      sourceBatchId: newBatchForm.sourceBatchId,
      sourceBatchCode,
      status: 'crumbing',
      traysCrumbed: newBatchForm.traysCrumbed,
      traysFried: 0,
      traysRemaining: newBatchForm.traysCrumbed,
      traysPacked: 0,
      crumbingTeam: newBatchForm.crumbingTeam,
      createdAt: new Date().toISOString(),
    };

    setCrumbingBatches([...crumbingBatches, newBatch]);
    showToast('success', `Crumbing batch created: ${batchCode}`);
    setShowNewBatchModal(false);
    setNewBatchForm({ type: 'SPP', sourceBatchId: '', traysCrumbed: 0, crumbingTeam: '' });
  };

  const handleFreeze = (batchId: string) => {
    setCrumbingBatches(crumbingBatches.map(b => 
      b.id === batchId ? { ...b, status: 'frozen' } : b
    ));
    showToast('success', 'Batch frozen');
  };

  const handleStartFrying = () => {
    if (!selectedBatch || trayForm.traysFried <= 0) {
      showToast('error', 'Please enter valid tray count');
      return;
    }

    setCrumbingBatches(crumbingBatches.map(b => {
      if (b.id === selectedBatch) {
        return {
          ...b,
          status: 'frying',
          traysFried: b.traysFried + trayForm.traysFried,
          traysRemaining: b.traysCrumbed - (b.traysFried + trayForm.traysFried),
          fryingTeam: trayForm.fryingTeam,
          fryTemperature: trayForm.fryTemperature,
          fryTime: trayForm.fryTime,
        };
      }
      return b;
    }));

    showToast('success', `Fried ${trayForm.traysFried} trays at ${trayForm.fryTemperature}°C for ${trayForm.fryTime}s`);
    setShowTrayModal(false);
    setTrayForm({ traysFried: 0, fryingTeam: '', fryTemperature: 185, fryTime: 20 });
  };

  const handlePack = () => {
    if (!selectedBatch || packForm.traysPacked <= 0) {
      showToast('error', 'Please enter valid tray count');
      return;
    }

    const batch = crumbingBatches.find(b => b.id === selectedBatch);
    if (!batch) return;

    setCrumbingBatches(crumbingBatches.map(b => {
      if (b.id === selectedBatch) {
        const existingPacked = b.packedSkus || [];
        return {
          ...b,
          status: 'packed',
          traysPacked: b.traysPacked + packForm.traysPacked,
          packedSkus: [...existingPacked, {
            cases: packForm.cases,
            loose: packForm.loose,
          }],
        };
      }
      return b;
    }));

    showToast('success', `Packed ${packForm.traysPacked} trays (${packForm.cases} cases + ${packForm.loose} loose)`);
    setShowPackModal(false);
    setPackForm({ traysPacked: 0, cases: 0, loose: 0 });
  };

  const handleHandOver = (batchId: string) => {
    setCrumbingBatches(crumbingBatches.map(b => 
      b.id === batchId ? { ...b, status: 'handed_over' } : b
    ));
    showToast('success', 'Batch handed over');
  };

  const getActionButtons = (batch: CrumbingBatch) => {
    const buttons = [];

    if (batch.status === 'crumbing') {
      buttons.push(
        <button
          key="freeze"
          onClick={() => handleFreeze(batch.id)}
          className="px-3 py-1.5 bg-blue-500 text-white rounded text-xs font-medium hover:bg-blue-600"
        >
          Freeze
        </button>
      );
    } else if (batch.status === 'frozen') {
      buttons.push(
        <button
          key="fry"
          onClick={() => {
            setSelectedBatch(batch.id);
            setShowTrayModal(true);
          }}
          className="px-3 py-1.5 bg-red-500 text-white rounded text-xs font-medium hover:bg-red-600"
        >
          Fry Trays
        </button>
      );
    } else if (batch.status === 'frying') {
      buttons.push(
        <button
          key="pack"
          onClick={() => {
            setSelectedBatch(batch.id);
            setShowPackModal(true);
          }}
          className="flex items-center gap-1 px-3 py-1.5 bg-emerald-500 text-white rounded text-xs font-medium hover:bg-emerald-600"
        >
          <Package className="w-3 h-3" /> Pack
        </button>
      );
    } else if (batch.status === 'packed') {
      buttons.push(
        <button
          key="handover"
          onClick={() => handleHandOver(batch.id)}
          className="flex items-center gap-1 px-3 py-1.5 bg-emerald-700 text-white rounded text-xs font-medium hover:bg-emerald-800"
        >
          <CheckCircle2 className="w-3 h-3" /> Hand Over
        </button>
      );
    }

    return buttons;
  };

  // Filter batches by type
  const sppBatches = crumbingBatches.filter(b => b.type === 'SPP');
  const jpBatches = crumbingBatches.filter(b => b.type === 'JP');
  const hcpBatches = crumbingBatches.filter(b => b.type === 'HCP');

  const renderBatchSection = (title: string, batches: CrumbingBatch[], type: CrumbingType) => {
    const sources = getAvailableSources(type);

    return (
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {/* Section Header */}
        <div className="px-4 py-3 bg-gradient-to-r from-pink-50 to-orange-50 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-slate-900">{title}</h3>
              <p className="text-sm text-slate-600">
                {type === 'SPP' && 'Spicy Paneer Poppers - 8 pieces/packet, 12 packets/case'}
                {type === 'JP' && 'Jalapeño Poppers - 6 pieces/packet, 12 packets/case'}
                {type === 'HCP' && 'Halloumi Cheese Poppers - 8 pieces/packet, 12 packets/case'}
              </p>
            </div>
            <button
              onClick={() => {
                setActiveType(type);
                setNewBatchForm({ ...newBatchForm, type });
                setShowNewBatchModal(true);
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-pink-600 text-white hover:bg-pink-700"
            >
              <Plus className="w-4 h-4" /> New Batch
            </button>
          </div>
        </div>

        {/* Batches Table */}
        {batches.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-4 py-2 text-left font-medium text-slate-500 text-xs uppercase tracking-wide">Batch ID</th>
                  <th className="px-4 py-2 text-left font-medium text-slate-500 text-xs uppercase tracking-wide">Source</th>
                  <th className="px-4 py-2 text-left font-medium text-slate-500 text-xs uppercase tracking-wide">Status</th>
                  <th className="px-4 py-2 text-left font-medium text-slate-500 text-xs uppercase tracking-wide">Crumbed</th>
                  <th className="px-4 py-2 text-left font-medium text-slate-500 text-xs uppercase tracking-wide">Fried</th>
                  <th className="px-4 py-2 text-left font-medium text-slate-500 text-xs uppercase tracking-wide">Remaining</th>
                  <th className="px-4 py-2 text-left font-medium text-slate-500 text-xs uppercase tracking-wide">Packed</th>
                  <th className="px-4 py-2 text-left font-medium text-slate-500 text-xs uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {batches.map((batch) => (
                  <tr key={batch.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3">
                      <div className="font-mono text-xs font-bold text-slate-900">{batch.batchCode}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-xs text-slate-600">{batch.sourceBatchCode}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-white ${crumbingStatusColors[batch.status]}`}>
                        {crumbingStatusLabels[batch.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-xs">
                      {batch.traysCrumbed} trays
                      {batch.crumbingTeam && (
                        <div className="text-slate-400">by {batch.crumbingTeam}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-xs">
                      {batch.traysFried} trays
                      {batch.fryingTeam && (
                        <div className="text-slate-400">by {batch.fryingTeam}</div>
                      )}
                      {batch.fryTemperature && (
                        <div className="text-slate-400">{batch.fryTemperature}°C / {batch.fryTime}s</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-orange-600 text-xs font-medium">
                      {batch.traysRemaining} trays
                    </td>
                    <td className="px-4 py-3">
                      {batch.packedSkus && batch.packedSkus.length > 0 ? (
                        <div className="text-xs">
                          {batch.packedSkus.map((p, i) => (
                            <div key={i}>{p.cases} cases + {p.loose} loose</div>
                          ))}
                        </div>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 flex-wrap">
                        {getActionButtons(batch)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-slate-400">
            <p>No {title} batches yet.</p>
            {sources.length === 0 && (
              <p className="text-xs mt-2 text-amber-600">
                No available sources. {type === 'SPP' && 'Create paneer rounds with SPP pieces cutting type first.'}
                {type === 'JP' && 'Record PAN111 from paneer rounds first.'}
                {type === 'HCP' && 'Send halloumi rounds to HCP first.'}
              </p>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-900">Crumbing & Frying</h3>
          <p className="text-sm text-slate-500">
            SPP / JP / HCP Production - Tray Tracking
          </p>
        </div>
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-blue-900 mb-2">Flash Fry Parameters</h4>
        <div className="grid grid-cols-2 gap-4 text-xs text-blue-800">
          <div>
            <strong>Temperature:</strong> 185°C
          </div>
          <div>
            <strong>Time:</strong> ~20 seconds per tray
          </div>
        </div>
      </div>

      {/* Three Sections */}
      {renderBatchSection('SPP - Spicy Paneer Poppers', sppBatches, 'SPP')}
      {renderBatchSection('JP - Jalapeño Poppers', jpBatches, 'JP')}
      {renderBatchSection('HCP - Halloumi Cheese Poppers', hcpBatches, 'HCP')}

      {/* New Batch Modal */}
      <Modal isOpen={showNewBatchModal} onClose={() => setShowNewBatchModal(false)} title={`Create New ${activeType} Batch`}>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Source</label>
            <select
              value={newBatchForm.sourceBatchId}
              onChange={(e) => setNewBatchForm({ ...newBatchForm, sourceBatchId: e.target.value })}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
            >
              <option value="">Select source...</option>
              {getAvailableSources(activeType).map((source: any) => (
                <option key={source.id} value={source.id}>
                  {activeType === 'SPP' && `${source.milkLotCode}/S${source.shiftNumber}/R${source.roundNumber}/C/S - ${(source.sppRecordedWeight ?? source.outputWeight ?? 0)} kg SPP`}
                  {activeType === 'JP' && `${source.lotCode} - ${source.currentQuantity} kg PAN111`}
                  {activeType === 'HCP' && `${source.milkLotCode}/S${source.shiftNumber}/R${source.roundNumber}/Halloumi - ${source.outputWeight} kg`}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Trays Crumbed</label>
            <input
              type="number"
              value={newBatchForm.traysCrumbed}
              onChange={(e) => setNewBatchForm({ ...newBatchForm, traysCrumbed: parseInt(e.target.value) })}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              min="0"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Crumbing Team</label>
            <input
              type="text"
              value={newBatchForm.crumbingTeam}
              onChange={(e) => setNewBatchForm({ ...newBatchForm, crumbingTeam: e.target.value })}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              placeholder="e.g., Rajesh, Amit"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <button
              onClick={handleCreateBatch}
              className="flex-1 px-4 py-2.5 bg-pink-600 text-white rounded-lg text-sm font-medium hover:bg-pink-700"
            >
              Create Batch
            </button>
            <button
              onClick={() => setShowNewBatchModal(false)}
              className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {/* Fry Trays Modal */}
      <Modal isOpen={showTrayModal} onClose={() => setShowTrayModal(false)} title="Fry Trays">
        <div className="space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-xs text-red-800">
              <strong>Flash Fry Parameters:</strong> 185°C for 20 seconds per tray
            </p>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Trays to Fry</label>
            <input
              type="number"
              value={trayForm.traysFried}
              onChange={(e) => setTrayForm({ ...trayForm, traysFried: parseInt(e.target.value) })}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              min="0"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Frying Team</label>
            <input
              type="text"
              value={trayForm.fryingTeam}
              onChange={(e) => setTrayForm({ ...trayForm, fryingTeam: e.target.value })}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              placeholder="e.g., Suresh, Deepak"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Temperature (°C)</label>
              <input
                type="number"
                value={trayForm.fryTemperature}
                onChange={(e) => setTrayForm({ ...trayForm, fryTemperature: parseInt(e.target.value) })}
                className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                min="0"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Time (seconds)</label>
              <input
                type="number"
                value={trayForm.fryTime}
                onChange={(e) => setTrayForm({ ...trayForm, fryTime: parseInt(e.target.value) })}
                className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                min="0"
              />
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button
              onClick={handleStartFrying}
              className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700"
            >
              Start Frying
            </button>
            <button
              onClick={() => setShowTrayModal(false)}
              className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {/* Pack Modal */}
      <Modal isOpen={showPackModal} onClose={() => setShowPackModal(false)} title="Pack Fried Trays">
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Trays to Pack</label>
            <input
              type="number"
              value={packForm.traysPacked}
              onChange={(e) => setPackForm({ ...packForm, traysPacked: parseInt(e.target.value) })}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              min="0"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Cases</label>
              <input
                type="number"
                value={packForm.cases}
                onChange={(e) => setPackForm({ ...packForm, cases: parseInt(e.target.value) })}
                className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                min="0"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Loose Packets</label>
              <input
                type="number"
                value={packForm.loose}
                onChange={(e) => setPackForm({ ...packForm, loose: parseInt(e.target.value) })}
                className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                min="0"
              />
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button
              onClick={handlePack}
              className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700"
            >
              Pack
            </button>
            <button
              onClick={() => setShowPackModal(false)}
              className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
