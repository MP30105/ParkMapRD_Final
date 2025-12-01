import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { 
      hasError: false, 
      error: null, 
      errorInfo: null 
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({
      error: error,
      errorInfo: errorInfo
    });
    
    // Log to external service if needed
    if (window.gtag) {
      window.gtag('event', 'exception', {
        description: error.toString(),
        fatal: false
      });
    }
  }

  resetError = () => {
    this.setState({ 
      hasError: false, 
      error: null, 
      errorInfo: null 
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: 40,
          textAlign: 'center',
          maxWidth: 600,
          margin: '80px auto',
          background: '#fff',
          borderRadius: 12,
          boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
        }}>
          <div style={{fontSize: 64, marginBottom: 20}}>⚠️</div>
          <h2 style={{color: '#e74c3c', marginBottom: 16}}>
            Algo salió mal
          </h2>
          <p style={{color: '#666', marginBottom: 24, lineHeight: 1.6}}>
            Lo sentimos, ha ocurrido un error inesperado. 
            Por favor, intenta recargar la página o contacta al soporte si el problema persiste.
          </p>
          
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <details style={{
              textAlign: 'left',
              background: '#f5f5f5',
              padding: 16,
              borderRadius: 8,
              marginBottom: 16,
              fontSize: 14
            }}>
              <summary style={{cursor: 'pointer', fontWeight: 600, marginBottom: 8}}>
                Detalles técnicos (solo en desarrollo)
              </summary>
              <pre style={{
                overflow: 'auto',
                fontSize: 12,
                color: '#e74c3c'
              }}>
                {this.state.error.toString()}
                {'\n\n'}
                {this.state.errorInfo?.componentStack}
              </pre>
            </details>
          )}
          
          <div style={{display: 'flex', gap: 12, justifyContent: 'center'}}>
            <button
              onClick={this.resetError}
              style={{
                padding: '12px 24px',
                background: '#3498db',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: 16,
                fontWeight: 600
              }}
            >
              Reintentar
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '12px 24px',
                background: '#95a5a6',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: 16,
                fontWeight: 600
              }}
            >
              Recargar Página
            </button>
          </div>
          
          <p style={{
            marginTop: 24,
            fontSize: 14,
            color: '#999'
          }}>
            Si el problema persiste, contacta a soporte técnico.
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
