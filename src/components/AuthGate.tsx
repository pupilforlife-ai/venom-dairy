import { ReactNode, useEffect, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import Login from '../pages/Login';
import { supabase, supabaseEnabled } from '../lib/supabase';

export default function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let mounted = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setSession(data.session);
        setLoading(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
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

  if (!supabaseEnabled || !session) return <Login />;
  return <>{children}</>;
}
