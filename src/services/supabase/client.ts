/**
 * Browser-only Supabase client for the Vite SPA.
 *
 * We only use @supabase/ssr's browser helper. There is no server or middleware
 * in this project, so the Next.js server/middleware helpers do not apply.
 */
import { createBrowserClient } from '@supabase/ssr';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
    // Surface a loud dev error; Supabase features will be disabled until env is set.
    console.warn(
        '[Supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. ' +
        'Cloud storage and auth will be disabled.'
    );
}

export const supabase = createBrowserClient(url ?? '', key ?? '');

export const isSupabaseConfigured = Boolean(url && key);
