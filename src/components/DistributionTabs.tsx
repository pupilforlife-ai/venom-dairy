import { ReactNode } from 'react';

const tabs = [
  { id: 'ready', label: 'Ready for Distribution' },
  { id: 'history', label: 'Distribution History' },
  { id: 'production', label: 'Still in Production' },
] as const;

export type DistributionTab = typeof tabs[number]['id'];

// Presentation only: switching tabs never saves or changes operational data.
export function DistributionTabs({ activeTab, onChange, children }: {
  activeTab: DistributionTab;
  onChange: (tab: DistributionTab) => void;
  children: Record<DistributionTab, ReactNode>;
}) {
  return <div className="space-y-4">
    <div role="tablist" aria-label="Distribution views" className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
      {tabs.map((tab, index) => <button key={tab.id} type="button" role="tab"
        id={`distribution-tab-${tab.id}`} aria-controls={`distribution-panel-${tab.id}`}
        aria-selected={activeTab === tab.id} tabIndex={activeTab === tab.id ? 0 : -1}
        onClick={() => onChange(tab.id)}
        onKeyDown={event => {
          const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length
            : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length
              : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
          if (next < 0) return;
          event.preventDefault();
          onChange(tabs[next].id);
          event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
        }}
        className={`min-w-0 rounded-lg px-2 py-3 text-xs font-semibold sm:text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 ${activeTab === tab.id ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-600 hover:bg-white/60'}`}>
        {tab.label}
      </button>)}
    </div>
    {tabs.map(tab => <div key={tab.id} role="tabpanel" id={`distribution-panel-${tab.id}`}
      aria-labelledby={`distribution-tab-${tab.id}`} hidden={activeTab !== tab.id} tabIndex={0}>
      {children[tab.id]}
    </div>)}
  </div>;
}
