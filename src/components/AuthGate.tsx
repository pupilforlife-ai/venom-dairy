import { ReactNode, useEffect, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import Login from '../pages/Login';
import { supabase, supabaseEnabled } from '../lib/supabase';

export default function AuthGate({ children }: { children: ReactNode }) {
  const localDemoMode = import.meta.env.VITE_LOCAL_DEMO_MODE === 'true';
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [authMessage, setAuthMessage] = useState('');

  if (localDemoMode) return <>{children}</>;

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let mounted = true;
    void supabase.auth.getSession().then(async ({ data }) => {
      if (mounted) {
        let nextSession = data.session;
        if (nextSession) {
          const { data: profile } = await supabase.from('profiles').select('status, role').eq('id', nextSession.user.id).maybeSingle<{ status: string; role: string }>();
          if (!profile || profile.status !== 'approved') {
            await supabase.auth.signOut();
            nextSession = null;
            setAuthMessage('Your account is awaiting owner approval.');
          } else {
            window.localStorage.setItem('vejoy_user_role', profile.role);
          }
        }
        setSession(nextSession);
        setLoading(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      if (nextSession) {
        const { data: profile } = await supabase.from('profiles').select('status, role').eq('id', nextSession.user.id).maybeSingle<{ status: string; role: string }>();
        if (profile?.status === 'approved') {
          window.localStorage.setItem('vejoy_user_role', profile.role);
          setSession(nextSession);
        } else {
          await supabase.auth.signOut();
          setAuthMessage('Your account is awaiting owner approval.');
          setSession(null);
        }
      } else {
        setSession(null);
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-sm text-slate-400">Checking secure session...</div>;
  }

  if (!supabaseEnabled || !session) return <Login message={authMessage} />;
  return <>{children}</>;
}
