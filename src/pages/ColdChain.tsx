import { useState } from 'react';
import {
  Thermometer,
  AlertTriangle,
  CheckCircle2,
  Snowflake,
  Clock,
  Plus,
} from 'lucide-react';
import { useApp } from '../store/AppContext';
import { useToast } from '../components/Toast';
import { Modal } from '../components/Modal';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

// Temperature profiles
const tempProfiles = [
  { location: 'Chiller', targetMin: 3, targetMax: 5 },
  { location: 'Intermediate Freezer', targetMin: -20, targetMax: -16 },
  { location: 'Finished Stock Chiller', targetMin: 3, targetMax: 5 },
];

export default function ColdChain() {
  const { temperatureReadings, addTemperatureReading } = useApp();
  const { showToast } = useToast();
  const [showLogModal, setShowLogModal] = useState(false);

  const inRange = temperatureReadings.filter((t) => t.inRange);
  const outOfRange = temperatureReadings.filter((t) => !t.inRange);

  // Get latest reading per location
  const latestByLocation = temperatureReadings.reduce((acc, reading) => {
    if (!acc[reading.location] || new Date(reading.recordedAt) > new Date(acc[reading.location].recordedAt)) {
      acc[reading.location] = reading;
    }
    return acc;
  }, {} as Record<string, typeof temperatureReadings[0]>);

  // New reading form
  const [newReading, setNewReading] = useState({
    location: 'Chiller',
    temperature: 4.0,
    recordedBy: '',
  });

  const handleLogReading = () => {
    if (!newReading.recordedBy) {
      showToast('error', 'Please enter who recorded this');
      return;
    }
    const profile = tempProfiles.find(p => p.location === newReading.location);
    if (!profile) return;

    addTemperatureReading({
      location: newReading.location,
      temperature: newReading.temperature,
      targetMin: profile.targetMin,
      targetMax: profile.targetMax,
      recordedAt: new Date().toISOString(),
      recordedBy: newReading.recordedBy,
    });

    const inRange = newReading.temperature >= profile.targetMin && newReading.temperature <= profile.targetMax;
    if (inRange) {
      showToast('success', `Temperature logged: ${newReading.temperature}°C at ${newReading.location}`);
    } else {
      showToast('error', `⚠️ OUT OF RANGE: ${newReading.temperature}°C at ${newReading.location} (target: ${profile.targetMin}–${profile.targetMax}°C)`);
    }

    setShowLogModal(false);
    setNewReading({ location: 'Chiller', temperature: 4.0, recordedBy: '' });
  };

  // Build chart data from readings grouped by time
  const chartData = Object.values(
    temperatureReadings.reduce((acc, r) => {
      const time = r.recordedAt.split('T')[1]?.substring(0, 5) || '';
      if (!acc[time]) acc[time] = { time };
      acc[time][r.location] = r.temperature;
      return acc;
    }, {} as Record<string, any>)
  ).sort((a, b) => a.time.localeCompare(b.time));

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Cold Chain Monitoring</h2>
          <p className="text-sm text-slate-500 mt-0.5">Temperature tracking and compliance</p>
        </div>
        <button 
          onClick={() => setShowLogModal(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Log Reading
        </button>
      </div>

      {/* Status summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
          <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto mb-1" />
          <p className="text-2xl font-bold text-emerald-700">{inRange.length}</p>
          <p className="text-xs text-emerald-600">In Range</p>
        </div>
        <div className={`${outOfRange.length > 0 ? 'bg-red-50 border border-red-200' : 'bg-slate-50 border border-slate-200'} rounded-xl p-4 text-center`}>
          <AlertTriangle className={`w-6 h-6 mx-auto mb-1 ${outOfRange.length > 0 ? 'text-red-600' : 'text-slate-400'}`} />
          <p className={`text-2xl font-bold ${outOfRange.length > 0 ? 'text-red-700' : 'text-slate-500'}`}>{outOfRange.length}</p>
          <p className={`text-xs ${outOfRange.length > 0 ? 'text-red-600' : 'text-slate-400'}`}>Out of Range</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
          <Clock className="w-6 h-6 text-blue-600 mx-auto mb-1" />
          <p className="text-2xl font-bold text-blue-700">{temperatureReadings.length}</p>
          <p className="text-xs text-blue-600">Total Readings</p>
        </div>
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 text-center">
          <Thermometer className="w-6 h-6 text-indigo-600 mx-auto mb-1" />
          <p className="text-2xl font-bold text-indigo-700">{Object.keys(latestByLocation).length}</p>
          <p className="text-xs text-indigo-600">Locations</p>
        </div>
      </div>

      {/* Temperature chart */}
      {chartData.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Temperature History</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="time" tick={{ fontSize: 12 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" domain={[-22, 8]} />
              <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
              <ReferenceLine y={5} stroke="#ef4444" strokeDasharray="3 3" />
              <ReferenceLine y={3} stroke="#ef4444" strokeDasharray="3 3" />
              <Line type="monotone" dataKey="Chiller" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="Intermediate Freezer" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="Finished Stock Chiller" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Location cards — latest readings */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {Object.values(latestByLocation).map((reading) => (
          <div
            key={reading.id}
            className={`rounded-xl border p-4 ${reading.inRange ? 'bg-white border-slate-200' : 'bg-red-50 border-red-200'}`}
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  {reading.location.includes('Freezer') ? <Snowflake className="w-4 h-4 text-indigo-500" /> : <Thermometer className="w-4 h-4 text-blue-500" />}
                  <h4 className="text-sm font-semibold text-slate-900">{reading.location}</h4>
                </div>
                <p className="text-xs text-slate-500 mt-1">Target: {reading.targetMin}°C to {reading.targetMax}°C</p>
              </div>
              <div className="text-right">
                <p className={`text-2xl font-bold ${reading.inRange ? 'text-slate-900' : 'text-red-600'}`}>{reading.temperature}°C</p>
                <span className={`inline-flex items-center gap-1 text-xs font-medium ${reading.inRange ? 'text-emerald-600' : 'text-red-600'}`}>
                  {reading.inRange ? <><CheckCircle2 className="w-3 h-3" /> OK</> : <><AlertTriangle className="w-3 h-3" /> Alert</>}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
              <span className="text-xs text-slate-500">By: {reading.recordedBy}</span>
              <span className="text-xs text-slate-500">{reading.recordedAt.split('T')[1]?.substring(0, 5)}</span>
            </div>
          </div>
        ))}
      </div>

      {/* All readings table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900">All Readings</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Location</th>
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Temp</th>
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Target</th>
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Status</th>
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">By</th>
                <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[...temperatureReadings].reverse().map((reading) => (
                <tr key={reading.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 text-slate-700">{reading.location}</td>
                  <td className="px-4 py-2.5 font-medium text-slate-900">{reading.temperature}°C</td>
                  <td className="px-4 py-2.5 text-slate-500 text-xs">{reading.targetMin}–{reading.targetMax}°C</td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${reading.inRange ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                      {reading.inRange ? 'OK' : 'OUT OF RANGE'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">{reading.recordedBy}</td>
                  <td className="px-4 py-2.5 text-slate-500 text-xs">{reading.recordedAt.split('T')[1]?.substring(0, 5)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Log Reading Modal */}
      <Modal isOpen={showLogModal} onClose={() => setShowLogModal(false)} title="Log Temperature Reading">
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Location</label>
            <select
              value={newReading.location}
              onChange={(e) => setNewReading({ ...newReading, location: e.target.value })}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
            >
              {tempProfiles.map(p => <option key={p.location} value={p.location}>{p.location} ({p.targetMin}–{p.targetMax}°C)</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Temperature (°C)</label>
            <input
              type="number"
              value={newReading.temperature}
              onChange={(e) => setNewReading({ ...newReading, temperature: parseFloat(e.target.value) })}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              step="0.1"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Recorded By</label>
            <input
              type="text"
              value={newReading.recordedBy}
              onChange={(e) => setNewReading({ ...newReading, recordedBy: e.target.value })}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              placeholder="e.g. Rajesh"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={handleLogReading} className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors">
              Log Reading
            </button>
            <button onClick={() => setShowLogModal(false)} className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
