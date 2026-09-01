import { useEffect, useState } from 'react';

/** Suppress indicators for loads fast enough that showing one is just a blink. */
export const INDICATOR_DELAY_MS = 260;

/**
 * Mirrors `active`, but only after it has stayed true for `delay`.
 *
 * Turning *off* is immediate: the indicator has to disappear the moment the
 * data lands, which is the whole point. Turning *on* is deferred so a request
 * that resolves quickly never flashes a loader on screen.
 */
export function useDelayedFlag(active: boolean, delay = INDICATOR_DELAY_MS): boolean {
    const [elapsed, setElapsed] = useState(false);

    /* Render-time reset rather than an effect: the grace period must restart
       whenever `active` flips, and doing that in an effect body would cost a
       cascading render on every transition. */
    const [wasActive, setWasActive] = useState(active);
    if (wasActive !== active) {
        setWasActive(active);
        setElapsed(false);
    }

    useEffect(() => {
        if (!active) return;
        const timer = window.setTimeout(() => setElapsed(true), delay);
        return () => window.clearTimeout(timer);
    }, [active, delay]);

    return active && elapsed;
}
