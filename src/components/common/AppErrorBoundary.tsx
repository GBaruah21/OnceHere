import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface AppErrorBoundaryState {
  hasError: boolean;
}

interface AppErrorBoundaryProps {
  children: React.ReactNode;
}

export class AppErrorBoundary extends React.Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  declare readonly props: Readonly<AppErrorBoundaryProps>;
  state: AppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('OnceHere interface error:', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="min-h-screen bg-neutral-950 px-6 text-neutral-100 flex items-center justify-center">
        <section role="alert" className="w-full max-w-lg rounded-3xl border border-rose-400/30 bg-neutral-900 p-7 text-center shadow-2xl">
          <AlertTriangle className="mx-auto h-10 w-10 text-amber-400" aria-hidden="true" />
          <h1 className="mt-4 font-serif text-2xl font-bold">This page hit an unexpected error</h1>
          <p className="mt-3 text-sm leading-6 text-neutral-300">
            Refresh the page to reopen OnceHere. If you were editing an archive, the saved device recovery copy will be offered after reload.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-amber-400 px-5 font-bold text-neutral-950 hover:brightness-110"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Refresh page
          </button>
        </section>
      </main>
    );
  }
}
