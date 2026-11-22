import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    let readable = error.message || 'An unexpected application error occurred.';
    try {
      const parsed = JSON.parse(error.message) as { error?: string; operationType?: string; path?: string };
      if (parsed && parsed.error) {
        if (parsed.error.includes('Quota exceeded')) {
          readable =
            'Daily Firestore quota reached. Your quota resets tomorrow — check your Firebase console if you wish to upgrade.';
        } else {
          readable = `${parsed.error}${parsed.path ? ` (${parsed.operationType || 'request'} on ${parsed.path})` : ''}`;
        }
      }
    } catch {
      // Plain error message
    }
    return { hasError: true, errorMessage: readable };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Notevox ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#FFFDF8] flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-white border border-[#E8E0D0] rounded-2xl p-8 text-center">
            <div className="w-12 h-12 rounded-xl bg-[#FDF2F7] text-[#8E2050] mx-auto mb-4 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h1 className="text-2xl font-bold text-[#1C1926] mb-2">Something went sideways</h1>
            <p className="text-sm text-[#5C566C] mb-6 break-words">{this.state.errorMessage}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#1C1926] text-[#FFFDF8] text-sm font-semibold hover:bg-[#312C42] transition-colors whitespace-nowrap"
            >
              <RotateCcw className="w-4 h-4" />
              Reload Notevox
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
