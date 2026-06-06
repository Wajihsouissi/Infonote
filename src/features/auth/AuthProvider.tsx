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
import React, { useEffect, useState, useCallback } from 'react';
import type { User, Session, AuthChangeEvent } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../../services/supabase/client';
import { useStore } from '../../store/useStore';
import { AuthContext } from './AuthContext';

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

/**
 * Ensure a `user_profiles` row exists for the authenticated user.
 * The DB trigger on auth.users normally handles this, but race conditions
 * or external sign-up flows may skip it — so we upsert defensively here.
 */
async function ensureUserProfile(user: { id: string; email?: string; user_metadata?: any }): Promise<void> {
    if (!isSupabaseConfigured) return;
    try {
        const { error } = await supabase
            .from('user_profiles')
            .upsert({
                id: user.id,
                email: user.email || '',
                display_name: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'User',
                account_status: 'active',
            }, { onConflict: 'id', ignoreDuplicates: true });

        if (error) {
            console.warn('[AuthProvider] ensureUserProfile failed:', error.message);
        }
    } catch (err) {
        console.warn('[AuthProvider] ensureUserProfile error:', err);
    }
}

/**
 * Ensure the authenticated user has at least one workspace.
 * Creates a default "My Workspace" if none exists, and persists the ID to localStorage.
 */
async function ensureWorkspace(userId: string): Promise<string | null> {
    try {
        const legacyStorageKey = 'chnk it.activeWorkspaceId';
        const userStorageKey = `chnk-it.activeWorkspaceId.${userId}`;
        const cached = localStorage.getItem(userStorageKey) || localStorage.getItem(legacyStorageKey);
        if (cached) {
            const { data: cachedWorkspace, error: cachedError } = await supabase
                .from('workspaces')
                .select('id')
                .eq('id', cached)
                .maybeSingle();
            if (!cachedError && cachedWorkspace?.id) {
                localStorage.setItem(userStorageKey, cachedWorkspace.id);
                localStorage.setItem(legacyStorageKey, cachedWorkspace.id);
                return cachedWorkspace.id;
            }
            localStorage.removeItem(userStorageKey);
            localStorage.removeItem(legacyStorageKey);
        }

        // Query existing workspaces
        const { data, error } = await supabase
            .from('workspaces')
            .select('id, owner_id')
            .order('created_at', { ascending: true })
            .limit(50);

        if (error) {
            console.warn('[workspace] Failed to query workspaces:', error.message);
            return null;
        }

        if (data && data.length > 0) {
            const owned = data.find((workspace: { owner_id?: string }) => workspace.owner_id === userId);
            const selected = owned ?? data[0];
            localStorage.setItem(userStorageKey, selected.id);
            localStorage.setItem(legacyStorageKey, selected.id);
            return selected.id;
        }

        // No workspace exists — create one
        const { data: created, error: insertErr } = await supabase
            .from('workspaces')
            .insert({ owner_id: userId, name: 'My Workspace' })
            .select('id')
            .single();

        if (insertErr) {
            console.warn('[workspace] Failed to create workspace:', insertErr.message);
            return null;
        }

        if (created) {
            localStorage.setItem(userStorageKey, created.id);
            localStorage.setItem(legacyStorageKey, created.id);
            return created.id;
        }
        return null;
    } catch (err) {
        console.warn('[workspace] Provisioning error:', err);
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
        try {
            const profile = await fetchProfileRow(u.id);
            const metaName =
                (u.user_metadata?.display_name as string | undefined) ??
                (u.user_metadata?.full_name as string | undefined) ??
                null;
            setAuthUser({
                id: u.id,
                email: u.email ?? profile?.email ?? null,
                displayName: profile?.display_name ?? metaName ?? null,
            });
        } catch (err) {
            // Profile fetch failed — still set auth with basic session data
            // so the user is not blocked from using the app.
            console.error('[Auth] profile fetch failed, using basic session data', err);
            setAuthUser({
                id: u.id,
                email: u.email ?? null,
                displayName:
                    (u.user_metadata?.display_name as string | undefined) ??
                    (u.user_metadata?.full_name as string | undefined) ??
                    null,
            });
        }
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
            if (sessionUser) {
                void ensureUserProfile(sessionUser)
                    .then(() => ensureWorkspace(sessionUser.id))
                    .then((workspaceId) => {
                        if (workspaceId) useStore.getState().setAuthWorkspace(workspaceId);
                    });
            }
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
                // fire-and-forget; pushToStore handles its own errors via try/catch
                void pushToStore(nextUser);
                if (nextUser) {
                    void ensureUserProfile(nextUser)
                        .then(() => ensureWorkspace(nextUser.id))
                        .then((workspaceId) => {
                            if (workspaceId) useStore.getState().setAuthWorkspace(workspaceId);
                        });
                }
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
            // Belt-and-braces: purge legacy app session keys so they cannot
            // resurrect a stale visitor/user state after Supabase signs out.
            try {
                localStorage.removeItem('chnk-it-mock-session');
                localStorage.removeItem('chnk-it-mock-users');
                localStorage.removeItem('chnk-it-auth-token');
                localStorage.removeItem('chnk it.activeWorkspaceId');
                if (user?.id) {
                    localStorage.removeItem(`chnk-it.activeWorkspaceId.${user.id}`);
                }
            } catch {
                // ignore storage errors (e.g. private browsing)
            }
            const { resetAuth, setCurrentView } = useStore.getState();
            resetAuth();
            setUser(null);
            // Redirect back to the public homepage context.
            if (typeof window !== 'undefined') {
                window.history.replaceState({}, '', '/');
            }
            setCurrentView('marketing');
        };

        if (!isSupabaseConfigured || !supabase) {
            finalize();
            return;
        }
        try {
            await supabase.auth.signOut({ scope: 'global' });
        } catch (err) {
            console.warn('[Auth] signOut network call failed; clearing local state anyway', err);
            try {
                await supabase.auth.signOut({ scope: 'local' });
            } catch {
                // Local cleanup continues in finalize.
            }
        } finally {
            finalize();
        }
    }, [user?.id]);

    return (
        <AuthContext.Provider value={{ user, loading, configured: isSupabaseConfigured, signOut }}>
            {children}
        </AuthContext.Provider>
    );
};

