/**
 * Thin auth context around Supabase Auth.
 *
 * - Captures any active session on mount (so the user stays logged in across
 *   refreshes) and listens for future auth events via onAuthStateChange.
 * - Mirrors the canonical `user_profiles` row into the global Zustand store so
 *   the UI always reads the same identity that lives in the database.
 * - Exposes a sign-out helper that destroys the remote session, resets the
 *   Zustand auth slice, and redirects back to the public landing context.
 */
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { User, Session, AuthChangeEvent } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../../services/supabase/client';
import { useStore } from '../../store/useStore';

type AuthContextValue = {
    user: User | null;
    loading: boolean;
    configured: boolean;
    signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
    user: null,
    loading: true,
    configured: false,
    signOut: async () => {},
});

type ProfileRow = {
    id: string;
    email: string | null;
    display_name?: string | null;
};

/**
 * Pull the canonical `user_profiles` row for the active user, if it exists.
 * Falls back gracefully so a missing row never breaks the auth flow.
 */
async function fetchProfileRow(userId: string): Promise<ProfileRow | null> {
    if (!isSupabaseConfigured) return null;
    try {
        const { data, error } = await supabase
            .from('user_profiles')
            .select('id, email, display_name')
            .eq('id', userId)
            .maybeSingle();
        if (error) return null;
        return (data as ProfileRow) ?? null;
    } catch {
        return null;
    }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState<boolean>(isSupabaseConfigured);

    /**
     * Push the active user into the Zustand store. When a real session exists
     * we also enrich the payload with the matching `user_profiles` row so the
     * UI sees backend-of-record values (email, display name) rather than raw
     * auth metadata.
     */
    const pushToStore = useCallback(async (u: User | null) => {
        const { setAuthUser, resetAuth } = useStore.getState();
        if (!u) {
            resetAuth();
            return;
        }
        const profile = await fetchProfileRow(u.id);
        const metaName =
            (u.user_metadata?.display_name as string | undefined) ??
            (u.user_metadata?.full_name as string | undefined) ??
            null;
        setAuthUser({
            id: u.id,
            email: profile?.email ?? u.email ?? null,
            displayName: profile?.display_name ?? metaName ?? null,
        });
    }, []);

    useEffect(() => {
        if (!isSupabaseConfigured) {
            // No backend configured — nothing to hydrate. Mark loading complete
            // so the UI can render the public/visitor experience.
            setLoading(false);
            useStore.getState().setAuthLoading(false);
            return;
        }

        let cancelled = false;

        // Hydrate from any persisted Supabase session on mount. This is what
        // keeps the user "logged in" after a refresh or back-navigation: the
        // browser client reads the token from localStorage and rehydrates.
        supabase.auth.getSession().then(async ({ data }: { data: { session: Session | null } }) => {
            if (cancelled) return;
            const sessionUser = data.session?.user ?? null;
            setUser(sessionUser);
            await pushToStore(sessionUser);
            setLoading(false);
        }).catch(() => {
            if (!cancelled) {
                setLoading(false);
                useStore.getState().setAuthLoading(false);
            }
        });

        const { data: sub } = supabase.auth.onAuthStateChange(
            (_event: AuthChangeEvent, session: Session | null) => {
                const nextUser = session?.user ?? null;
                setUser(nextUser);
                // fire-and-forget; pushToStore handles its own errors
                void pushToStore(nextUser);
            }
        );

        return () => {
            cancelled = true;
            sub.subscription.unsubscribe();
        };
    }, [pushToStore]);

    const signOut = useCallback(async () => {
        // Always tear down local state, even if the network call fails.
        const finalize = () => {
            // Belt-and-braces: purge any legacy mock session keys that may
            // exist from earlier builds so they cannot resurrect a stale user.
            try {
                localStorage.removeItem('chnk-it-mock-session');
                localStorage.removeItem('chnk-it-mock-users');
            } catch {
                // ignore storage errors (e.g. private browsing)
            }
            const { resetAuth, setCurrentView } = useStore.getState();
            resetAuth();
            setUser(null);
            // Redirect back to the public homepage context.
            setCurrentView('landing');
        };

        if (!isSupabaseConfigured || !supabase) {
            finalize();
            return;
        }
        try {
            await supabase.auth.signOut();
        } catch (err) {
            console.warn('[Auth] signOut network call failed; clearing local state anyway', err);
        } finally {
            finalize();
        }
    }, []);

    return (
        <AuthContext.Provider value={{ user, loading, configured: isSupabaseConfigured, signOut }}>
            {children}
        </AuthContext.Provider>
    );
};

export function useAuth(): AuthContextValue {
    return useContext(AuthContext);
}
