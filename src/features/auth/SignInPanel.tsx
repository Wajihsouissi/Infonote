import React, { useCallback, useState } from 'react';
import { Mail, LogOut, Loader2 } from 'lucide-react';
import { supabase } from '../../services/supabase/client';
import { useAuth } from './AuthProvider';

type Props = {
    onSignedIn?: () => void;
    compact?: boolean;
};

/**
 * Minimal email-magic-link sign in panel. Renders a compact "signed in as"
 * row when a user session exists, or an email form otherwise.
 */
export const SignInPanel: React.FC<Props> = ({ onSignedIn, compact }) => {
    const { user, configured, signOut } = useAuth();
    const [email, setEmail] = useState('');
    const [sending, setSending] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        if (!configured) {
            setError('Supabase is not configured. Set VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY.');
            return;
        }
        setSending(true);
        setMessage(null);
        setError(null);

        try {
            const { error } = await supabase.auth.signInWithOtp({
                email,
                options: {
                    emailRedirectTo: window.location.origin,
                },
            });
            if (error) throw error;
            setMessage('Check your inbox for the sign-in link.');
            onSignedIn?.();
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setSending(false);
        }
    }, [email, configured, onSignedIn]);

    const containerStyle: React.CSSProperties = {
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: compact ? 8 : 16,
        minWidth: compact ? 220 : 280,
    };

    if (user) {
        return (
            <div style={containerStyle}>
                <div style={{ fontSize: 12, opacity: 0.75 }}>Signed in as</div>
                <div style={{ fontWeight: 600, fontSize: 14, wordBreak: 'break-all' }}>{user.email}</div>
                <button
                    onClick={signOut}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '6px 10px', borderRadius: 6,
                        border: '1px solid var(--color-border, #e5e7eb)',
                        background: 'transparent', cursor: 'pointer'
                    }}
                >
                    <LogOut size={14} /> Sign out
                </button>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit} style={containerStyle}>
            <div style={{ fontSize: 12, opacity: 0.75 }}>Sign in with email</div>
            <div style={{ display: 'flex', gap: 6 }}>
                <input
                    type="email"
                    required
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={{
                        flex: 1, padding: '6px 10px', borderRadius: 6,
                        border: '1px solid var(--color-border, #e5e7eb)',
                        background: 'transparent', fontSize: 13
                    }}
                />
                <button
                    type="submit"
                    disabled={sending || !email}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '6px 10px', borderRadius: 6,
                        border: '1px solid var(--color-primary, #3b82f6)',
                        background: 'var(--color-primary, #3b82f6)', color: 'white',
                        cursor: sending ? 'not-allowed' : 'pointer', fontSize: 13
                    }}
                >
                    {sending ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
                    Send link
                </button>
            </div>
            {message && <div style={{ fontSize: 12, color: 'var(--color-success, #059669)' }}>{message}</div>}
            {error && <div style={{ fontSize: 12, color: 'var(--color-error, #dc2626)' }}>{error}</div>}
        </form>
    );
};
