import { useState } from 'react';
import {
  Milk,
  Plus,
  CheckCircle2,
  XCircle,
  Beaker,
  ArrowDownToLine,
  TrendingDown,
  Database,
} from 'lucide-react';
import { useApp } from '../store/AppContext';
import { useToast } from '../components/Toast';
import { Modal } from '../components/Modal';
import { milkLots as staticMilkLots } from '../data/mockData';

export default function MilkReceiving() {
  const { milkLots, addMilkLot, updateMilkLot } = useApp();
  const { showToast } = useToast();
  const [selectedLot, setSelectedLot] = useState(milkLots[0]?.id || '');
  const [showNewLotModal, setShowNewLotModal] = useState(false);
  
  const activeLot = milkLots.find((l) => l.id === selectedLot);

  // New lot form
  const [newLot, setNewLot] = useState({
    lotCode: '',
    supplier: 'Green Valley Dairy',
    litresReceived: 25000,
    receiptDate: new Date().toISOString().split('T')[0],
    receiptTime: new Date().toTimeString().slice(0, 5),
    invoiceNo: '',
    deliveryNoteNo: '',
  });

  const handleCreateLot = () => {
    if (!newLot.lotCode) {
      showToast('error', 'Please enter a lot code');
      return;
    }
    addMilkLot({
      lotCode: newLot.lotCode,
      receiptDate: newLot.receiptDate,
      receiptTime: newLot.receiptTime,
      supplier: newLot.supplier,
      invoiceNo: newLot.invoiceNo || undefined,
      deliveryNoteNo: newLot.deliveryNoteNo || undefined,
      litresReceived: newLot.litresReceived,
      litresConsumed: 0,
      litresRemaining: newLot.litresReceived,
      litresRejected: 0,
      litresSpilled: 0,
      litresSold: 0,
      status: 'active',
    });
    showToast('success', `Milk lot ${newLot.lotCode} created`);
    setShowNewLotModal(false);
    setNewLot({ 
      lotCode: '', 
      supplier: 'Green Valley Dairy', 
      litresReceived: 25000, 
      receiptDate: new Date().toISOString().split('T')[0],
      receiptTime: new Date().toTimeString().slice(0, 5),
      invoiceNo: '',
      deliveryNoteNo: '',
    });
  };

  // Vessel allocations
  const allocations = activeLot ? [
    { destination: 'Silo (10,000L)', litres: Math.min(8500, activeLot.litresRemaining) },
    { destination: 'BMC #1 (3,000L)', litres: Math.min(3000, Math.max(0, activeLot.litresRemaining - 8500)) },
    { destination: 'BMC #2 (3,000L)', litres: Math.min(3000, Math.max(0, activeLot.litresRemaining - 11500)) },
    { destination: 'Holding Tank (2,500L)', litres: Math.min(2500, Math.max(0, activeLot.litresRemaining - 14500)) },
    { destination: 'Direct to Production', litres: Math.min(2000, Math.max(0, activeLot.litresRemaining - 17000)) },
    { destination: 'IBC Storage', litres: Math.max(0, activeLot.litresRemaining - 19000) },
  ].filter(a => a.litres > 0) : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Milk Receiving & Source Lots</h2>
          <p className="text-sm text-slate-500 mt-0.5">Track milk intake, vessel allocation, and consumption</p>
        </div>
        <button 
          onClick={() => setShowNewLotModal(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Receipt
        </button>
      </div>

      {/* Lot selector - show only last 5 lots */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {milkLots.slice(0, 5).map((lot) => (
          <button
            key={lot.id}
            onClick={() => setSelectedLot(lot.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium whitespace-nowrap transition-colors ${
              selectedLot === lot.id ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {lot.status === 'active' && <span className="w-2 h-2 rounded-full bg-emerald-400" />}
            {lot.status === 'completed' && <span className="w-2 h-2 rounded-full bg-slate-400" />}
            Lot {lot.lotCode}
          </button>
        ))}
      </div>

      {activeLot && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-2 text-slate-500 mb-1">
                <ArrowDownToLine className="w-4 h-4" />
                <span className="text-xs font-medium uppercase tracking-wide">Received</span>
              </div>
              <p className="text-2xl font-bold text-slate-900">{activeLot.litresReceived.toLocaleString()}</p>
              <p className="text-xs text-slate-400">litres</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-2 text-slate-500 mb-1">
                <Beaker className="w-4 h-4" />
                <span className="text-xs font-medium uppercase tracking-wide">Consumed</span>
              </div>
              <p className="text-2xl font-bold text-blue-600">{activeLot.litresConsumed.toLocaleString()}</p>
              <p className="text-xs text-slate-400">litres</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-2 text-slate-500 mb-1">
                <Milk className="w-4 h-4" />
                <span className="text-xs font-medium uppercase tracking-wide">Remaining</span>
              </div>
              <p className="text-2xl font-bold text-emerald-600">{activeLot.litresRemaining.toLocaleString()}</p>
              <p className="text-xs text-slate-400">litres</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-2 text-slate-500 mb-1">
                <XCircle className="w-4 h-4" />
                <span className="text-xs font-medium uppercase tracking-wide">Rejected</span>
              </div>
              <p className="text-2xl font-bold text-red-600">{activeLot.litresRejected}</p>
              <p className="text-xs text-slate-400">litres</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-2 text-slate-500 mb-1">
                <TrendingDown className="w-4 h-4" />
                <span className="text-xs font-medium uppercase tracking-wide">Spilled</span>
              </div>
              <p className="text-2xl font-bold text-amber-600">{activeLot.litresSpilled}</p>
              <p className="text-xs text-slate-400">litres</p>
            </div>
          </div>

          {/* Lot Summary Table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200">
              <h3 className="text-sm font-semibold text-slate-900">Lot Summary</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-slate-100">
                  <tr className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-700 w-48">Receipt</td>
                    <td className="px-4 py-3 text-slate-900">
                      <span className="font-mono font-bold">Lot {activeLot.lotCode}</span>
                      <span className="text-slate-500 ml-3">
                        {activeLot.receiptDate} {activeLot.receiptTime && `at ${activeLot.receiptTime}`}
                      </span>
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-700">Origin / Invoice</td>
                    <td className="px-4 py-3 text-slate-900">
                      <div>{activeLot.supplier}</div>
                      {activeLot.invoiceNo && (
                        <div className="text-xs text-slate-500 mt-0.5">
                          Invoice: <span className="font-mono">{activeLot.invoiceNo}</span>
                          {activeLot.deliveryNoteNo && (
                            <span className="ml-3">Delivery Note: <span className="font-mono">{activeLot.deliveryNoteNo}</span></span>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-700">Quantity Received</td>
                    <td className="px-4 py-3 text-slate-900 font-bold">{activeLot.litresReceived.toLocaleString()} L</td>
                  </tr>
                  <tr className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-700">Milk Used in Production</td>
                    <td className="px-4 py-3 text-blue-600 font-bold">{activeLot.litresConsumed.toLocaleString()} L</td>
                  </tr>
                  <tr className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-700">Milk Sold</td>
                    <td className="px-4 py-3 text-emerald-600 font-bold">{(activeLot.litresSold || 0).toLocaleString()} L</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Progress bar */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-slate-900">Lot Consumption Progress</h3>
              <span className="text-xs text-slate-500">
                {((activeLot.litresConsumed / activeLot.litresReceived) * 100).toFixed(0)}% utilized
              </span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-4 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full transition-all"
                style={{ width: `${(activeLot.litresConsumed / activeLot.litresReceived) * 100}%` }}
              />
            </div>
            <div className="flex justify-between mt-2 text-xs text-slate-500">
              <span>Received: {activeLot.receiptDate} (Sunday)</span>
              <span>Supplier: {activeLot.supplier}</span>
              <span>Status: <span className={`font-medium ${activeLot.status === 'active' ? 'text-emerald-600' : 'text-slate-500'}`}>{activeLot.status}</span></span>
            </div>
          </div>

          {/* Vessel allocation */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2">
              <Database className="w-4 h-4 text-slate-500" />
              <h3 className="text-sm font-semibold text-slate-900">Vessel / Location Allocation</h3>
            </div>
            <div className="p-4 space-y-3">
              {allocations.length > 0 ? allocations.map((alloc) => (
                <div key={alloc.destination} className="flex items-center gap-3">
                  <span className="text-sm text-slate-700 w-44 shrink-0">{alloc.destination}</span>
                  <div className="flex-1 bg-slate-100 rounded-full h-3 relative overflow-hidden">
                    <div className="bg-blue-500 h-3 rounded-full" style={{ width: `${(alloc.litres / activeLot.litresReceived) * 100}%` }} />
                  </div>
                  <span className="text-sm font-medium text-slate-900 w-20 text-right">{alloc.litres.toLocaleString()}L</span>
                  <span className="text-xs text-slate-400 w-10 text-right">{((alloc.litres / activeLot.litresReceived) * 100).toFixed(0)}%</span>
                </div>
              )) : (
                <p className="text-sm text-slate-400 text-center py-4">No remaining milk to allocate</p>
              )}
            </div>
          </div>

          {/* Receipt history */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">Receipt History</h3>
              <span className="text-xs text-slate-500">{milkLots.length} lots</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left">
                    <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Lot Code</th>
                    <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Date</th>
                    <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Supplier</th>
                    <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Qty (L)</th>
                    <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Consumed</th>
                    <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Remaining</th>
                    <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {milkLots.map((lot) => (
                    <tr key={lot.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-mono font-bold text-slate-900">{lot.lotCode}</td>
                      <td className="px-4 py-2.5 text-slate-600">{lot.receiptDate}</td>
                      <td className="px-4 py-2.5 text-slate-600">{lot.supplier}</td>
                      <td className="px-4 py-2.5 text-slate-700 font-medium">{lot.litresReceived.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-blue-600">{lot.litresConsumed.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-emerald-600">{lot.litresRemaining.toLocaleString()}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                          lot.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                          lot.status === 'completed' ? 'bg-slate-100 text-slate-600' : 'bg-red-100 text-red-700'
                        }`}>
                          {lot.status === 'active' ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                          {lot.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* New Milk Lot Modal */}
      <Modal isOpen={showNewLotModal} onClose={() => setShowNewLotModal(false)} title="New Milk Receipt">
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Lot Code (date-based, e.g. 230626)</label>
            <input
              type="text"
              value={newLot.lotCode}
              onChange={(e) => setNewLot({ ...newLot, lotCode: e.target.value })}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              placeholder="e.g. 230626"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Receipt Date</label>
              <input
                type="date"
                value={newLot.receiptDate}
                onChange={(e) => setNewLot({ ...newLot, receiptDate: e.target.value })}
                className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Receipt Time</label>
              <input
                type="time"
                value={newLot.receiptTime}
                onChange={(e) => setNewLot({ ...newLot, receiptTime: e.target.value })}
                className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Supplier</label>
            <input
              type="text"
              value={newLot.supplier}
              onChange={(e) => setNewLot({ ...newLot, supplier: e.target.value })}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Invoice No (optional)</label>
              <input
                type="text"
                value={newLot.invoiceNo}
                onChange={(e) => setNewLot({ ...newLot, invoiceNo: e.target.value })}
                className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                placeholder="e.g. INV-2026-0423"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Delivery Note No (optional)</label>
              <input
                type="text"
                value={newLot.deliveryNoteNo}
                onChange={(e) => setNewLot({ ...newLot, deliveryNoteNo: e.target.value })}
                className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                placeholder="e.g. DN-2026-0891"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Litres Received</label>
            <input
              type="number"
              value={newLot.litresReceived}
              onChange={(e) => setNewLot({ ...newLot, litresReceived: parseInt(e.target.value) })}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              min="0"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={handleCreateLot} className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors">
              Create Milk Lot
            </button>
            <button onClick={() => setShowNewLotModal(false)} className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
