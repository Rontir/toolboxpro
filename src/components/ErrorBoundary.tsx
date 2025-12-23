'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error: Error): Partial<State> {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('ErrorBoundary caught an error:', error, errorInfo);
        this.setState({ errorInfo });
    }

    handleRetry = () => {
        this.setState({ hasError: false, error: null, errorInfo: null });
    };

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: '400px',
                    padding: '2rem',
                    textAlign: 'center',
                    background: 'var(--bg-card)',
                    borderRadius: '16px',
                    margin: '2rem',
                }}>
                    <span style={{ fontSize: '64px', marginBottom: '1rem' }}>💥</span>
                    <h2 style={{
                        fontSize: '1.5rem',
                        fontWeight: 600,
                        marginBottom: '0.5rem',
                        color: 'var(--text-white)'
                    }}>
                        Ups! Coś poszło nie tak
                    </h2>
                    <p style={{
                        color: 'var(--text-muted)',
                        marginBottom: '1.5rem',
                        maxWidth: '400px'
                    }}>
                        Narzędzie napotkało nieoczekiwany błąd. Spróbuj ponownie lub odśwież stronę.
                    </p>

                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <button
                            onClick={this.handleRetry}
                            style={{
                                padding: '0.75rem 1.5rem',
                                background: 'var(--accent)',
                                color: 'white',
                                border: 'none',
                                borderRadius: '8px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                            }}
                            onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                            onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
                        >
                            🔄 Spróbuj ponownie
                        </button>
                        <button
                            onClick={() => window.location.reload()}
                            style={{
                                padding: '0.75rem 1.5rem',
                                background: 'var(--bg-tertiary)',
                                color: 'var(--text-gray)',
                                border: '1px solid var(--border)',
                                borderRadius: '8px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                            }}
                        >
                            ↻ Odśwież stronę
                        </button>
                    </div>

                    {process.env.NODE_ENV === 'development' && this.state.error && (
                        <details style={{
                            marginTop: '2rem',
                            padding: '1rem',
                            background: 'var(--bg-input)',
                            borderRadius: '8px',
                            textAlign: 'left',
                            width: '100%',
                            maxWidth: '600px',
                        }}>
                            <summary style={{
                                cursor: 'pointer',
                                color: '#ef4444',
                                fontWeight: 600,
                                marginBottom: '0.5rem'
                            }}>
                                🔧 Szczegóły błędu (dev only)
                            </summary>
                            <pre style={{
                                fontSize: '0.75rem',
                                color: 'var(--text-muted)',
                                overflow: 'auto',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                            }}>
                                {this.state.error.toString()}
                                {this.state.errorInfo?.componentStack}
                            </pre>
                        </details>
                    )}
                </div>
            );
        }

        return this.props.children;
    }
}

// HOC wrapper for functional components
export function withErrorBoundary<P extends object>(
    WrappedComponent: React.ComponentType<P>,
    fallback?: ReactNode
) {
    return function WithErrorBoundary(props: P) {
        return (
            <ErrorBoundary fallback={fallback}>
                <WrappedComponent {...props} />
            </ErrorBoundary>
        );
    };
}
