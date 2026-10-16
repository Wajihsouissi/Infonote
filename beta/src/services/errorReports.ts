import { insertRow, isSupabaseConfigured } from './supabase/client';
import { useStore } from '../store/useStore';

/**
 * Crash reports.
 *
 * A beta's most valuable feedback is the crash nobody bothers to report, so
 * uncaught errors, rejected promises and anything the error boundary catches
 * are written to one table (`client_errors` — beta/supabase/client_errors.sql
 * creates it, and nothing in the app can read it back).
 *
 * What is sent: the message, the stack, the address of the page and the browser
 * string. Never a card, a title, or anything typed. The URL carries no content
 * either — the beta's addresses are `/canvas`, `/home` and the like.
 *
 * Reporting must never make things worse, so every path here is best-effort:
 * failures are swallowed, the same message is sent once, and a session is
 * capped. A crash loop cannot flood the table or the network.
 */

type ErrorSource = 'window-error' | 'unhandled-rejection' | 'error-boundary';

const MAX_PER_SESSION = 10;
const seen = new Set<string>();
let sent = 0;

export function reportError(source: ErrorSource, error: unknown, extra?: string): void {
    try {
        const err = error instanceof Error ? error : new Error(String(error ?? 'Unknown error'));
        const message = [err.message || 'Unknown error', extra].filter(Boolean).join(' | ').slice(0, 2000);

        /* Deduped and capped before anything else, so a crash loop is one
           report in production and one line in the console in development —
           and so both behave the same way but for the last step. */
        if (sent >= MAX_PER_SESSION) return;
        const key = `${source}:${message}`;
        if (seen.has(key)) return;
        seen.add(key);
        sent += 1;

        if (import.meta.env.DEV) {
            // In development the console is right there, and a local crash is
            // usually the thing being worked on.
            console.warn(`[error report:${source}]`, message);
            return;
        }
        if (!isSupabaseConfigured) return;

        void insertRow('client_errors', {
            source,
            message,
            stack: err.stack ? String(err.stack).slice(0, 8000) : null,
            url: window.location.pathname,
            user_agent: navigator.userAgent.slice(0, 400),
        }, useStore.getState().auth.accessToken);
    } catch {
        // A reporter that throws would turn one crash into two.
    }
}

let started = false;

/** Listen for the two kinds of crash the app never sees itself. */
export function startErrorReports(): void {
    if (started) return;
    started = true;
    window.addEventListener('error', (event) => reportError('window-error', event.error ?? event.message));
    window.addEventListener('unhandledrejection', (event) => reportError('unhandled-rejection', event.reason));
}
