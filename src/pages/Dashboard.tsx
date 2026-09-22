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
import { useApp } from '../store/AppContext';
import { statusLabels } from '../data/mockData';

type DashboardMetric = {
  label: string;
  value: number | string;
  unit: string;
  trend: 'up' | 'down' | 'stable';
  trendValue: string;
  color: string;
};

function MetricCard({ metric }: { metric: DashboardMetric }) {
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
          <span>{metric.trendValue}</span>
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const {
    productionRounds,
    temperatureReadings,
    milkLots,
    finishedStock,
    intermediateLots,
    wasteEvents,
  } = useApp();
  
  const activeMilkLot = milkLots.find((m) => m.status === 'active') ?? milkLots[0];
  const activeLotCode = activeMilkLot?.lotCode;
  const activeLotRounds = productionRounds.filter((r) => r.milkLotCode === activeLotCode);
  const activeRounds = activeLotRounds.filter((r) => r.status !== 'handed_over');
  const outOfRangeTemps = temperatureReadings.filter((t) => !t.inRange);
  const awaitingHandover = finishedStock.filter((f) => f.status === 'awaiting_handover');
  const totalCases = awaitingHandover.reduce((s, f) => s + f.cases, 0);
  const totalOutput = activeLotRounds.reduce((s, r) => s + r.outputWeight, 0);
  const paneerRounds = activeLotRounds.filter((r) => r.type === 'D' || r.type === 'C/S');
  const paneerOutput = paneerRounds.reduce((s, r) => s + r.outputWeight, 0);
  const paneerInput = paneerRounds.reduce((s, r) => s + r.actualInput, 0);
  const paneerYield = paneerInput > 0 ? (paneerOutput / paneerInput) * 100 : 0;
  const totalWaste = wasteEvents.reduce((s, event) => s + event.quantity, 0);
  const frozenStock = intermediateLots
    .filter((lot) => lot.status !== 'consumed' && /frozen/i.test(lot.productName))
    .reduce((s, lot) => s + lot.currentQuantity, 0);
  const unexplainedMilk = activeMilkLot
    ? activeMilkLot.litresReceived - activeMilkLot.litresConsumed - activeMilkLot.litresRemaining
      - activeMilkLot.litresRejected - activeMilkLot.litresSpilled - (activeMilkLot.litresSold ?? 0)
    : 0;
  const metrics: DashboardMetric[] = [
    { label: 'Milk Remaining', value: activeMilkLot?.litresRemaining ?? 0, unit: 'L', trend: 'down', trendValue: activeMilkLot ? `${Math.round((activeMilkLot.litresConsumed / activeMilkLot.litresReceived) * 100)}% consumed` : 'No active lot', color: 'blue' },
    { label: 'Current Lot Output', value: totalOutput.toFixed(1), unit: 'kg', trend: 'up', trendValue: `${activeLotRounds.filter((r) => r.outputWeight > 0).length} completed rounds`, color: 'emerald' },
    { label: 'Paneer Yield', value: paneerYield.toFixed(1), unit: '%', trend: 'stable', trendValue: paneerInput > 0 ? 'Calculated from rounds' : 'No paneer input recorded', color: 'teal' },
    { label: 'Frozen Stock', value: frozenStock.toFixed(1), unit: 'kg', trend: 'up', trendValue: 'Available intermediate stock', color: 'indigo' },
    { label: 'Recorded Waste', value: totalWaste.toFixed(1), unit: 'kg/L', trend: 'down', trendValue: `${wasteEvents.length} recorded events`, color: 'red' },
    { label: 'Cases Ready', value: totalCases, unit: 'cases', trend: 'up', trendValue: 'Awaiting handover', color: 'purple' },
    { label: 'Cold Chain', value: `${temperatureReadings.filter((t) => t.inRange).length}/${temperatureReadings.length}`, unit: 'OK', trend: 'stable', trendValue: `${outOfRangeTemps.length} excursion(s)`, color: 'amber' },
    { label: 'Weekly Fuel Cost', value: '—', unit: '', trend: 'stable', trendValue: 'Available after Utilities data is complete', color: 'orange' },
  ];
  const weeklyProduction = activeLotRounds.reduce<Record<string, { day: string; paneer: number; halloumi: number; butter: number; poppers: number }>>((days, round) => {
    const day = new Date(round.startTime).toLocaleDateString('en-US', { weekday: 'short' });
    const entry = days[day] ?? { day, paneer: 0, halloumi: 0, butter: 0, poppers: 0 };
    if (round.type === 'D' || round.type === 'C/S') entry.paneer += round.outputWeight;
    if (round.type === 'Halloumi') entry.halloumi += round.outputWeight;
    if (round.type === 'Butter' || round.type === 'Ghee') entry.butter += round.outputWeight;
    days[day] = entry;
    return days;
  }, {});
  const weeklyProductionData = Object.values(weeklyProduction);

  return (
    <div className="space-y-6">
      {/* Metric tiles — management priorities */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {metrics.map((metric, i) => (
          <MetricCard key={i} metric={metric} />
        ))}
      </div>

      {/* Quick status row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Milk lot progress */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Milk className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-semibold text-slate-900">Milk Lot {activeMilkLot?.lotCode}</h3>
          </div>
          {activeMilkLot && (
            <div>
              <div className="flex justify-between text-xs text-slate-500 mb-1">
                <span>{activeMilkLot.litresConsumed.toLocaleString()}L consumed</span>
                <span>{activeMilkLot.litresRemaining.toLocaleString()}L remaining</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2.5">
                <div
                  className="bg-blue-500 h-2.5 rounded-full transition-all"
                  style={{ width: `${(activeMilkLot.litresConsumed / activeMilkLot.litresReceived) * 100}%` }}
                />
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                <div>
                  <p className="text-xs text-slate-400">Received</p>
                  <p className="text-sm font-bold text-slate-900">{activeMilkLot.litresReceived.toLocaleString()}L</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Spilled</p>
                  <p className="text-sm font-bold text-red-600">{activeMilkLot.litresSpilled}L</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Unexplained</p>
                    <p className="text-sm font-bold text-amber-600">{unexplainedMilk.toLocaleString()}L</p>
                </div>
              </div>
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
                  <p className="text-xs font-medium text-red-700">Temperature Excursion</p>
                  <p className="text-xs text-red-600">{outOfRangeTemps[0].location}: {outOfRangeTemps[0].temperature}°C (target {outOfRangeTemps[0].targetMin}–{outOfRangeTemps[0].targetMax}°C)</p>
                </div>
              </div>
            )}
            <div className="flex items-start gap-2 p-2 bg-amber-50 rounded-lg">
              <ClipboardList className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-medium text-amber-700">{activeRounds.filter(r => !['handed_over', 'packed'].includes(r.status)).length} rounds in production</p>
                <p className="text-xs text-amber-600">{activeRounds.filter((r) => r.status === 'pressing').length} pressing, {activeRounds.filter((r) => r.status === 'in_production').length} in production, {activeRounds.filter((r) => r.status === 'scheduled').length} scheduled</p>
              </div>
            </div>
            <div className="flex items-start gap-2 p-2 bg-blue-50 rounded-lg">
              <Package className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-medium text-blue-700">{totalCases} cases awaiting handover</p>
                <p className="text-xs text-blue-600">{awaitingHandover.map((item) => item.sku).join(', ') || 'None'}</p>
              </div>
            </div>
            <div className="flex items-start gap-2 p-2 bg-emerald-50 rounded-lg">
              <Snowflake className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-medium text-emerald-700">{frozenStock.toFixed(1)} kg frozen intermediate stock</p>
                <p className="text-xs text-emerald-600">Awaiting downstream packing</p>
              </div>
            </div>
          </div>
        </div>

        {/* Quick stats */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-semibold text-slate-900">This Week's Output</h3>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-500">Malai Paneer (D)</span>
              <span className="text-sm font-bold text-slate-900">{activeLotRounds.filter((r) => r.type === 'D').reduce((s, r) => s + r.outputWeight, 0).toFixed(1)} kg</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-500">Rozana Paneer (C/S)</span>
              <span className="text-sm font-bold text-slate-900">{activeLotRounds.filter((r) => r.type === 'C/S').reduce((s, r) => s + r.outputWeight, 0).toFixed(1)} kg</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-500">Halloumi</span>
              <span className="text-sm font-bold text-slate-900">{activeLotRounds.filter((r) => r.type === 'Halloumi').reduce((s, r) => s + r.outputWeight, 0).toFixed(1)} kg</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-500">Recovered Cream</span>
              <span className="text-sm font-bold text-slate-900">{activeLotRounds.reduce((s, r) => s + (r.creamRecovered ?? 0), 0).toFixed(1)} kg</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-500">PAN111 (Recovered)</span>
              <span className="text-sm font-bold text-slate-900">{intermediateLots.filter((lot) => lot.productId === 'pan111').reduce((s, lot) => s + lot.currentQuantity, 0).toFixed(1)} kg</span>
            </div>
            <div className="border-t border-slate-100 pt-2 flex justify-between items-center">
              <span className="text-xs font-medium text-slate-700">Total Yield (Paneer)</span>
              <span className="text-sm font-bold text-emerald-600">{paneerYield.toFixed(1)}%</span>
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
            <BarChart data={weeklyProductionData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="day" tick={{ fontSize: 12 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" />
              <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Bar dataKey="paneer" fill="#10b981" radius={[2, 2, 0, 0]} name="Paneer" />
              <Bar dataKey="halloumi" fill="#6366f1" radius={[2, 2, 0, 0]} name="Halloumi" />
              <Bar dataKey="butter" fill="#f59e0b" radius={[2, 2, 0, 0]} name="Butter" />
              <Bar dataKey="poppers" fill="#ec4899" radius={[2, 2, 0, 0]} name="Poppers" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Yield trend */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Paneer Yield Trend (kg/100L)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={[{ week: activeLotCode ?? 'Current', malai: paneerYield, rozana: paneerYield, target: 14.5 }]}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="week" tick={{ fontSize: 12 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" domain={[12.5, 15.5]} />
              <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Line type="monotone" dataKey="malai" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} name="Malai (D)" />
              <Line type="monotone" dataKey="rozana" stroke="#6366f1" strokeWidth={2} dot={{ r: 4 }} name="Rozana (C/S)" />
              <Line type="monotone" dataKey="target" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" dot={false} name="Target" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Active rounds table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Active Rounds — Milk Lot {activeLotCode ?? '—'}</h3>
          <span className="text-xs text-slate-500">{activeRounds.length} rounds</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Batch ID</th>
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
                  <td className="px-4 py-2.5">
                    <span className="font-mono text-xs font-medium text-slate-900">
                      {round.milkLotCode}/S{round.shiftNumber}/R{round.roundNumber}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-xs font-bold">
                      {round.type}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      round.status === 'handed_over' ? 'bg-emerald-100 text-emerald-700' :
                      round.status === 'in_production' ? 'bg-blue-100 text-blue-700' :
                      round.status === 'pressing' ? 'bg-purple-100 text-purple-700' :
                      'bg-slate-100 text-slate-600'
                    }`}>
                      {statusLabels[round.status]}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{round.actualInput || '—'}</td>
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
