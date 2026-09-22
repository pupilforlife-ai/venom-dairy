import React, { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  ChevronDown,
  ChevronRight,
  Edit,
  Milk,
  ArrowDownToLine,
  Beaker,
  XCircle,
  TrendingDown,
  Database,
} from 'lucide-react';
import { useApp } from '../store/AppContext';
import { useToast } from '../components/Toast';
import { Modal } from '../components/Modal';

export default function MilkReceiving() {
  const { milkLots, addMilkLot } = useApp();
  const { showToast } = useToast();
  const newestLot = milkLots.find((lot) => lot.isLatest) ?? milkLots[0];
  const [selectedLot, setSelectedLot] = useState(newestLot?.id || '');
  const [expandedLots, setExpandedLots] = useState<Set<string>>(new Set());
  const [showNewLotModal, setShowNewLotModal] = useState(false);

  const orderedLots = useMemo(() => [...milkLots].sort((a, b) => {
    const aDate = new Date(`${a.receiptDate}T${a.receiptTime || '00:00'}`).getTime();
    const bDate = new Date(`${b.receiptDate}T${b.receiptTime || '00:00'}`).getTime();
    return bDate - aDate;
  }), [milkLots]);
  const quickLots = orderedLots.slice(0, 4);
  const olderLots = orderedLots.slice(4);

  useEffect(() => {
    if (newestLot && !milkLots.some((lot) => lot.id === selectedLot)) {
      setSelectedLot(newestLot.id);
    }
  }, [milkLots, newestLot, selectedLot]);
  
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
      isLatest: true,
      reconciliation: {
        paneerRecorded: 0,
        yieldLPerKg: 0,
        paneerYieldPer100L: 0,
        dRounds: 0,
        csRounds: 0,
        cream: 0,
        pan111: 0,
        paneerForSpp: 0,
      },
      packedSkus: [],
      milkSales: [],
    });
    showToast('success', `Milk lot ${newLot.lotCode} created`);
    setShowNewLotModal(false);
    setNewLot({ 
      lotCode: '', supplier: 'Green Valley Dairy', litresReceived: 25000, 
      receiptDate: new Date().toISOString().split('T')[0],
      receiptTime: new Date().toTimeString().slice(0, 5),
      invoiceNo: '', deliveryNoteNo: '',
    });
  };

  const toggleExpand = (lotId: string) => {
    const newExpanded = new Set(expandedLots);
    if (newExpanded.has(lotId)) {
      newExpanded.delete(lotId);
    } else {
      newExpanded.add(lotId);
    }
    setExpandedLots(newExpanded);
  };

  // Vessel allocations for selected lot
  const allocations = activeLot ? [
    { destination: 'Silo (10,000L)', litres: Math.min(8500, activeLot.litresRemaining) },
    { destination: 'BMC #1 (3,000L)', litres: Math.min(3000, Math.max(0, activeLot.litresRemaining - 8500)) },
    { destination: 'BMC #2 (3,000L)', litres: Math.min(3000, Math.max(0, activeLot.litresRemaining - 11500)) },
    { destination: 'Holding Tank (2,500L)', litres: Math.min(2500, Math.max(0, activeLot.litresRemaining - 14500)) },
    { destination: 'Direct to Production', litres: Math.min(2000, Math.max(0, activeLot.litresRemaining - 17000)) },
    { destination: 'IBC Storage', litres: Math.max(0, activeLot.litresRemaining - 19000) },
  ].filter(a => a.litres > 0) : [];

  // Calculate totals
  const totals = milkLots.reduce((acc, lot) => {
    acc.received += lot.litresReceived;
    acc.consumed += lot.litresConsumed;
    acc.sold += lot.litresSold || 0;
    acc.remaining += lot.litresRemaining;
    return acc;
  }, { received: 0, consumed: 0, sold: 0, remaining: 0 });

  // Format date
  const formatDate = (dateStr: string, timeStr?: string) => {
    const date = new Date(dateStr);
    const formatted = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    return timeStr ? `${formatted}, ${timeStr}` : formatted;
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Milk and cream lots</h1>
          <p className="text-sm text-slate-500 mt-1">Record each receipt as a traceable source lot.</p>
        </div>
        <button 
          onClick={() => setShowNewLotModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Receive source lot
        </button>
      </div>

      {/* Lot selector: four newest lots plus an older-lots dropdown */}
      <div>
        <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Select a lot to view details</h3>
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="grid grid-cols-2 sm:flex gap-2">
          {quickLots.map((lot) => (
            <button
              key={lot.id}
              onClick={() => setSelectedLot(lot.id)}
              className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium whitespace-nowrap transition-all ${
                selectedLot === lot.id 
                  ? 'bg-slate-900 text-white border-slate-900 shadow-md' 
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
              }`}
            >
              {lot.status === 'active' && <span className="w-2 h-2 rounded-full bg-emerald-400" />}
              {lot.status === 'completed' && <span className="w-2 h-2 rounded-full bg-slate-400" />}
              {lot.status === 'rejected' && <span className="w-2 h-2 rounded-full bg-red-400" />}
              <span>Lot {lot.lotCode}</span>
              {lot.isLatest && selectedLot !== lot.id && (
                <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[9px] font-bold uppercase rounded">Latest</span>
              )}
            </button>
          ))}
          </div>
          {olderLots.length > 0 && (
            <select
              value={olderLots.some((lot) => lot.id === selectedLot) ? selectedLot : ''}
              onChange={(event) => event.target.value && setSelectedLot(event.target.value)}
              className="w-full sm:w-auto min-w-48 px-3 py-3 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700"
              aria-label="Select an older milk lot"
            >
              <option value="">Older lots...</option>
              {olderLots.map((lot) => (
                <option key={lot.id} value={lot.id}>Lot {lot.lotCode}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Selected Lot Summary */}
      {activeLot && (
        <>
          {/* Lot Summary Table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2">
              <Milk className="w-4 h-4 text-slate-500" />
              <h3 className="text-sm font-semibold text-slate-900">Lot Summary — {activeLot.lotCode}</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-slate-100">
                  <tr className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-700 w-48">Receipt</td>
                    <td className="px-4 py-3 text-slate-900">
                      <span className="font-mono font-bold">Lot {activeLot.lotCode}</span>
                      <span className="text-slate-500 ml-3">
                        {formatDate(activeLot.receiptDate, activeLot.receiptTime)}
                      </span>
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-700">Origin / Invoice</td>
                    <td className="px-4 py-3 text-slate-900">
                      <div>{activeLot.supplier}</div>
                      {(activeLot.invoiceNo || activeLot.deliveryNoteNo) && (
                        <div className="text-xs text-slate-500 mt-0.5">
                          {activeLot.invoiceNo && <span>Invoice: <span className="font-mono">{activeLot.invoiceNo}</span></span>}
                          {activeLot.invoiceNo && activeLot.deliveryNoteNo && <span className="mx-2">•</span>}
                          {activeLot.deliveryNoteNo && <span>Delivery Note: <span className="font-mono">{activeLot.deliveryNoteNo}</span></span>}
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

          {/* Metric Tiles */}
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
              <span>Received: {formatDate(activeLot.receiptDate, activeLot.receiptTime)}</span>
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
        </>
      )}

      {/* Recent Receipts Table - MAIN FOCUS */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
          <h2 className="text-lg font-semibold text-slate-900">Recent receipts</h2>
          <p className="text-xs text-slate-500 mt-1">
            Accepted milk totals exclude rejected receipts. Expand a row for its production detail.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-white border-b-2 border-slate-300">
                <th className="px-4 py-3 text-left font-semibold text-slate-700 text-xs uppercase tracking-wider">Receipt</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700 text-xs uppercase tracking-wider">Origin / Invoice</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-700 text-xs uppercase tracking-wider">Received</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-700 text-xs uppercase tracking-wider">Milk Used in Production</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-700 text-xs uppercase tracking-wider">Milk Sold</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-700 text-xs uppercase tracking-wider">Milk Left / Unallocated</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-700 text-xs uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-700 text-xs uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {orderedLots.map((lot) => {
                const isExpanded = expandedLots.has(lot.id);
                const milkLeft = lot.litresRemaining;
                
                return (
                  <React.Fragment key={lot.id}>
                    {/* Main Row */}
                    <tr className="hover:bg-blue-50 transition-colors cursor-pointer" onClick={() => toggleExpand(lot.id)}>
                      <td className="px-4 py-4 border-l-4 border-transparent hover:border-blue-500">
                        <div className="flex items-start gap-2">
                          <div className="mt-1 text-slate-400">
                            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-slate-900 text-base">{lot.lotCode}</span>
                              {lot.isLatest && (
                                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-bold uppercase rounded-sm">
                                  Latest Milk
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-500 mt-1">
                              {formatDate(lot.receiptDate, lot.receiptTime)} - Milk
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="font-medium text-slate-900">{lot.supplier}</div>
                        {lot.invoiceNo && (
                          <div className="text-xs text-slate-500 mt-1 font-mono">{lot.invoiceNo}</div>
                        )}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <span className="font-semibold text-slate-900">{lot.litresReceived.toLocaleString()} L</span>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <span className="text-slate-700">{lot.litresConsumed.toLocaleString()} L</span>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <span className="text-slate-700">{(lot.litresSold || 0).toLocaleString()} L</span>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <span className={`font-bold text-base ${milkLeft > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                          {milkLeft.toLocaleString()} L
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                          lot.status === 'active' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                          lot.status === 'completed' ? 'bg-slate-100 text-slate-700 border border-slate-200' :
                          'bg-red-100 text-red-800 border border-red-200'
                        }`}>
                          {lot.status === 'active' ? 'Accepted' : lot.status === 'completed' ? 'Completed' : 'Rejected'}
                        </span>
                      </td>
                      <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          <button className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 transition-colors">
                            - Hide
                          </button>
                          <button className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 transition-colors">
                            Edit
                          </button>
                          <button className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 transition-colors">
                            + Milk sale
                          </button>
                          <button className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 transition-colors">
                            Close
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Expanded Detail View */}
                    {isExpanded && lot.reconciliation && (
                      <tr className="bg-slate-50">
                        <td colSpan={8} className="px-6 py-6">
                          <div className="space-y-6">
                            {/* Production Reconciliation - Two Side-by-Side Cards */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                              {/* Left Box: Production Reconciliation Metrics */}
                              <div className="bg-white rounded-lg border-2 border-slate-200 p-5 shadow-sm">
                                <h3 className="text-sm font-bold text-slate-900 mb-4 pb-2 border-b border-slate-200">
                                  Production reconciliation · {lot.lotCode}
                                </h3>
                                <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                                  <div className="border-l-4 border-blue-500 pl-3">
                                    <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">Paneer Recorded</p>
                                    <p className="text-xl font-bold text-slate-900 mt-1">
                                      {lot.reconciliation.paneerRecorded.toLocaleString()} kg
                                    </p>
                                  </div>
                                  <div className="border-l-4 border-blue-500 pl-3">
                                    <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">Yield (Milk/kg Paneer)</p>
                                    <p className="text-xl font-bold text-slate-900 mt-1">
                                      {lot.reconciliation.yieldLPerKg.toFixed(2)} L/kg
                                    </p>
                                  </div>
                                  <div className="border-l-4 border-blue-500 pl-3">
                                    <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">Paneer Yield per 100 L</p>
                                    <p className="text-xl font-bold text-slate-900 mt-1">
                                      {lot.reconciliation.paneerYieldPer100L.toFixed(2)} kg/100 L
                                    </p>
                                  </div>
                                  <div className="border-l-4 border-blue-500 pl-3">
                                    <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">D Rounds</p>
                                    <p className="text-xl font-bold text-slate-900 mt-1">
                                      {lot.reconciliation.dRounds}
                                    </p>
                                  </div>
                                  <div className="border-l-4 border-blue-500 pl-3">
                                    <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">C/S Rounds</p>
                                    <p className="text-xl font-bold text-slate-900 mt-1">
                                      {lot.reconciliation.csRounds}
                                    </p>
                                  </div>
                                  <div className="border-l-4 border-blue-500 pl-3">
                                    <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">Cream</p>
                                    <p className="text-xl font-bold text-slate-900 mt-1">
                                      {lot.reconciliation.cream.toFixed(2)} kg
                                    </p>
                                  </div>
                                  <div className="border-l-4 border-blue-500 pl-3">
                                    <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">PAN111</p>
                                    <p className="text-xl font-bold text-slate-900 mt-1">
                                      {lot.reconciliation.pan111.toFixed(2)} kg
                                    </p>
                                  </div>
                                  <div className="border-l-4 border-slate-300 pl-3">
                                    <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">Paneer for SPP</p>
                                    <p className="text-xl font-bold text-slate-400 mt-1">
                                      {lot.reconciliation.paneerForSpp.toFixed(2)} kg
                                    </p>
                                  </div>
                                </div>
                              </div>

                              {/* Right Box: Packed SKUs */}
                              <div className="bg-white rounded-lg border-2 border-slate-200 p-5 shadow-sm">
                                <h3 className="text-sm font-bold text-slate-900 mb-4 pb-2 border-b border-slate-200">
                                  SKU Packed on Board
                                </h3>
                                <div className="space-y-0">
                                  {lot.packedSkus && lot.packedSkus.length > 0 ? (
                                    lot.packedSkus.map((sku, idx) => (
                                      <div key={idx} className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0 hover:bg-slate-50 px-2 -mx-2 rounded transition-colors">
                                        <span className="font-mono text-sm font-semibold text-slate-900">{sku.sku}</span>
                                        <span className="text-sm font-bold text-slate-900 bg-slate-100 px-3 py-1 rounded">{sku.cases}</span>
                                      </div>
                                    ))
                                  ) : (
                                    <p className="text-sm text-slate-400 text-center py-8">No SKUs packed yet</p>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Footer Caption */}
                            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
                              <p className="text-xs text-blue-800 text-center">
                                <strong>Note:</strong> SKU figures are board-declared. Physical corrections remain in Packing verification because they may combine multiple milk receipts.
                              </p>
                            </div>

                            {/* Milk Sales Sub-Table */}
                            {lot.milkSales && lot.milkSales.length > 0 && (
                              <div className="bg-white rounded-lg border-2 border-slate-200 overflow-hidden shadow-sm">
                                <div className="px-4 py-3 border-b-2 border-slate-300 bg-slate-50">
                                  <h4 className="text-sm font-bold text-slate-900">Milk Sales</h4>
                                </div>
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="bg-white border-b border-slate-200">
                                      <th className="px-4 py-2 text-left font-semibold text-slate-700 text-xs uppercase tracking-wider">Milk Sale Date</th>
                                      <th className="px-4 py-2 text-left font-semibold text-slate-700 text-xs uppercase tracking-wider">Customer</th>
                                      <th className="px-4 py-2 text-right font-semibold text-slate-700 text-xs uppercase tracking-wider">Quantity</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {lot.milkSales.map((sale) => (
                                      <tr key={sale.id} className="hover:bg-slate-50">
                                        <td className="px-4 py-3 text-slate-700">{formatDate(sale.saleDate)}</td>
                                        <td className="px-4 py-3 text-slate-900 font-medium">{sale.customer}</td>
                                        <td className="px-4 py-3 text-right text-slate-700 font-semibold">{sale.quantity.toLocaleString()} L</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>

            {/* Footer Summary Row */}
            <tfoot>
              <tr className="bg-slate-100 border-t-4 border-slate-400">
                <td className="px-4 py-4 font-bold text-slate-900 text-base" colSpan={2}>
                  Accepted milk totals
                </td>
                <td className="px-4 py-4 text-right">
                  <span className="font-bold text-slate-900 text-base">{totals.received.toLocaleString()} L</span>
                </td>
                <td className="px-4 py-4 text-right">
                  <span className="font-bold text-slate-700 text-base">{totals.consumed.toLocaleString()} L</span>
                </td>
                <td className="px-4 py-4 text-right">
                  <span className="font-bold text-slate-700 text-base">{totals.sold.toLocaleString()} L</span>
                </td>
                <td className="px-4 py-4 text-right">
                  <span className={`font-bold text-lg ${totals.remaining > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                    {totals.remaining.toLocaleString()} L
                  </span>
                </td>
                <td className="px-4 py-4" colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* New Milk Lot Modal */}
      <Modal isOpen={showNewLotModal} onClose={() => setShowNewLotModal(false)} title="Receive Source Lot">
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
