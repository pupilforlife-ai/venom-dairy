import {
  AlertTriangle,
  TrendingDown,
  Scale,
  Droplets,
  Plus,
  Info,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { wasteEvents, yieldTrends } from '../data/mockData';

const wasteByReason = [
  { reason: 'Texture defect', kg: 2.5, color: '#ef4444' },
  { reason: 'Spillage', kg: 120, color: '#f59e0b', unit: 'L' },
  { reason: 'Cutting loss', kg: 1.2, color: '#6366f1' },
  { reason: 'Rejected popper', kg: 0.8, color: '#ec4899' },
];

export default function WasteAndYield() {
  const totalWasteKg = wasteEvents.filter(w => w.unit === 'kg').reduce((s, w) => s + w.quantity, 0);
  const totalWasteL = wasteEvents.filter(w => w.unit === 'L').reduce((s, w) => s + w.quantity, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Waste & Yield</h2>
          <p className="text-sm text-slate-500 mt-0.5">Track waste events, recoverable intermediates, and production yield</p>
        </div>
        <button className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors">
          <Plus className="w-4 h-4" />
          Log Waste
        </button>
      </div>

      {/* Important note */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-start gap-2">
        <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <p className="text-xs text-blue-700">
          <strong>Note:</strong> PAN111 (recovered paneer) and recovered cream are <strong>not</strong> waste — they are intermediate materials tracked separately in Inventory.
        </p>
      </div>

      {/* Summary metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 text-slate-500 mb-1">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <span className="text-xs font-medium uppercase tracking-wide">Waste (Solid)</span>
          </div>
          <p className="text-2xl font-bold text-red-600">{totalWasteKg.toFixed(1)}</p>
          <p className="text-xs text-slate-400">kg this week</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 text-slate-500 mb-1">
            <Droplets className="w-4 h-4 text-amber-500" />
            <span className="text-xs font-medium uppercase tracking-wide">Waste (Liquid)</span>
          </div>
          <p className="text-2xl font-bold text-amber-600">{totalWasteL}</p>
          <p className="text-xs text-slate-400">L milk spilled</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 text-slate-500 mb-1">
            <Scale className="w-4 h-4 text-emerald-500" />
            <span className="text-xs font-medium uppercase tracking-wide">Malai Yield</span>
          </div>
          <p className="text-2xl font-bold text-emerald-600">14.4%</p>
          <p className="text-xs text-slate-400">kg per 100L (target: 14.5%)</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 text-slate-500 mb-1">
            <Scale className="w-4 h-4 text-indigo-500" />
            <span className="text-xs font-medium uppercase tracking-wide">Ghee Yield</span>
          </div>
          <p className="text-2xl font-bold text-indigo-600">70.0%</p>
          <p className="text-xs text-slate-400">actual vs 70% target</p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Waste by reason */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Waste by Reason (This Week)</h3>
          <div className="flex items-center gap-4">
            <ResponsiveContainer width="50%" height={180}>
              <PieChart>
                <Pie data={wasteByReason} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="kg" nameKey="reason">
                  {wasteByReason.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '12px' }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-2">
              {wasteByReason.map((item) => (
                <div key={item.reason} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-xs text-slate-600 flex-1">{item.reason}</span>
                  <span className="text-xs font-medium text-slate-900">{item.kg} {item.unit || 'kg'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Yield comparison */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Yield: Actual vs Target (kg/100L)</h3>
          <div className="space-y-3">
            {yieldTrends.map((y) => (
              <div key={y.week}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-slate-700">{y.week}</span>
                  <span className="text-xs text-slate-400">Target: {y.target}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-emerald-600 w-12">D: {y.malai}</span>
                  <div className="flex-1 bg-slate-100 rounded-full h-2 relative overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(y.malai / 16) * 100}%` }} />
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-indigo-600 w-12">C/S: {y.rozana}</span>
                  <div className="flex-1 bg-slate-100 rounded-full h-2 relative overflow-hidden">
                    <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${(y.rozana / 16) * 100}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Waste events table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900">Waste Events</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Date</th>
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Product</th>
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Batch</th>
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Quantity</th>
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Reason</th>
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {wasteEvents.map((event) => (
                <tr key={event.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 text-slate-600">{event.date}</td>
                  <td className="px-4 py-2.5 font-medium text-slate-900">{event.product}</td>
                  <td className="px-4 py-2.5">
                    {event.batchCode ? (
                      <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">{event.batchCode}</code>
                    ) : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-slate-700">{event.quantity} {event.unit}</td>
                  <td className="px-4 py-2.5">
                    <span className="px-2 py-0.5 bg-red-50 text-red-700 rounded text-xs font-medium">{event.reason}</span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">{event.recordedBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Ghee formula yield */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <h3 className="text-sm font-semibold text-slate-900 mb-3">Ghee Formula Yield Comparison</h3>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-xs text-slate-500">Formula Input</p>
            <p className="text-lg font-bold text-slate-900">105 kg</p>
            <p className="text-xs text-slate-400">92.5 kg butter + 12.5 kg AF oil</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Theoretical Output</p>
            <p className="text-lg font-bold text-emerald-600">73.5 kg</p>
            <p className="text-xs text-slate-400">~70% yield</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Variance</p>
            <p className="text-lg font-bold text-amber-600">±0%</p>
            <p className="text-xs text-slate-400">On target</p>
          </div>
        </div>
      </div>
    </div>
  );
}
