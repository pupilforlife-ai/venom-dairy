import { Fragment, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRightLeft,
  Clock,
  ChevronDown,
  ChevronRight,
  GitBranch,
  Package,
  Snowflake,
  Thermometer,
} from 'lucide-react';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { useApp } from '../store/AppContext';
import { FinishedStockLot, ProductionRound } from '../data/mockData';
import { paneerSkuByCode } from '../data/skuConfig';

type Tab = 'intermediate' | 'finished';
type TransferKind = 'intermediate' | 'finished';

const standardLocations = [
  'Chiller',
  'Dairy Container (Intermediate Freezer)',
  'Dairy Container (Finished Stock)',
  'Coldroom',
  'Distribution Coldroom',
  'Rental Cold Storage',
];

function formatQuantity(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function isCurrentIntermediateStock(status: string, quantity: number) {
  return status !== 'consumed' && quantity > 0;
}

function isCurrentFinishedStock(status: string) {
  return status !== 'handed_over';
}

function roundMatchesBatchCode(round: ProductionRound, sourceBatchCode: string) {
  const source = sourceBatchCode.trim().toLowerCase();
  if (!source) return false;
  const candidates = [
    round.batchCode,
    round.sourceBatchCode,
    `${round.milkLotCode}/S${round.shiftNumber}/R${round.roundNumber}`,
    `${round.milkLotCode}/S${round.shiftNumber}/R${round.roundNumber}/${round.type}`,
  ].filter(Boolean).map(value => String(value).toLowerCase());
  return candidates.includes(source);
}

interface FinishedSkuGroup {
  sku: string;
  productName: string;
  cases: number;
  loosePackets: number;
  totalPackets: number;
  weightKg: number;
  looseWeightKg: number;
  hasWeightKg: boolean;
  hasLooseWeightKg: boolean;
  lines: FinishedStockLot[];
}

export default function Inventory() {
  const {
    intermediateLots,
    finishedStock,
    productionRounds,
    updateIntermediateLot,
    updateFinishedStock,
  } = useApp();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<Tab>('intermediate');
  const [locationFilter, setLocationFilter] = useState('all');
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferTarget, setTransferTarget] = useState('');
  const [transferDestination, setTransferDestination] = useState('');

  const locations = useMemo(() => [
    ...new Set([
      ...standardLocations,
      ...intermediateLots.map((lot) => lot.storageLocation),
      ...finishedStock.map((stock) => stock.storageLocation),
    ]),
  ], [finishedStock, intermediateLots]);

  const filteredIntermediate = intermediateLots.filter(
    (lot) => locationFilter === 'all' || lot.storageLocation === locationFilter,
  );
  const legacyFinishedStock = useMemo<FinishedStockLot[]>(() => {
    // An undefined packingRunId is not a real link. Do not let one legacy row
    // with a missing ID suppress every other legacy packing entry.
    const recordedPackingRuns = new Set(finishedStock.map(stock => stock.packingRunId).filter(Boolean));
    return productionRounds.flatMap(round => {
      if (['scheduled', 'cancelled', 'spoiled', 'handed_over'].includes(round.status)) return [];
      const sourceBatchCode = round.batchCode || round.sourceBatchCode || `${round.milkLotCode}/S${round.shiftNumber}/R${round.roundNumber}/${round.type}`;
      return (round.packedSkus || [])
        .filter(entry => {
          if (entry.packingRunId) return !recordedPackingRuns.has(entry.packingRunId);
          // Older stock rows may not have a packingRunId. Match their source,
          // SKU, and quantity before synthesising another legacy line.
          return !finishedStock.some(stock =>
            !stock.packingRunId &&
            stock.sku === entry.sku &&
            (stock.sourceBatchCodes || []).includes(sourceBatchCode) &&
            (stock.cases || 0) === (entry.cases || 0) &&
            (stock.loosePackets || 0) === (entry.loose || 0)
          );
        })
        .map((entry, index) => {
          const packingRunId = entry.packingRunId || `legacy-${round.id}-${index}`;
          return {
            id: packingRunId,
            sku: entry.sku,
            productName: paneerSkuByCode[entry.sku]?.productName || entry.sku,
            packingRunId,
            cases: entry.cases || 0,
            loosePackets: entry.loose || 0,
            totalPackets: paneerSkuByCode[entry.sku]?.packMode === 'units'
              ? (entry.cases || 0) * (paneerSkuByCode[entry.sku]?.unitsPerCase || 0) + (entry.loose || 0)
              : 0,
            storageLocation: 'Dairy Container (Finished Stock)',
            status: 'awaiting_handover',
            createdAt: round.completedAt || round.startTime,
            sourceBatchCodes: [sourceBatchCode],
            ...(entry.weightKg !== undefined ? { weightKg: entry.weightKg } : {}),
            ...(entry.looseWeightKg !== undefined ? { looseWeightKg: entry.looseWeightKg } : {}),
          } satisfies FinishedStockLot;
        });
    });
  }, [finishedStock, productionRounds]);
  const inventoryFinishedStock = useMemo(() => [...finishedStock, ...legacyFinishedStock], [finishedStock, legacyFinishedStock]);
  const filteredFinished = inventoryFinishedStock.filter(
    (stock) => locationFilter === 'all' || stock.storageLocation === locationFilter,
  );
  const [expandedSkus, setExpandedSkus] = useState<Set<string>>(new Set());

  const currentIntermediate = filteredIntermediate.filter((lot) =>
    isCurrentIntermediateStock(lot.status, lot.currentQuantity),
  );
  const currentFinished = filteredFinished.filter((stock) => isCurrentFinishedStock(stock.status));

  const groupedFinished = useMemo<FinishedSkuGroup[]>(() => {
    const groups = new Map<string, FinishedSkuGroup>();
    filteredFinished.forEach((stock) => {
      const existing = groups.get(stock.sku) || {
        sku: stock.sku,
        productName: stock.productName,
        cases: 0,
        loosePackets: 0,
        totalPackets: 0,
        weightKg: 0,
        looseWeightKg: 0,
        hasWeightKg: false,
        hasLooseWeightKg: false,
        lines: [],
      };
      existing.lines.push(stock);
      if (isCurrentFinishedStock(stock.status)) {
        existing.cases += stock.cases || 0;
        existing.loosePackets += stock.loosePackets || 0;
        existing.totalPackets += stock.totalPackets || 0;
        if (stock.weightKg !== undefined) {
          existing.weightKg += stock.weightKg;
          existing.hasWeightKg = true;
        }
        if (stock.looseWeightKg !== undefined) {
          existing.looseWeightKg += stock.looseWeightKg;
          existing.hasLooseWeightKg = true;
        }
      }
      groups.set(stock.sku, existing);
    });
    return [...groups.values()].sort((a, b) => a.productName.localeCompare(b.productName) || a.sku.localeCompare(b.sku));
  }, [filteredFinished]);

  const toggleSku = (sku: string) => {
    setExpandedSkus(current => {
      const next = new Set(current);
      if (next.has(sku)) next.delete(sku);
      else next.add(sku);
      return next;
    });
  };

  const totalIntermediateKg = currentIntermediate
    .filter((lot) => lot.uom === 'kg')
    .reduce((sum, lot) => sum + lot.currentQuantity, 0);
  const totalCases = currentFinished.reduce((sum, stock) => sum + (stock.cases || 0), 0);
  const totalLoose = currentFinished.reduce((sum, stock) => sum + (stock.loosePackets || 0), 0);
  const totalPackets = currentFinished.reduce((sum, stock) => sum + (stock.totalPackets || 0), 0);

  const fifoLots = useMemo(() => intermediateLots
    .filter((lot) =>
      lot.status === 'available' &&
      lot.currentQuantity > 0 &&
      lot.storageLocation.toLowerCase().includes('freezer'),
    )
    .sort((a, b) => new Date(a.producedAt).getTime() - new Date(b.producedAt).getTime()), [intermediateLots]);
  const oldestFifoLot = fifoLots[0];
  const priorityLots = useMemo(() => intermediateLots
    .filter((lot) => lot.priorityUse && lot.status === 'available' && lot.currentQuantity > 0)
    .sort((a, b) => new Date(a.useByDate || '9999-12-31').getTime() - new Date(b.useByDate || '9999-12-31').getTime()), [intermediateLots]);
  const priorityLot = priorityLots[0];

  const transferItems = useMemo(() => ({
    intermediate: intermediateLots.filter((lot) => isCurrentIntermediateStock(lot.status, lot.currentQuantity)),
    finished: finishedStock.filter((stock) => isCurrentFinishedStock(stock.status)),
  }), [finishedStock, intermediateLots]);

  const openTransferModal = (kind?: TransferKind, id?: string) => {
    const target = kind && id ? `${kind}|${id}` : '';
    setTransferTarget(target);
    setTransferDestination('');
    setShowTransferModal(true);
  };

  const handleTransfer = () => {
    const [kind, id] = transferTarget.split('|') as [TransferKind | undefined, string | undefined];
    if (!kind || !id || !transferDestination) {
      showToast('error', 'Select stock and a destination before transferring');
      return;
    }

    if (kind === 'intermediate') {
      const lot = intermediateLots.find((item) => item.id === id);
      if (!lot) return;
      if (lot.storageLocation === transferDestination) {
        showToast('error', 'The stock is already at that location');
        return;
      }
      updateIntermediateLot(id, { storageLocation: transferDestination });
      showToast('success', `${lot.productName} transferred to ${transferDestination}`);
    } else {
      const stock = finishedStock.find((item) => item.id === id);
      if (!stock) return;
      if (stock.storageLocation === transferDestination) {
        showToast('error', 'The stock is already at that location');
        return;
      }
      updateFinishedStock(id, { storageLocation: transferDestination });
      showToast('success', `${stock.productName} transferred to ${transferDestination}`);
    }

    setShowTransferModal(false);
    setTransferTarget('');
    setTransferDestination('');
  };

  const selectedTransferLabel = (() => {
    const [kind, id] = transferTarget.split('|') as [TransferKind | undefined, string | undefined];
    if (!kind || !id) return '';
    if (kind === 'intermediate') {
      const lot = transferItems.intermediate.find((item) => item.id === id);
      return lot ? `${lot.productName} · ${formatQuantity(lot.currentQuantity)} ${lot.uom}` : '';
    }
    const stock = transferItems.finished.find((item) => item.id === id);
    return stock ? `${stock.productName} · ${formatQuantity(stock.totalPackets || 0)} packets` : '';
  })();

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Inventory &amp; Stock</h2>
          <p className="text-sm text-slate-500 mt-0.5">Live intermediate lots, finished stock, locations, and genealogy</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={locationFilter}
            onChange={(event) => setLocationFilter(event.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
          >
            <option value="all">All Locations</option>
            {locations.map((location) => <option key={location} value={location}>{location}</option>)}
          </select>
          <button
            type="button"
            onClick={() => openTransferModal()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
          >
            <ArrowRightLeft className="w-4 h-4" />
            Transfer stock
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 text-slate-500 mb-1"><Package className="w-4 h-4" /><span className="text-xs font-medium uppercase tracking-wide">Intermediate</span></div>
          <p className="text-2xl font-bold text-slate-900">{formatQuantity(totalIntermediateKg)}</p>
          <p className="text-xs text-slate-400">kg currently in stock</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 text-slate-500 mb-1"><Package className="w-4 h-4" /><span className="text-xs font-medium uppercase tracking-wide">Finished Cases</span></div>
          <p className="text-2xl font-bold text-emerald-600">{totalCases}</p>
          <p className="text-xs text-slate-400">not handed over</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 text-slate-500 mb-1"><Package className="w-4 h-4" /><span className="text-xs font-medium uppercase tracking-wide">Loose Packets</span></div>
          <p className="text-2xl font-bold text-amber-600">{totalLoose}</p>
          <p className="text-xs text-slate-400">not handed over</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 text-slate-500 mb-1"><Package className="w-4 h-4" /><span className="text-xs font-medium uppercase tracking-wide">Total Packets</span></div>
          <p className="text-2xl font-bold text-indigo-600">{totalPackets}</p>
          <p className="text-xs text-slate-400">current finished stock</p>
        </div>
      </div>

      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
        <button type="button" onClick={() => setActiveTab('intermediate')} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'intermediate' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          Intermediate Stock ({filteredIntermediate.length})
        </button>
        <button type="button" onClick={() => setActiveTab('finished')} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'finished' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          Finished Stock ({groupedFinished.length} SKUs)
        </button>
      </div>

      {activeTab === 'intermediate' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-slate-50 text-left border-b border-slate-200">
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Product</th>
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Source Batch</th>
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Qty</th>
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Location</th>
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Status</th>
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Genealogy</th>
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Action</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {filteredIntermediate.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3"><div className="font-medium text-slate-900">{item.productName}</div><div className="text-xs text-slate-400 font-mono">{item.lotCode}</div></td>
                    <td className="px-4 py-3"><code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">{item.sourceBatchCode}</code></td>
                    <td className="px-4 py-3 text-slate-700 font-medium">{formatQuantity(item.currentQuantity)} {item.uom}</td>
                    <td className="px-4 py-3"><span className={`inline-flex items-center gap-1 text-xs font-medium ${item.storageLocation.toLowerCase().includes('freezer') ? 'text-indigo-600' : 'text-blue-600'}`}>{item.storageLocation.toLowerCase().includes('freezer') ? <Snowflake className="w-3 h-3" /> : <Thermometer className="w-3 h-3" />}{item.storageLocation}</span></td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${item.status === 'available' ? 'bg-emerald-100 text-emerald-700' : item.status === 'reserved' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>{item.status}</span></td>
                    <td className="px-4 py-3"><div className="flex items-center gap-1 text-xs text-slate-500"><GitBranch className="w-3 h-3" /><span>Milk {item.sourceMilkLotCode} → S{item.sourceShift}/R{item.sourceRound}</span></div></td>
                    <td className="px-4 py-3"><button type="button" onClick={() => openTransferModal('intermediate', item.id)} disabled={!isCurrentIntermediateStock(item.status, item.currentQuantity)} className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:border-emerald-300 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"><ArrowRightLeft className="w-3 h-3" />Move</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredIntermediate.length === 0 && <div className="p-6 text-center text-slate-400 text-sm">No intermediate stock at this location.</div>}
        </div>
      )}

      {activeTab === 'finished' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-indigo-50">
            <p className="text-xs text-indigo-800"><strong>SKU summary:</strong> click any SKU to expand its packing runs, source batches, and linked production rounds.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-slate-50 text-left border-b border-slate-200">
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">SKU</th>
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Product</th>
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Cases</th>
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Loose</th>
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Total Pkts</th>
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Location</th>
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Batch History</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {groupedFinished.map((group) => {
                  const isExpanded = expandedSkus.has(group.sku);
                  const currentLines = group.lines.filter(item => isCurrentFinishedStock(item.status));
                  const locationsForSku = [...new Set(currentLines.map(item => item.storageLocation))];
                  const roundsForSku = [...new Map(group.lines.flatMap(item => (item.sourceBatchCodes || []).flatMap(code => productionRounds.filter(round => roundMatchesBatchCode(round, code)))).map(round => [round.id, round])).values()];
                  return (
                    <Fragment key={group.sku}>
                      <tr key={group.sku} className="cursor-pointer hover:bg-indigo-50" onClick={() => toggleSku(group.sku)} aria-expanded={isExpanded}>
                        <td className="px-4 py-3"><div className="flex items-center gap-2"><span className="text-slate-400">{isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</span><code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-700">{group.sku}</code></div></td>
                        <td className="px-4 py-3 font-medium text-slate-900">{group.productName}</td>
                        <td className="px-4 py-3 font-medium text-slate-700">{group.cases}</td>
                        <td className="px-4 py-3 text-slate-700">{group.loosePackets}</td>
                        <td className="px-4 py-3 font-bold text-slate-900">{group.totalPackets}{group.hasWeightKg ? ` · ${formatQuantity(group.weightKg)} kg` : group.hasLooseWeightKg ? ` · ${formatQuantity(group.looseWeightKg)} kg loose` : ''}</td>
                        <td className="px-4 py-3"><div className="flex max-w-xs flex-wrap gap-1">{locationsForSku.length > 0 ? locationsForSku.map(location => <span key={location} className="text-xs font-medium text-blue-600">{location}</span>) : <span className="text-xs text-slate-400">No current stock</span>}</div></td>
                        <td className="px-4 py-3"><span className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700">{group.lines.length} batch{group.lines.length === 1 ? '' : 'es'} · {roundsForSku.length} round{roundsForSku.length === 1 ? '' : 's'}</span></td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${group.sku}-history`} className="bg-slate-50">
                          <td colSpan={7} className="px-4 py-4">
                            <div className="space-y-4">
                              <div>
                                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Packing and batch history</h4>
                                <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200 bg-white">
                                  <table className="w-full text-xs">
                                    <thead><tr className="border-b border-slate-200 bg-slate-100 text-left text-slate-500"><th className="px-3 py-2">Packed</th><th className="px-3 py-2">Source batch(es)</th><th className="px-3 py-2">Quantity</th><th className="px-3 py-2">Location / status</th><th className="px-3 py-2">Action</th></tr></thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {group.lines.map(item => {
                                        const lineRounds = [...new Map((item.sourceBatchCodes || []).flatMap(code => productionRounds.filter(round => roundMatchesBatchCode(round, code))).map(round => [round.id, round])).values()];
                                        const isPersistedFinishedStock = !item.id.startsWith('legacy-');
                                        return <tr key={item.id} className="align-top">
                                          <td className="px-3 py-2 text-slate-600">{new Date(item.createdAt).toLocaleString()}<div className="mt-1 font-mono text-[10px] text-slate-400">{item.packingRunId}</div></td>
                                          <td className="px-3 py-2"><div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">Finished batch: {item.finishedGoodsBatchCode || 'Assigned at Distribution'}</div>{item.finishedGoodsBatchCodeReviewedBy && <div className="mb-1 text-[10px] text-indigo-700">Reviewed by {item.finishedGoodsBatchCodeReviewedBy}{item.finishedGoodsBatchCodeReviewMethod === 'owner_admin_override' ? ' · changed' : ''}</div>}<div className="flex max-w-sm flex-wrap gap-1">{(item.sourceBatchCodes || []).map((code, index) => <code key={`${code}-${index}`} className="rounded bg-slate-100 px-1 py-0.5 text-[10px] text-slate-700">{code}</code>)}</div>{lineRounds.length > 0 && <div className="mt-1 text-[10px] text-indigo-700">Linked to {lineRounds.length} production round{lineRounds.length === 1 ? '' : 's'}</div>}</td>
                                          <td className="px-3 py-2 font-medium text-slate-700">{item.cases || 0} cases · {item.loosePackets || 0} loose<div className="text-slate-500">{item.totalPackets || 0} packets{item.weightKg !== undefined ? ` · ${formatQuantity(item.weightKg)} kg` : item.looseWeightKg !== undefined ? ` · ${formatQuantity(item.looseWeightKg)} kg loose` : ''}</div></td>
                                          <td className="px-3 py-2"><div className="text-slate-600">{item.storageLocation}</div><span className={`mt-1 inline-flex rounded-full px-2 py-0.5 font-medium ${item.status === 'awaiting_handover' ? 'bg-amber-100 text-amber-700' : item.status === 'handed_over' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{item.status === 'awaiting_handover' ? 'Awaiting' : item.status === 'handed_over' ? 'Handed Over' : 'Returned'}</span>{!isPersistedFinishedStock && <div className="mt-1 text-[10px] text-slate-400">Legacy round record</div>}</td>
                                          <td className="px-3 py-2"><button type="button" onClick={(event) => { event.stopPropagation(); openTransferModal('finished', item.id); }} disabled={!isCurrentFinishedStock(item.status) || !isPersistedFinishedStock} title={!isPersistedFinishedStock ? 'This legacy round record must be reconciled before it can be transferred' : undefined} className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 font-medium text-slate-600 hover:border-emerald-300 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"><ArrowRightLeft className="h-3 w-3" />Move</button></td>
                                        </tr>;
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                              <div>
                                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Linked production rounds</h4>
                                {roundsForSku.length > 0 ? <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">{roundsForSku.map(round => <div key={round.id} className="rounded-lg border border-indigo-100 bg-indigo-50 p-3"><div className="font-mono text-xs font-semibold text-indigo-800">{round.milkLotCode}/S{round.shiftNumber}/R{round.roundNumber}</div><div className="mt-1 text-xs text-indigo-700">{round.type} · {round.status}</div><div className="mt-1 text-xs text-indigo-600">Output: {formatQuantity(round.outputWeight || 0)} kg</div></div>)}</div> : <p className="mt-2 text-xs text-slate-500">No matching production-round record was found for these batch codes.</p>}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          {groupedFinished.length === 0 && <div className="p-6 text-center text-slate-400 text-sm">No finished stock at this location.</div>}
        </div>
      )}

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
        {oldestFifoLot ? <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" /> : <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />}
        <div>
          <p className="text-sm font-medium text-amber-800">FIFO stock guidance</p>
          {oldestFifoLot ? (
            <p className="text-xs text-amber-700 mt-0.5">{oldestFifoLot.productName} ({formatQuantity(oldestFifoLot.currentQuantity)} {oldestFifoLot.uom}) from {oldestFifoLot.sourceBatchCode} is the oldest eligible freezer lot.</p>
          ) : (
            <p className="text-xs text-amber-700 mt-0.5">No eligible freezer stock is currently available for packing.</p>
          )}
          {priorityLot && <p className="text-xs text-amber-700 mt-1">Priority-use stock: {priorityLot.productName} ({formatQuantity(priorityLot.currentQuantity)} {priorityLot.uom}){priorityLot.useByDate ? ` · use by ${new Date(priorityLot.useByDate).toLocaleDateString()}` : ''}.</p>}
        </div>
      </div>

      <Modal isOpen={showTransferModal} onClose={() => setShowTransferModal(false)} title="Transfer stock">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Move a complete stock line to another storage location. The quantity and genealogy remain unchanged.</p>
          <label className="block"><span className="text-xs font-medium uppercase tracking-wide text-slate-600">Stock line</span>
            <select value={transferTarget} onChange={(event) => setTransferTarget(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
              <option value="">Select stock…</option>
              <optgroup label="Intermediate stock">{transferItems.intermediate.map((lot) => <option key={`intermediate|${lot.id}`} value={`intermediate|${lot.id}`}>{lot.productName} · {formatQuantity(lot.currentQuantity)} {lot.uom} · {lot.storageLocation}</option>)}</optgroup>
              <optgroup label="Finished stock">{transferItems.finished.map((stock) => <option key={`finished|${stock.id}`} value={`finished|${stock.id}`}>{stock.productName} · {formatQuantity(stock.totalPackets || 0)} packets · {stock.storageLocation}</option>)}</optgroup>
            </select>
          </label>
          {selectedTransferLabel && <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">Selected: <strong>{selectedTransferLabel}</strong></div>}
          <label className="block"><span className="text-xs font-medium uppercase tracking-wide text-slate-600">Move to</span>
            <select value={transferDestination} onChange={(event) => setTransferDestination(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"><option value="">Select destination…</option>{locations.map((location) => <option key={location} value={location}>{location}</option>)}</select>
          </label>
          <div className="flex gap-2 pt-2"><button type="button" onClick={handleTransfer} className="flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700">Save transfer</button><button type="button" onClick={() => setShowTransferModal(false)} className="rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-200">Cancel</button></div>
        </div>
      </Modal>
    </div>
  );
}
