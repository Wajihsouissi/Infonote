import React, { useCallback, useState } from 'react';
import { Mail, LogOut, Loader2, Lock } from 'lucide-react';
import { supabase } from '../../services/supabase/client';
import { useAuth } from './useAuth';
import {
    EMAIL_IN_USE_MESSAGE,
    EMAIL_CONFIRMATION_ENABLED_MESSAGE,
    activateAuthenticatedSession,
    getActiveSession,
    getFriendlyAuthError,
    isDuplicateSignupResponse,
    isEmailRegistered,
} from './authFlow';

type Props = {
    onSignedIn?: () => void;
    compact?: boolean;
};

/**
 * Authentication panel supporting Email & Password.
 * Toggles between Sign In and Sign Up modes.
 */
export const SignInPanel: React.FC<Props> = ({ onSignedIn, compact }) => {
    const { user, configured, signOut } = useAuth();
    const [mode, setMode] = useState<'signin' | 'signup'>('signin');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        if (!configured) {
            setError('Supabase is not configured. Set VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.');
            return;
        }
        const cleanEmail = email.trim().toLowerCase();
        const cleanPassword = password.trim();
        if (!cleanEmail || !cleanPassword) {
            setError('Email and password are required.');
            return;
        }
        if (cleanPassword.length < 6) {
            setError('Password must be at least 6 characters.');
            return;
        }
        setLoading(true);
        setMessage(null);
        setError(null);

        try {
            if (mode === 'signup') {
                const alreadyRegistered = await isEmailRegistered(cleanEmail);
                if (alreadyRegistered) throw new Error(EMAIL_IN_USE_MESSAGE);

                const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
                    email: cleanEmail,
                    password: cleanPassword,
                });
                if (signUpError) throw signUpError;
                if (isDuplicateSignupResponse(signUpData)) throw new Error(EMAIL_IN_USE_MESSAGE);

                let activeSession = signUpData.session ?? await getActiveSession();
                if (!activeSession) {
                    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
                        email: cleanEmail,
                        password: cleanPassword,
                    });
                    if (signInError) throw signInError;
                    activeSession = signInData.session ?? await getActiveSession();
                }

                if (!activeSession) {
                    throw new Error(EMAIL_CONFIRMATION_ENABLED_MESSAGE);
                }

                await activateAuthenticatedSession(activeSession);
                setMessage('Account created. You are now signed in.');
                onSignedIn?.();
            } else {
                const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
                    email: cleanEmail,
                    password: cleanPassword,
                });
                if (signInError) throw signInError;
                const activeSession = signInData.session ?? await getActiveSession();
                if (!activeSession) {
                    throw new Error('Unable to start a signed-in session. Please try again.');
                }
                await activateAuthenticatedSession(activeSession);
                setMessage('Successfully signed in.');
                onSignedIn?.();
            }
        } catch (err) {
            setError(getFriendlyAuthError(err));
        } finally {
            setLoading(false);
        }
    }, [email, password, mode, configured, onSignedIn]);

    const containerStyle: React.CSSProperties = {
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: compact ? 8 : 16,
        minWidth: compact ? 240 : 280,
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
        <div style={containerStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 12, opacity: 0.75 }}>
                    {mode === 'signin' ? 'Sign in with email' : 'Create an account'}
                </div>
                <button
                    type="button"
                    onClick={() => {
                        setMode(mode === 'signin' ? 'signup' : 'signin');
                        setError(null);
                        setMessage(null);
                    }}
                    style={{
                        background: 'none', border: 'none', color: 'var(--color-primary, #3b82f6)',
                        cursor: 'pointer', fontSize: 12, textDecoration: 'underline', padding: 0
                    }}
                >
                    {mode === 'signin' ? 'Need an account?' : 'Already have one?'}
                </button>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', background: 'transparent', border: '1px solid var(--color-border, #e5e7eb)', borderRadius: 6, padding: '0 8px' }}>
                    <Mail size={14} style={{ opacity: 0.5, marginRight: 6 }} />
                    <input
                        type="email"
                        required
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        style={{
                            flex: 1, padding: '6px 0', border: 'none',
                            background: 'transparent', fontSize: 13, outline: 'none'
                        }}
                    />
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', background: 'transparent', border: '1px solid var(--color-border, #e5e7eb)', borderRadius: 6, padding: '0 8px' }}>
                    <Lock size={14} style={{ opacity: 0.5, marginRight: 6 }} />
                    <input
                        type="password"
                        required
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        minLength={6}
                        style={{
                            flex: 1, padding: '6px 0', border: 'none',
                            background: 'transparent', fontSize: 13, outline: 'none'
                        }}
                    />
                </div>

                <button
                    type="submit"
                    disabled={loading || !email || !password}
                    style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        padding: '6px 10px', borderRadius: 6,
                        border: '1px solid var(--color-primary, #3b82f6)',
                        background: 'var(--color-primary, #3b82f6)', color: 'white',
                        cursor: loading ? 'not-allowed' : 'pointer', fontSize: 13, marginTop: 4
                    }}
                >
                    {loading ? <Loader2 size={14} className="animate-spin" /> : null}
                    {mode === 'signin' ? 'Sign In' : 'Sign Up'}
                </button>

                {message && <div style={{ fontSize: 12, color: 'var(--color-success, #059669)' }}>{message}</div>}
                {error && <div style={{ fontSize: 12, color: 'var(--color-error, #dc2626)' }}>{error}</div>}
            </form>
        </div>
    );
};
