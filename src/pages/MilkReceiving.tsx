import React, { useEffect, useMemo, useState } from 'react';
import { Plus, ChevronDown, ChevronRight, Download } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { useToast } from '../components/Toast';
import { Modal } from '../components/Modal';
import { getButterBatchCode, getCreamBatchCode, getGheeBatchCode, getHalloumiBatchCode, getMilkLotAccounting, getMilkLotProductionReconciliation, milkStorageVessels } from '../data/mockData';
import { buildMilkLotPackedSummary } from '../lib/milkLotPackedSummary';
import { MilkLotPackedSummary } from '../components/MilkLotPackedSummary';
import { useSupabaseState } from '../hooks/useSupabaseState';
import type { CrumbingBatch } from './CrumbingTab';
import { dailyCipChecklist, dailyCipSteps, weeklyAcidCipChecklist, weeklyAcidCipSteps } from '../data/cip';
import { exportMilkReceivingWorkbook } from '../lib/operationalExports';
import { getMilkLotVesselBalances, getMilkSaleSourceAvailability, getMilkSaleVesselSource, planMilkSaleAllocations } from '../lib/milkVesselAllocation';
import { createExternalCreamLotCode } from '../lib/creamLotCode';
import { parseAdditiveQuantity } from '../lib/additiveQuantity';

