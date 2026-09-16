import {
  Thermometer,
  AlertTriangle,
  CheckCircle2,
  Snowflake,
  Clock,
  TrendingUp,
} from 'lucide-react';
import { temperatureReadings } from '../data/mockData';
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

// Mock temperature history for chart
const tempHistory = [
  { time: '06:00', chillerA: 4.2, chillerB: 4.8, freezer: -17.5, freezerDeep: -19.2 },
  { time: '08:00', chillerA: 4.1, chillerB: 4.7, freezer: -17.8, freezerDeep: -19.0 },
  { time: '10:00', chillerA: 6.1, chillerB: 4.9, freezer: -17.2, freezerDeep: -18.8 },
  { time: '12:00', chillerA: 4.5, chillerB: 4.6, freezer: -17.5, freezerDeep: -19.1 },
  { time: '14:00', chillerA: 4.3, chillerB: 4.5, freezer: -17.6, freezerDeep: -19.3 },
  { time: '16:00', chillerA: 4.4, chillerB: 4.7, freezer: -17.4, freezerDeep: -19.0 },
];

export default function ColdChain() {
  const inRange = temperatureReadings.filter((t) => t.inRange);
  const outOfRange = temperatureReadings.filter((t) => !t.inRange);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Cold Chain Monitoring</h2>
          <p className="text-sm text-slate-500 mt-0.5">Temperature tracking and compliance</p>
        </div>
        <button className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors">
          <Thermometer className="w-4 h-4" />
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
          <p className={`text-2xl font-bold ${outOfRange.length > 0 ? 'text-red-700' : 'text-slate-500'}`}>
            {outOfRange.length}
          </p>
          <p className={`text-xs ${outOfRange.length > 0 ? 'text-red-600' : 'text-slate-400'}`}>Out of Range</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
          <Clock className="w-6 h-6 text-blue-600 mx-auto mb-1" />
          <p className="text-2xl font-bold text-blue-700">6</p>
          <p className="text-xs text-blue-600">Readings Today</p>
        </div>
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 text-center">
          <Thermometer className="w-6 h-6 text-indigo-600 mx-auto mb-1" />
          <p className="text-2xl font-bold text-indigo-700">4</p>
          <p className="text-xs text-indigo-600">Locations</p>
        </div>
      </div>

      {/* Temperature chart */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">Temperature History (Today)</h3>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={tempHistory}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="time" tick={{ fontSize: 12 }} stroke="#94a3b8" />
            <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" domain={[-22, 8]} />
            <Tooltip
              contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}
            />
            <ReferenceLine y={5} stroke="#ef4444" strokeDasharray="3 3" label={{ value: 'Max Chiller', position: 'right', fontSize: 10 }} />
            <ReferenceLine y={3} stroke="#ef4444" strokeDasharray="3 3" label={{ value: 'Min Chiller', position: 'right', fontSize: 10 }} />
            <Line type="monotone" dataKey="chillerA" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} name="Chiller A" />
            <Line type="monotone" dataKey="chillerB" stroke="#60a5fa" strokeWidth={2} dot={{ r: 3 }} name="Chiller B" />
            <Line type="monotone" dataKey="freezer" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} name="Freezer" />
            <Line type="monotone" dataKey="freezerDeep" stroke="#818cf8" strokeWidth={2} dot={{ r: 3 }} name="Freezer Deep" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Location cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {temperatureReadings.map((reading) => (
          <div
            key={reading.id}
            className={`rounded-xl border p-4 ${
              reading.inRange
                ? 'bg-white border-slate-200'
                : 'bg-red-50 border-red-200'
            }`}
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  {reading.location.includes('Freezer') ? (
                    <Snowflake className="w-4 h-4 text-indigo-500" />
                  ) : (
                    <Thermometer className="w-4 h-4 text-blue-500" />
                  )}
                  <h4 className="text-sm font-semibold text-slate-900">{reading.location}</h4>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Target: {reading.targetMin}°C to {reading.targetMax}°C
                </p>
              </div>
              <div className="text-right">
                <p className={`text-2xl font-bold ${reading.inRange ? 'text-slate-900' : 'text-red-600'}`}>
                  {reading.temperature}°C
                </p>
                <span className={`inline-flex items-center gap-1 text-xs font-medium ${
                  reading.inRange ? 'text-emerald-600' : 'text-red-600'
                }`}>
                  {reading.inRange ? (
                    <><CheckCircle2 className="w-3 h-3" /> OK</>
                  ) : (
                    <><AlertTriangle className="w-3 h-3" /> Alert</>
                  )}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
              <span className="text-xs text-slate-500">
                By: {reading.recordedBy}
              </span>
              <span className="text-xs text-slate-500">
                {reading.recordedAt.split('T')[1]?.substring(0, 5)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Out of range alert */}
      {outOfRange.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-800">Temperature Excursion Detected</p>
              <p className="text-xs text-red-700 mt-1">
                {outOfRange.map((t) => `${t.location}: ${t.temperature}°C (target ${t.targetMin}-${t.targetMax}°C)`).join(' • ')}
              </p>
              <p className="text-xs text-red-600 mt-2">
                Action required: Check door seals, verify compressor function, log corrective action.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
