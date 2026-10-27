import { useState } from 'react';
import { AlertCircle, ArrowLeft, Check, Eye, EyeOff, Lock, Mail, Sparkles, User } from '../../../../shared/icons';
import { Button } from '../../../../shared/ui/controls/button/Button';
import { useStore } from '../../../../store/useStore';
import {
    authErrorMessage,
    isSupabaseConfigured,
    sendPasswordReset,
    signInWithEmailCode,
    signInWithGoogle,
    signInWithPassword,
    signUpWithPassword,
} from '../../session';
import styles from './AuthPage.module.css';

/**
 * Signing in and signing up, in one page.
 *
 * The two differ by one field and one call, so they are one component with a
 * mode rather than two files that drift apart. The side panel says what an
 * account actually buys in the beta — AI and unlimited nesting — because that
 * is the only honest reason to ask someone for an email here: the app works
 * without one, and their work is already saved.
 */

type Mode = 'login' | 'signup';

const WHAT_AN_ACCOUNT_BUYS = [
    'Use the AI assistant',
    'Nest cards as deep as you like',
    'Open your work on this device, as always',
];

export function AuthPage({ mode }: { mode: Mode }) {
    const setView = useStore((s) => s.setView);
    const isSignup = mode === 'signup';

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [busy, setBusy] = useState<null | 'submit' | 'code' | 'google' | 'reset'>(null);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    const run = async (kind: NonNullable<typeof busy>, action: () => Promise<string | void>) => {
        setError(null);
        setNotice(null);
        if (!isSupabaseConfigured) {
            setError('Accounts are not set up on this build yet — everything except AI works without one.');
            return;
        }
        setBusy(kind);
        try {
            const message = await action();
            if (message) setNotice(message);
        } catch (err) {
            setError(authErrorMessage(err));
        } finally {
            setBusy(null);
        }
    };

    const submit = (event: React.FormEvent) => {
        event.preventDefault();
        void run('submit', async () => {
            if (!isSignup) {
                await signInWithPassword(email, password);
                setView('canvas');
                return;
            }
            const { needsConfirmation } = await signUpWithPassword(email, password, name);
            if (needsConfirmation) return 'Account created. Check your email to confirm it, then sign in.';
            setView('canvas');
        });
    };

    return (
        <div className={styles.shell}>
            <aside className={styles.side}>
                <button type="button" className={styles.back} onClick={() => setView('marketing')}>
                    <ArrowLeft size={14} />
                    Back
                </button>

                <div className={styles.sideBody}>
                    <div className={styles.logo}>
                        <Sparkles size={18} />
                        <span>Chnk it</span>
                    </div>
                    <h2 className={styles.sideTitle}>
                        {isSignup ? 'An account unlocks the AI.' : 'Welcome back.'}
                    </h2>
                    <p className={styles.sideText}>
                        Your canvas is saved in this browser whether you sign in or not. An account is
                        what lets the assistant read it and build on it.
                    </p>
                    <ul className={styles.sideList}>
                        {WHAT_AN_ACCOUNT_BUYS.map((line) => (
                            <li key={line}><Check size={13} /> {line}</li>
                        ))}
                    </ul>
                </div>

                <p className={styles.sideFootnote}>
                    Signing in does not move or back up your work yet — it stays on this device.
                </p>
            </aside>

            <main className={styles.panel}>
                <div className={styles.form}>
                    <h1 className={styles.title}>{isSignup ? 'Create your account' : 'Sign in'}</h1>
                    <p className={styles.subtitle}>
                        {isSignup ? 'Email and a password, or continue with Google.' : 'With your email, a one-time link, or Google.'}
                    </p>

                    <Button
                        variant="secondary"
                        fullWidth
                        onClick={() => void run('google', signInWithGoogle)}
                        disabled={busy !== null}
                        leadingIcon={<GoogleMark />}
                    >
                        Continue with Google
                    </Button>

                    <div className={styles.divider}>or with your email</div>

                    {error && (
                        <p className={styles.error} role="alert">
                            <AlertCircle size={15} />
                            <span>{error}</span>
                        </p>
                    )}
                    {notice && (
                        <p className={styles.notice} role="status">
                            <Check size={15} />
                            <span>{notice}</span>
                        </p>
                    )}

                    <form className={styles.fields} onSubmit={submit}>
                        {isSignup && (
                            <label className={styles.field}>
                                <span>What should we call you?</span>
                                <span data-input-shell="" className={styles.inputWrap}>
                                    <User size={14} />
                                    <input
                                        type="text"
                                        autoComplete="name"
                                        placeholder="Your name"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        disabled={busy !== null}
                                    />
                                </span>
                            </label>
                        )}

                        <label className={styles.field}>
                            <span>Email</span>
                            <span data-input-shell="" className={styles.inputWrap}>
                                <Mail size={14} />
                                <input
                                    type="email"
                                    autoComplete="email"
                                    placeholder="you@example.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    disabled={busy !== null}
                                    required
                                />
                            </span>
                        </label>

                        <label className={styles.field}>
                            <span>Password</span>
                            <span data-input-shell="" className={styles.inputWrap}>
                                <Lock size={14} />
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    autoComplete={isSignup ? 'new-password' : 'current-password'}
                                    placeholder="At least 6 characters"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    disabled={busy !== null}
                                    minLength={6}
                                    required
                                />
                                <button
                                    type="button"
                                    className={styles.reveal}
                                    onClick={() => setShowPassword((v) => !v)}
                                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                                >
                                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                                </button>
                            </span>
                        </label>

                        <Button
                            type="submit"
                            variant="primary"
                            fullWidth
                            loading={busy === 'submit'}
                            disabled={busy !== null || !email || !password}
                        >
                            {isSignup ? 'Create account' : 'Sign in'}
                        </Button>
                    </form>

                    <div className={styles.alternatives}>
                        <button
                            type="button"
                            className={styles.link}
                            disabled={busy !== null || !email}
                            onClick={() => void run('code', async () => {
                                await signInWithEmailCode(email);
                                return 'Check your email for a sign-in link.';
                            })}
                        >
                            {busy === 'code' ? 'Sending…' : 'Email me a sign-in link instead'}
                        </button>
                        {!isSignup && (
                            <button
                                type="button"
                                className={styles.link}
                                disabled={busy !== null || !email}
                                onClick={() => void run('reset', async () => {
                                    await sendPasswordReset(email);
                                    return 'Check your email for a link to set a new password.';
                                })}
                            >
                                {busy === 'reset' ? 'Sending…' : 'Forgot your password?'}
                            </button>
                        )}
                    </div>

                    <p className={styles.footer}>
                        {isSignup ? 'Already have an account?' : 'No account yet?'}
                        <button type="button" className={styles.switch} onClick={() => setView(isSignup ? 'login' : 'signup')}>
                            {isSignup ? 'Sign in' : 'Create one'}
                        </button>
                    </p>
                    <p className={styles.footer}>
                        <button type="button" className={styles.switch} onClick={() => setView('canvas')}>
                            Keep working without an account
                        </button>
                    </p>
                </div>
            </main>
        </div>
    );
}

/** Google's mark, inline: one provider, one icon, no icon package for it. */
function GoogleMark() {
    return (
        <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
        </svg>
    );
}
