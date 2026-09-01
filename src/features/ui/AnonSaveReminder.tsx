/**
 * AnonSaveReminder — periodic, non-blocking nudge for anonymous users
 * (see BETA_SCOPE.md): unsaved work is only available for the active session,
 * so we honestly remind them to sign in or connect a folder.
 *
 * Cadence: first shown shortly after the first meaningful edit of the
 * session, then roughly every 10 minutes. Dismissing hides it for a full
 * interval; the last-shown time persists in localStorage so reloads do
 * not re-toast early. Never a modal, never steals focus.
 */
import React, { useEffect, useState } from 'react';
import { CloudOff, X, ArrowRight } from '../../components/icons';
import styles from './AnonSaveReminder.module.css';
import { useStore } from '../../store/useStore';

const LAST_SHOWN_KEY = 'chnk-it-anon-reminder-last-shown';
const INTERVAL_MS = 10 * 60 * 1000; // ~10 minutes between nudges
const FIRST_EDIT_DELAY_MS = 15 * 1000; // breathing room after the first edit
const BOOT_GRACE_MS = 3000; // initial app setup churn is not a meaningful edit

function lastShownAt(): number {
    const raw = localStorage.getItem(LAST_SHOWN_KEY);
    const parsed = raw ? Number(raw) : 0;
    return Number.isFinite(parsed) ? parsed : 0;
}

export const AnonSaveReminder: React.FC = () => {
    const isAuthenticated = useStore((s) => s.auth.isAuthenticated);
    const currentView = useStore((s) => s.currentView);
    const setCurrentView = useStore((s) => s.setCurrentView);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        if (isAuthenticated) {
            setVisible(false);
            return;
        }

        const mountedAt = Date.now();
        let hasEdited = false;
        let timer: number | null = null;

        const schedule = (delay: number) => {
            if (timer) window.clearTimeout(timer);
            timer = window.setTimeout(() => {
                timer = null;
                const state = useStore.getState();
                const stillEligible = !state.auth.isAuthenticated && state.currentView === 'canvas';
                if (!stillEligible) {
                    // Re-check once the interval has passed again.
                    schedule(INTERVAL_MS);
                    return;
                }
                localStorage.setItem(LAST_SHOWN_KEY, String(Date.now()));
                setVisible(true);
                // Chain the next nudge; dismissing only hides until then.
                schedule(INTERVAL_MS);
            }, delay);
        };

        const unsubscribe = useStore.subscribe(
            (s) => ({ nodes: s.nodes, edges: s.edges, restoring: s.storage.isRestoringGraph }),
            (curr, prev) => {
                if (hasEdited || curr.restoring || prev.restoring) return;
                if (Date.now() - mountedAt < BOOT_GRACE_MS) return;
                if (curr.nodes === prev.nodes && curr.edges === prev.edges) return;
                hasEdited = true;
                // First edit of the session: nudge soon, unless one was shown
                // recently (e.g. just before a reload).
                const sinceLast = Date.now() - lastShownAt();
                schedule(Math.max(FIRST_EDIT_DELAY_MS, INTERVAL_MS - sinceLast));
            }
        );

        return () => {
            unsubscribe();
            if (timer) window.clearTimeout(timer);
        };
    }, [isAuthenticated]);

    if (!visible || isAuthenticated || currentView !== 'canvas') return null;

    const dismiss = () => setVisible(false);
    const signIn = () => {
        setVisible(false);
        setCurrentView('login');
    };

    return (
        <div className={styles.toast} role="status" aria-live="polite">
            <div className={styles.icon}>
                <CloudOff size={16} />
            </div>
            <div className={styles.text}>
                Save your work by signing in or connecting a folder.
            </div>
            <button className={styles.signInButton} type="button" onClick={signIn}>
                Sign in
                <ArrowRight size={13} />
            </button>
            <button className={styles.dismissButton} type="button" onClick={dismiss} aria-label="Dismiss reminder">
                <X size={14} />
            </button>
        </div>
    );
};
