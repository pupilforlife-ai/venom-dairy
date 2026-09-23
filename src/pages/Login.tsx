import { FormEvent, useState } from 'react';
import { ArrowRight, Factory, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import { supabase, supabaseEnabled } from '../lib/supabase';

export default function Login({ message = '' }: { message?: string }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'signIn' | 'request'>('signIn');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(message);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    if (!supabaseEnabled || !supabase) {
      setError('Authentication is not configured for this deployment.');
      return;
    }

    setBusy(true);
    const normalizedUsername = username.trim().toLowerCase();
    if (!/^[a-z0-9._-]{2,32}$/.test(normalizedUsername)) {
      setError('Use 2–32 letters, numbers, dots, dashes, or underscores.');
      setBusy(false);
      return;
    }
    const internalEmail = `${normalizedUsername}@users.vejoy.internal`;
    if (mode === 'request') {
      const { error: signUpError } = await supabase.auth.signUp({
        email: internalEmail,
        password,
        options: { data: { username: normalizedUsername } },
      });
      if (signUpError) setError(signUpError.message);
      else setError('Request submitted. An owner must approve this username before access is granted.');
    } else {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: internalEmail, password });
      if (signInError) setError(signInError.message);
    }
    setBusy(false);
  };

  return (
    <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-5">
      <div className="w-full max-w-5xl grid lg:grid-cols-[1.1fr_0.9fr] overflow-hidden rounded-3xl border border-white/10 bg-slate-900 shadow-2xl">
        <section className="hidden lg:flex flex-col justify-between p-10 bg-gradient-to-br from-emerald-500 to-teal-700">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center">
              <Factory className="w-6 h-6" />
            </div>
            <div>
              <p className="font-semibold tracking-wide">Vejoy</p>
              <p className="text-sm text-white/75">Production System</p>
            </div>
          </div>
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-white/70">Operations console</p>
            <h1 className="mt-4 text-5xl font-bold leading-tight">Keep every batch moving.</h1>
            <p className="mt-5 max-w-md text-white/80">Trace milk from receiving through production, packing, cold chain, and handover.</p>
          </div>
          <div className="flex items-center gap-2 text-sm text-white/80">
            <ShieldCheck className="w-4 h-4" /> Secure team access
          </div>
        </section>

        <section className="p-7 sm:p-10">
          <div className="lg:hidden flex items-center gap-3 mb-12">
            <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center"><Factory className="w-5 h-5" /></div>
            <div><p className="font-semibold">Vejoy</p><p className="text-xs text-slate-400">Production System</p></div>
          </div>
          <div className="max-w-sm mx-auto lg:mx-0">
            <p className="text-sm font-medium text-emerald-400">Welcome back</p>
            <h2 className="mt-2 text-3xl font-bold">Sign in to Vejoy</h2>
            <p className="mt-2 text-sm text-slate-400">Use your internal username to access production operations.</p>

            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
              <label className="block">
                <span className="text-sm font-medium text-slate-300">Username</span>
                <span className="relative block mt-2">
                  <Mail className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                  <input required type="text" value={username} onChange={(event) => setUsername(event.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-800 py-3 pl-10 pr-3 text-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20" placeholder="e.g. rajesh" autoComplete="username" />
                </span>
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-300">Password</span>
                <span className="relative block mt-2">
                  <LockKeyhole className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                  <input required minLength={6} type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-800 py-3 pl-10 pr-3 text-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20" placeholder="Enter your password" />
                </span>
              </label>
              {error && <p role="alert" className="rounded-xl border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-300">{error}</p>}
              <button disabled={busy} className="w-full rounded-xl bg-emerald-500 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60">
                {busy ? 'Please wait...' : <span className="flex items-center justify-center gap-2">{mode === 'signIn' ? 'Sign in' : 'Request access'} <ArrowRight className="w-4 h-4" /></span>}
              </button>
            </form>
            <button type="button" onClick={() => { setMode(mode === 'signIn' ? 'request' : 'signIn'); setError(''); }} className="mt-5 w-full text-center text-sm text-emerald-400 hover:text-emerald-300">
              {mode === 'signIn' ? 'New staff member? Request access' : 'Already approved? Sign in'}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
