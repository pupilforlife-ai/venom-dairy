import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  ClipboardList,
  Milk,
  Package,
  Thermometer,
  AlertTriangle,
  Truck,
  Settings,
  Menu,
  X,
  ChevronRight,
  Factory,
  LogOut,
  Download,
  ClipboardCheck,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useApp } from '../store/AppContext';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/instructions', label: 'Instructions', icon: ClipboardCheck },
  { path: '/production-board', label: 'Production Board', icon: ClipboardList },
  { path: '/milk-receiving', label: 'Milk Receiving', icon: Milk },
  { path: '/inventory', label: 'Inventory & Stock', icon: Package },
  { path: '/cutting', label: 'Cutting', icon: ClipboardList },
  { path: '/packing', label: 'Packing', icon: Package },
  { path: '/reconciliation', label: 'Reconciliation', icon: ClipboardList },
  { path: '/cold-chain', label: 'Cold Chain', icon: Thermometer },
  { path: '/waste', label: 'Waste & Yield', icon: AlertTriangle },
  { path: '/utilities', label: 'Utilities', icon: Truck },
  { path: '/distribution', label: 'Distribution', icon: Truck },
  { path: '/settings', label: 'Settings', icon: Settings },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const { milkLots, productionShifts } = useApp();
  const isLocalDemo = import.meta.env.VITE_LOCAL_DEMO_MODE === 'true';
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [role, setRole] = useState('');
  const [theme, setTheme] = useState(() => window.localStorage.getItem('vejoy_theme') || 'light');
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const location = useLocation();

  const latestMilkLot = [...milkLots].sort((a, b) => {
    const aTime = new Date(`${a.receiptDate}T${a.receiptTime || '00:00'}`).getTime();
    const bTime = new Date(`${b.receiptDate}T${b.receiptTime || '00:00'}`).getTime();
    return bTime - aTime;
  })[0];
  const latestShift = [...productionShifts]
    .filter((shift) => shift.milkLotId === latestMilkLot?.id || shift.milkLotCode === latestMilkLot?.lotCode)
    .sort((a, b) => {
      // Prefer the latest active shift. If none is active, fall back to the
      // most recently started shift so the header never shows a fixed value.
      const activeRank = Number(b.status === 'active') - Number(a.status === 'active');
      if (activeRank !== 0) return activeRank;
      return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime();
    })[0];

  useEffect(() => {
    window.localStorage.setItem('vejoy_theme', theme);
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    void client.auth.getUser().then(async ({ data }) => {
      const user = data.user;
      if (!user) return;
      setUsername(user.user_metadata?.username || user.email?.split('@')[0] || 'User');
      const { data: profile } = await client.from('profiles').select('role').eq('id', user.id).maybeSingle<{ role: string }>();
      if (profile?.role) setRole(profile.role);
    });
  }, []);

  useEffect(() => {
    const standaloneMedia = window.matchMedia('(display-mode: standalone)');
    const updateInstalledState = () => {
      const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
      setIsInstalled(standaloneMedia.matches || iosStandalone);
    };
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };

    updateInstalledState();
    window.addEventListener('beforeinstallprompt', handleInstallPrompt);
    standaloneMedia.addEventListener?.('change', updateInstalledState);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
      standaloneMedia.removeEventListener?.('change', updateInstalledState);
    };
  }, []);

  const installApp = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-slate-900 text-white transform transition-transform duration-200 ease-in-out ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-700">
          <div className="w-9 h-9 rounded-lg bg-emerald-500 flex items-center justify-center">
            <Factory className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-lg leading-tight">Vejoy</h1>
            <p className="text-xs text-slate-400">Production System</p>
          </div>
          <button
            className="ml-auto lg:hidden text-slate-400 hover:text-white"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-emerald-500/15 text-emerald-400'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon className="w-4.5 h-4.5" />
                {item.label}
                {isActive && <ChevronRight className="w-4 h-4 ml-auto" />}
              </Link>
            );
          })}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center text-xs font-bold">
                {username.slice(0, 2).toUpperCase() || 'US'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{username || 'User'}</p>
              <p className="text-xs text-slate-400">{role || 'staff'}</p>
            </div>
            <button onClick={() => void supabase?.auth.signOut()} className="text-slate-400 hover:text-white" title="Sign out" aria-label="Sign out">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {isLocalDemo && <div className="bg-amber-400 px-4 py-2 text-center text-xs font-bold tracking-wide text-amber-950">LOCAL DEMO — TEST DATA ONLY — NOT PRODUCTION</div>}
        {/* Top bar */}
        <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-4 lg:px-6 py-3 flex items-center gap-4">
          <button
            className="lg:hidden text-slate-600 hover:text-slate-900"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-6 h-6" />
          </button>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-slate-900">
              {navItems.find((n) => n.path === location.pathname)?.label || 'Dashboard'}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            {installPrompt && !isInstalled && (
              <button
                type="button"
                onClick={() => void installApp()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                title="Install Vejoy on this device"
              >
                <Download className="h-3.5 w-3.5" />
                Install
              </button>
            )}
            <select aria-label="Theme" value={theme} onChange={(event) => setTheme(event.target.value)} className="hidden sm:block rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700">
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="black">Black / OLED</option>
              <option value="contrast">High Contrast</option>
              <option value="amber">Amber Night</option>
              <option value="system">System Default</option>
            </select>
            <span className="hidden sm:inline text-sm text-slate-500">
              Milk Lot: <span className="font-medium text-slate-700">{latestMilkLot?.lotCode || '—'}</span>
            </span>
            <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 text-xs font-medium rounded-full">
              {latestShift ? `Shift ${latestShift.shiftNumber}` : 'No shift'}
            </span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 lg:p-6 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
