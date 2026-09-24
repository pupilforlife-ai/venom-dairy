import { useEffect, useState } from 'react';
import { Settings as SettingsIcon, Users, Package, Thermometer, Shield, Database, RotateCcw, Check, X, KeyRound } from 'lucide-react';
import { useToast } from '../components/Toast';
import { supabase } from '../lib/supabase';

export default function Settings() {
  const { showToast } = useToast();
  const [isOwner, setIsOwner] = useState(false);
  const [users, setUsers] = useState<Array<{ id: string; username: string; role: string; status: string; created_at: string }>>([]);
  const [passwordUser, setPasswordUser] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const loadPendingUsers = async () => {
    if (!supabase) return;
    const { data: currentProfile } = await supabase.from('profiles').select('role').eq('id', (await supabase.auth.getUser()).data.user?.id || '').maybeSingle<{ role: string }>();
    const owner = currentProfile?.role === 'owner';
    setIsOwner(owner);
    if (owner) {
      const { data } = await supabase.from('profiles').select('id, username, role, status, created_at').order('created_at', { ascending: true });
      setUsers(data || []);
    }
  };

  const updateUser = async (id: string, updates: { status?: string; role?: string }) => {
    if (!supabase) return;
    const user = (await supabase.auth.getUser()).data.user;
    const { error } = await supabase.from('profiles').update({ ...updates, approved_at: updates.status === 'approved' ? new Date().toISOString() : undefined, approved_by: user?.id || null }).eq('id', id);
    if (error) showToast('error', error.message);
    else { showToast('success', 'User updated'); await loadPendingUsers(); }
  };

  const changePassword = async () => {
    if (!supabase || !passwordUser || newPassword.length < 6) { showToast('error', 'Password must be at least 6 characters'); return; }
    const { error } = await supabase.functions.invoke('owner-reset-password', { body: { userId: passwordUser, password: newPassword } });
    if (error) showToast('error', error.message);
    else { showToast('success', 'Password changed'); setPasswordUser(null); setNewPassword(''); }
  };

  useEffect(() => { void loadPendingUsers(); }, []);

  const updateUserStatus = async (id: string, status: 'approved' | 'rejected') => {
    if (!supabase) return;
    const user = (await supabase.auth.getUser()).data.user;
    const { error } = await supabase.from('profiles').update({ status, approved_at: status === 'approved' ? new Date().toISOString() : null, approved_by: user?.id || null }).eq('id', id);
    if (error) showToast('error', error.message);
    else {
      showToast('success', status === 'approved' ? 'User approved' : 'User rejected');
      await loadPendingUsers();
    }
  };

  const handleResetData = async () => {
    if (confirm('Are you sure you want to reset all data to initial state? This cannot be undone.')) {
      // Clear all localStorage keys
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('vejoy_')) {
          localStorage.removeItem(key);
        }
      });

      if (supabase) {
        const { error } = await supabase.from('app_state').delete().neq('key', '');
        if (error) {
          showToast('error', 'Local data cleared, but Supabase data could not be reset');
          return;
        }
      }

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

      {isOwner && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
            <div>
          <h3 className="text-sm font-semibold text-slate-900">Team access and roles</h3>
              <p className="text-xs text-slate-500 mt-1">Approve users, assign roles, and manage passwords.</p>
            </div>
            <Users className="w-4 h-4 text-slate-500" />
          </div>
          <div className="divide-y divide-slate-100">
            {users.length === 0 ? <p className="p-4 text-sm text-slate-500">No users found.</p> : users.map((user) => (
              <div key={user.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                <div><p className="text-sm font-medium text-slate-900">{user.username}</p><p className="text-xs text-slate-500">{user.status} · {new Date(user.created_at).toLocaleDateString()}</p></div>
                <div className="flex flex-wrap items-center gap-2">
                  <select value={user.role} onChange={(e) => void updateUser(user.id, { role: e.target.value })} className="px-2 py-1.5 rounded-lg border border-slate-200 text-xs"><option value="staff">Staff</option><option value="admin">Admin</option><option value="owner">Owner</option></select>
                  {user.status === 'pending' && <button onClick={() => void updateUserStatus(user.id, 'approved')} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-medium"><Check className="w-3 h-3" /> Approve</button>}
                  {user.status !== 'rejected' && user.status !== 'pending' && <button onClick={() => setPasswordUser(user.id)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-medium"><KeyRound className="w-3 h-3" /> Password</button>}
                  {user.status === 'pending' && <button onClick={() => void updateUserStatus(user.id, 'rejected')} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-50 text-red-700 text-xs font-medium"><X className="w-3 h-3" /> Reject</button>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {passwordUser && <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4"><div className="bg-white rounded-xl p-5 w-full max-w-sm"><h3 className="font-semibold text-slate-900">Set user password</h3><input autoFocus type="password" minLength={6} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="New password" className="mt-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /><div className="mt-4 flex justify-end gap-2"><button onClick={() => { setPasswordUser(null); setNewPassword(''); }} className="px-3 py-2 text-sm">Cancel</button><button onClick={() => void changePassword()} className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm">Change password</button></div></div></div>}

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
