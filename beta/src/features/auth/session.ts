import type { GoTrueClient, Session, User } from '@supabase/auth-js';
import {
    AUTH_STORAGE_KEY,
    getAuthRedirectUrl,
    hasStoredSession,
    isAuthRedirect,
    isSupabaseConfigured,
    loadAuthClient,
} from '../../services/supabase/client';
import { useStore } from '../../store/useStore';

/**
 * Signing in, and staying signed in.
 *
 * The store is the only place the rest of the app looks for identity, so this
 * module's whole job is to keep `auth` in the store equal to the Supabase
 * session — on load, after a sign-in, when a token refreshes, and on sign-out.
 * Nothing else subscribes to Supabase directly.
 *
 * No profile table is read or written. The display name lives in the session's
 * own `user_metadata`, which means a brand-new Supabase project needs no schema
 * for sign-in to work end to end.
 */

/** What the app calls this person, from whatever the provider gave us. */
function displayNameOf(user: User): string | null {
    const meta = user.user_metadata ?? {};
    return (meta.display_name as string | undefined)
        ?? (meta.full_name as string | undefined)
        ?? (meta.name as string | undefined)
        ?? null;
}

function publish(session: Session | null): void {
    const { setAuthUser, setAuthLoading } = useStore.getState();
    setAuthUser(session?.user
        ? {
            id: session.user.id,
            email: session.user.email ?? null,
            displayName: displayNameOf(session.user),
            accessToken: session.access_token,
        }
        : null);
    setAuthLoading(false);
}

/** The live subscription, once the client is up. Set at most once. */
let unsubscribeAuth: (() => void) | null = null;

/**
 * Start mirroring a loaded client's session into the store.
 *
 * Every change — a sign-in here or in another tab, a refreshed token, a
 * sign-out — arrives through `onAuthStateChange`. The token matters as much as
 * the identity: the AI routes send it with every request, so a refresh that did
 * not reach the store would start failing requests an hour into a session.
 */
function attach(client: GoTrueClient): void {
    if (unsubscribeAuth) return;
    const { data } = client.onAuthStateChange((_event, session) => publish(session));
    unsubscribeAuth = () => data.subscription.unsubscribe();
    void client.getSession()
        .then(({ data: current }) => publish(current.session))
        .catch(() => publish(null));
}

/** Load the client (once) and make sure the store is listening to it. */
function connect(): Promise<GoTrueClient | null> {
    return loadAuthClient().then((client) => {
        if (client) attach(client);
        return client;
    });
}

/**
 * Mirror the session into the store for as long as the app is open.
 *
 * Returns the stop function, so `App` can start it the way it starts local
 * persistence. With no Supabase configured this settles immediately as "signed
 * out", which is a complete, working state: guests can do everything except AI.
 *
 * A guest with no saved session is settled the same way, without loading the
 * auth library at all. It is fetched when there is a session to restore, a
 * provider redirect to finish, a sign-in button pressed (see `client()`), or
 * another tab signing in.
 */
export function startAuthSession(): () => void {
    const { setAuthLoading } = useStore.getState();
    if (!isSupabaseConfigured) {
        setAuthLoading(false);
        return () => {};
    }

    let live = true;
    const start = () => {
        void connect().catch(() => { if (live) publish(null); });
    };

    if (hasStoredSession() || isAuthRedirect()) {
        setAuthLoading(true);
        start();
    } else {
        setAuthLoading(false);
    }

    // Signed in in another tab: that tab wrote the session; pick it up here.
    const onStorage = (event: StorageEvent) => {
        if (event.key === AUTH_STORAGE_KEY && event.newValue) start();
    };
    window.addEventListener('storage', onStorage);

    return () => {
        live = false;
        window.removeEventListener('storage', onStorage);
        unsubscribeAuth?.();
        unsubscribeAuth = null;
    };
}

/** A message worth showing the user, from whatever the provider threw. */
export function authErrorMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    const lower = message.toLowerCase();
    if (lower.includes('already') || lower.includes('registered')) return 'That email already has an account. Sign in instead.';
    if (lower.includes('not confirmed') || lower.includes('confirm')) return 'Check your email to confirm the account, then sign in.';
    if (lower.includes('invalid') || lower.includes('credentials')) return 'That email and password do not match.';
    if (lower.includes('rate') || lower.includes('too many')) return 'Too many attempts. Wait a minute and try again.';
    return message;
}

/** Thrown when a build has no Supabase project behind it. */
const NOT_CONFIGURED = 'Accounts are not set up on this build yet.';

async function client(): Promise<GoTrueClient> {
    const loaded = await connect();
    if (!loaded) throw new Error(NOT_CONFIGURED);
    return loaded;
}

export async function signInWithPassword(email: string, password: string): Promise<void> {
    const { error } = await (await client()).signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
}

export async function signUpWithPassword(email: string, password: string, displayName: string): Promise<{ needsConfirmation: boolean }> {
    const { data, error } = await (await client()).signUp({
        email: email.trim(),
        password,
        options: {
            data: { display_name: displayName.trim() || email.split('@')[0] },
            emailRedirectTo: getAuthRedirectUrl('/canvas'),
        },
    });
    if (error) throw error;
    /* Supabase answers a sign-up for an existing address with a user that has
       no identities rather than an error, so that people cannot probe which
       emails are registered. Treat it as what it is. */
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        throw new Error('That email already has an account. Sign in instead.');
    }
    return { needsConfirmation: !data.session };
}

/** A sign-in link / one-time code, for people who would rather not have a password. */
export async function signInWithEmailCode(email: string): Promise<void> {
    const { error } = await (await client()).signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: getAuthRedirectUrl('/canvas') },
    });
    if (error) throw error;
}

export async function signInWithGoogle(): Promise<void> {
    const { error } = await (await client()).signInWithOAuth({
        provider: 'google',
        options: { redirectTo: getAuthRedirectUrl('/canvas') },
    });
    if (error) throw error;
}

export async function sendPasswordReset(email: string): Promise<void> {
    const { error } = await (await client()).resetPasswordForEmail(email.trim(), {
        redirectTo: getAuthRedirectUrl('/update-password'),
    });
    if (error) throw error;
}

export async function updatePassword(password: string): Promise<void> {
    const { error } = await (await client()).updateUser({ password });
    if (error) throw error;
}

export async function updateDisplayName(displayName: string): Promise<void> {
    const { error } = await (await client()).updateUser({ data: { display_name: displayName.trim() } });
    if (error) throw error;
    // `updateUser` returns the new user but does not emit an auth event, so the
    // store would keep showing the old name until the next refresh.
    const { data } = await (await client()).getSession();
    publish(data.session);
}

/**
 * Sign out, whatever the network says.
 *
 * The local session is cleared even when the remote call fails: a user who
 * pressed Sign out and is still signed in afterwards has been ignored, and on a
 * shared machine that is the worst possible outcome.
 */
export async function signOut(): Promise<void> {
    try {
        await (await loadAuthClient())?.signOut({ scope: 'global' });
    } catch {
        try {
            await (await loadAuthClient())?.signOut({ scope: 'local' });
        } catch { /* the local clear below is the part that matters */ }
    } finally {
        try {
            localStorage.removeItem(AUTH_STORAGE_KEY);
        } catch { /* private browsing */ }
        useStore.getState().setAuthUser(null);
    }
}

export { isSupabaseConfigured };
