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
 *   VITE_SUPABASE_PUBLISHABLE_KEY=<your-publishable-anon-key>
 *
 * Backwards compatibility: VITE_SUPABASE_ANON_KEY is still accepted as a
 * fallback for projects that haven't migrated to the new "publishable key"
 * naming Supabase rolled out in late 2025.
 *
 * Vite strips all non-VITE_ prefixed variables at build time.
 */
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
// Accept either the legacy `VITE_SUPABASE_ANON_KEY` or the new
// `VITE_SUPABASE_PUBLISHABLE_KEY` (same JWT, just renamed).
const key =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    import.meta.env.VITE_SUPABASE_ANON_KEY;

const hasPlaceholders =
    url === 'your-supabase-project-url-here' ||
    key === 'your-supabase-anon-key-here' ||
    key === 'your-supabase-publishable-key-here';

const isValidUrl = url && (url.startsWith('http://') || url.startsWith('https://'));

export const isSupabaseConfigured = Boolean(url && key && !hasPlaceholders && isValidUrl);

if (!isSupabaseConfigured) {
    console.warn(
        '[Supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY ' +
        '(VITE_SUPABASE_ANON_KEY also accepted). Cloud storage and auth will be ' +
        'disabled. Create a .env file in the project root with these variables.'
    );
}

// Initialize client only if configured to avoid runtime throw.
// `flowType: 'pkce'` is the recommended OAuth flow for SPAs and works
// hand-in-hand with `detectSessionInUrl: true` to finish the redirect
// handshake automatically when Google bounces the user back to the app.
export const supabase = isSupabaseConfigured
    ? createClient(url!, key!, {
          auth: {
              storage: localStorage,
              storageKey: 'infonote-auth-token',
              autoRefreshToken: true,
              persistSession: true,
              detectSessionInUrl: true,
              flowType: 'pkce',
          },
      })
    : (null as unknown as ReturnType<typeof createClient>);

/**
 * Resolves the OAuth redirect URL we send to Supabase.
 *
 * ALWAYS returns the URL the user is *currently* browsing on (origin +
 * pathname), so Google bounces them back to the same dev/preview/prod host
 * they started from. Never hardcode a port — a dev server may be on 5173,
 * 4173, 3000, or anything else.
 *
 * IMPORTANT: this URL must also be added to the Supabase Dashboard's
 * "Redirect URLs" allow-list (Authentication → URL Configuration). If it
 * isn't, Supabase silently falls back to the configured Site URL — which
 * is what causes the dreaded "localhost:3000 refused to connect" screen
 * after a successful Google sign-in.
 */
export function getOAuthRedirectUrl(): string {
    if (typeof window === 'undefined') return '';
    // origin + pathname strips any stale query/hash but preserves the
    // sub-path the user landed on (so deep-link auth works).
    const { origin, pathname } = window.location;
    return origin + pathname;
}

