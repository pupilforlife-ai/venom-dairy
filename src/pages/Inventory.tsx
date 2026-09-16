import { useState } from 'react';
import {
  Package,
  Snowflake,
  Thermometer,
  ArrowRightLeft,
  Clock,
  AlertCircle,
  Filter,
} from 'lucide-react';
import { intermediateStock, finishedStock } from '../data/mockData';

type Tab = 'intermediate' | 'finished';

export default function Inventory() {
  const [activeTab, setActiveTab] = useState<Tab>('intermediate');
  const [locationFilter, setLocationFilter] = useState('all');

  const locations = [...new Set([...intermediateStock.map((s) => s.location), ...finishedStock.map((s) => s.location)])];

  const filteredIntermediate = intermediateStock.filter(
    (s) => locationFilter === 'all' || s.location === locationFilter
  );
  const filteredFinished = finishedStock.filter(
    (s) => locationFilter === 'all' || s.location === locationFilter
  );

  // Summary stats
  const totalIntermediate = filteredIntermediate.reduce((s, i) => s + i.weight, 0);
  const totalCases = filteredFinished.reduce((s, f) => s + f.cases, 0);
  const totalLoose = filteredFinished.reduce((s, f) => s + f.loosePackets, 0);
  const totalPackets = filteredFinished.reduce((s, f) => s + f.totalPackets, 0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Inventory & Stock</h2>
          <p className="text-sm text-slate-500 mt-0.5">Track intermediate and finished goods</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
          >
            <option value="all">All Locations</option>
            {locations.map((loc) => (
              <option key={loc} value={loc}>{loc}</option>
            ))}
          </select>
          <button className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors">
            <ArrowRightLeft className="w-4 h-4" />
            Transfer
          </button>
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 text-slate-500 mb-1">
            <Package className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wide">Intermediate</span>
          </div>
          <p className="text-2xl font-bold text-slate-900">{totalIntermediate}</p>
          <p className="text-xs text-slate-400">kg in stock</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 text-slate-500 mb-1">
            <Package className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wide">Finished Cases</span>
          </div>
          <p className="text-2xl font-bold text-emerald-600">{totalCases}</p>
          <p className="text-xs text-slate-400">cases ready</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 text-slate-500 mb-1">
            <Package className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wide">Loose Packets</span>
          </div>
          <p className="text-2xl font-bold text-amber-600">{totalLoose}</p>
          <p className="text-xs text-slate-400">packets</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 text-slate-500 mb-1">
            <Package className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wide">Total Packets</span>
          </div>
          <p className="text-2xl font-bold text-indigo-600">{totalPackets}</p>
          <p className="text-xs text-slate-400">packet equivalent</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setActiveTab('intermediate')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'intermediate'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Intermediate Stock
        </button>
        <button
          onClick={() => setActiveTab('finished')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'finished'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Finished Stock
        </button>
      </div>

      {/* Intermediate stock table */}
      {activeTab === 'intermediate' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left border-b border-slate-200">
                  <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Product</th>
                  <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Source Round</th>
                  <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Weight</th>
                  <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Location</th>
                  <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Status</th>
                  <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Created</th>
                  <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Expiry</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredIntermediate.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{item.productName}</td>
                    <td className="px-4 py-3">
                      <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">
                        {item.sourceRoundCode}
                      </code>
                    </td>
                    <td className="px-4 py-3 text-slate-700 font-medium">{item.weight} kg</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 text-xs font-medium ${
                        item.location.includes('Freezer') ? 'text-indigo-600' : 'text-blue-600'
                      }`}>
                        {item.location.includes('Freezer') ? (
                          <Snowflake className="w-3 h-3" />
                        ) : (
                          <Thermometer className="w-3 h-3" />
                        )}
                        {item.location}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        item.status === 'available'
                          ? 'bg-emerald-100 text-emerald-700'
                          : item.status === 'reserved'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-slate-100 text-slate-600'
                      }`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{item.createdAt.split('T')[0]}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{item.expiryDate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredIntermediate.length === 0 && (
            <div className="p-8 text-center text-slate-400 text-sm">
              No intermediate stock found for selected filters
            </div>
          )}
        </div>
      )}

      {/* Finished stock table */}
      {activeTab === 'finished' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left border-b border-slate-200">
                  <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">SKU</th>
                  <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Product</th>
                  <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Cases</th>
                  <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Loose</th>
                  <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Total Pkts</th>
                  <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Location</th>
                  <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Status</th>
                  <th className="px-4 py-2.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredFinished.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-700 font-medium">
                        {item.sku}
                      </code>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">{item.productName}</td>
                    <td className="px-4 py-3 text-slate-700 font-medium">{item.cases}</td>
                    <td className="px-4 py-3 text-slate-700">{item.loosePackets}</td>
                    <td className="px-4 py-3 text-slate-900 font-bold">{item.totalPackets}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 text-xs font-medium ${
                        item.location.includes('Freezer') ? 'text-indigo-600' : 'text-blue-600'
                      }`}>
                        {item.location.includes('Freezer') ? (
                          <Snowflake className="w-3 h-3" />
                        ) : (
                          <Thermometer className="w-3 h-3" />
                        )}
                        {item.location}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        item.status === 'awaiting_handover'
                          ? 'bg-amber-100 text-amber-700'
                          : item.status === 'handed_over'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-red-100 text-red-700'
                      }`}>
                        {item.status === 'awaiting_handover' ? 'Awaiting' : item.status === 'handed_over' ? 'Handed Over' : 'Returned'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{item.createdAt.split('T')[0]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredFinished.length === 0 && (
            <div className="p-8 text-center text-slate-400 text-sm">
              No finished stock found for selected filters
            </div>
          )}
        </div>
      )}

      {/* FIFO Warning */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-amber-800">FIFO Notice</p>
          <p className="text-xs text-amber-700 mt-0.5">
            PAN111 (Recovered Cream) created on Jun 16 is approaching 7-day limit. 
            Consider using in next butter batch before Jun 23.
          </p>
        </div>
      </div>
    </div>
  );
}
