import { useState } from 'react';
import {
  Filter,
  Plus,
  ChevronDown,
  Users,
  Weight,
  CheckCircle2,
  Circle,
  Lock,
} from 'lucide-react';
import { productionRounds, milkLots, statusFlow, statusLabels, statusColors } from '../data/mockData';

type FilterState = {
  milkLot: string;
  status: string;
  type: string;
  shift: string;
};

function StatusPipeline({ currentStatus }: { currentStatus: string }) {
  const currentIndex = statusFlow.indexOf(currentStatus as typeof statusFlow[number]);

  return (
    <div className="flex items-center gap-0.5" title={statusLabels[currentStatus]}>
      {statusFlow.map((step, i) => (
        <div key={step} className="flex items-center">
          <div
            className={`w-2 h-2 rounded-full ${
              i <= currentIndex ? statusColors[step] : 'bg-slate-200'
            }`}
            title={statusLabels[step]}
          />
          {i < statusFlow.length - 1 && (
            <div className={`w-1.5 h-0.5 ${i < currentIndex ? statusColors[step] : 'bg-slate-200'}`} />
          )}
        </div>
      ))}
    </div>
  );
}

export default function ProductionBoard() {
  const [filters, setFilters] = useState<FilterState>({
    milkLot: 'all',
    status: 'all',
    type: 'all',
    shift: 'all',
  });
  const [showFilters, setShowFilters] = useState(false);

  const filteredRounds = productionRounds.filter((round) => {
    if (filters.milkLot !== 'all' && round.milkLotId !== filters.milkLot) return false;
    if (filters.status !== 'all' && round.status !== filters.status) return false;
    if (filters.type !== 'all' && round.type !== filters.type) return false;
    if (filters.shift !== 'all' && round.shift !== parseInt(filters.shift)) return false;
    return true;
  });

  // Group by shift
  const groupedByShift = filteredRounds.reduce((acc, round) => {
    if (!acc[round.shift]) acc[round.shift] = [];
    acc[round.shift].push(round);
    return acc;
  }, {} as Record<number, typeof productionRounds>);

  const activeMilkLot = milkLots.find((m) => m.status === 'active');

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-slate-900">Digital Production Board</h2>
            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-medium rounded-full">
              LIVE
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            Milk Lot: <span className="font-medium text-slate-700">{activeMilkLot?.lotCode}</span> • {filteredRounds.length} rounds shown
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
              showFilters
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
          >
            <Filter className="w-4 h-4" />
            Filters
            <ChevronDown className={`w-3 h-3 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </button>
          <button className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors">
            <Plus className="w-4 h-4" />
            New Round
          </button>
        </div>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Milk Lot</label>
            <select
              value={filters.milkLot}
              onChange={(e) => setFilters({ ...filters, milkLot: e.target.value })}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
            >
              <option value="all">All Lots</option>
              {milkLots.map((lot) => (
                <option key={lot.id} value={lot.id}>{lot.lotCode}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Status</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
            >
              <option value="all">All Statuses</option>
              {statusFlow.map((s) => (
                <option key={s} value={s}>{statusLabels[s]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Type</label>
            <select
              value={filters.type}
              onChange={(e) => setFilters({ ...filters, type: e.target.value })}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
            >
              <option value="all">All Types</option>
              <option value="D">D (Malai / Full Fat)</option>
              <option value="C/S">C/S (Rozana / Medium Fat)</option>
              <option value="Halloumi">Halloumi</option>
              <option value="Butter">Butter</option>
              <option value="Ghee">Ghee</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Shift</label>
            <select
              value={filters.shift}
              onChange={(e) => setFilters({ ...filters, shift: e.target.value })}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
            >
              <option value="all">All Shifts</option>
              <option value="1">Shift 1 (Sun night)</option>
              <option value="2">Shift 2</option>
              <option value="3">Shift 3</option>
              <option value="4">Shift 4</option>
            </select>
          </div>
        </div>
      )}

      {/* Status legend */}
      <div className="bg-white rounded-xl border border-slate-200 p-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span className="font-medium text-slate-500 mr-2">Status Flow:</span>
          {statusFlow.map((step) => (
            <span key={step} className="flex items-center gap-1">
              <span className={`w-2 h-2 rounded-full ${statusColors[step]}`} />
              <span className="text-slate-600">{statusLabels[step]}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Production board grouped by shift */}
      <div className="space-y-4">
        {Object.entries(groupedByShift)
          .sort(([a], [b]) => parseInt(a) - parseInt(b))
          .map(([shift, rounds]) => (
            <div key={shift} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              {/* Shift header */}
              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-slate-900 text-white text-xs font-bold flex items-center justify-center">
                    {shift}
                  </span>
                  <span className="text-sm font-semibold text-slate-700">Shift {shift}</span>
                  <span className="text-xs text-slate-400">
                    Team: {rounds[0]?.team.join(', ')}
                  </span>
                </div>
                <span className="text-xs text-slate-500">
                  {rounds.length} round{rounds.length > 1 ? 's' : ''}
                </span>
              </div>

              {/* Rounds table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="px-4 py-2 text-left font-medium text-slate-500 text-xs uppercase tracking-wide w-40">Batch ID</th>
                      <th className="px-4 py-2 text-left font-medium text-slate-500 text-xs uppercase tracking-wide w-16">Type</th>
                      <th className="px-4 py-2 text-left font-medium text-slate-500 text-xs uppercase tracking-wide">Pipeline</th>
                      <th className="px-4 py-2 text-left font-medium text-slate-500 text-xs uppercase tracking-wide w-28">Status</th>
                      <th className="px-4 py-2 text-left font-medium text-slate-500 text-xs uppercase tracking-wide w-16">Input</th>
                      <th className="px-4 py-2 text-left font-medium text-slate-500 text-xs uppercase tracking-wide w-16">Output</th>
                      <th className="px-4 py-2 text-left font-medium text-slate-500 text-xs uppercase tracking-wide w-20">Balance</th>
                      <th className="px-4 py-2 text-left font-medium text-slate-500 text-xs uppercase tracking-wide w-24">Cut By</th>
                      <th className="px-4 py-2 text-left font-medium text-slate-500 text-xs uppercase tracking-wide w-28">Packing</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {rounds.map((round) => (
                      <tr key={round.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-mono text-xs font-bold text-slate-900">
                            {round.milkLotCode}/S{round.shift}/R{round.roundNumber}
                          </div>
                          {round.locked && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] text-slate-400">
                              <Lock className="w-2.5 h-2.5" /> Locked
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-xs font-bold">
                            {round.type}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <StatusPipeline currentStatus={round.status} />
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                            round.status === 'handed_over' ? 'bg-emerald-100 text-emerald-700' :
                            round.status === 'in_production' ? 'bg-blue-100 text-blue-700' :
                            round.status === 'pressing' ? 'bg-purple-100 text-purple-700' :
                            round.status === 'frozen' ? 'bg-indigo-100 text-indigo-700' :
                            round.status === 'packed' ? 'bg-teal-100 text-teal-700' :
                            'bg-slate-100 text-slate-600'
                          }`}>
                            {round.status === 'handed_over' || round.status === 'packed' ? (
                              <CheckCircle2 className="w-3 h-3" />
                            ) : (
                              <Circle className="w-3 h-3" />
                            )}
                            {statusLabels[round.status]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600 text-xs">
                          {round.actualInput > 0 ? `${round.actualInput}L` : '—'}
                        </td>
                        <td className="px-4 py-3 text-slate-600 text-xs">
                          {round.outputWeight > 0 ? `${round.outputWeight} kg` : '—'}
                        </td>
                        <td className="px-4 py-3">
                          {round.intermediateBalance !== undefined && round.intermediateBalance > 0 ? (
                            <span className="text-amber-700 font-medium text-xs">{round.intermediateBalance} kg</span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">
                          {round.cutBy || '—'}
                          {round.cuttingType && (
                            <div className="text-[10px] text-slate-400">{round.cuttingType}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">
                          {round.casesPacked !== undefined && round.casesPacked > 0 ? (
                            <div>
                              <span className="font-medium text-slate-700">{round.casesPacked} cases</span>
                              {round.loosePacked !== undefined && round.loosePacked > 0 && (
                                <span className="text-slate-500"> + {round.loosePacked} loose</span>
                              )}
                            </div>
                          ) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-3 text-center">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Total Input</p>
          <p className="text-xl font-bold text-slate-900 mt-1">
            {filteredRounds.reduce((s, r) => s + r.actualInput, 0).toLocaleString()} L
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-3 text-center">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Total Output</p>
          <p className="text-xl font-bold text-emerald-600 mt-1">
            {filteredRounds.reduce((s, r) => s + r.outputWeight, 0)} kg
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-3 text-center">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Intermediate Balance</p>
          <p className="text-xl font-bold text-amber-600 mt-1">
            {filteredRounds.reduce((s, r) => s + (r.intermediateBalance || 0), 0)} kg
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-3 text-center">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Avg Yield</p>
          <p className="text-xl font-bold text-indigo-600 mt-1">
            {(() => {
              const withOutput = filteredRounds.filter((r) => r.outputWeight > 0 && r.actualInput > 0);
              if (withOutput.length === 0) return '—';
              const avg = withOutput.reduce((s, r) => s + (r.outputWeight / r.actualInput) * 100, 0) / withOutput.length;
              return avg.toFixed(1) + '%';
            })()}
          </p>
        </div>
      </div>
    </div>
  );
}
