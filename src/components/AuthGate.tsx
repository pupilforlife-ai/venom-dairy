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
    const client = supabase;
    if (!client) {
      setLoading(false);
      return;
    }

    let mounted = true;
    void client.auth.getSession().then(async ({ data }) => {
      if (mounted) {
        let nextSession = data.session;
        if (nextSession) {
          const { data: profile } = await client.from('profiles').select('status, role, username').eq('id', nextSession.user.id).maybeSingle<{ status: string; role: string; username: string }>();
          if (!profile || profile.status !== 'approved') {
            await client.auth.signOut();
            nextSession = null;
            setAuthMessage('Your account is awaiting owner approval.');
          } else {
            window.localStorage.setItem('vejoy_user_role', profile.role);
            window.localStorage.setItem('vejoy_user_username', profile.username || nextSession.user.user_metadata?.username || '');
          }
        }
        setSession(nextSession);
        setLoading(false);
      }
    });

    const { data: listener } = client.auth.onAuthStateChange(async (_event, nextSession) => {
      if (nextSession) {
        const { data: profile } = await client.from('profiles').select('status, role, username').eq('id', nextSession.user.id).maybeSingle<{ status: string; role: string; username: string }>();
        if (profile?.status === 'approved') {
          window.localStorage.setItem('vejoy_user_role', profile.role);
          window.localStorage.setItem('vejoy_user_username', profile.username || nextSession.user.user_metadata?.username || '');
          setSession(nextSession);
        } else {
          await client.auth.signOut();
          setAuthMessage('Your account is awaiting owner approval.');
          setSession(null);
        }
      } else {
        window.localStorage.removeItem('vejoy_user_role');
        window.localStorage.removeItem('vejoy_user_username');
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
