import { Component } from 'react';
import { reportError } from '../../services/errorReports';
import type { ErrorInfo, ReactNode } from 'react';
import { Button } from '../../shared/ui/controls/button/Button';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
}

interface State {
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    state: State = { error: null };

    static getDerivedStateFromError(error: Error): State {
        return { error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('[ErrorBoundary] Caught error:', error, errorInfo.componentStack);
        reportError('error-boundary', error, errorInfo.componentStack ?? undefined);
    }

    render() {
        if (!this.state.error) return this.props.children;
        if (this.props.fallback) return this.props.fallback;

        return (
            <div
                role="alert"
                style={{
                    minHeight: '100vh',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 12,
                    padding: 40,
                    textAlign: 'center',
                    fontFamily: 'var(--font-sans)',
                    background: 'var(--bg-base)',
                    color: 'var(--text-main)',
                }}
            >
                <h2>Something went wrong</h2>
                <p style={{ color: 'var(--text-soft)' }}>
                    {this.state.error.message || 'An unexpected error occurred.'}
                </p>
                <p style={{ color: 'var(--text-soft)' }}>
                    Your work up to the last save is kept in this browser.
                </p>
                <Button variant="primary" onClick={() => window.location.reload()}>
                    Reload
                </Button>
                <a href="/recovery" style={{ color: 'var(--text-main)', textUnderlineOffset: 4 }}>Open workspace recovery</a>
            </div>
        );
    }
}
