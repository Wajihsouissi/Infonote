/**
 * The bearer token the /api/ai/* routes require.
 *
 * Those routes proxy a paid provider key, so they answer only a signed-in
 * caller. One builder for every AI request, so the sign-in rule lives in one
 * place.
 */
import { useStore } from '../store/useStore';

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
 * by `requireAiAccess` in api/_lib/aiGuard.js, which never reads this flag:
 * even a hand-forged request to the deployed routes still needs a real session.
 * Never teach that file about this — those routes proxy a paid key, and an
 * unauthenticated one is an open relay for it.
 */
export const ALLOW_ANONYMOUS_AI =
    import.meta.env.DEV && import.meta.env.VITE_AI_ALLOW_ANONYMOUS === 'true';

/**
 * Resolve the caller's access token, or fail fast with a friendly message
 * instead of letting the route answer with a bare 401.
 *
 * With the anonymous flag on, a missing session yields no header rather than an
 * error, and the dev server's guard decides whether that is acceptable. A real
 * session still wins whenever one exists, so turning the flag on does not
 * silently downgrade a signed-in user to anonymous rate limits.
 */
export async function getAiAuthHeader(
    signInMessage = 'Sign in to use AI features.',
): Promise<Record<string, string>> {
    const token = useStore.getState().auth.accessToken;
    if (token) return { Authorization: `Bearer ${token}` };
    if (ALLOW_ANONYMOUS_AI) return {};
    throw new Error(signInMessage);
}
