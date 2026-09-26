import React, { useEffect, useMemo, useState } from 'react';
import { Plus, ChevronDown, ChevronRight } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { useToast } from '../components/Toast';
import { Modal } from '../components/Modal';
import { getButterBatchCode, getCreamBatchCode, getGheeBatchCode, getHalloumiBatchCode, milkStorageVessels } from '../data/mockData';

export default function MilkReceiving() {
  const { milkLots, creamLots, productionRounds, addMilkLot, updateMilkLot, addCreamLot } = useApp();
  const { showToast } = useToast();
  const newestLot = [...milkLots].sort((a, b) => {
    const aDate = new Date(`${a.receiptDate}T${a.receiptTime || '00:00'}`).getTime();
    const bDate = new Date(`${b.receiptDate}T${b.receiptTime || '00:00'}`).getTime();
    return bDate - aDate;
  })[0];
  const [selectedLot, setSelectedLot] = useState(newestLot?.id || '');
  const [expandedLots, setExpandedLots] = useState<Set<string>>(new Set());
  const [showNewLotModal, setShowNewLotModal] = useState(false);
  const [showEditLotModal, setShowEditLotModal] = useState(false);
  const [showMilkSaleModal, setShowMilkSaleModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showReceiveCreamModal, setShowReceiveCreamModal] = useState(false);
  const [editingLotId, setEditingLotId] = useState<string | null>(null);

  const orderedLots = useMemo(() => [...milkLots].sort((a, b) => {
    const aDate = new Date(`${a.receiptDate}T${a.receiptTime || '00:00'}`).getTime();
    const bDate = new Date(`${b.receiptDate}T${b.receiptTime || '00:00'}`).getTime();
    return bDate - aDate;
  }), [milkLots]);
  const quickLots = orderedLots.slice(0, 4);
  const olderLots = orderedLots.slice(4);
  const displayedLot = orderedLots.find((lot) => lot.id === selectedLot) || orderedLots[0];

  useEffect(() => {
    if (newestLot && !milkLots.some((lot) => lot.id === selectedLot)) {
      setSelectedLot(newestLot.id);
    }
  }, [milkLots, newestLot, selectedLot]);
  
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

  const [editLot, setEditLot] = useState({ ...newLot });
  const [milkSale, setMilkSale] = useState({
    quantity: 0,
    customer: '',
    saleDate: new Date().toISOString().split('T')[0],
  });
  const [creamReceipt, setCreamReceipt] = useState({
    quantity: 0,
    receivedFrom: '',
    receivingTemp: 0,
    receivingPh: 0,
    storageLocation: 'container' as 'container' | 'chiller' | 'coldroom',
    remarks: '',
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

  const getAllocations = (lot: typeof milkLots[number]) => {
    let receiptRemainder = Math.max(0, lot.litresReceived);
    const allocations = milkStorageVessels.map((vessel) => {
      const litres = vessel.capacity === null ? receiptRemainder : Math.min(vessel.capacity, receiptRemainder);
      receiptRemainder = Math.max(0, receiptRemainder - litres);
      return { ...vessel, litres };
    });

    // New rounds identify their source vessel. Use planned input until the
    // round has an actual input, then use the actual value.
    const sourceDraws = new Map<string, number>();
    productionRounds
      .filter((round) => round.milkLotId === lot.id && round.sourceVessel)
      .forEach((round) => {
        const draw = round.actualInput > 0 ? round.actualInput : round.plannedInput;
        sourceDraws.set(round.sourceVessel!, (sourceDraws.get(round.sourceVessel!) || 0) + Math.max(0, draw));
      });
    allocations.forEach((allocation) => {
      const draw = sourceDraws.get(allocation.id) || 0;
      allocation.litres = Math.max(0, allocation.litres - draw);
    });

    // Historical rounds do not have a vessel recorded. Reconcile that legacy
    // drawdown against the receiving fill order so the displayed quantities
    // still add up to the lot's current remaining figure.
    const knownDraw = [...sourceDraws.values()].reduce((sum, draw) => sum + draw, 0);
    let legacyDraw = Math.max(0, lot.litresReceived - lot.litresRemaining - knownDraw);
    allocations.forEach((allocation) => {
      if (legacyDraw <= 0) return;
      const draw = Math.min(allocation.litres, legacyDraw);
      allocation.litres -= draw;
      legacyDraw -= draw;
    });

    const displayedTotal = allocations.reduce((sum, allocation) => sum + allocation.litres, 0);
    const reconciliationDifference = Math.max(0, lot.litresRemaining - displayedTotal);
    const auxiliary = allocations.find((allocation) => allocation.id === 'auxiliary');
    if (auxiliary) auxiliary.litres += reconciliationDifference;
    return allocations.filter((allocation) => allocation.litres > 0 || sourceDraws.has(allocation.id));
  };

  const packedSkuSummary = useMemo(() => {
    if (!displayedLot) return [];
    const boardEntries = productionRounds
      .filter((round) => round.milkLotId === displayedLot.id)
      .flatMap((round) => round.packedSkus || []);
    const entries = boardEntries.length > 0 ? boardEntries : (displayedLot.packedSkus || []);
    const summary = new Map<string, { sku: string; cases: number; loose: number }>();
    entries.forEach((entry) => {
      const existing = summary.get(entry.sku) || { sku: entry.sku, cases: 0, loose: 0 };
      existing.cases += entry.cases || 0;
      existing.loose += entry.loose || 0;
      summary.set(entry.sku, existing);
    });
    return [...summary.values()];
  }, [displayedLot, productionRounds]);

  const totals = displayedLot ? {
    received: displayedLot.litresReceived,
    consumed: displayedLot.litresConsumed,
    sold: displayedLot.litresSold || 0,
    remaining: displayedLot.litresRemaining,
  } : { received: 0, consumed: 0, sold: 0, remaining: 0 };

  const openEditLot = (lot: typeof milkLots[number]) => {
    setEditingLotId(lot.id);
    setEditLot({
      lotCode: lot.lotCode,
      supplier: lot.supplier,
      litresReceived: lot.litresReceived,
      receiptDate: lot.receiptDate,
      receiptTime: lot.receiptTime || '',
      invoiceNo: lot.invoiceNo || '',
      deliveryNoteNo: lot.deliveryNoteNo || '',
    });
    setShowEditLotModal(true);
  };

  const handleUpdateLot = () => {
    const lot = milkLots.find((item) => item.id === editingLotId);
    if (!lot || !editLot.lotCode.trim() || editLot.litresReceived <= 0) {
      showToast('error', 'Enter a lot code and a valid received quantity');
      return;
    }
    const alreadyAccountedFor = lot.litresConsumed + (lot.litresSold || 0) + lot.litresRejected + lot.litresSpilled;
    if (editLot.litresReceived < alreadyAccountedFor) {
      showToast('error', `Received quantity cannot be below ${alreadyAccountedFor.toLocaleString()} L already accounted for`);
      return;
    }
    const delta = editLot.litresReceived - lot.litresReceived;
    updateMilkLot(lot.id, {
      lotCode: editLot.lotCode.trim(),
      supplier: editLot.supplier.trim(),
      litresReceived: editLot.litresReceived,
      litresRemaining: Math.max(0, lot.litresRemaining + delta),
      receiptDate: editLot.receiptDate,
      receiptTime: editLot.receiptTime || undefined,
      invoiceNo: editLot.invoiceNo.trim() || undefined,
      deliveryNoteNo: editLot.deliveryNoteNo.trim() || undefined,
    });
    showToast('success', `Milk lot ${editLot.lotCode.trim()} updated`);
    setShowEditLotModal(false);
  };

  const openMilkSale = (lot: typeof milkLots[number]) => {
    setSelectedLot(lot.id);
    setMilkSale({ quantity: 0, customer: '', saleDate: new Date().toISOString().split('T')[0] });
    setShowMilkSaleModal(true);
  };

  const handleMilkSale = () => {
    const lot = milkLots.find((item) => item.id === selectedLot);
    if (!lot || milkSale.quantity <= 0 || !milkSale.customer.trim() || !milkSale.saleDate) {
      showToast('error', 'Enter sale quantity, customer, and date');
      return;
    }
    if (milkSale.quantity > lot.litresRemaining) {
      showToast('error', `Only ${lot.litresRemaining.toLocaleString()} L is available in this lot`);
      return;
    }
    updateMilkLot(lot.id, {
      litresSold: (lot.litresSold || 0) + milkSale.quantity,
      litresRemaining: lot.litresRemaining - milkSale.quantity,
      milkSales: [...(lot.milkSales || []), {
        id: `ms-${Date.now()}`,
        milkLotId: lot.id,
        saleDate: milkSale.saleDate,
        customer: milkSale.customer.trim(),
        quantity: milkSale.quantity,
      }],
    });
    showToast('success', `${milkSale.quantity.toLocaleString()} L sold from lot ${lot.lotCode}`);
    setShowMilkSaleModal(false);
  };

  const openCloseLot = (lot: typeof milkLots[number]) => {
    setSelectedLot(lot.id);
    setShowCloseModal(true);
  };

  const handleCloseLot = () => {
    const lot = milkLots.find((item) => item.id === selectedLot);
    if (!lot) return;
    updateMilkLot(lot.id, {
      productionClosed: true,
      productionClosedAt: new Date().toISOString(),
      status: 'completed',
      isLatest: false,
    });
    showToast('success', `Production for lot ${lot.lotCode} is closed`);
    setShowCloseModal(false);
  };

  const handleReceiveCream = () => {
    if (creamReceipt.quantity <= 0 || !creamReceipt.receivedFrom.trim() || creamReceipt.receivingTemp === 0 || creamReceipt.receivingPh === 0) {
      showToast('error', 'Enter quantity, received from, temperature, and pH');
      return;
    }
    const today = new Date().toISOString();
    addCreamLot({
      lotCode: `CREAM-${today.slice(0, 10).replaceAll('-', '')}-${Date.now().toString().slice(-4)}`,
      dateReceived: today.slice(0, 10),
      receivedAt: today,
      quantity: creamReceipt.quantity,
      supplier: creamReceipt.receivedFrom.trim(),
      receivedFrom: creamReceipt.receivedFrom.trim(),
      receivingTemp: creamReceipt.receivingTemp,
      receivingPh: creamReceipt.receivingPh,
      storageLocation: creamReceipt.storageLocation,
      notes: creamReceipt.remarks.trim() || undefined,
      consumed: 0,
      remaining: creamReceipt.quantity,
    });
    showToast('success', `Received ${creamReceipt.quantity.toLocaleString()} kg cream`);
    setShowReceiveCreamModal(false);
    setCreamReceipt({ quantity: 0, receivedFrom: '', receivingTemp: 0, receivingPh: 0, storageLocation: 'container', remarks: '' });
  };

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
        <div className="flex flex-wrap gap-2 justify-end">
          <button
            onClick={() => setShowReceiveCreamModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-amber-600 text-white hover:bg-amber-700 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Receive cream
          </button>
          <button
            onClick={() => setShowNewLotModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Receive source lot
          </button>
        </div>
      </div>

      {/* Lot selector: four newest lots plus an older-lots dropdown */}
      <div>
        <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Select a lot to view details</h3>
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="grid grid-cols-2 sm:flex gap-2">
          {quickLots.map((lot) => (
            <button
              key={lot.id}
              onClick={() => { setSelectedLot(lot.id); setExpandedLots(current => new Set(current).add(lot.id)); }}
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
              onChange={(event) => { if (event.target.value) { setSelectedLot(event.target.value); setExpandedLots(current => new Set(current).add(event.target.value)); } }}
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

      {/* Recent Receipts Table - MAIN FOCUS */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
          <h2 className="text-lg font-semibold text-slate-900">Recent receipts</h2>
          <p className="text-xs text-slate-500 mt-1">
            Showing the selected lot only. Expand the row for production detail and sale history.
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
              {(displayedLot ? [displayedLot] : []).map((lot) => {
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
                          lot.productionClosed ? 'bg-indigo-100 text-indigo-800 border border-indigo-200' :
                          lot.status === 'active' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                          lot.status === 'completed' ? 'bg-slate-100 text-slate-700 border border-slate-200' :
                          'bg-red-100 text-red-800 border border-red-200'
                        }`}>
                          {lot.productionClosed ? 'Closed' : lot.status === 'active' ? 'Accepted' : lot.status === 'completed' ? 'Completed' : 'Rejected'}
                        </span>
                      </td>
                      <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => toggleExpand(lot.id)} className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 transition-colors">
                            {isExpanded ? '− Hide' : '+ Show'}
                          </button>
                          <button onClick={() => openEditLot(lot)} className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 transition-colors">
                            Edit
                          </button>
                          <button onClick={() => openMilkSale(lot)} disabled={lot.productionClosed} className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                            + Milk sale
                          </button>
                          <button onClick={() => openCloseLot(lot)} disabled={Boolean(lot.productionClosed)} className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
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
                                {packedSkuSummary.length > 0 ? (
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                      <thead>
                                        <tr className="border-b border-slate-200">
                                          <th className="px-2 py-2 text-left text-[10px] uppercase tracking-wider text-slate-500">SKU</th>
                                          <th className="px-2 py-2 text-right text-[10px] uppercase tracking-wider text-slate-500">Quantity in cases</th>
                                          <th className="px-2 py-2 text-right text-[10px] uppercase tracking-wider text-slate-500">Quantity in packets</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100">
                                        {packedSkuSummary.map((sku) => (
                                          <tr key={sku.sku}>
                                            <td className="px-2 py-3 font-mono font-semibold text-slate-900">{sku.sku}</td>
                                            <td className="px-2 py-3 text-right font-bold text-slate-900">{sku.cases.toLocaleString()}</td>
                                            <td className="px-2 py-3 text-right font-bold text-slate-900">{sku.loose.toLocaleString()}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                ) : (
                                  <p className="text-sm text-slate-400 text-center py-8">No SKUs packed yet</p>
                                )}
                              </div>
                            </div>

                            <div className="bg-white rounded-lg border-2 border-slate-200 p-5 shadow-sm">
                              <h3 className="text-sm font-bold text-slate-900 mb-3">Common product pools · {lot.lotCode}</h3>
                              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                                <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
                                  <p className="text-xs text-blue-700 font-semibold">Cream</p>
                                  <p className="font-mono font-bold text-slate-900">{lot.creamPool?.batchId || getCreamBatchCode(lot.lotCode)}</p>
                                  <p className="text-xs text-slate-600 mt-1">{(lot.creamPool?.availableBalance || 0).toFixed(2)} kg available</p>
                                </div>
                                <div className="rounded-lg border border-amber-100 bg-amber-50 p-3">
                                  <p className="text-xs text-amber-700 font-semibold">Butter</p>
                                  <p className="font-mono font-bold text-slate-900">{lot.butterPool?.batchId || getButterBatchCode(lot.lotCode)}</p>
                                  <p className="text-xs text-slate-600 mt-1">{(lot.butterPool?.availableBalance || 0).toFixed(2)} kg available</p>
                                </div>
                                <div className="rounded-lg border border-yellow-100 bg-yellow-50 p-3">
                                  <p className="text-xs text-yellow-700 font-semibold">Ghee</p>
                                  <p className="font-mono font-bold text-slate-900">{lot.gheePool?.batchId || getGheeBatchCode(lot.lotCode)}</p>
                                  <p className="text-xs text-slate-600 mt-1">{(lot.gheePool?.availableBalance || 0).toFixed(2)} kg available</p>
                                </div>
                                <div className="rounded-lg border border-cyan-100 bg-cyan-50 p-3">
                                  <p className="text-xs text-cyan-700 font-semibold">Halloumi</p>
                                  <p className="font-mono font-bold text-slate-900">{lot.halloumiPool?.batchId || getHalloumiBatchCode(lot.lotCode)}</p>
                                  <p className="text-xs text-slate-600 mt-1">{(lot.halloumiPool?.availableForCrumbing || 0).toFixed(2)} kg for crumbing</p>
                                </div>
                              </div>
                            </div>

                            {/* Operational detail retained from the previous page, shown once inside the expanded row. */}
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                              <div className="bg-white rounded-lg border-2 border-slate-200 p-5 shadow-sm">
                                <div className="flex items-center justify-between mb-3">
                                  <h3 className="text-sm font-bold text-slate-900">Lot consumption progress</h3>
                                  <span className="text-xs text-slate-500">{lot.litresReceived > 0 ? ((lot.litresConsumed / lot.litresReceived) * 100).toFixed(0) : 0}% utilized</span>
                                </div>
                                <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                                  <div className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full" style={{ width: `${lot.litresReceived > 0 ? Math.min(100, (lot.litresConsumed / lot.litresReceived) * 100) : 0}%` }} />
                                </div>
                                <div className="grid grid-cols-2 gap-3 mt-4 text-xs">
                                  <div><span className="text-slate-500">Rejected</span><div className="font-bold text-red-600">{lot.litresRejected.toLocaleString()} L</div></div>
                                  <div><span className="text-slate-500">Spilled</span><div className="font-bold text-amber-600">{lot.litresSpilled.toLocaleString()} L</div></div>
                                  <div><span className="text-slate-500">Received</span><div className="font-bold text-slate-900">{lot.litresReceived.toLocaleString()} L</div></div>
                                  <div><span className="text-slate-500">Unallocated</span><div className="font-bold text-emerald-600">{lot.litresRemaining.toLocaleString()} L</div></div>
                                </div>
                              </div>
                              <div className="bg-white rounded-lg border-2 border-slate-200 p-5 shadow-sm">
                                <h3 className="text-sm font-bold text-slate-900 mb-1">Vessel / location allocation</h3>
                                <p className="text-xs text-slate-500 mb-3">Bars show quantity against each vessel’s capacity. New rounds reduce the selected vessel; older rounds are reconciled as legacy drawdown.</p>
                                <div className="space-y-2">
                                  {getAllocations(lot).length > 0 ? getAllocations(lot).map((allocation) => {
                                    const fillPercent = allocation.capacity ? Math.min(100, (allocation.litres / allocation.capacity) * 100) : 100;
                                    return (
                                      <div key={allocation.id} className="flex items-center gap-2 text-xs">
                                        <span className="w-40 shrink-0 text-slate-600">{allocation.label}</span>
                                        <div className="flex-1 bg-slate-100 rounded-full h-3 overflow-hidden"><div className="h-full bg-blue-500 rounded-full" style={{ width: `${fillPercent}%` }} /></div>
                                        <span className="w-28 text-right font-semibold text-slate-800">{allocation.litres.toLocaleString()} L{allocation.capacity ? ` / ${allocation.capacity.toLocaleString()} L` : ''}</span>
                                      </div>
                                    );
                                  }) : <p className="text-xs text-slate-400">No remaining milk to allocate</p>}
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
                  Lot totals · {displayedLot?.lotCode || '—'}
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

      <Modal isOpen={showEditLotModal} onClose={() => setShowEditLotModal(false)} title="Edit original milk receipt">
        <div className="space-y-4">
          <p className="text-xs text-slate-500">This edits the original receipt fields. Recorded production, sales, rejected, and spilled quantities are preserved.</p>
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Lot Code</label>
            <input value={editLot.lotCode} onChange={(e) => setEditLot({ ...editLot, lotCode: e.target.value })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Receipt Date</label><input type="date" value={editLot.receiptDate} onChange={(e) => setEditLot({ ...editLot, receiptDate: e.target.value })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" /></div>
            <div><label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Receipt Time</label><input type="time" value={editLot.receiptTime} onChange={(e) => setEditLot({ ...editLot, receiptTime: e.target.value })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" /></div>
          </div>
          <div><label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Supplier</label><input value={editLot.supplier} onChange={(e) => setEditLot({ ...editLot, supplier: e.target.value })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" /></div>
          <div><label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Litres Received</label><input type="number" min="1" value={editLot.litresReceived} onChange={(e) => setEditLot({ ...editLot, litresReceived: Number(e.target.value) })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Invoice No</label><input value={editLot.invoiceNo} onChange={(e) => setEditLot({ ...editLot, invoiceNo: e.target.value })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" /></div>
            <div><label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Delivery Note No</label><input value={editLot.deliveryNoteNo} onChange={(e) => setEditLot({ ...editLot, deliveryNoteNo: e.target.value })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" /></div>
          </div>
          <div className="flex gap-2 pt-2"><button onClick={handleUpdateLot} className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium">Save changes</button><button onClick={() => setShowEditLotModal(false)} className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium">Cancel</button></div>
        </div>
      </Modal>

      <Modal isOpen={showMilkSaleModal} onClose={() => setShowMilkSaleModal(false)} title={`Log milk sale · ${displayedLot?.lotCode || ''}`}>
        <div className="space-y-4">
          <p className="text-xs text-slate-500">Only the selected lot’s remaining milk can be sold. Available: <strong>{displayedLot?.litresRemaining.toLocaleString() || 0} L</strong>.</p>
          <div><label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Quantity of milk (L)</label><input type="number" min="1" value={milkSale.quantity} onChange={(e) => setMilkSale({ ...milkSale, quantity: Number(e.target.value) })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" /></div>
          <div><label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Sold to customer</label><input value={milkSale.customer} onChange={(e) => setMilkSale({ ...milkSale, customer: e.target.value })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" placeholder="Customer name" /></div>
          <div><label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Date of sale</label><input type="date" value={milkSale.saleDate} onChange={(e) => setMilkSale({ ...milkSale, saleDate: e.target.value })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" /></div>
          <div className="flex gap-2 pt-2"><button onClick={handleMilkSale} className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium">Save milk sale</button><button onClick={() => setShowMilkSaleModal(false)} className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium">Cancel</button></div>
        </div>
      </Modal>

      <Modal isOpen={showCloseModal} onClose={() => setShowCloseModal(false)} title="Close milk-lot production">
        <div className="space-y-4">
          <p className="text-sm text-slate-700">Are you sure the production for this lot of milk is closed?</p>
          <p className="text-xs text-slate-500">Closing prevents new production shifts and rounds from being created for this lot. Existing records remain available.</p>
          <div className="flex gap-2 pt-2"><button onClick={handleCloseLot} className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium">Yes, close production</button><button onClick={() => setShowCloseModal(false)} className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium">Cancel</button></div>
        </div>
      </Modal>

      <Modal isOpen={showReceiveCreamModal} onClose={() => setShowReceiveCreamModal(false)} title="Receive purchased cream">
        <div className="space-y-4">
          <div><label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Quantity of cream (kg)</label><input type="number" min="0" step="0.01" value={creamReceipt.quantity} onChange={(e) => setCreamReceipt({ ...creamReceipt, quantity: Number(e.target.value) })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" /></div>
          <div><label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Received from</label><input value={creamReceipt.receivedFrom} onChange={(e) => setCreamReceipt({ ...creamReceipt, receivedFrom: e.target.value })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Receiving temp (°C)</label><input type="number" step="0.1" value={creamReceipt.receivingTemp} onChange={(e) => setCreamReceipt({ ...creamReceipt, receivingTemp: Number(e.target.value) })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" /></div>
            <div><label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Receiving pH</label><input type="number" step="0.01" value={creamReceipt.receivingPh} onChange={(e) => setCreamReceipt({ ...creamReceipt, receivingPh: Number(e.target.value) })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" /></div>
          </div>
          <div><label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Storage location</label><select value={creamReceipt.storageLocation} onChange={(e) => setCreamReceipt({ ...creamReceipt, storageLocation: e.target.value as typeof creamReceipt.storageLocation })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"><option value="container">Container</option><option value="chiller">Chiller</option><option value="coldroom">Coldroom</option></select></div>
          <div><label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Comments / remarks</label><textarea value={creamReceipt.remarks} onChange={(e) => setCreamReceipt({ ...creamReceipt, remarks: e.target.value })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" rows={3} /></div>
          <div className="flex gap-2 pt-2"><button onClick={handleReceiveCream} className="flex-1 px-4 py-2.5 bg-amber-600 text-white rounded-lg text-sm font-medium">Save cream receipt</button><button onClick={() => setShowReceiveCreamModal(false)} className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium">Cancel</button></div>
        </div>
      </Modal>

      {creamLots.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50"><h2 className="text-lg font-semibold text-slate-900">Purchased cream lots</h2><p className="text-xs text-slate-500 mt-1">Available for selection in the Butter production tab.</p></div>
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-slate-200"><th className="px-4 py-3 text-left text-xs uppercase tracking-wider">Lot</th><th className="px-4 py-3 text-left text-xs uppercase tracking-wider">Received from</th><th className="px-4 py-3 text-right text-xs uppercase tracking-wider">Quantity</th><th className="px-4 py-3 text-right text-xs uppercase tracking-wider">Temp / pH</th><th className="px-4 py-3 text-left text-xs uppercase tracking-wider">Storage</th><th className="px-4 py-3 text-right text-xs uppercase tracking-wider">Remaining</th></tr></thead><tbody className="divide-y divide-slate-100">{creamLots.map((cream) => <tr key={cream.id}><td className="px-4 py-3 font-mono font-semibold">{cream.lotCode}</td><td className="px-4 py-3">{cream.receivedFrom || cream.supplier}</td><td className="px-4 py-3 text-right">{cream.quantity.toLocaleString()} kg</td><td className="px-4 py-3 text-right">{cream.receivingTemp ?? '—'}°C / {cream.receivingPh ?? '—'}</td><td className="px-4 py-3 capitalize">{cream.storageLocation || '—'}</td><td className="px-4 py-3 text-right font-semibold text-emerald-700">{cream.remaining.toLocaleString()} kg</td></tr>)}</tbody></table></div>
        </div>
      )}
    </div>
  );
}
