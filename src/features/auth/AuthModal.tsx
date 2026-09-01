import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, Mail, Lock, Eye, EyeOff, Loader2, LogIn, UserPlus, AlertCircle, CheckCircle2, LogOut } from '../../components/icons';
import { useStore } from '../../store/useStore';
import { useAuth } from './useAuth';
import { supabase, isSupabaseConfigured } from '../../services/supabase/client';
import {
    EMAIL_IN_USE_MESSAGE,
    EMAIL_CONFIRMATION_ENABLED_MESSAGE,
    activateAuthenticatedSession,
    getActiveSession,
    getFriendlyAuthError,
    isDuplicateSignupResponse,
    isEmailRegistered,
} from './authFlow';
import { Tabs, type TabItem } from '../../components/ui/Tabs';
import styles from './AuthModal.module.css';

type Mode = 'signin' | 'signup';

const AUTH_TABS: TabItem<Mode>[] = [
    { id: 'signin', label: 'Sign in' },
    { id: 'signup', label: 'Sign up' },
];

interface FormState {
    email: string;
    password: string;
    confirmPassword: string;
}

const EMPTY: FormState = { email: '', password: '', confirmPassword: '' };

/**
 * Beautiful glassmorphic auth modal.
 *
 * Tabs between Sign In and Sign Up. Talks directly to Supabase Auth
 * (`signInWithPassword`, `signUp`) — no mock data. Surfaces real errors:
 *  - "User already registered" on duplicate sign-up
 *  - "Invalid login credentials" on bad password
 *  - "Passwords do not match" client-side
 *  - "Password should be at least 6 characters" from Supabase
 */
