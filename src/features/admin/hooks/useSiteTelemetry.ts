/**
 * useSiteTelemetry — fire a single site-visit row into Supabase on mount.
 *
 * Inserted into `public.site_visits` which feeds the admin analytics panel.
 * Uses a session-scoped dedup flag so a single page session only logs once.
 */
import { useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '../../../services/supabase/client';

const SESSION_KEY = '__infonote_telemetry_sent';

export function useSiteTelemetry(): void {
    useEffect(() => {
        if (!isSupabaseConfigured) return;
        if (typeof window === 'undefined') return;
        if (sessionStorage.getItem(SESSION_KEY)) return;

        sessionStorage.setItem(SESSION_KEY, '1');

        // Fire-and-forget; telemetry must never block the UI or surface errors.
        void supabase
            .from('site_visits')
            .insert({
                user_agent: navigator.userAgent.slice(0, 500),
            })
            .then(() => {
                // logged
            })
            .catch(() => {
                // Silently drop telemetry failures so the user experience
                // is never degraded by analytics plumbing.
            });
    }, []);
}
