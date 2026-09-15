/**
 * Shared bearer-token builder for the authenticated /api/ai/* routes.
 *
 * aiService and searchService each grew their own copy of this, so the sign-in
 * rule lived in two places that had to be changed together. They now share one.
 */
import { supabase, isSupabaseConfigured } from './supabase/client';

/**
 * Local-development escape hatch for the sign-in requirement.
 *
 * Vite replaces `import.meta.env.DEV` with the literal `false` when it builds
 * for production, so this constant folds to `false` and every branch guarded by
 * it becomes dead code the minifier drops. Setting VITE_AI_ALLOW_ANONYMOUS in a
 * hosting dashboard therefore cannot open up a deployed build — the flag only
 * exists while `vite dev` is serving.
 *
 * That is only the first of two locks. Production access is decided server-side
 * by `requireAiAccess` in api/_lib/aiGuard.js, which is deliberately left
 * unchanged: even a hand-forged request to the deployed /api/ai/* routes still
 * needs a real Supabase session. Never add this bypass there — those routes
 * proxy a paid Gemini key, and an unauthenticated one is an open relay for it.
 */
export const ALLOW_ANONYMOUS_AI =
    import.meta.env.DEV && import.meta.env.VITE_AI_ALLOW_ANONYMOUS === 'true';

/**
 * Resolve the caller's Supabase access token, or fail fast with a friendly
 * message instead of letting the route answer with a bare 401.
 *
 * With the anonymous flag on, a missing session yields no header rather than an
 * error, and the dev server's guard decides whether that is acceptable. A real
 * session still wins whenever one exists, so turning the flag on does not
 * silently downgrade a signed-in user to anonymous rate limits.
 */
export async function getAiAuthHeader(
    signInMessage = 'Sign in to use AI features.',
): Promise<Record<string, string>> {
    if (!isSupabaseConfigured || !supabase) {
        if (ALLOW_ANONYMOUS_AI) return {};
        throw new Error(signInMessage);
    }
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
        if (ALLOW_ANONYMOUS_AI) return {};
        throw new Error(signInMessage);
    }
    return { Authorization: `Bearer ${token}` };
}
