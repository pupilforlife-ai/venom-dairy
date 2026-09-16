import {
  Truck,
  Package,
  CheckCircle2,
  Clock,
  AlertCircle,
  Plus,
  ArrowRight,
} from 'lucide-react';
import { finishedStock } from '../data/mockData';

export default function Handover() {
  const awaiting = finishedStock.filter((f) => f.status === 'awaiting_handover');
  const handedOver = finishedStock.filter((f) => f.status === 'handed_over');

  const totalCases = awaiting.reduce((s, f) => s + f.cases, 0);
  const totalLoose = awaiting.reduce((s, f) => s + f.loosePackets, 0);
  const totalPackets = awaiting.reduce((s, f) => s + f.totalPackets, 0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Distribution Handover</h2>
          <p className="text-sm text-slate-500 mt-0.5">Manage finished stock handover to distribution</p>
        </div>
        <button className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors">
          <Plus className="w-4 h-4" />
          New Handover
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
          <Clock className="w-5 h-5 text-amber-600 mx-auto mb-1" />
          <p className="text-2xl font-bold text-amber-700">{awaiting.length}</p>
          <p className="text-xs text-amber-600">Awaiting Handover</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
          <Package className="w-5 h-5 text-slate-600 mx-auto mb-1" />
          <p className="text-2xl font-bold text-slate-900">{totalCases}</p>
          <p className="text-xs text-slate-500">Total Cases</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
          <Package className="w-5 h-5 text-slate-600 mx-auto mb-1" />
          <p className="text-2xl font-bold text-slate-900">{totalLoose}</p>
          <p className="text-xs text-slate-500">Loose Packets</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 mx-auto mb-1" />
          <p className="text-2xl font-bold text-emerald-700">{totalPackets}</p>
          <p className="text-xs text-emerald-600">Total Packets</p>
        </div>
      </div>

      {/* Awaiting handover */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Awaiting Handover</h3>
          <span className="text-xs text-slate-500">{awaiting.length} items</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Select</th>
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">SKU</th>
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Product</th>
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Cases</th>
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Loose</th>
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Total</th>
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Location</th>
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Ready Since</th>
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {awaiting.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
                  </td>
                  <td className="px-4 py-3">
                    <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-700 font-medium">
                      {item.sku}
                    </code>
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900">{item.productName}</td>
                  <td className="px-4 py-3 text-slate-700 font-medium">{item.cases}</td>
                  <td className="px-4 py-3 text-slate-700">{item.loosePackets}</td>
                  <td className="px-4 py-3 text-slate-900 font-bold">{item.totalPackets}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{item.location}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{item.createdAt.split('T')[0]}</td>
                  <td className="px-4 py-3">
                    <button className="flex items-center gap-1 px-2 py-1 bg-emerald-50 text-emerald-700 rounded text-xs font-medium hover:bg-emerald-100 transition-colors">
                      Confirm
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent handovers */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900">Recent Handovers</h3>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-3 p-3 bg-emerald-50 rounded-lg">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-emerald-900">Handover #H-2026-042</p>
              <p className="text-xs text-emerald-700">37 cases + 6 loose SPP packets → Distribution confirmed</p>
            </div>
            <span className="text-xs text-emerald-600">Jun 16, 14:30</span>
          </div>
          <div className="flex items-center gap-3 p-3 bg-emerald-50 rounded-lg">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-emerald-900">Handover #H-2026-041</p>
              <p className="text-xs text-emerald-700">22 cases + 3 loose Paneer D 400g → Distribution confirmed</p>
            </div>
            <span className="text-xs text-emerald-600">Jun 16, 11:00</span>
          </div>
          <div className="flex items-center gap-3 p-3 bg-red-50 rounded-lg">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-900">Return #R-2026-005</p>
              <p className="text-xs text-red-700">2 cases damaged in transit → Quarantined for inspection</p>
            </div>
            <span className="text-xs text-red-600">Jun 15, 16:45</span>
          </div>
        </div>
      </div>
    </div>
  );
}
