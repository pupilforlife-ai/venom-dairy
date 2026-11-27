import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { error: Error | null };

export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Vejoy display error', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div role="alert" className="w-full max-w-lg rounded-2xl border border-amber-200 bg-white p-6 shadow-lg">
          <h1 className="text-xl font-bold text-slate-900">This view could not be displayed</h1>
          <p className="mt-3 text-sm text-slate-700">
            If you just saved an entry, check the round before recording it again. The server may have received it.
          </p>
          <details className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            <summary className="cursor-pointer font-semibold">Error details for support</summary>
            <p className="mt-2 break-words">{this.state.error.message}</p>
          </details>
          <button type="button" onClick={() => window.location.reload()} className="mt-5 rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-700">
            Reload app
          </button>
        </div>
      </main>
    );
  }
}
