import { useState } from 'react';
import { AlertCircle, Check, Lock } from '../../components/icons';
import { Button } from '../../components/ui/Button';
import { useStore } from '../../store/useStore';
import { authErrorMessage, updatePassword } from './session';
import styles from './AuthPage.module.css';

/**
 * Where a "reset your password" email lands.
 *
 * The link carries a recovery token that the Supabase client swaps for a
 * short-lived session before this renders, which is why setting a new password
 * here needs no old one — the email was the proof.
 */
export function UpdatePasswordPage() {
    const setView = useStore((s) => s.setView);
    const isAuthenticated = useStore((s) => s.auth.isAuthenticated);

    const [password, setPassword] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [done, setDone] = useState(false);

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError(null);
        setBusy(true);
        try {
            await updatePassword(password);
            setDone(true);
        } catch (err) {
            setError(authErrorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className={styles.shell}>
            <aside className={styles.side}>
                <div className={styles.sideBody}>
                    <h2 className={styles.sideTitle}>Set a new password</h2>
                    <p className={styles.sideText}>
                        This link signed you in for a moment so you can choose a new password. It works
                        once, and only from the email it was sent to.
                    </p>
                </div>
            </aside>

            <main className={styles.panel}>
                <div className={styles.form}>
                    {done ? (
                        <>
                            <h1 className={styles.title}>Password changed</h1>
                            <p className={styles.notice}>
                                <Check size={15} />
                                <span>You are signed in with the new password.</span>
                            </p>
                            <Button variant="primary" fullWidth onClick={() => setView('canvas')}>
                                Back to your canvas
                            </Button>
                        </>
                    ) : (
                        <>
                            <h1 className={styles.title}>Choose a new password</h1>
                            <p className={styles.subtitle}>At least 6 characters.</p>

                            {!isAuthenticated && (
                                <p className={styles.error} role="alert">
                                    <AlertCircle size={15} />
                                    <span>This reset link has expired. Ask for a new one from the sign-in page.</span>
                                </p>
                            )}
                            {error && (
                                <p className={styles.error} role="alert">
                                    <AlertCircle size={15} />
                                    <span>{error}</span>
                                </p>
                            )}

                            <form className={styles.fields} onSubmit={submit}>
                                <label className={styles.field}>
                                    <span>New password</span>
                                    <span className={styles.inputWrap}>
                                        <Lock size={14} />
                                        <input
                                            type="password"
                                            autoComplete="new-password"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            minLength={6}
                                            required
                                            disabled={busy || !isAuthenticated}
                                        />
                                    </span>
                                </label>
                                <Button type="submit" variant="primary" fullWidth loading={busy} disabled={busy || !isAuthenticated || password.length < 6}>
                                    Save password
                                </Button>
                            </form>

                            <p className={styles.footer}>
                                <button type="button" className={styles.switch} onClick={() => setView('login')}>
                                    Back to sign in
                                </button>
                            </p>
                        </>
                    )}
                </div>
            </main>
        </div>
    );
}
