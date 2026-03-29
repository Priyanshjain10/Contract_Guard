import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ShieldCheck, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="min-h-screen flex items-center justify-center p-6"
          style={{ background: '#050709' }}
        >
          <div
            className="max-w-md w-full rounded-2xl p-8 text-center"
            style={{
              background: 'rgba(232,71,95,0.08)',
              border: '1px solid rgba(232,71,95,0.3)',
            }}
          >
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5"
              style={{ background: 'rgba(201,169,110,0.15)', border: '1px solid rgba(201,169,110,0.3)' }}
            >
              <ShieldCheck className="w-7 h-7" style={{ color: '#C9A96E' }} />
            </div>
            <h1 className="text-xl font-black mb-2" style={{ color: '#EAF1FF' }}>
              Something went wrong
            </h1>
            <p className="text-sm mb-2" style={{ color: '#A8B3C9' }}>
              An unexpected error occurred while rendering the dashboard.
            </p>
            {this.state.error && (
              <p className="text-xs font-mono mb-5 px-3 py-2 rounded-lg text-left" style={{ color: '#E8475F', background: 'rgba(232,71,95,0.08)' }}>
                {this.state.error.message}
              </p>
            )}
            <button
              onClick={this.handleReset}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold"
              style={{ background: 'rgba(201,169,110,0.15)', color: '#C9A96E', border: '1px solid rgba(201,169,110,0.3)' }}
            >
              <RefreshCw className="w-4 h-4" />
              Try again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
