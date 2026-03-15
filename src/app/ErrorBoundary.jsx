import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    const error = this.state.error;
    const errorName = error?.name || 'Error';
    const errorMessage = error?.message || 'An unexpected error occurred.';

    let userMessage;
    switch (error?.code) {
      case 'CORRUPTED_DATA':
        userMessage = 'The project file appears to be corrupted or in an unrecognized format.';
        break;
      case 'UNSUPPORTED_VERSION':
        userMessage = `This project was saved with a newer version of the app (version ${error.version}). Please update to load it.`;
        break;
      case 'VALIDATION_FAILED':
        userMessage = 'The project file failed validation. Some data may be missing or malformed.';
        break;
      default:
        userMessage = 'Something went wrong while loading this page.';
    }

    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: '32px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        color: '#e0e0e0',
        background: '#1a1a2e',
      }}>
        <div style={{
          maxWidth: '480px',
          width: '100%',
          padding: '32px',
          borderRadius: '12px',
          background: '#16213e',
          border: '1px solid #2a2a4a',
        }}>
          <h2 style={{ margin: '0 0 12px', fontSize: '18px', fontWeight: 600, color: '#ff6b6b' }}>
            {errorName === 'UnsupportedVersionError' ? 'Unsupported Version' :
             errorName === 'CorruptedDataError' ? 'Corrupted Data' :
             errorName === 'ProjectValidationError' ? 'Validation Error' :
             'Something Went Wrong'}
          </h2>
          <p style={{ margin: '0 0 16px', fontSize: '14px', lineHeight: 1.5, color: '#b0b0c0' }}>
            {userMessage}
          </p>
          <details style={{ marginBottom: '20px', fontSize: '12px', color: '#808090' }}>
            <summary style={{ cursor: 'pointer', marginBottom: '8px' }}>Technical details</summary>
            <pre style={{
              padding: '12px',
              borderRadius: '6px',
              background: '#0f0f23',
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontSize: '11px',
            }}>
              {errorMessage}
            </pre>
          </details>
          <div style={{ display: 'flex', gap: '8px' }}>
            <a
              href="/"
              style={{
                display: 'inline-block',
                padding: '8px 20px',
                borderRadius: '6px',
                background: '#4a6cf7',
                color: '#fff',
                textDecoration: 'none',
                fontSize: '13px',
                fontWeight: 500,
              }}
            >
              Go Home
            </a>
            <button
              onClick={() => this.setState({ error: null })}
              style={{
                padding: '8px 20px',
                borderRadius: '6px',
                background: 'transparent',
                border: '1px solid #3a3a5a',
                color: '#b0b0c0',
                cursor: 'pointer',
                fontSize: '13px',
              }}
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }
}
