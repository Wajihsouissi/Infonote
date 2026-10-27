/**
 * The beta's five pages, and the URLs they live at.
 *
 * A hand-rolled router rather than a library: there are five routes, no nesting
 * and no loaders, and the whole thing is a path-to-view function plus history
 * integration in App.tsx. Adding a router would be more code, not less.
 */

export type AppView = 'marketing' | 'home' | 'canvas' | 'login' | 'signup' | 'update-password' | 'profile';

/** The canonical URL for each view. */
export const VIEW_PATHS: Record<AppView, string> = {
    marketing: '/',
    home: '/home',
    canvas: '/canvas',
    login: '/login',
    signup: '/signup',
    'update-password': '/update-password',
    profile: '/profile',
};

/**
 * Which view a URL means.
 *
 * `/` depends on who is asking: a visitor gets the marketing page, someone
 * signed in gets their dashboard. Anything unknown falls back the same way
 * rather than showing a 404 page the beta does not have.
 */
export function viewFromPath(rawPath: string, isAuthenticated: boolean): AppView {
    const path = rawPath.replace(/\/+$/, '') || '/';
    if (path === '/') return isAuthenticated ? 'home' : 'marketing';
    const match = (Object.entries(VIEW_PATHS) as [AppView, string][])
        .find(([view, viewPath]) => viewPath === path && view !== 'marketing');
    if (!match) return isAuthenticated ? 'home' : 'marketing';

    const [view] = match;
    /* The dashboard is the only page that needs an account. The profile does
       not: it holds the backup file, which a guest needs more than anyone. */
    if (view === 'home' && !isAuthenticated) return 'marketing';
    return view;
}

/**
 * Supabase sends people back with `?code=` (a sign-in), or `#access_token=…`
 * and `type=recovery` (a password reset). The client swaps those for a session
 * on its own; this is only about which page should be on screen while it does.
 */
export function viewFromAuthRedirect(url: URL): AppView | null {
    if (url.hash.includes('type=recovery') || url.searchParams.get('type') === 'recovery') return 'update-password';
    if (url.searchParams.has('code') || url.hash.includes('access_token=')) return 'canvas';
    return null;
}