export default function MilkReceiving() {
  const { milkLots, creamLots, productionRounds, cipRecords, addMilkLot, updateMilkLot, addCreamLot, addCipRecord } = useApp();
  const { showToast } = useToast();
  // Read-only subscription: this page never writes crumbing records.
  const [crumbingBatches, , crumbingLoaded] = useSupabaseState<CrumbingBatch[]>('vejoy_crumbingBatches', []);
  const isExportOwner = typeof window !== 'undefined'
    && window.localStorage.getItem('vejoy_user_role')?.toLowerCase() === 'owner';
  const currentRole = typeof window === 'undefined' ? '' : window.localStorage.getItem('vejoy_user_role')?.toLowerCase() || '';
  const canEditLotCode = currentRole === 'owner' || currentRole === 'admin';
  const newestLot = [...milkLots].sort((a, b) => {
    const aDate = new Date(`${a.receiptDate}T${a.receiptTime || '00:00'}`).getTime();
    const bDate = new Date(`${b.receiptDate}T${b.receiptTime || '00:00'}`).getTime();
    return bDate - aDate;
  })[0];
  const [selectedLot, setSelectedLot] = useState(newestLot?.id || '');
  const [expandedLots, setExpandedLots] = useState<Set<string>>(() => newestLot?.id ? new Set([newestLot.id]) : new Set());
  const [showNewLotModal, setShowNewLotModal] = useState(false);
  const [showEditLotModal, setShowEditLotModal] = useState(false);
  const [showMilkSaleModal, setShowMilkSaleModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showReceiveCreamModal, setShowReceiveCreamModal] = useState(false);
  const [editingLotId, setEditingLotId] = useState<string | null>(null);
  const [weeklyCipRecordedBy, setWeeklyCipRecordedBy] = useState(() => typeof window === 'undefined' ? '' : window.localStorage.getItem('vejoy_user_username') || '');
  const [weeklyCipNotes, setWeeklyCipNotes] = useState('');
  const [weeklyCipSupervisorName, setWeeklyCipSupervisorName] = useState('');
  const [weeklyCipSupervisorConfirmed, setWeeklyCipSupervisorConfirmed] = useState(false);
  const [weeklyCipCompletedSteps, setWeeklyCipCompletedSteps] = useState<string[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [editLotChangeReason, setEditLotChangeReason] = useState('');

  const orderedLots = useMemo(() => [...milkLots].sort((a, b) => {
    const aDate = new Date(`${a.receiptDate}T${a.receiptTime || '00:00'}`).getTime();
    const bDate = new Date(`${b.receiptDate}T${b.receiptTime || '00:00'}`).getTime();
    return bDate - aDate;
  }), [milkLots]);
  const quickLots = orderedLots.slice(0, 4);
  const olderLots = orderedLots.slice(4);
  const displayedLot = orderedLots.find((lot) => lot.id === selectedLot) || orderedLots[0];
  const closeModalLot = milkLots.find((lot) => lot.id === selectedLot);

  useEffect(() => {
    if (newestLot && !milkLots.some((lot) => lot.id === selectedLot)) {
      setSelectedLot(newestLot.id);
    }
    if (newestLot) {
      setExpandedLots((current) => current.has(newestLot.id) ? current : new Set(current).add(newestLot.id));
    }
  }, [milkLots, newestLot, selectedLot]);
  
  // New lot form
  const [newLot, setNewLot] = useState({
    lotCode: '',
    supplier: 'Green Valley Dairy',
    litresReceived: 25000,
    receiptStatus: 'received' as 'planned' | 'received',
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
    sourceVessel: 'auto',
  });
  const [creamReceipt, setCreamReceipt] = useState({
    quantity: '',
    receivedFrom: '',
    receivingTemp: 0,
    receivingPh: 0,
    storageLocation: 'container' as 'container' | 'chiller' | 'coldroom',
    remarks: '',
  });
  const creamReceiptQuantity = parseAdditiveQuantity(creamReceipt.quantity);

  const handleCreateLot = () => {
    if (!newLot.lotCode) {
      showToast('error', 'Please enter a lot code');
      return;
    }
    if (newLot.receiptStatus === 'received' && newLot.litresReceived <= 0) {
      showToast('error', 'Enter the received milk volume, or choose Planned / receipt pending');
      return;
    }
    const isPlanned = newLot.receiptStatus === 'planned';
    const createdAt = new Date().toISOString();
    addMilkLot({
      lotCode: newLot.lotCode,
      receiptDate: newLot.receiptDate,
      receiptTime: newLot.receiptTime,
      receiptStatus: newLot.receiptStatus,
      receivedAt: isPlanned ? undefined : createdAt,
      supplier: newLot.supplier,
      invoiceNo: newLot.invoiceNo || undefined,
      deliveryNoteNo: newLot.deliveryNoteNo || undefined,
      litresReceived: isPlanned ? 0 : newLot.litresReceived,
      litresConsumed: 0,
      litresRemaining: isPlanned ? 0 : newLot.litresReceived,
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
      receiptStatus: 'received',
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

  const packedSkuSummary = useMemo(() => {
    return displayedLot ? buildMilkLotPackedSummary(displayedLot, productionRounds, crumbingBatches) : null;
  }, [displayedLot, productionRounds, crumbingBatches]);

  const totals = displayedLot ? {
    received: displayedLot.litresReceived,
    ...getMilkLotAccounting(displayedLot, productionRounds),
  } : { received: 0, consumed: 0, sold: 0, remaining: 0 };
  const displayedSaleSource = getMilkSaleVesselSource(milkSale.quantity);
  const displayedSaleAvailability = displayedLot
    ? getMilkSaleSourceAvailability(displayedLot, productionRounds)
    : { ibc: 0, auxiliary: 0, vessels: [] };
  const displayedSalePlan = planMilkSaleAllocations(
    milkSale.quantity,
    displayedSaleAvailability.vessels,
    displayedSaleSource,
    milkSale.sourceVessel,
  );

  const milkVesselLabel = (vesselId: string) => {
    if (vesselId === 'ibc') return 'IBC stock';
    if (vesselId === 'multiple') return 'Multiple vessels';
    if (vesselId === 'auxiliary') return 'Auxiliary storage';
    return milkStorageVessels.find(vessel => vessel.id === vesselId)?.label || 'Legacy / unassigned';
  };

  const handleExport = async () => {
    if (!isExportOwner) {
      showToast('error', 'Only the owner can export operational records');
      return;
    }
    if (!displayedLot || isExporting) return;
    setIsExporting(true);
    try {
      await exportMilkReceivingWorkbook(displayedLot, productionRounds);
      showToast('success', `Milk receiving record for lot ${displayedLot.lotCode} exported to Excel`);
    } catch (error) {
      console.error('Milk Receiving Excel export failed:', error);
      showToast('error', 'Could not create the Milk Receiving Excel file');
    } finally {
      setIsExporting(false);
    }
  };

  const openEditLot = (lot: typeof milkLots[number]) => {
    setEditingLotId(lot.id);
    setEditLot({
      lotCode: lot.lotCode,
      supplier: lot.supplier,
      litresReceived: lot.litresReceived,
      receiptStatus: lot.receiptStatus || 'received',
      receiptDate: lot.receiptDate,
      receiptTime: lot.receiptTime || '',
      invoiceNo: lot.invoiceNo || '',
      deliveryNoteNo: lot.deliveryNoteNo || '',
    });
    setEditLotChangeReason('');
    setShowEditLotModal(true);
  };

  const handleUpdateLot = () => {
    const lot = milkLots.find((item) => item.id === editingLotId);
    if (!lot || !editLot.lotCode.trim()) {
      showToast('error', 'Enter a lot code');
      return;
    }
    const lotCodeChanged = editLot.lotCode.trim() !== lot.lotCode;
    if (lotCodeChanged && !canEditLotCode) {
      showToast('error', 'Only an owner or admin can change the milk lot code');
      return;
    }
    if (lotCodeChanged && editLotChangeReason.trim().length < 5) {
      showToast('error', 'Enter a reason of at least 5 characters for the lot-code correction');
      return;
    }
    if (editLot.receiptStatus === 'received' && editLot.litresReceived <= 0) {
      showToast('error', 'Enter the received milk volume before marking this lot received');
      return;
    }
    const accounting = getMilkLotAccounting(lot, productionRounds);
    const alreadyAccountedFor = accounting.consumed + accounting.sold + lot.litresRejected + lot.litresSpilled;
    if (editLot.receiptStatus === 'planned' && lot.receiptStatus !== 'planned' && alreadyAccountedFor > 0) {
      showToast('error', 'A received lot with recorded activity cannot be moved back to Planned');
      return;
    }
    if (editLot.receiptStatus === 'received' && editLot.litresReceived < alreadyAccountedFor) {
      showToast('error', `Received quantity cannot be below ${alreadyAccountedFor.toLocaleString()} L already accounted for`);
      return;
    }
    const delta = editLot.litresReceived - lot.litresReceived;
    updateMilkLot(lot.id, {
      lotCode: editLot.lotCode.trim(),
      supplier: editLot.supplier.trim(),
      litresReceived: editLot.receiptStatus === 'planned' ? 0 : editLot.litresReceived,
      litresRemaining: editLot.receiptStatus === 'planned' ? 0 : Math.max(0, accounting.rawRemaining + delta),
      receiptStatus: editLot.receiptStatus,
      receivedAt: editLot.receiptStatus === 'received' ? lot.receivedAt || new Date().toISOString() : undefined,
      receiptDate: editLot.receiptDate,
      receiptTime: editLot.receiptTime || undefined,
      invoiceNo: editLot.invoiceNo.trim() || undefined,
      deliveryNoteNo: editLot.deliveryNoteNo.trim() || undefined,
      lotCodeHistory: lotCodeChanged
        ? [...(lot.lotCodeHistory || []), {
          previousLotCode: lot.lotCode,
          newLotCode: editLot.lotCode.trim(),
          changedAt: new Date().toISOString(),
          changedBy: typeof window === 'undefined' ? 'owner/admin' : window.localStorage.getItem('vejoy_user_username') || currentRole,
          reason: editLotChangeReason.trim(),
        }]
        : lot.lotCodeHistory,
    });
    showToast('success', `Milk lot ${editLot.lotCode.trim()} updated`);
    setShowEditLotModal(false);
  };

  const openMilkSale = (lot: typeof milkLots[number]) => {
    setSelectedLot(lot.id);
    setMilkSale({ quantity: 0, customer: '', saleDate: new Date().toISOString().split('T')[0], sourceVessel: 'auto' });
    setShowMilkSaleModal(true);
  };

  const handleMilkSale = () => {
    const lot = milkLots.find((item) => item.id === selectedLot);
    if (!lot || milkSale.quantity <= 0 || !milkSale.customer.trim() || !milkSale.saleDate) {
      showToast('error', 'Enter sale quantity, customer, and date');
      return;
    }
    const available = getMilkLotAccounting(lot, productionRounds).remaining;
    if (milkSale.quantity > available) {
      showToast('error', `Only ${available.toLocaleString()} L is available in this lot`);
      return;
    }
    const sourceAvailability = getMilkSaleSourceAvailability(lot, productionRounds);
    const sourcePlan = planMilkSaleAllocations(
      milkSale.quantity,
      sourceAvailability.vessels,
      getMilkSaleVesselSource(milkSale.quantity),
      milkSale.sourceVessel,
    );
    if (sourcePlan.shortfall > 0.01) {
      const sourceAvailable = sourceAvailability.vessels.find(vessel => vessel.id === milkSale.sourceVessel)?.litres || 0;
      const requestedSource = milkSale.sourceVessel === 'auto' ? 'all available vessels' : milkVesselLabel(milkSale.sourceVessel);
      showToast('error', `Only ${sourceAvailable.toLocaleString()} L is available in ${requestedSource}; ${sourcePlan.shortfall.toLocaleString()} L is still needed`);
      return;
    }
    const firstSource = sourcePlan.allocations[0]?.vesselId;
    const sourceVessel = sourcePlan.allocations.length > 1 ? 'multiple' : firstSource || 'unassigned';
    updateMilkLot(lot.id, {
      litresConsumed: getMilkLotAccounting(lot, productionRounds).consumed,
      litresSold: (lot.litresSold || 0) + milkSale.quantity,
      litresRemaining: available - milkSale.quantity,
      milkSales: [...(lot.milkSales || []), {
        id: `ms-${Date.now()}`,
        milkLotId: lot.id,
        saleDate: milkSale.saleDate,
        customer: milkSale.customer.trim(),
        quantity: milkSale.quantity,
        sourceVessel,
        sourceAllocations: sourcePlan.allocations,
      }],
    });
    const sourceSummary = sourcePlan.allocations.map(allocation => `${allocation.quantity.toLocaleString()} L ${milkVesselLabel(allocation.vesselId)}`).join(' + ');
    showToast('success', `${milkSale.quantity.toLocaleString()} L sale recorded from ${sourceSummary}`);
    setShowMilkSaleModal(false);
  };

  const openCloseLot = (lot: typeof milkLots[number]) => {
    setSelectedLot(lot.id);
    setWeeklyCipCompletedSteps([]);
    setWeeklyCipSupervisorName('');
    setWeeklyCipSupervisorConfirmed(false);
    setWeeklyCipNotes('');
    setShowCloseModal(true);
  };

  const handleCloseLot = () => {
    const lot = milkLots.find((item) => item.id === selectedLot);
    if (!lot) return;
    const weeklyCipAlreadyRecorded = cipRecords.some(record =>
      record.frequency === 'weekly' && record.milkLotId === lot.id
    );
    if (!weeklyCipAlreadyRecorded) {
      if (!weeklyCipRecordedBy.trim()) {
        showToast('error', 'Enter the person who verified the weekly CIP');
        return;
      }
      const requiredWeeklySteps = [...dailyCipChecklist, ...weeklyAcidCipChecklist];
      const missingStep = requiredWeeklySteps.find(step => !weeklyCipCompletedSteps.includes(step.id));
      if (missingStep) {
        showToast('error', `Complete the weekly CIP checklist: ${missingStep.label}`);
        return;
      }
      if (!weeklyCipSupervisorName.trim() || !weeklyCipSupervisorConfirmed) {
        showToast('error', 'Supervisor sign-off is required before closing milk production');
        return;
      }
      addCipRecord({
        frequency: 'weekly',
        cycle: 'weekly_full',
        status: 'completed',
        milkLotId: lot.id,
        milkLotCode: lot.lotCode,
        performedAt: new Date().toISOString(),
        recordedBy: weeklyCipRecordedBy.trim(),
        completedSteps: weeklyCipCompletedSteps,
        waterVolumeLitres: 200,
        waterTemperatureC: 80,
        chemicalName: 'SH8000',
        chemicalVolumeLitres: 5,
        circulationMinutes: 45,
        acidWaterTemperatureC: 65,
        acidChemicalName: 'Scale Bright',
        acidChemicalVolumeLitres: 2,
        acidCirculationMinutes: 45,
        acidExtensionMinutes: weeklyCipCompletedSteps.includes('weekly-acid-extra-10-minutes') ? 10 : 0,
        supervisorName: weeklyCipSupervisorName.trim(),
        supervisorSignedOffAt: new Date().toISOString(),
        notes: weeklyCipNotes.trim() || undefined,
      });
    }
    updateMilkLot(lot.id, {
      productionClosed: true,
      productionClosedAt: new Date().toISOString(),
      status: 'completed',
      isLatest: false,
    });
    showToast('success', `Production for lot ${lot.lotCode} is closed`);
    setShowCloseModal(false);
    setWeeklyCipNotes('');
    setWeeklyCipSupervisorName('');
    setWeeklyCipSupervisorConfirmed(false);
    setWeeklyCipCompletedSteps([]);
  };

  const handleReceiveCream = () => {
    if (creamReceiptQuantity === null || creamReceiptQuantity <= 0 || !creamReceipt.receivedFrom.trim() || creamReceipt.receivingTemp === 0 || creamReceipt.receivingPh === 0) {
      showToast('error', 'Enter quantity, received from, temperature, and pH');
      return;
    }
    const receivedAtDate = new Date();
    const today = receivedAtDate.toISOString();
    const dateReceived = `${receivedAtDate.getFullYear()}-${String(receivedAtDate.getMonth() + 1).padStart(2, '0')}-${String(receivedAtDate.getDate()).padStart(2, '0')}`;
    const existingCreamLotCodes = [
      ...creamLots.map(cream => cream.lotCode),
      ...milkLots.flatMap(lot => (lot.creamLots || []).map(cream => cream.lotCode)),
    ];
    const lotCode = createExternalCreamLotCode(creamReceipt.receivedFrom, dateReceived, existingCreamLotCodes);
    addCreamLot({
      lotCode,
      dateReceived,
      receivedAt: today,
      quantity: creamReceiptQuantity,
      supplier: creamReceipt.receivedFrom.trim(),
      receivedFrom: creamReceipt.receivedFrom.trim(),
      receivingTemp: creamReceipt.receivingTemp,
      receivingPh: creamReceipt.receivingPh,
      storageLocation: creamReceipt.storageLocation,
      notes: creamReceipt.remarks.trim() || undefined,
      consumed: 0,
      remaining: creamReceiptQuantity,
    });
    showToast('success', `Received ${creamReceiptQuantity.toLocaleString()} kg cream · lot ${lotCode}`);
    setShowReceiveCreamModal(false);
    setCreamReceipt({ quantity: '', receivedFrom: '', receivingTemp: 0, receivingPh: 0, storageLocation: 'container', remarks: '' });
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
          {isExportOwner && (
            <button
              type="button"
              onClick={handleExport}
              disabled={!displayedLot || isExporting}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-50 transition-colors shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              {isExporting ? 'Exporting…' : 'Export Excel'}
            </button>
          )}
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
                const lotAccounting = getMilkLotAccounting(lot, productionRounds);
                const lotReconciliation = getMilkLotProductionReconciliation(lot, productionRounds);
                const receiptPending = lot.receiptStatus === 'planned';
                const vesselAllocation = receiptPending
                  ? { vessels: [], ruleShortfallLitres: 0 }
                  : getMilkLotVesselBalances(lot, productionRounds);
                const milkLeft = lotAccounting.remaining;
                
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
                              {lot.receiptStatus === 'planned' ? 'Planned for' : 'Received'} {formatDate(lot.receiptDate, lot.receiptTime)} - Milk
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
                        <span className="font-semibold text-slate-900">{lot.receiptStatus === 'planned' ? 'Pending receipt' : `${lot.litresReceived.toLocaleString()} L`}</span>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <span className="text-slate-700">{lotAccounting.consumed.toLocaleString()} L</span>
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
                          {lot.productionClosed ? 'Closed' : lot.receiptStatus === 'planned' ? 'Planned · receipt pending' : lot.status === 'active' ? 'Accepted' : lot.status === 'completed' ? 'Completed' : 'Rejected'}
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
                          <button onClick={() => openMilkSale(lot)} disabled={lot.productionClosed || lot.receiptStatus === 'planned'} className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                            + Milk sale
                          </button>
                          <button onClick={() => openCloseLot(lot)} disabled={Boolean(lot.productionClosed) || lot.receiptStatus === 'planned'} className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                            Close
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Expanded Detail View */}
                    {isExpanded && (
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
                                <p className="mb-4 text-xs text-slate-500">Calculated from recorded production rounds. Milk input uses actual input when present, otherwise the started round’s planned input.</p>
                                <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                                  <div className="border-l-4 border-blue-500 pl-3">
                                    <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">Paneer Recorded</p>
                                    <p className="text-xl font-bold text-slate-900 mt-1">
                                      {lotReconciliation.paneerRecorded.toLocaleString(undefined, { maximumFractionDigits: 2 })} kg
                                    </p>
                                  </div>
                                  <div className="border-l-4 border-blue-500 pl-3">
                                    <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">Yield (Milk/kg Paneer)</p>
                                    <p className="text-xl font-bold text-slate-900 mt-1">
                                      {lotReconciliation.yieldLPerKg.toFixed(2)} L/kg
                                    </p>
                                  </div>
                                  <div className="border-l-4 border-blue-500 pl-3">
                                    <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">Paneer Yield per 100 L</p>
                                    <p className="text-xl font-bold text-slate-900 mt-1">
                                      {lotReconciliation.paneerYieldPer100L.toFixed(2)} kg/100 L
                                    </p>
                                  </div>
                                  <div className="border-l-4 border-blue-500 pl-3">
                                    <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">D Rounds</p>
                                    <p className="text-xl font-bold text-slate-900 mt-1">
                                      {lotReconciliation.dRounds}
                                    </p>
                                  </div>
                                  <div className="border-l-4 border-blue-500 pl-3">
                                    <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">C/S Rounds</p>
                                    <p className="text-xl font-bold text-slate-900 mt-1">
                                      {lotReconciliation.csRounds}
                                    </p>
                                  </div>
                                  <div className="border-l-4 border-blue-500 pl-3">
                                    <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">Cream</p>
                                    <p className="text-xl font-bold text-slate-900 mt-1">
                                      {lotReconciliation.cream.toFixed(2)} kg
                                    </p>
                                  </div>
                                  <div className="border-l-4 border-blue-500 pl-3">
                                    <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">PAN111</p>
                                    <p className="text-xl font-bold text-slate-900 mt-1">
                                      {lotReconciliation.pan111.toFixed(2)} kg
                                    </p>
                                  </div>
                                  <div className="border-l-4 border-slate-300 pl-3">
                                    <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">Paneer for SPP</p>
                                    <p className="text-xl font-bold text-slate-400 mt-1">
                                      {lotReconciliation.paneerForSpp.toFixed(2)} kg
                                    </p>
                                  </div>
                                </div>
                              </div>

                              {/* Right Box: Packed SKUs */}
                              <div className="bg-white rounded-lg border-2 border-slate-200 p-5 shadow-sm">
                                <h3 className="text-sm font-bold text-slate-900 mb-4 pb-2 border-b border-slate-200">
                                  SKU Packed on Board
                                </h3>
                                {packedSkuSummary && <MilkLotPackedSummary summary={packedSkuSummary} loading={!crumbingLoaded} />}
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
                                  <p className="text-xs text-slate-600 mt-1">{(lot.halloumiPool?.availableForCrumbing || 0).toFixed(2)} kg available for sale / HCP</p>
                                </div>
                              </div>
                            </div>

                            {/* Operational detail retained from the previous page, shown once inside the expanded row. */}
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                              <div className="bg-white rounded-lg border-2 border-slate-200 p-5 shadow-sm">
                                <div className="flex items-center justify-between mb-3">
                                  <h3 className="text-sm font-bold text-slate-900">Lot consumption progress</h3>
                                  <span className="text-xs text-slate-500">{receiptPending ? 'Pending receipt volume' : `${lot.litresReceived > 0 ? ((lotAccounting.consumed / lot.litresReceived) * 100).toFixed(0) : 0}% utilized`}</span>
                                </div>
                                <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                                  <div className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full" style={{ width: `${lot.litresReceived > 0 ? Math.min(100, (lotAccounting.consumed / lot.litresReceived) * 100) : 0}%` }} />
                                </div>
                                <div className="grid grid-cols-2 gap-3 mt-4 text-xs">
                                  <div><span className="text-slate-500">Rejected</span><div className="font-bold text-red-600">{lot.litresRejected.toLocaleString()} L</div></div>
                                  <div><span className="text-slate-500">Spilled</span><div className="font-bold text-amber-600">{lot.litresSpilled.toLocaleString()} L</div></div>
                                  <div><span className="text-slate-500">Received</span><div className="font-bold text-slate-900">{receiptPending ? 'Pending' : `${lot.litresReceived.toLocaleString()} L`}</div></div>
                                  <div><span className="text-slate-500">Unallocated</span><div className="font-bold text-emerald-600">{receiptPending ? 'Pending' : `${lotAccounting.remaining.toLocaleString()} L`}</div></div>
                                </div>
                                {!receiptPending && lotAccounting.overdraw > 0.01 && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">Overdraw detected: {lotAccounting.overdraw.toFixed(2)} L. Review round input and waste records before closing this lot.</div>}
                              </div>
                              <div className="bg-white rounded-lg border-2 border-slate-200 p-5 shadow-sm">
                                <h3 className="text-sm font-bold text-slate-900 mb-1">Vessel / location allocation</h3>
                                <p className="text-xs text-slate-500 mb-3">Production is deducted automatically in this order: Direct to production → BMC #2 → Silo → BMC #1 → BMC #3 → Auxiliary → IBCs. Sales use IBCs for exact 1,000 L multiples and Auxiliary for quantities below 400 L.</p>
                                <div className="space-y-2">
                                  {receiptPending ? <p className="text-xs text-blue-700">Vessel allocation will be calculated after the actual received volume is entered.</p> : vesselAllocation.vessels.length > 0 ? vesselAllocation.vessels.map((allocation) => {
                                    const fillPercent = allocation.capacity ? Math.min(100, (allocation.litres / allocation.capacity) * 100) : 100;
                                    return (
                                      <div key={allocation.id} className="rounded-lg border border-slate-100 px-2 py-2">
                                        <div className="flex items-center gap-2 text-xs">
                                          <span className="w-40 shrink-0 text-slate-600">{allocation.label}</span>
                                          <div className="flex-1 bg-slate-100 rounded-full h-3 overflow-hidden"><div className="h-full bg-blue-500 rounded-full" style={{ width: `${fillPercent}%` }} /></div>
                                          <span className="w-28 text-right font-semibold text-slate-800">{allocation.litres.toLocaleString()} L{allocation.capacity ? ` / ${allocation.capacity.toLocaleString()} L` : ''}</span>
                                        </div>
                                        {(allocation.productionDrawLitres > 0 || allocation.salesDrawLitres > 0 || allocation.otherDrawLitres > 0) && (
                                          <p className="mt-1 text-[11px] text-slate-500">
                                            Opened {allocation.openingLitres.toLocaleString()} L · Production {allocation.productionDrawLitres.toLocaleString()} L · Sales {allocation.salesDrawLitres.toLocaleString()} L · Other {allocation.otherDrawLitres.toLocaleString()} L
                                          </p>
                                        )}
                                      </div>
                                    );
                                  }) : <p className="text-xs text-slate-400">No remaining milk to allocate</p>}
                                </div>
                                {vesselAllocation.ruleShortfallLitres > 0.01 && (
                                  <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                                    Vessel allocation shortfall: {vesselAllocation.ruleShortfallLitres.toLocaleString()} L. The recorded milk use exceeds the opening vessel stock or a sale’s required source.
                                  </div>
                                )}
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
                                      <th className="px-4 py-2 text-left font-semibold text-slate-700 text-xs uppercase tracking-wider">Deducted From</th>
                                      <th className="px-4 py-2 text-right font-semibold text-slate-700 text-xs uppercase tracking-wider">Quantity</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {lot.milkSales.map((sale) => (
                                      <tr key={sale.id} className="hover:bg-slate-50">
                                        <td className="px-4 py-3 text-slate-700">{formatDate(sale.saleDate)}</td>
                                        <td className="px-4 py-3 text-slate-900 font-medium">{sale.customer}</td>
                                        <td className="px-4 py-3 text-slate-700">
                                          {sale.sourceAllocations?.length
                                            ? sale.sourceAllocations.map(allocation => `${allocation.quantity.toLocaleString()} L ${milkVesselLabel(allocation.vesselId)}`).join(' + ')
                                            : milkVesselLabel(sale.sourceVessel || getMilkSaleVesselSource(sale.quantity) || 'unassigned')}
                                        </td>
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
      <Modal isOpen={showNewLotModal} onClose={() => setShowNewLotModal(false)} title="Create Milk Lot">
        <div className="space-y-4">
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
            Create a planned lot before offloading so production can start immediately. Add the actual volume, invoice and delivery note later from Edit.
          </div>
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
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Receipt status</label>
            <select
              value={newLot.receiptStatus}
              onChange={(e) => setNewLot({ ...newLot, receiptStatus: e.target.value as 'planned' | 'received', litresReceived: e.target.value === 'planned' ? 0 : (newLot.litresReceived || 25000) })}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
            >
              <option value="planned">Planned · receipt pending</option>
              <option value="received">Received · volume recorded now</option>
            </select>
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
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">{newLot.receiptStatus === 'planned' ? 'Expected litres (optional)' : 'Litres Received'}</label>
            <input
              type="number"
              value={newLot.receiptStatus === 'planned' ? '' : newLot.litresReceived}
              onChange={(e) => setNewLot({ ...newLot, litresReceived: parseInt(e.target.value) })}
              disabled={newLot.receiptStatus === 'planned'}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm disabled:bg-slate-50"
              min="0"
              placeholder={newLot.receiptStatus === 'planned' ? 'Add after receipt' : 'e.g. 25000'}
            />
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={handleCreateLot} className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors">
              {newLot.receiptStatus === 'planned' ? 'Create Planned Lot' : 'Record Received Lot'}
            </button>
            <button onClick={() => setShowNewLotModal(false)} className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showEditLotModal} onClose={() => setShowEditLotModal(false)} title="Edit original milk receipt">
        <div className="space-y-4">
          <p className="text-xs text-slate-500">Add receipt details after offloading. Recorded production, sales, rejected, and spilled quantities are preserved.</p>
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Lot Code {canEditLotCode ? '(owner/admin editable)' : '(owner/admin only)'}</label>
            <input value={editLot.lotCode} disabled={!canEditLotCode} onChange={(e) => setEditLot({ ...editLot, lotCode: e.target.value })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm disabled:bg-slate-50" />
          </div>
          {canEditLotCode && editLot.lotCode !== milkLots.find((lot) => lot.id === editingLotId)?.lotCode && (
            <div>
              <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Reason for lot-code correction</label>
              <input value={editLotChangeReason} onChange={(e) => setEditLotChangeReason(e.target.value)} className="mt-1 w-full px-3 py-2 border border-amber-200 rounded-lg text-sm" placeholder="e.g. Supplier rejected the original tanker lot" />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Receipt Date</label><input type="date" value={editLot.receiptDate} onChange={(e) => setEditLot({ ...editLot, receiptDate: e.target.value })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" /></div>
            <div><label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Receipt Time</label><input type="time" value={editLot.receiptTime} onChange={(e) => setEditLot({ ...editLot, receiptTime: e.target.value })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" /></div>
          </div>
          <div><label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Supplier</label><input value={editLot.supplier} onChange={(e) => setEditLot({ ...editLot, supplier: e.target.value })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" /></div>
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Receipt status</label>
            <select value={editLot.receiptStatus} onChange={(e) => setEditLot({ ...editLot, receiptStatus: e.target.value as 'planned' | 'received' })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white">
              <option value="planned">Planned · receipt pending</option>
              <option value="received">Received · volume recorded</option>
            </select>
          </div>
          <div><label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Litres Received</label><input type="number" min="0" disabled={editLot.receiptStatus === 'planned'} value={editLot.receiptStatus === 'planned' ? '' : editLot.litresReceived} onChange={(e) => setEditLot({ ...editLot, litresReceived: Number(e.target.value) })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm disabled:bg-slate-50" placeholder={editLot.receiptStatus === 'planned' ? 'Add after receipt' : 'e.g. 25000'} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Invoice No</label><input value={editLot.invoiceNo} onChange={(e) => setEditLot({ ...editLot, invoiceNo: e.target.value })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" /></div>
            <div><label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Delivery Note No</label><input value={editLot.deliveryNoteNo} onChange={(e) => setEditLot({ ...editLot, deliveryNoteNo: e.target.value })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" /></div>
          </div>
          <div className="flex gap-2 pt-2"><button onClick={handleUpdateLot} className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium">Save changes</button><button onClick={() => setShowEditLotModal(false)} className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium">Cancel</button></div>
        </div>
      </Modal>

      <Modal isOpen={showMilkSaleModal} onClose={() => setShowMilkSaleModal(false)} title={`Log milk sale · ${displayedLot?.lotCode || ''}`}>
        <div className="space-y-4">
          <p className="text-xs text-slate-500">Only the selected lot’s remaining milk can be sold. Total available: <strong>{totals.remaining.toLocaleString()} L</strong>.</p>
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
            <p><strong>Preferred source is guidance:</strong> 1,000 L multiples prefer IBCs, and sales below 400 L prefer auxiliary storage. If that stock is unavailable, the sale can use another vessel or split across vessels.</p>
            <p className="mt-1">Available by vessel: {displayedSaleAvailability.vessels.length ? displayedSaleAvailability.vessels.map(vessel => `${vessel.label} ${vessel.litres.toLocaleString()} L`).join(' · ') : 'No vessel stock currently available'}.</p>
          </div>
          <div><label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Quantity of milk (L)</label><input type="number" min="1" value={milkSale.quantity || ''} onChange={(e) => setMilkSale({ ...milkSale, quantity: Number(e.target.value) || 0 })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" /></div>
          <div><label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Sale source</label><select value={milkSale.sourceVessel} onChange={e => setMilkSale({ ...milkSale, sourceVessel: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"><option value="auto">Auto: preferred vessel, then any available stock</option>{displayedSaleAvailability.vessels.map(vessel => <option key={vessel.id} value={vessel.id}>{vessel.label} · {vessel.litres.toLocaleString()} L available</option>)}</select><p className="mt-1 text-[11px] text-slate-500">Choose a specific vessel or let the app use and record the available vessel(s).</p></div>
          {milkSale.quantity > 0 && (
            <p className={`text-xs font-medium ${displayedSalePlan.shortfall <= 0.01 ? 'text-emerald-700' : 'text-red-700'}`}>
              {displayedSalePlan.shortfall <= 0.01
                ? `This sale will be deducted from ${displayedSalePlan.allocations.map(allocation => `${allocation.quantity.toLocaleString()} L ${milkVesselLabel(allocation.vesselId)}`).join(' + ')}.`
                : `Not enough milk in the selected source(s): ${displayedSalePlan.shortfall.toLocaleString()} L still needed.`}
            </p>
          )}
          <div><label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Sold to customer</label><input value={milkSale.customer} onChange={(e) => setMilkSale({ ...milkSale, customer: e.target.value })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" placeholder="Customer name" /></div>
          <div><label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Date of sale</label><input type="date" value={milkSale.saleDate} onChange={(e) => setMilkSale({ ...milkSale, saleDate: e.target.value })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" /></div>
          <div className="flex gap-2 pt-2"><button onClick={handleMilkSale} className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium">Save milk sale</button><button onClick={() => setShowMilkSaleModal(false)} className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium">Cancel</button></div>
        </div>
      </Modal>

      <Modal isOpen={showCloseModal} onClose={() => setShowCloseModal(false)} title="Weekly CIP & close milk-lot production" size="lg">
        <div className="space-y-4">
          <p className="text-sm text-slate-700">Complete both CIP parts before closing production for {closeModalLot?.lotCode || 'this lot'}.</p>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm font-medium text-amber-900">Weekly CIP = daily SH8000 cycle + acid cycle</p>
            <p className="text-xs text-amber-800 mt-1">Part 1 repeats the daily SH8000 cycle. Part 2 uses 200 L water at 65°C with 2 L Scale Bright. Existing shift-level daily CIP records remain separate.</p>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-600 uppercase tracking-wide">Part 1 · Daily SH8000 cycle</p>
            {dailyCipSteps.map(step => (
              <label key={step.id} className="flex items-start gap-2 rounded-lg border border-slate-200 p-2.5 text-sm text-slate-700 cursor-pointer hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={weeklyCipCompletedSteps.includes(step.id)}
                  onChange={(e) => setWeeklyCipCompletedSteps(current => e.target.checked ? [...current, step.id] : current.filter(id => id !== step.id))}
                  className="mt-0.5"
                />
                <span>{step.label}{step.required === false ? ' (only if needed)' : ''}</span>
              </label>
            ))}
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-600 uppercase tracking-wide">Part 2 · Weekly acid cycle</p>
            {weeklyAcidCipSteps.map(step => (
              <label key={step.id} className="flex items-start gap-2 rounded-lg border border-slate-200 p-2.5 text-sm text-slate-700 cursor-pointer hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={weeklyCipCompletedSteps.includes(step.id)}
                  onChange={(e) => setWeeklyCipCompletedSteps(current => e.target.checked ? [...current, step.id] : current.filter(id => id !== step.id))}
                  className="mt-0.5"
                />
                <span>{step.label}{step.required === false ? ' (only if needed)' : ''}</span>
              </label>
            ))}
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Verified / recorded by</label>
            <input value={weeklyCipRecordedBy} onChange={(e) => setWeeklyCipRecordedBy(e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" placeholder="Name or username" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Supervisor sign-off</label>
            <input value={weeklyCipSupervisorName} onChange={(e) => setWeeklyCipSupervisorName(e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" placeholder="Supervisor name" />
            <label className="flex items-start gap-2 mt-2 text-xs text-slate-600 cursor-pointer">
              <input type="checkbox" checked={weeklyCipSupervisorConfirmed} onChange={(e) => setWeeklyCipSupervisorConfirmed(e.target.checked)} className="mt-0.5" />
              <span>I confirm both weekly CIP parts were reviewed and signed off.</span>
            </label>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Notes (optional)</label>
            <textarea value={weeklyCipNotes} onChange={(e) => setWeeklyCipNotes(e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" rows={3} placeholder="Weekly cleaning observations or corrective action" />
          </div>
          <p className="text-xs text-slate-500">Closing stops new raw-milk shifts and rounds for this lot. Existing rounds, cream-to-butter processing, cutting, packing, crumbing and distribution remain available.</p>
          <div className="flex gap-2 pt-2"><button onClick={handleCloseLot} className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium">Record weekly CIP & close</button><button onClick={() => setShowCloseModal(false)} className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium">Cancel</button></div>
        </div>
      </Modal>

      <Modal isOpen={showReceiveCreamModal} onClose={() => setShowReceiveCreamModal(false)} title="Receive purchased cream">
        <div className="space-y-4">
          <div><label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Container weights / total cream (kg)</label><input type="text" inputMode="decimal" value={creamReceipt.quantity} onChange={(e) => setCreamReceipt({ ...creamReceipt, quantity: e.target.value })} placeholder="e.g. 12+13" className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" /><p className="mt-1 text-xs text-slate-500">Enter one weight or add container weights with +.</p>{creamReceipt.quantity.trim() && <p className={`mt-1 text-sm font-semibold ${creamReceiptQuantity === null ? 'text-red-600' : 'text-emerald-700'}`}>{creamReceiptQuantity === null ? 'Use numbers separated by +, e.g. 12+13' : `Total: ${creamReceiptQuantity.toFixed(2)} kg`}</p>}</div>
          <div><label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Received from</label><input value={creamReceipt.receivedFrom} onChange={(e) => setCreamReceipt({ ...creamReceipt, receivedFrom: e.target.value })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Receiving temp (°C)</label><input type="number" step="0.1" value={creamReceipt.receivingTemp || ''} onChange={(e) => setCreamReceipt({ ...creamReceipt, receivingTemp: Number(e.target.value) || 0 })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" /></div>
            <div><label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Receiving pH</label><input type="number" step="0.01" value={creamReceipt.receivingPh || ''} onChange={(e) => setCreamReceipt({ ...creamReceipt, receivingPh: Number(e.target.value) || 0 })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" /></div>
          </div>
          <div><label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Storage location</label><select value={creamReceipt.storageLocation} onChange={(e) => setCreamReceipt({ ...creamReceipt, storageLocation: e.target.value as typeof creamReceipt.storageLocation })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"><option value="container">Container</option><option value="chiller">Chiller</option><option value="coldroom">Coldroom</option></select></div>
          <div><label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Comments / remarks</label><textarea value={creamReceipt.remarks} onChange={(e) => setCreamReceipt({ ...creamReceipt, remarks: e.target.value })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" rows={3} /></div>
          <div className="flex gap-2 pt-2"><button onClick={handleReceiveCream} className="flex-1 px-4 py-2.5 bg-amber-600 text-white rounded-lg text-sm font-medium">Save cream receipt</button><button onClick={() => setShowReceiveCreamModal(false)} className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium">Cancel</button></div>
        </div>
      </Modal>

      {creamLots.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50"><h2 className="text-lg font-semibold text-slate-900">Purchased cream lots</h2><p className="text-xs text-slate-500 mt-1">Available for selection in the Butter production tab.</p></div>
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-slate-200"><th className="px-4 py-3 text-left text-xs uppercase tracking-wider">Lot</th><th className="px-4 py-3 text-left text-xs uppercase tracking-wider">Received from</th><th className="px-4 py-3 text-right text-xs uppercase tracking-wider">Quantity</th><th className="px-4 py-3 text-right text-xs uppercase tracking-wider">Temp / pH</th><th className="px-4 py-3 text-left text-xs uppercase tracking-wider">Storage</th><th className="px-4 py-3 text-right text-xs uppercase tracking-wider">Remaining</th></tr></thead><tbody className="divide-y divide-slate-100">{creamLots.map((cream) => <tr key={cream.id}><td className="px-4 py-3 font-mono font-semibold">{cream.lotCode}</td><td className="px-4 py-3">{cream.receivedFrom || cream.supplier}</td><td className="px-4 py-3 text-right">{cream.quantity.toLocaleString()} kg</td><td className="px-4 py-3 text-right">{cream.receivingTemp ?? '—'}°C / {cream.receivingPh ?? '—'}</td><td className="px-4 py-3 capitalize">{cream.storageLocation || '—'}</td><td className={`px-4 py-3 text-right font-semibold ${cream.remaining < 0 ? 'text-red-700' : 'text-emerald-700'}`}>{cream.remaining.toLocaleString()} kg{cream.remaining < 0 && <span className="ml-1 text-xs">· overdraw</span>}</td></tr>)}</tbody></table></div>
        </div>
      )}
    </div>
  );
}
