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
import { useState } from 'react';
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
import { getMilkLotAccounting, getRoundMilkInput, statusLabels } from '../data/mockData';
import { reconcileFinishedStock } from '../lib/finishedStock';
import { getPaneerRoundRemainingBalance, isPaneerIntermediateLot, reconcileFrozenRoundBalances } from '../lib/paneerBalance';
import { useSupabaseState } from '../hooks/useSupabaseState';
import { Modal } from '../components/Modal';

interface DashboardCrumbingBatch {
  id: string;
  status: string;
  type: string;
  createdAt: string;
  productionCompletedAt?: string;
  packedSkus?: Array<{ sku: string; cases: number; loose: number }>;
}

type DashboardMetric = {
  label: string;
  value: number | string;
  unit: string;
  trend: 'up' | 'down' | 'stable';
  trendValue: string;
  color: string;
};

function MetricCard({ metric, onClick }: { metric: DashboardMetric; onClick?: () => void }) {
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

  const content = (
    <>
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
    </>
  );

  const cardClass = `rounded-xl border p-4 text-left ${colorMap[metric.color] || 'bg-slate-50 text-slate-700 border-slate-200'}${onClick ? ' w-full cursor-pointer transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2' : ''}`;
  return onClick
    ? <button type="button" className={cardClass} onClick={onClick} aria-haspopup="dialog">{content}<span className="sr-only">Open freezer stock details</span></button>
    : <div className={cardClass}>{content}</div>;
}

