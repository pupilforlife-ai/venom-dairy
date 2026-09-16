import {
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Scale,
  Droplets,
  Plus,
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
} from 'recharts';
import { wasteEvents, yieldTrends } from '../data/mockData';

const wasteByReason = [
  { reason: 'Texture defect', kg: 8.5, color: '#ef4444' },
  { reason: 'Spillage', kg: 15, color: '#f59e0b' },
  { reason: 'Cutting loss', kg: 4.2, color: '#6366f1' },
  { reason: 'Over-press', kg: 3.1, color: '#10b981' },
  { reason: 'Contamination', kg: 1.5, color: '#ec4899' },
];

const weeklyWaste = [
  { week: 'W20', waste: 18.2, target: 15 },
  { week: 'W21', waste: 14.5, target: 15 },
  { week: 'W22', waste: 12.8, target: 15 },
  { week: 'W23', waste: 16.1, target: 15 },
  { week: 'W24', waste: 11.3, target: 15 },
];

export default function WasteAndYield() {
  const totalWaste = wasteEvents.reduce((s, w) => s + w.quantity, 0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Waste & Yield</h2>
          <p className="text-sm text-slate-500 mt-0.5">Track waste events and production yield</p>
        </div>
        <button className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors">
          <Plus className="w-4 h-4" />
          Log Waste
        </button>
      </div>

      {/* Summary metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 text-slate-500 mb-1">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <span className="text-xs font-medium uppercase tracking-wide">Today's Waste</span>
          </div>
          <p className="text-2xl font-bold text-red-600">{totalWaste.toFixed(1)}</p>
          <p className="text-xs text-slate-400">kg total</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 text-slate-500 mb-1">
            <Scale className="w-4 h-4 text-emerald-500" />
            <span className="text-xs font-medium uppercase tracking-wide">Paneer Yield</span>
          </div>
          <p className="text-2xl font-bold text-emerald-600">14.4%</p>
          <p className="text-xs text-slate-400">kg per 100L</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 text-slate-500 mb-1">
            <Droplets className="w-4 h-4 text-blue-500" />
            <span className="text-xs font-medium uppercase tracking-wide">Ghee Yield</span>
          </div>
          <p className="text-2xl font-bold text-blue-600">70.0%</p>
          <p className="text-xs text-slate-400">actual vs 70% target</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 text-slate-500 mb-1">
            <TrendingDown className="w-4 h-4 text-amber-500" />
            <span className="text-xs font-medium uppercase tracking-wide">Waste Trend</span>
          </div>
          <p className="text-2xl font-bold text-amber-600">-15%</p>
          <p className="text-xs text-slate-400">vs last week</p>
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
                <Pie
                  data={wasteByReason}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={70}
                  dataKey="kg"
                  nameKey="reason"
                >
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
                  <span className="text-xs font-medium text-slate-900">{item.kg} kg</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Weekly waste trend */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Weekly Waste Trend (kg)</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={weeklyWaste}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="week" tick={{ fontSize: 12 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" />
              <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
              <Bar dataKey="waste" fill="#ef4444" radius={[4, 4, 0, 0]} name="Actual Waste" />
              <Bar dataKey="target" fill="#e2e8f0" radius={[4, 4, 0, 0]} name="Target" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Waste events table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900">Recent Waste Events</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Date</th>
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Product</th>
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Quantity</th>
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Reason</th>
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Recorded By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {wasteEvents.map((event) => (
                <tr key={event.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 text-slate-600">{event.date}</td>
                  <td className="px-4 py-2.5 font-medium text-slate-900">{event.product}</td>
                  <td className="px-4 py-2.5 text-slate-700">{event.quantity} {event.unit}</td>
                  <td className="px-4 py-2.5">
                    <span className="px-2 py-0.5 bg-red-50 text-red-700 rounded text-xs font-medium">
                      {event.reason}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">{event.recordedBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Yield comparison */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">Yield: Actual vs Target</h3>
        <div className="space-y-3">
          {yieldTrends.map((y) => (
            <div key={y.week} className="flex items-center gap-3">
              <span className="text-sm font-medium text-slate-700 w-12">{y.week}</span>
              <div className="flex-1 flex items-center gap-2">
                <div className="flex-1 bg-slate-100 rounded-full h-3 relative overflow-hidden">
                  <div
                    className={`h-full rounded-full ${y.actual >= y.target ? 'bg-emerald-500' : 'bg-amber-500'}`}
                    style={{ width: `${(y.actual / 16) * 100}%` }}
                  />
                </div>
                <span className="text-sm font-medium text-slate-900 w-12 text-right">{y.actual}%</span>
              </div>
              <span className="text-xs text-slate-400 w-16 text-right">
                {y.actual >= y.target ? (
                  <span className="text-emerald-600">+{(y.actual - y.target).toFixed(1)}</span>
                ) : (
                  <span className="text-red-600">{(y.actual - y.target).toFixed(1)}</span>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