export const AuthModal: React.FC = () => {
    const isOpen = useStore((s) => s.isAuthModalOpen);
    const setOpen = useStore((s) => s.setAuthModalOpen);
    const { user, signOut } = useAuth();

    const [mode, setMode] = useState<Mode>('signin');
    const [form, setForm] = useState<FormState>(EMPTY);
    const [showPassword, setShowPassword] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const emailRef = useRef<HTMLInputElement>(null);

    // Reset transient state when re-opening the modal.
    useEffect(() => {
        if (isOpen) {
            setError(null);
            setSuccess(null);
            setSubmitting(false);
            // autofocus email
            const t = window.setTimeout(() => emailRef.current?.focus(), 80);
            return () => window.clearTimeout(t);
        } else {
            setForm(EMPTY);
        }
    }, [isOpen]);

    // ESC to close.
    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isOpen, setOpen]);

    const handleSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);

        if (!isSupabaseConfigured) {
            setError('Cloud auth is not configured. Set VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in .env.local.');
            return;
        }

        const email = form.email.trim();
        if (!email) { setError('Email is required.'); return; }
        if (!form.password) { setError('Password is required.'); return; }
        if (form.password.length < 6) { setError('Password must be at least 6 characters.'); return; }

        if (mode === 'signup' && form.password !== form.confirmPassword) {
            setError('Passwords do not match.');
            return;
        }

        setSubmitting(true);
        try {
            if (mode === 'signup') {
                const alreadyRegistered = await isEmailRegistered(email);
                if (alreadyRegistered) throw new Error(EMAIL_IN_USE_MESSAGE);

                const { data, error: signUpError } = await supabase.auth.signUp({
                    email,
                    password: form.password,
                });
                if (signUpError) throw signUpError;
                if (isDuplicateSignupResponse(data)) throw new Error(EMAIL_IN_USE_MESSAGE);
                // Infonote requires immediate sessions. Supabase Email
                // "Confirm email" must be OFF for signUp to return one.
                let activeSession = data.session ?? await getActiveSession();
                if (!activeSession) {
                    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
                        email,
                        password: form.password,
                    });
                    if (signInError) throw signInError;
                    activeSession = signInData.session ?? await getActiveSession();
                }

                if (activeSession) {
                    await activateAuthenticatedSession(activeSession);
                    setSuccess('Account created. You are now signed in.');
                    setTimeout(() => setOpen(false), 700);
                } else {
                    throw new Error(EMAIL_CONFIRMATION_ENABLED_MESSAGE);
                }
            } else {
                const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
                    email,
                    password: form.password,
                });
                if (signInError) throw signInError;
                const activeSession = signInData.session ?? await getActiveSession();
                if (!activeSession) {
                    throw new Error('Unable to start a signed-in session. Please try again.');
                }
                await activateAuthenticatedSession(activeSession);
                setSuccess('Signed in.');
                setTimeout(() => setOpen(false), 400);
            }
        } catch (err) {
            setError(getFriendlyAuthError(err));
        } finally {
            setSubmitting(false);
        }
    }, [form, mode, setOpen]);

    if (!isOpen) return null;

    return (
        <div
            className={styles.backdrop}
            role="dialog"
            aria-modal="true"
            aria-label="Authentication"
            onMouseDown={(e) => {
                if (e.target === e.currentTarget) setOpen(false);
            }}
        >
            <div className={styles.shell}>
                <button
                    type="button"
                    className={`${styles.closeBtn} icon-hover`}
                    aria-label="Close"
                    onClick={() => setOpen(false)}
                >
                    <X size={16} />
                </button>

                {user ? (
                    <>
                        <h2 className={styles.heading}>You are signed in</h2>
                        <p className={styles.subheading}>Manage your session below.</p>
                        <div className={styles.signedIn}>
                            <div className={styles.signedInRow}>
                                <Mail size={14} className={styles.inputIcon} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div className={styles.signedInLabel}>Email</div>
                                    <div style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {user.email}
                                    </div>
                                </div>
                            </div>
                            <button
                                type="button"
                                className={styles.signOutBtn}
                                onClick={async () => { await signOut(); setOpen(false); }}
                            >
                                <LogOut size={14} />
                                Sign out
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        <h2 className={styles.heading}>{mode === 'signin' ? 'Welcome back' : 'Create your account'}</h2>
                        <p className={styles.subheading}>
                            {mode === 'signin'
                                ? 'Sign in to sync your canvas across devices.'
                                : 'It only takes a few seconds to get started.'}
                        </p>

                        <Tabs
                            className={styles.tabs}
                            items={AUTH_TABS}
                            value={mode}
                            onChange={(next) => { setMode(next); setError(null); setSuccess(null); }}
                            color="primary"
                            radius="md"
                            fullWidth
                            aria-label="Sign in or sign up"
                        />

                        {error && (
                            <div className={styles.error} role="alert">
                                <AlertCircle size={14} />
                                <span>{error}</span>
                            </div>
                        )}
                        {success && (
                            <div className={styles.success} role="status">
                                <CheckCircle2 size={14} />
                                <span>{success}</span>
                            </div>
                        )}

                        <form onSubmit={handleSubmit} noValidate>
                            <div className={styles.field}>
                                <label className={styles.label} htmlFor="auth-email">Email</label>
                                <div className={styles.inputWrap}>
                                    <span className={styles.inputIcon}><Mail size={14} /></span>
                                    <input
                                        ref={emailRef}
                                        id="auth-email"
                                        className={styles.input}
                                        type="email"
                                        autoComplete="email"
                                        placeholder="you@example.com"
                                        value={form.email}
                                        disabled={submitting}
                                        required
                                        onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                                    />
                                </div>
                            </div>

                            <div className={styles.field}>
                                <label className={styles.label} htmlFor="auth-password">Password</label>
                                <div className={styles.inputWrap}>
                                    <span className={styles.inputIcon}><Lock size={14} /></span>
                                    <input
                                        id="auth-password"
                                        className={styles.input}
                                        type={showPassword ? 'text' : 'password'}
                                        autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                                        placeholder={mode === 'signin' ? 'Your password' : 'At least 6 characters'}
                                        value={form.password}
                                        disabled={submitting}
                                        minLength={6}
                                        required
                                        onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                                    />
                                    <button
                                        type="button"
                                        className={styles.eyeBtn}
                                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                                        onClick={() => setShowPassword((v) => !v)}
                                    >
                                        {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                                    </button>
                                </div>
                            </div>

                            {mode === 'signup' && (
                                <div className={styles.field}>
                                    <label className={styles.label} htmlFor="auth-confirm">Confirm password</label>
                                    <div className={styles.inputWrap}>
                                        <span className={styles.inputIcon}><Lock size={14} /></span>
                                        <input
                                            id="auth-confirm"
                                            className={styles.input}
                                            type={showPassword ? 'text' : 'password'}
                                            autoComplete="new-password"
                                            placeholder="Re-enter your password"
                                            value={form.confirmPassword}
                                            disabled={submitting}
                                            minLength={6}
                                            required
                                            onChange={(e) => setForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                                        />
                                    </div>
                                </div>
                            )}

                            <button type="submit" className={styles.submit} disabled={submitting}>
                                {submitting
                                    ? <Loader2 size={16} className="animate-spin" />
                                    : mode === 'signin' ? <LogIn size={16} /> : <UserPlus size={16} />}
                                {mode === 'signin' ? 'Sign in' : 'Create account'}
                            </button>
                        </form>
                    </>
                )}
            </div>
        </div>
    );
};