export default function Dashboard() {
  const [showFrozenStockDetails, setShowFrozenStockDetails] = useState(false);
  const {
    productionRounds,
    temperatureReadings,
    milkLots,
    finishedStock,
    intermediateLots,
    wasteEvents,
  } = useApp();
  const [crumbingBatches] = useSupabaseState<DashboardCrumbingBatch[]>('vejoy_crumbingBatches', []);
  
  const activeMilkLot = [...milkLots]
    .sort((left, right) => new Date(`${right.receiptDate}T${right.receiptTime || '00:00'}`).getTime() - new Date(`${left.receiptDate}T${left.receiptTime || '00:00'}`).getTime())
    .find((lot) => lot.status === 'active') ?? [...milkLots]
      .sort((left, right) => new Date(`${right.receiptDate}T${right.receiptTime || '00:00'}`).getTime() - new Date(`${left.receiptDate}T${left.receiptTime || '00:00'}`).getTime())[0];
  const activeLotCode = activeMilkLot?.lotCode;
  const activeLotRounds = productionRounds.filter((r) => r.milkLotCode === activeLotCode || r.milkLotId === activeMilkLot?.id);
  const milkAccounting = activeMilkLot
    ? getMilkLotAccounting(activeMilkLot, productionRounds)
    : { consumed: 0, sold: 0, remaining: 0, overdraw: 0, rawRemaining: 0 };
  const activeRounds = activeLotRounds.filter((r) => !['handed_over', 'packed', 'frozen', 'cancelled', 'spoiled'].includes(r.status));
  const latestTemperatureReadings = [...temperatureReadings]
    .sort((left, right) => new Date(right.recordedAt).getTime() - new Date(left.recordedAt).getTime())
    .filter((reading, index, readings) => readings.findIndex(candidate => candidate.location === reading.location) === index);
  const outOfRangeTemps = latestTemperatureReadings.filter((t) => !t.inRange);
  const reconciledFinishedStock = reconcileFinishedStock(productionRounds, finishedStock);
  const awaitingHandover = reconciledFinishedStock.filter((stock) => stock.status === 'awaiting_handover');
  const totalCases = awaitingHandover.reduce((sum, stock) => sum + (stock.cases || 0), 0);
  const reconciledRoundIds = new Set(reconciledFinishedStock.map(stock => stock.sourceRoundId).filter(Boolean));
  const otherRoundCases = productionRounds
    .filter(round => !reconciledRoundIds.has(round.id) && !['handed_over', 'cancelled', 'spoiled'].includes(round.status))
    .reduce((sum, round) => sum + (round.packedSkus || []).reduce((packSum, pack) => packSum + Math.max(0, pack.cases || 0), 0), 0);
  const crumbingCases = crumbingBatches
    .filter(batch => batch.status === 'packed')
    .reduce((sum, batch) => sum + (batch.packedSkus || []).reduce((packSum, pack) => packSum + Math.max(0, pack.cases || 0), 0), 0);
  const readyHandoverSkus = [
    ...awaitingHandover.map((item) => item.sku),
    ...productionRounds
      .filter(round => !reconciledRoundIds.has(round.id) && !['handed_over', 'cancelled', 'spoiled'].includes(round.status))
      .flatMap(round => (round.packedSkus || []).map(pack => pack.sku)),
    ...crumbingBatches.filter(batch => batch.status === 'packed').flatMap(batch => (batch.packedSkus || []).map(pack => pack.sku)),
  ]
    .filter((sku, index, values) => values.indexOf(sku) === index);
  const totalOutput = activeLotRounds.reduce((s, r) => s + r.outputWeight, 0);
  const paneerRounds = activeLotRounds.filter((r) => r.type === 'D' || r.type === 'C/S');
  const paneerOutput = paneerRounds.reduce((s, r) => s + r.outputWeight, 0);
  const paneerInput = paneerRounds.reduce((s, r) => s + getRoundMilkInput(r), 0);
  const paneerYield = paneerInput > 0 ? (paneerOutput / paneerInput) * 100 : 0;
  const directRounds = paneerRounds.filter(round => round.type === 'D');
  const csRounds = paneerRounds.filter(round => round.type === 'C/S');
  const directInput = directRounds.reduce((sum, round) => sum + getRoundMilkInput(round), 0);
  const csInput = csRounds.reduce((sum, round) => sum + getRoundMilkInput(round), 0);
  const directYield = directInput > 0 ? (directRounds.reduce((sum, round) => sum + round.outputWeight, 0) / directInput) * 100 : 0;
  const csYield = csInput > 0 ? (csRounds.reduce((sum, round) => sum + round.outputWeight, 0) / csInput) * 100 : 0;
  const totalWasteKg = wasteEvents.filter(event => event.unit.toLowerCase() === 'kg').reduce((s, event) => s + event.quantity, 0);
  const totalWasteL = wasteEvents.filter(event => event.unit.toLowerCase() === 'l').reduce((s, event) => s + event.quantity, 0);
  const paneerIntermediateLots = intermediateLots.filter(isPaneerIntermediateLot);
  const paneerIntermediateSourceRoundIds = new Set(paneerIntermediateLots.map((lot) => lot.sourceBatchId));
  const frozenFreezerLots = paneerIntermediateLots
    .filter((lot) => lot.status !== 'consumed' && lot.currentQuantity > 0 && /freezer/i.test(lot.storageLocation));
  const recordedFrozenStock = frozenFreezerLots
    .reduce((s, lot) => s + lot.currentQuantity, 0);
  const legacyFrozenRounds = activeLotRounds
    .filter((round) =>
      (round.type === 'D' || round.type === 'C/S') &&
      (round.status === 'frozen' || round.status === 'cut') &&
      !paneerIntermediateSourceRoundIds.has(round.id)
    );
  const legacyFrozenRoundBalances = legacyFrozenRounds.map((round) => ({
    round,
    balanceKg: getPaneerRoundRemainingBalance(round) ?? 0,
  }));
  const legacyFrozenBalanceTotals = reconcileFrozenRoundBalances(
    legacyFrozenRoundBalances.map(({ balanceKg }) => balanceKg),
  );
  const legacyFrozenRoundStock = legacyFrozenBalanceTotals.netBalanceKg;
  const frozenStock = recordedFrozenStock + legacyFrozenRoundStock;
  const unexplainedMilk = activeMilkLot
    ? activeMilkLot.litresReceived - milkAccounting.consumed - milkAccounting.remaining
      - activeMilkLot.litresRejected - activeMilkLot.litresSpilled - milkAccounting.sold
    : 0;
  const metrics: DashboardMetric[] = [
    { label: 'Milk Remaining', value: milkAccounting.remaining, unit: 'L', trend: 'down', trendValue: activeMilkLot ? `${Math.round((milkAccounting.consumed / activeMilkLot.litresReceived) * 100)}% consumed` : 'No active lot', color: 'blue' },
    { label: 'Current Lot Output', value: totalOutput.toFixed(1), unit: 'kg', trend: 'up', trendValue: `${activeLotRounds.filter((r) => r.outputWeight > 0).length} completed rounds`, color: 'emerald' },
    { label: 'Paneer Yield', value: paneerYield.toFixed(1), unit: '%', trend: 'stable', trendValue: paneerInput > 0 ? 'Calculated from rounds' : 'No paneer input recorded', color: 'teal' },
    { label: 'Frozen Stock', value: frozenStock.toFixed(1), unit: 'kg', trend: 'up', trendValue: 'Available intermediate stock', color: 'indigo' },
    { label: 'Recorded Waste', value: `${totalWasteKg.toFixed(1)} / ${totalWasteL.toFixed(1)}`, unit: 'kg / L', trend: 'down', trendValue: `${wasteEvents.length} recorded events`, color: 'red' },
    { label: 'Cases Ready', value: totalCases + otherRoundCases + crumbingCases, unit: 'cases', trend: 'up', trendValue: 'Awaiting handover across all packed products', color: 'purple' },
    { label: 'Cold Chain', value: `${latestTemperatureReadings.filter((t) => t.inRange).length}/${latestTemperatureReadings.length}`, unit: 'OK', trend: 'stable', trendValue: `${outOfRangeTemps.length} current excursion(s)`, color: 'amber' },
    { label: 'Weekly Fuel Cost', value: '—', unit: '', trend: 'stable', trendValue: 'Available after Utilities data is complete', color: 'orange' },
  ];
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);
  const thisWeekRounds = productionRounds.filter(round => {
    const timestamp = new Date(round.startTime).getTime();
    return Number.isFinite(timestamp) && timestamp >= weekStart.getTime() && timestamp < weekEnd.getTime();
  });
  const weeklyProduction = thisWeekRounds.reduce<Record<string, { day: string; paneer: number; halloumi: number; butter: number; poppers: number }>>((days, round) => {
    const day = new Date(round.startTime).toLocaleDateString('en-US', { weekday: 'short' });
    const entry = days[day] ?? { day, paneer: 0, halloumi: 0, butter: 0, poppers: 0 };
    if (round.type === 'D' || round.type === 'C/S') entry.paneer += round.outputWeight;
    if (round.type === 'Halloumi') entry.halloumi += round.outputWeight;
    if (round.type === 'Butter' || round.type === 'Ghee') entry.butter += round.outputWeight;
    days[day] = entry;
    return days;
  }, {});
  crumbingBatches.forEach(batch => {
    if (!['packed', 'handed_over'].includes(batch.status)) return;
    const completedAt = new Date(batch.productionCompletedAt || batch.createdAt);
    if (!Number.isFinite(completedAt.getTime()) || completedAt < weekStart || completedAt >= weekEnd) return;
    const day = completedAt.toLocaleDateString('en-US', { weekday: 'short' });
    const entry = weeklyProduction[day] ?? { day, paneer: 0, halloumi: 0, butter: 0, poppers: 0 };
    entry.poppers += (batch.packedSkus || []).reduce((sum, pack) => sum + (pack.cases || 0) * 12 * 0.25 + (pack.loose || 0) * 0.25, 0);
    weeklyProduction[day] = entry;
  });
  const weeklyProductionData = Object.values(weeklyProduction);

  return (
    <div className="space-y-6">
      {/* Metric tiles — management priorities */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {metrics.map((metric, i) => (
          <MetricCard key={i} metric={metric} onClick={metric.label === 'Frozen Stock' ? () => setShowFrozenStockDetails(true) : undefined} />
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
                <span>{milkAccounting.consumed.toLocaleString()}L consumed</span>
                <span>{milkAccounting.remaining.toLocaleString()}L remaining</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2.5">
                <div
                  className="bg-blue-500 h-2.5 rounded-full transition-all"
                  style={{ width: `${Math.min(100, (milkAccounting.consumed / activeMilkLot.litresReceived) * 100)}%` }}
                />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-3 text-center">
                <div>
                  <p className="text-xs text-slate-400">Received</p>
                  <p className="text-sm font-bold text-slate-900">{activeMilkLot.litresReceived.toLocaleString()}L</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Consumed</p>
                  <p className="text-sm font-bold text-slate-900">{milkAccounting.consumed.toLocaleString()}L</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Rejected</p>
                  <p className="text-sm font-bold text-slate-700">{activeMilkLot.litresRejected.toLocaleString()}L</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Spilled</p>
                  <p className="text-sm font-bold text-red-600">{activeMilkLot.litresSpilled}L</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Sold</p>
                  <p className="text-sm font-bold text-slate-700">{milkAccounting.sold.toLocaleString()}L</p>
                </div>
              </div>
              <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                <div className="font-semibold">Remaining = Received − Consumed − Rejected − Spilled − Sold</div>
                <div className="mt-1 font-mono">{activeMilkLot.litresReceived.toLocaleString()} − {milkAccounting.consumed.toLocaleString()} − {activeMilkLot.litresRejected.toLocaleString()} − {activeMilkLot.litresSpilled.toLocaleString()} − {milkAccounting.sold.toLocaleString()} = {milkAccounting.remaining.toLocaleString()} L</div>
                {milkAccounting.overdraw > 0.01 && <div className="mt-1 font-semibold text-red-700">Overdraw: {milkAccounting.overdraw.toFixed(2)} L — review round inputs and waste records.</div>}
                {Math.abs(unexplainedMilk) > 0.01 && milkAccounting.overdraw <= 0.01 && <div className="mt-1 text-amber-700">Unexplained variance: {unexplainedMilk.toFixed(2)} L</div>}
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
                <p className="text-xs font-medium text-amber-700">{activeRounds.length} rounds in production</p>
                <p className="text-xs text-amber-600">{activeRounds.filter((r) => r.status === 'pressing').length} pressing, {activeRounds.filter((r) => r.status === 'in_production').length} in production, {activeRounds.filter((r) => r.status === 'scheduled').length} scheduled</p>
              </div>
            </div>
            <div className="flex items-start gap-2 p-2 bg-blue-50 rounded-lg">
              <Package className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-medium text-blue-700">{totalCases + otherRoundCases + crumbingCases} cases awaiting handover</p>
                <p className="text-xs text-blue-600">{readyHandoverSkus.join(', ') || 'None'}</p>
              </div>
            </div>
            <button type="button" onClick={() => setShowFrozenStockDetails(true)} aria-haspopup="dialog" className="flex w-full items-start gap-2 rounded-lg bg-emerald-50 p-2 text-left transition-colors hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
              <Snowflake className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-medium text-emerald-700">{frozenStock.toFixed(1)} kg frozen intermediate stock</p>
                <p className="text-xs text-emerald-600">View freezer stock details</p>
              </div>
            </button>
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
            <LineChart data={[{ week: activeLotCode ?? 'Current', malai: directYield, rozana: csYield, target: 14.5 }]}>
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

      <Modal isOpen={showFrozenStockDetails} onClose={() => setShowFrozenStockDetails(false)} title="Freezer stock details" size="lg">
        <div className="space-y-5">
          <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-semibold text-indigo-900">Recorded frozen stock</p>
              <p className="text-xl font-bold text-indigo-900">{frozenStock.toFixed(2)} kg</p>
            </div>
            <div className="mt-2 space-y-1 text-xs text-indigo-700">
              <p>{frozenFreezerLots.length} recorded freezer intermediate lot{frozenFreezerLots.length === 1 ? '' : 's'}: {recordedFrozenStock.toFixed(2)} kg.</p>
              {legacyFrozenRounds.length > 0 && <p>Unrepresented frozen/cut Paneer round pool: max(0, positive balances {legacyFrozenBalanceTotals.positiveBalanceKg.toFixed(2)} kg − overpacked stock {legacyFrozenBalanceTotals.overpackedKg.toFixed(2)} kg) = {legacyFrozenRoundStock.toFixed(2)} kg.</p>}
              <p>Total frozen stock: {recordedFrozenStock.toFixed(2)} kg + {legacyFrozenRoundStock.toFixed(2)} kg legacy pool = <strong>{frozenStock.toFixed(2)} kg</strong>. Consumed lots and non-freezer locations are excluded.</p>
            </div>
          </div>

          <section>
            <h4 className="mb-2 text-sm font-semibold text-slate-900">Intermediate freezer lots</h4>
            {frozenFreezerLots.length === 0 ? <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">No active intermediate lots are recorded in freezer locations.</p> : (
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full min-w-[620px] text-left text-xs">
                  <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-2">Product / lot</th><th className="px-3 py-2">Source</th><th className="px-3 py-2">Remaining</th><th className="px-3 py-2">Location</th><th className="px-3 py-2">Status</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {frozenFreezerLots.map(lot => <tr key={lot.id}>
                      <td className="px-3 py-2"><div className="font-medium text-slate-900">{lot.productName}</div><div className="font-mono text-[10px] text-slate-500">{lot.lotCode}</div></td>
                      <td className="px-3 py-2 text-slate-600">Milk {lot.sourceMilkLotCode} · S{lot.sourceShift}/R{lot.sourceRound}<div className="font-mono text-[10px] text-slate-400">{lot.sourceBatchCode}</div></td>
                      <td className="whitespace-nowrap px-3 py-2 font-semibold text-slate-900">{lot.currentQuantity.toFixed(2)} {lot.uom}</td>
                      <td className="px-3 py-2 text-slate-600">{lot.storageLocation}</td>
                      <td className="px-3 py-2 capitalize text-slate-600">{lot.status}</td>
                    </tr>)}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {legacyFrozenRounds.length > 0 && <section>
            <h4 className="mb-2 text-sm font-semibold text-slate-900">Frozen/cut Paneer rounds not represented by Paneer intermediate lots</h4>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-[460px] text-left text-xs">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-2">Round</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Remaining balance</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{legacyFrozenRoundBalances.map(({ round, balanceKg }) => <tr key={round.id}>
                  <td className="px-3 py-2 font-mono text-slate-700">{round.milkLotCode} · S{round.shiftNumber}/R{round.roundNumber}</td>
                  <td className="px-3 py-2 text-slate-600">{round.type}</td>
                  <td className={`px-3 py-2 font-semibold ${balanceKg < 0 ? 'text-rose-700' : 'text-slate-900'}`}>{balanceKg < 0 ? `Overpacked by ${Math.abs(balanceKg).toFixed(2)} kg` : `${balanceKg.toFixed(2)} kg available`}</td>
                </tr>)}</tbody>
              </table>
            </div>
          </section>}
        </div>
      </Modal>

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
