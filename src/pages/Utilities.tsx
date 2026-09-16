import { useState } from 'react';
import {
  Fuel,
  Zap,
  Flame,
  Plus,
  TrendingUp,
  DollarSign,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { useApp } from '../store/AppContext';
import { useToast } from '../components/Toast';
import { Modal } from '../components/Modal';

export default function Utilities() {
  const { utilityLogs, addUtilityLog } = useApp();
  const { showToast } = useToast();

  const [showLogModal, setShowLogModal] = useState(false);

  // New utility form
  const [newUtility, setNewUtility] = useState({
    type: 'diesel' as 'diesel' | 'paraffin' | 'gas' | 'electricity',
    periodStart: new Date().toISOString().split('T')[0],
    periodEnd: new Date().toISOString().split('T')[0],
    quantity: 0,
    uom: 'L',
    unitCost: 0,
    notes: '',
  });

  // Calculate totals
  const totalDiesel = utilityLogs.filter(u => u.type === 'diesel').reduce((s, u) => s + u.quantity, 0);
  const totalParaffin = utilityLogs.filter(u => u.type === 'paraffin').reduce((s, u) => s + u.quantity, 0);
  const totalGas = utilityLogs.filter(u => u.type === 'gas').reduce((s, u) => s + u.quantity, 0);
  const totalElectricity = utilityLogs.filter(u => u.type === 'electricity').reduce((s, u) => s + u.quantity, 0);
  const totalCost = utilityLogs.reduce((s, u) => s + (u.totalCost || 0), 0);

  // Chart data
  const chartData = [
    { name: 'Diesel', value: totalDiesel, color: '#f59e0b' },
    { name: 'Paraffin', value: totalParaffin, color: '#ef4444' },
    { name: 'Gas', value: totalGas, color: '#6366f1' },
    { name: 'Electricity', value: totalElectricity, color: '#10b981' },
  ];

  const handleLogUtility = () => {
    if (!newUtility.quantity || !newUtility.periodStart || !newUtility.periodEnd) {
      showToast('error', 'Please fill in all required fields');
      return;
    }

    const totalCost = newUtility.quantity * newUtility.unitCost;

    addUtilityLog({
      type: newUtility.type,
      periodStart: newUtility.periodStart,
      periodEnd: newUtility.periodEnd,
      quantity: newUtility.quantity,
      uom: newUtility.uom,
      unitCost: newUtility.unitCost,
      totalCost,
      notes: newUtility.notes || undefined,
    });

    showToast('success', `Logged ${newUtility.quantity} ${newUtility.uom} of ${newUtility.type}`);
    setShowLogModal(false);
    setNewUtility({
      type: 'diesel',
      periodStart: new Date().toISOString().split('T')[0],
      periodEnd: new Date().toISOString().split('T')[0],
      quantity: 0,
      uom: 'L',
      unitCost: 0,
      notes: '',
    });
  };

  // Auto-set UOM based on type
  const handleTypeChange = (type: string) => {
    const uomMap: Record<string, string> = {
      diesel: 'L',
      paraffin: 'L',
      gas: 'kg',
      electricity: 'kWh',
    };
    setNewUtility({ ...newUtility, type: type as any, uom: uomMap[type] || 'L' });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Utilities & Fuel</h2>
          <p className="text-sm text-slate-500 mt-0.5">Track diesel, paraffin, gas, and electricity consumption</p>
        </div>
        <button
          onClick={() => setShowLogModal(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Log Utility
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-amber-700 mb-1">
            <Fuel className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wide">Diesel</span>
          </div>
          <p className="text-2xl font-bold text-amber-900">{totalDiesel}</p>
          <p className="text-xs text-amber-700">litres</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-red-700 mb-1">
            <Fuel className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wide">Paraffin</span>
          </div>
          <p className="text-2xl font-bold text-red-900">{totalParaffin}</p>
          <p className="text-xs text-red-700">litres</p>
        </div>
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-indigo-700 mb-1">
            <Flame className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wide">Gas</span>
          </div>
          <p className="text-2xl font-bold text-indigo-900">{totalGas}</p>
          <p className="text-xs text-indigo-700">kg</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-emerald-700 mb-1">
            <Zap className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wide">Electricity</span>
          </div>
          <p className="text-2xl font-bold text-emerald-900">{totalElectricity}</p>
          <p className="text-xs text-emerald-700">kWh</p>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-slate-700 mb-1">
            <DollarSign className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wide">Total Cost</span>
          </div>
          <p className="text-2xl font-bold text-slate-900">R{totalCost.toLocaleString()}</p>
          <p className="text-xs text-slate-500">this week</p>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">Utility Consumption</h3>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="#94a3b8" />
            <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" />
            <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {chartData.map((entry, index) => (
                <Bar key={index} dataKey="value" fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Utility logs table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900">Utility Logs</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Type</th>
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Period</th>
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Quantity</th>
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Unit Cost</th>
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Total Cost</th>
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {utilityLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                      log.type === 'diesel' ? 'bg-amber-100 text-amber-700' :
                      log.type === 'paraffin' ? 'bg-red-100 text-red-700' :
                      log.type === 'gas' ? 'bg-indigo-100 text-indigo-700' :
                      'bg-emerald-100 text-emerald-700'
                    }`}>
                      {log.type === 'diesel' && <Fuel className="w-3 h-3" />}
                      {log.type === 'paraffin' && <Fuel className="w-3 h-3" />}
                      {log.type === 'gas' && <Flame className="w-3 h-3" />}
                      {log.type === 'electricity' && <Zap className="w-3 h-3" />}
                      {log.type}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-600">
                    {log.periodStart} → {log.periodEnd}
                  </td>
                  <td className="px-4 py-2.5 text-slate-700 font-medium">
                    {log.quantity} {log.uom}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">
                    R{log.unitCost?.toFixed(2) || '0.00'}
                  </td>
                  <td className="px-4 py-2.5 text-slate-900 font-bold">
                    R{log.totalCost?.toLocaleString() || '0'}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">
                    {log.notes || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {utilityLogs.length === 0 && (
          <div className="p-6 text-center text-slate-400 text-sm">No utility logs yet</div>
        )}
      </div>

      {/* Log Utility Modal */}
      <Modal isOpen={showLogModal} onClose={() => setShowLogModal(false)} title="Log Utility Consumption">
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Utility Type</label>
            <select
              value={newUtility.type}
              onChange={(e) => handleTypeChange(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
            >
              <option value="diesel">Diesel</option>
              <option value="paraffin">Paraffin</option>
              <option value="gas">Gas (LPG)</option>
              <option value="electricity">Electricity</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Period Start</label>
              <input
                type="date"
                value={newUtility.periodStart}
                onChange={(e) => setNewUtility({ ...newUtility, periodStart: e.target.value })}
                className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Period End</label>
              <input
                type="date"
                value={newUtility.periodEnd}
                onChange={(e) => setNewUtility({ ...newUtility, periodEnd: e.target.value })}
                className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Quantity ({newUtility.uom})</label>
              <input
                type="number"
                value={newUtility.quantity || ''}
                onChange={(e) => setNewUtility({ ...newUtility, quantity: parseFloat(e.target.value) })}
                className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                step="0.1"
                min="0"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Unit Cost (R/{newUtility.uom})</label>
              <input
                type="number"
                value={newUtility.unitCost || ''}
                onChange={(e) => setNewUtility({ ...newUtility, unitCost: parseFloat(e.target.value) })}
                className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                step="0.01"
                min="0"
              />
            </div>
          </div>

          {newUtility.quantity > 0 && newUtility.unitCost > 0 && (
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-xs text-slate-500">Total Cost:</p>
              <p className="text-lg font-bold text-slate-900">
                R{(newUtility.quantity * newUtility.unitCost).toLocaleString()}
              </p>
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Notes (optional)</label>
            <textarea
              value={newUtility.notes}
              onChange={(e) => setNewUtility({ ...newUtility, notes: e.target.value })}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              rows={2}
              placeholder="e.g. Generator + boiler, Meter reading, etc."
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={handleLogUtility}
              className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors"
            >
              Log Utility
            </button>
            <button
              onClick={() => setShowLogModal(false)}
              className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
