import { Settings as SettingsIcon, Users, Package, Thermometer, Shield, Database } from 'lucide-react';

export default function Settings() {
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
            <p className="font-medium text-slate-900">0.2.0 (MVP)</p>
          </div>
          <div>
            <span className="text-slate-500">Build</span>
            <p className="font-medium text-slate-900">2026-06-17</p>
          </div>
          <div>
            <span className="text-slate-500">Database</span>
            <p className="font-medium text-slate-900">Supabase</p>
          </div>
          <div>
            <span className="text-slate-500">Environment</span>
            <p className="font-medium text-slate-900">Development</p>
          </div>
        </div>
      </div>
    </div>
  );
}
