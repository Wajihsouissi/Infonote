/**
 * Client error telemetry — reports uncaught errors, unhandled promise
 * rejections, and ErrorBoundary catches to the `client_errors` table
 * (migration 0013) so beta crashes are visible without user reports.
 *
 * Fire-and-forget by design: telemetry must never throw, block the UI,
 * or loop. Deduped per session and hard-capped so a crash loop cannot
 * flood the table. In dev it only logs to the console.
 */
import { supabase, isSupabaseConfigured } from './supabase/client';

type ErrorSource = 'window-error' | 'unhandled-rejection' | 'error-boundary';

const MAX_REPORTS_PER_SESSION = 10;
const reported = new Set<string>();
let reportCount = 0;

export function reportClientError(source: ErrorSource, error: unknown, extra?: string): void {
    try {
        const err = error instanceof Error ? error : new Error(String(error ?? 'Unknown error'));
        const message = [err.message || 'Unknown error', extra]
            .filter(Boolean)
            .join(' | ')
            .slice(0, 2000);

        if (import.meta.env.DEV) {
            console.warn(`[telemetry:${source}]`, message);
            return;
        }
        if (!isSupabaseConfigured || reportCount >= MAX_REPORTS_PER_SESSION) return;

        const dedupeKey = `${source}:${message}`;
        if (reported.has(dedupeKey)) return;
        reported.add(dedupeKey);
        reportCount++;

        // user_id is filled server-side via the column default (auth.uid()).
        void supabase
            .from('client_errors')
            .insert({
                source,
                message,
                stack: err.stack ? String(err.stack).slice(0, 8000) : null,
                url: window.location.href.slice(0, 500),
                user_agent: navigator.userAgent.slice(0, 400),
            })
            .then(({ error: insertError }) => {
                if (insertError) console.warn('[telemetry] report failed:', insertError.message);
            });
    } catch {
        // Telemetry must never crash the app.
    }
}

let initialized = false;

export function initErrorTelemetry(): void {
    if (initialized) return;
    initialized = true;
    window.addEventListener('error', (event) => {
        reportClientError('window-error', event.error ?? event.message);
    });
    window.addEventListener('unhandledrejection', (event) => {
        reportClientError('unhandled-rejection', event.reason);
    });
}
