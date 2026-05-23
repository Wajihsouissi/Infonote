/**
 * Browser-only Supabase client for the Vite SPA.
 *
 * Uses the standard @supabase/supabase-js createClient for maximum
 * compatibility in a pure client-side Vite application.  The client is
 * initialized with VITE_ prefixed environment variables so Vite bundles
 * them correctly into the production build.
 *
 * IMPORTANT — your .env / .env.production file must contain:
 *   VITE_SUPABASE_URL=https://<project>.supabase.co
 *   VITE_SUPABASE_ANON_KEY=<your-anon-public-key>
 *
 * Vite strips all non-VITE_ prefixed variables at build time.
 */
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

const hasPlaceholders =
    url === 'your-supabase-project-url-here' ||
    key === 'your-supabase-anon-key-here';

const isValidUrl = url && (url.startsWith('http://') || url.startsWith('https://'));

export const isSupabaseConfigured = Boolean(url && key && !hasPlaceholders && isValidUrl);

if (!isSupabaseConfigured) {
    console.warn(
        '[Supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. ' +
        'Cloud storage and auth will be disabled. ' +
        'Create a .env file in the project root with these variables.'
    );
}

// Initialize client only if configured to avoid runtime throw.
export const supabase = isSupabaseConfigured
    ? createClient(url!, key!, {
          auth: {
              storage: localStorage,
              storageKey: 'chnk-it-auth-token',
              autoRefreshToken: true,
              persistSession: true,
              detectSessionInUrl: true,
          },
      })
    : (null as unknown as ReturnType<typeof createClient>);
