import { useEffect, useState } from 'react';
import { ArrowRight, Sparkles, X } from '../../components/icons';
import { useStore } from '../../store/useStore';
import styles from './GuestReminder.module.css';

/**
 * A quiet nudge for people working without an account.
 *
 * The wording is the point. The old version said "save your work by signing
 * in", which was not true here: the beta saves to this browser either way, and
 * signing in moves nothing. Claiming otherwise would be selling an account on
 * a promise the app does not keep — and the first time someone lost a laptop
 * they would discover that. So this says what an account actually does.
 *
 * Never a modal, never focus-stealing, and only after real work exists: a
 * toast on an empty canvas is an advertisement, not a reminder.
 */

const LAST_SHOWN_KEY = 'chnk-it-guest-reminder-last-shown';
const INTERVAL_MS = 10 * 60 * 1000;
const FIRST_EDIT_DELAY_MS = 20 * 1000;
/** The store settles after load; those writes are not edits. */
const BOOT_GRACE_MS = 3000;

function lastShownAt(): number {
    const raw = Number(localStorage.getItem(LAST_SHOWN_KEY));
    return Number.isFinite(raw) ? raw : 0;
}

export function GuestReminder() {
    const isAuthenticated = useStore((s) => s.auth.isAuthenticated);
    const view = useStore((s) => s.view);
    const setView = useStore((s) => s.setView);
    const [visible, setVisible] = useState(false);

    // Signing in mid-session ends the conversation immediately.
    const [wasAuthenticated, setWasAuthenticated] = useState(isAuthenticated);
    if (wasAuthenticated !== isAuthenticated) {
        setWasAuthenticated(isAuthenticated);
        if (isAuthenticated && visible) setVisible(false);
    }

    useEffect(() => {
        if (isAuthenticated) return;

        const mountedAt = Date.now();
        let edited = false;
        let timer: number | null = null;

        const schedule = (delay: number) => {
            if (timer) window.clearTimeout(timer);
            timer = window.setTimeout(() => {
                timer = null;
                const state = useStore.getState();
                if (state.auth.isAuthenticated || state.view !== 'canvas') {
                    schedule(INTERVAL_MS);
                    return;
                }
                localStorage.setItem(LAST_SHOWN_KEY, String(Date.now()));
                setVisible(true);
                schedule(INTERVAL_MS);
            }, delay);
        };

        const unsubscribe = useStore.subscribe(
            (s) => ({ nodes: s.nodes, edges: s.edges }),
            (next, previous) => {
                if (edited) return;
                if (Date.now() - mountedAt < BOOT_GRACE_MS) return;
                if (next.nodes === previous.nodes && next.edges === previous.edges) return;
                edited = true;
                // Soon after the first edit — unless one was shown just before
                // a reload, in which case wait out the rest of the interval.
                schedule(Math.max(FIRST_EDIT_DELAY_MS, INTERVAL_MS - (Date.now() - lastShownAt())));
            },
        );

        return () => {
            unsubscribe();
            if (timer) window.clearTimeout(timer);
        };
    }, [isAuthenticated]);

    if (!visible || isAuthenticated || view !== 'canvas') return null;

    return (
        <div className={styles.toast} role="status" aria-live="polite">
            <span className={styles.icon}><Sparkles size={15} /></span>
            <span className={styles.text}>
                <strong>Your work is saved in this browser.</strong>
                An account adds the AI assistant and unlimited nesting.
            </span>
            <button
                type="button"
                className={styles.action}
                onClick={() => { setVisible(false); setView('login'); }}
            >
                Sign in
                <ArrowRight size={13} />
            </button>
            <button
                type="button"
                className={styles.dismiss}
                onClick={() => setVisible(false)}
                aria-label="Dismiss"
            >
                <X size={14} />
            </button>
        </div>
    );
}
