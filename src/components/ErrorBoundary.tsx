import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[ErrorBoundary]', error.message, info.componentStack);
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div style={{
          width: '100%', height: '100vh',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: '#fff', color: '#000',
          fontFamily: 'system-ui, sans-serif', padding: 24,
        }}>
          <div style={{ fontSize: 48, fontWeight: 800, marginBottom: 16 }}>TINGMO</div>
          <div style={{
            fontSize: 14, color: '#FF5A1F', fontWeight: 700,
            marginBottom: 8, textAlign: 'center',
          }}>
            发生错误 / An error occurred
          </div>
          <div style={{
            fontSize: 12, color: '#999', maxWidth: 400,
            textAlign: 'center', wordBreak: 'break-all',
            fontFamily: 'monospace', marginBottom: 16,
          }}>
            {this.state.error?.message || '未知错误 / Unknown error'}
          </div>
          <button
            onClick={() => {
              window.location.reload();
            }}
            style={{
              padding: '8px 20px', border: '2px solid #000',
              background: '#000', color: '#fff',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            重新加载 / Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
