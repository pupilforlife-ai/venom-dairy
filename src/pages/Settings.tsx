import { Settings as SettingsIcon, Users, Package, Thermometer, Shield, Database, RotateCcw } from 'lucide-react';
import { useToast } from '../components/Toast';

export default function Settings() {
  const { showToast } = useToast();

  const handleResetData = () => {
    if (confirm('Are you sure you want to reset all data to initial state? This cannot be undone.')) {
      // Clear all localStorage keys
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('vejoy_')) {
          localStorage.removeItem(key);
        }
      });
      showToast('success', 'Data reset. Refreshing page...');
      setTimeout(() => window.location.reload(), 1000);
    }
  };

  const sections = [
    {
      title: 'Master Data',
      description: 'Products, SKUs, units of measure, storage locations',
      icon: Database,
      items: ['Units of Measure', 'Storage Locations', 'Product Families', 'SKU Master', 'Packaging Config'],
    },
    {
      title: 'Team & Roles',
      description: 'User accounts, roles, and permissions',
      icon: Users,
      items: ['User Accounts', 'Role: Production Manager', 'Role: Owner', 'Access Policies'],
    },
    {
      title: 'Recipes',
      description: 'Product formulas and recipe versions (restricted access)',
      icon: Package,
      items: ['Recipe Versions', 'Scaling Rules', 'Access Control'],
    },
    {
      title: 'Temperature Profiles',
      description: 'Cold chain target ranges and alert thresholds',
      icon: Thermometer,
      items: ['Chiller: 3–5°C', 'Freezer: -18°C target', 'Alert Thresholds'],
    },
    {
      title: 'Waste Reasons',
      description: 'Configurable waste reason master list',
      icon: Shield,
      items: ['Texture Defect', 'Spillage', 'Cutting Loss', 'Over-Press', 'Contamination'],
    },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Settings</h2>
        <p className="text-sm text-slate-500 mt-0.5">Configure master data, roles, and system parameters</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <div key={section.title} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2">
                <Icon className="w-4 h-4 text-slate-500" />
                <h3 className="text-sm font-semibold text-slate-900">{section.title}</h3>
              </div>
              <div className="p-4">
                <p className="text-xs text-slate-500 mb-3">{section.description}</p>
                <div className="space-y-1.5">
                  {section.items.map((item) => (
                    <button
                      key={item}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50 transition-colors text-left"
                    >
                      <span>{item}</span>
                      <span className="text-xs text-slate-400">Configure →</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* System info */}
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
        <h3 className="text-sm font-semibold text-slate-900 mb-2">System Information</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div>
            <span className="text-slate-500">Version</span>
            <p className="font-medium text-slate-900">0.2.0 (Interactive Prototype)</p>
          </div>
          <div>
            <span className="text-slate-500">Build</span>
            <p className="font-medium text-slate-900">2026-06-17</p>
          </div>
          <div>
            <span className="text-slate-500">Storage</span>
            <p className="font-medium text-slate-900">Browser localStorage</p>
          </div>
          <div>
            <span className="text-slate-500">Environment</span>
            <p className="font-medium text-slate-900">Development</p>
          </div>
        </div>
      </div>

      {/* Reset data */}
      <div className="bg-red-50 rounded-xl border border-red-200 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-red-900">Reset All Data</h3>
            <p className="text-xs text-red-700 mt-1">Clear all data and return to initial state. This action cannot be undone.</p>
          </div>
          <button
            onClick={handleResetData}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Reset Data
          </button>
        </div>
      </div>
    </div>
  );
}
