import {
  TrendingUp,
  TrendingDown,
  Minus,
  Milk,
  ClipboardList,
  Snowflake,
  Package,
  AlertTriangle,
  BarChart3,
  Thermometer,
  CheckCircle2,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
} from 'recharts';
import {
  dashboardMetrics,
  weeklyProduction,
  yieldTrends,
  productionRounds,
  temperatureReadings,
  milkLots,
  finishedStock,
} from '../data/mockData';

function MetricCard({ metric }: { metric: typeof dashboardMetrics[0] }) {
  const colorMap: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    orange: 'bg-orange-50 text-orange-700 border-orange-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    teal: 'bg-teal-50 text-teal-700 border-teal-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
  };

  const TrendIcon = metric.trend === 'up' ? TrendingUp : metric.trend === 'down' ? TrendingDown : Minus;

  return (
    <div className={`rounded-xl border p-4 ${colorMap[metric.color] || 'bg-slate-50 text-slate-700 border-slate-200'}`}>
      <p className="text-xs font-medium opacity-75 uppercase tracking-wide">{metric.label}</p>
      <div className="flex items-end gap-2 mt-1.5">
        <span className="text-2xl font-bold">{metric.value}</span>
        {metric.unit && <span className="text-sm font-medium opacity-70 mb-0.5">{metric.unit}</span>}
      </div>
      {metric.trendValue && (
        <div className="flex items-center gap-1 mt-2 text-xs font-medium">
          <TrendIcon className="w-3 h-3" />
          <span>{metric.trendValue} vs yesterday</span>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    in_progress: 'bg-blue-100 text-blue-700',
    pressed: 'bg-purple-100 text-purple-700',
    cutting: 'bg-amber-100 text-amber-700',
    frozen: 'bg-indigo-100 text-indigo-700',
    packing: 'bg-orange-100 text-orange-700',
    completed: 'bg-emerald-100 text-emerald-700',
  };

  const labels: Record<string, string> = {
    in_progress: 'In Progress',
    pressed: 'Pressed',
    cutting: 'Cutting',
    frozen: 'Frozen',
    packing: 'Packing',
    completed: 'Completed',
  };

  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${styles[status] || 'bg-slate-100 text-slate-600'}`}>
      {labels[status] || status}
    </span>
  );
}

export default function Dashboard() {
  const activeRounds = productionRounds.filter((r) => r.status !== 'completed');
  const outOfRangeTemps = temperatureReadings.filter((t) => !t.inRange);
  const activeMilkLot = milkLots.find((m) => m.status === 'active');
  const awaitingHandover = finishedStock.filter((f) => f.status === 'awaiting_handover');

  return (
    <div className="space-y-6">
      {/* Metric tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {dashboardMetrics.map((metric, i) => (
          <MetricCard key={i} metric={metric} />
        ))}
      </div>

      {/* Quick status row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Milk lot progress */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Milk className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-semibold text-slate-900">Milk Lot Progress</h3>
          </div>
          {activeMilkLot && (
            <div>
              <div className="flex justify-between text-xs text-slate-500 mb-1">
                <span>{activeMilkLot.litresConsumed}L consumed</span>
                <span>{activeMilkLot.litresRemaining}L remaining</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2.5">
                <div
                  className="bg-blue-500 h-2.5 rounded-full transition-all"
                  style={{ width: `${(activeMilkLot.litresConsumed / activeMilkLot.litresReceived) * 100}%` }}
                />
              </div>
              <p className="text-xs text-slate-500 mt-2">
                {activeMilkLot.lotCode} • {activeMilkLot.supplier}
              </p>
            </div>
          )}
        </div>

        {/* Alerts */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <h3 className="text-sm font-semibold text-slate-900">Active Alerts</h3>
          </div>
          <div className="space-y-2">
            {outOfRangeTemps.length > 0 && (
              <div className="flex items-start gap-2 p-2 bg-red-50 rounded-lg">
                <Thermometer className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-medium text-red-700">Temperature Out of Range</p>
                  <p className="text-xs text-red-600">{outOfRangeTemps[0].location}: {outOfRangeTemps[0].temperature}°C</p>
                </div>
              </div>
            )}
            {activeRounds.length > 0 && (
              <div className="flex items-start gap-2 p-2 bg-amber-50 rounded-lg">
                <ClipboardList className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-medium text-amber-700">{activeRounds.length} rounds in progress</p>
                  <p className="text-xs text-amber-600">Awaiting cutting/packing</p>
                </div>
              </div>
            )}
            {awaitingHandover.length > 0 && (
              <div className="flex items-start gap-2 p-2 bg-blue-50 rounded-lg">
                <Package className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-medium text-blue-700">{awaitingHandover.length} orders awaiting handover</p>
                  <p className="text-xs text-blue-600">Ready for distribution</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Quick stats */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-semibold text-slate-900">Today's Summary</h3>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-500">Rounds completed</span>
              <span className="text-sm font-bold text-slate-900">
                {productionRounds.filter((r) => r.status === 'completed').length}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-500">Total output</span>
              <span className="text-sm font-bold text-slate-900">
                {productionRounds.reduce((sum, r) => sum + r.outputWeight, 0)} kg
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-500">Temp readings</span>
              <div className="flex items-center gap-1">
                <span className="text-sm font-bold text-slate-900">
                  {temperatureReadings.length - outOfRangeTemps.length}/{temperatureReadings.length}
                </span>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              </div>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-500">Frozen stock</span>
              <span className="text-sm font-bold text-slate-900">
                <Snowflake className="w-3.5 h-3.5 inline text-blue-500 mr-1" />
                {productionRounds.filter((r) => r.status === 'frozen').reduce((s, r) => s + (r.intermediateBalance || 0), 0)} kg
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Weekly production */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Weekly Production (kg)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={weeklyProduction}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="day" tick={{ fontSize: 12 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" />
              <Tooltip
                contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Bar dataKey="paneer" fill="#10b981" radius={[2, 2, 0, 0]} name="Paneer" />
              <Bar dataKey="halloumi" fill="#6366f1" radius={[2, 2, 0, 0]} name="Halloumi" />
              <Bar dataKey="butter" fill="#f59e0b" radius={[2, 2, 0, 0]} name="Butter" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Yield trend */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Paneer Yield Trend (L/kg)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={yieldTrends}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="week" tick={{ fontSize: 12 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" domain={[13, 15.5]} />
              <Tooltip
                contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Line type="monotone" dataKey="actual" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} name="Actual" />
              <Line type="monotone" dataKey="target" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" dot={false} name="Target" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Active rounds table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Active Production Rounds</h3>
          <span className="text-xs text-slate-500">{activeRounds.length} active</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Batch ID</th>
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Shift</th>
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Type</th>
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Status</th>
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Input (L)</th>
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Output (kg)</th>
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Team</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {activeRounds.map((round) => (
                <tr key={round.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-medium text-slate-900">
                    {round.milkLotCode}/S{round.shift}/R{round.roundNumber}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">Shift {round.shift}</td>
                  <td className="px-4 py-2.5">
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-xs font-medium">
                      {round.type}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={round.status} />
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{round.actualInput}</td>
                  <td className="px-4 py-2.5 text-slate-600">{round.outputWeight || '—'}</td>
                  <td className="px-4 py-2.5 text-slate-500 text-xs">{round.team.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
