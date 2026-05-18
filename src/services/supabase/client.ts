/**
 * Browser-only Supabase client for the Vite SPA.
 *
 * We only use @supabase/ssr's browser helper. There is no server or middleware
 * in this project, so the Next.js server/middleware helpers do not apply.
 */
import { createBrowserClient } from '@supabase/ssr';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const hasPlaceholders = 
    url === 'your-supabase-project-url-here' || 
    key === 'your-supabase-anon-key-here';

const isValidUrl = url && (url.startsWith('http://') || url.startsWith('https://'));

export const isSupabaseConfigured = Boolean(url && key && !hasPlaceholders && isValidUrl);

if (!isSupabaseConfigured) {
    // Surface a soft warning; Supabase features will be disabled until env is properly set.
    console.warn(
        '[Supabase] Missing, invalid, or placeholder VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. ' +
        'Cloud storage and auth will be disabled, falling back to mock authentication.'
    );
}

// Initialize client only if configured to avoid @supabase/ssr throw
export const supabase = isSupabaseConfigured 
    ? createBrowserClient(url!, key!) 
    : null as any;
