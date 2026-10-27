import type { GoTrueClient } from '@supabase/auth-js';

/**
 * The Supabase auth client, when there is one — loaded only when it is needed.
 *
 * Sign-in is optional in the beta: the app is local-first and everything except
 * AI works without an account. So a missing or placeholder configuration is not
 * an error — it means "no accounts on this build", and `isSupabaseConfigured`
 * is what every caller checks first.
 *
 * The beta's auth needs **no database tables**. Identity comes from the session
 * and from `user_metadata`, so a fresh Supabase project works as soon as its
 * URL and key are set:
 *
 *   VITE_SUPABASE_URL=https://<project>.supabase.co
 *   VITE_SUPABASE_PUBLISHABLE_KEY=<publishable / anon key>
 *
 * Two size decisions live here. The auth client alone, not
 * `@supabase/supabase-js`, which also bundles the database, storage, realtime
 * and functions clients the beta never calls. And a dynamic import: even alone
 * the auth client is ~100 kB minified, and a guest who has never signed in
 * should not download it to open the canvas. `hasStoredSession` is how the app
 * tells, without the library, whether there is anyone to restore.
 */

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
// Either name works: the publishable key is what Supabase renamed the anon key
// to in late 2025, and projects created before that still say "anon".
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
    || import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined;

const isPlaceholder = (value: string | undefined): boolean =>
    !value || /^your-supabase/.test(value.trim());

export const isSupabaseConfigured = Boolean(
    !isPlaceholder(url)
    && !isPlaceholder(key)
    && /^https?:\/\//.test(url ?? ''),
);

/**
 * One row, straight to the project's REST endpoint.
 *
 * A plain fetch rather than a database client: the only thing the beta writes
 * to a table is a crash report, and pulling in `@supabase/supabase-js` for it
 * would put back the ~200 kB Step 7 took out. Resolves false when there is no
 * project configured, or when the write fails — a report is never worth an
 * error of its own.
 */
export async function insertRow(table: string, row: object, accessToken?: string | null): Promise<boolean> {
    if (!isSupabaseConfigured) return false;
    try {
        const response = await fetch(`${url!.replace(/\/+$/, '')}/rest/v1/${table}`, {
            method: 'POST',
            headers: {
                apikey: key!,
                Authorization: `Bearer ${accessToken || key!}`,
                'Content-Type': 'application/json',
                // Nothing reads the row back, and the table does not allow it.
                Prefer: 'return=minimal',
            },
            body: JSON.stringify(row),
            keepalive: true,
        });
        return response.ok;
    } catch {
        return false;
    }
}

/** Where the auth client keeps the session in localStorage. */
export const AUTH_STORAGE_KEY = 'chnk-it-auth-token';

/** Whether a session was saved by an earlier visit (or another tab). */
export function hasStoredSession(): boolean {
    try {
        return localStorage.getItem(AUTH_STORAGE_KEY) !== null;
    } catch {
        return false;
    }
}

/**
 * Whether this page load is a provider sending the user back — a sign-in link,
 * Google, or a password reset. The client must be up to finish that handshake.
 */
export function isAuthRedirect(location: Location = window.location): boolean {
    const params = new URLSearchParams(location.search);
    return params.has('code')
        || params.has('error_description')
        || /(^|[#&])(access_token|error_description)=/.test(location.hash);
}

let loading: Promise<GoTrueClient | null> | null = null;

/**
 * The client, created on first use.
 *
 * `flowType: 'pkce'` with `detectSessionInUrl` is what finishes the redirect
 * handshake when a provider bounces the user back to the app. The headers are
 * the ones supabase-js would send: the key identifies the project.
 */
export function loadAuthClient(): Promise<GoTrueClient | null> {
    if (!isSupabaseConfigured) return Promise.resolve(null);
    loading ??= import('@supabase/auth-js').then(({ GoTrueClient }) => new GoTrueClient({
        url: `${url!.replace(/\/+$/, '')}/auth/v1`,
        headers: { apikey: key!, Authorization: `Bearer ${key!}` },
        storage: localStorage,
        storageKey: AUTH_STORAGE_KEY,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
    }));
    return loading;
}

/**
 * Where a provider should send the user back to.
 *
 * `VITE_SITE_URL` wins in production so a sign-in started from a preview
 * deployment still lands on the real domain. Whatever this returns must be on
 * the Supabase project's redirect allow-list, or the provider silently falls
 * back to the Site URL — the classic "this site can't be reached" screen after
 * an otherwise successful sign-in.
 */
export function getAuthRedirectUrl(path = '/'): string {
    const configured = import.meta.env.VITE_SITE_URL as string | undefined;
    const origin = configured && /^https?:\/\//i.test(configured)
        ? configured.replace(/\/+$/, '')
        : window.location.origin;
    return `${origin}${path}`;
}
