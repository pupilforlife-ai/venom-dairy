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
import { milkLots } from '../data/mockData';

export default function MilkReceiving() {
  const [selectedLot, setSelectedLot] = useState(milkLots[0].id);
  const activeLot = milkLots.find((l) => l.id === selectedLot);

  // Vessel allocations matching PRODUCT_SPEC.md Section 7
  // 10,000L silo, 3,000L BMC #1, 3,000L BMC #2, 2,500L holding tank, ~2,000L direct production, IBCs
  const allocations = activeLot?.lotCode === '160626' ? [
    { destination: 'Silo (10,000L)', capacity: 10000, litres: 8500, percentage: 34 },
    { destination: 'BMC #1 (3,000L)', capacity: 3000, litres: 3000, percentage: 12 },
    { destination: 'BMC #2 (3,000L)', capacity: 3000, litres: 3000, percentage: 12 },
    { destination: 'Holding Tank (2,500L)', capacity: 2500, litres: 2500, percentage: 10 },
    { destination: 'Direct to Production', capacity: null, litres: 2000, percentage: 8 },
    { destination: 'IBC Storage (×6)', capacity: 6000, litres: 5880, percentage: 24 },
  ] : [
    { destination: 'Silo (10,000L)', capacity: 10000, litres: 9000, percentage: 38 },
    { destination: 'BMC #1 (3,000L)', capacity: 3000, litres: 3000, percentage: 13 },
    { destination: 'BMC #2 (3,000L)', capacity: 3000, litres: 3000, percentage: 13 },
    { destination: 'Holding Tank (2,500L)', capacity: 2500, litres: 2500, percentage: 10 },
    { destination: 'Direct to Production', capacity: null, litres: 2000, percentage: 8 },
    { destination: 'IBC Storage (×5)', capacity: 5000, litres: 4300, percentage: 18 },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Milk Receiving & Source Lots</h2>
          <p className="text-sm text-slate-500 mt-0.5">Track milk intake, vessel allocation, and consumption</p>
        </div>
        <button className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors">
          <Plus className="w-4 h-4" />
          New Receipt
        </button>
      </div>

      {/* Lot selector */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {milkLots.map((lot) => (
          <button
            key={lot.id}
            onClick={() => setSelectedLot(lot.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium whitespace-nowrap transition-colors ${
              selectedLot === lot.id
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
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
                className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full transition-all flex items-center justify-end pr-2"
                style={{ width: `${(activeLot.litresConsumed / activeLot.litresReceived) * 100}%` }}
              >
                <span className="text-[10px] font-bold text-white">
                  {((activeLot.litresConsumed / activeLot.litresReceived) * 100).toFixed(0)}%
                </span>
              </div>
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
              {allocations.map((alloc) => (
                <div key={alloc.destination} className="flex items-center gap-3">
                  <span className="text-sm text-slate-700 w-44 shrink-0">{alloc.destination}</span>
                  <div className="flex-1 bg-slate-100 rounded-full h-3 relative overflow-hidden">
                    <div
                      className="bg-blue-500 h-3 rounded-full"
                      style={{ width: `${(alloc.litres / (alloc.capacity || activeLot.litresReceived)) * 100}%` }}
                    />
                    {alloc.capacity && (
                      <div
                        className="absolute top-0 right-0 h-full w-px bg-red-300"
                        style={{ left: `${100}%` }}
                        title={`Capacity: ${alloc.capacity}L`}
                      />
                    )}
                  </div>
                  <span className="text-sm font-medium text-slate-900 w-20 text-right">
                    {alloc.litres.toLocaleString()}L
                  </span>
                  <span className="text-xs text-slate-400 w-10 text-right">{alloc.percentage}%</span>
                </div>
              ))}
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
                          lot.status === 'completed' ? 'bg-slate-100 text-slate-600' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {lot.status === 'active' ? <CheckCircle2 className="w-3 h-3" /> : 
                           lot.status === 'completed' ? <CheckCircle2 className="w-3 h-3" /> :
                           <XCircle className="w-3 h-3" />}
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
    </div>
  );
}
