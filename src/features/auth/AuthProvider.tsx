/**
 * Thin auth context around Supabase Auth.
 *
 * Exposes the current user + a loading flag, and a sign-out helper. Sign-in is
 * handled by <SignInPanel /> via email magic link, which is the lowest-friction
 * method that does not require extra provider setup.
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

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState<boolean>(isSupabaseConfigured);

    // Push changes into the global Zustand store so the active user id is
    // available outside of React (e.g. from services / non-component code).
    const pushToStore = useCallback((u: User | null) => {
        const setAuthUser = useStore.getState().setAuthUser;
        setAuthUser(u ? { id: u.id, email: u.email ?? null } : null);
    }, []);

    useEffect(() => {
        if (!isSupabaseConfigured) {
            setLoading(false);
            useStore.getState().setAuthLoading(false);
            return;
        }

        let cancelled = false;

        supabase.auth.getUser().then(({ data }: { data: { user: User | null } }) => {
            if (cancelled) return;
            setUser(data.user ?? null);
            pushToStore(data.user ?? null);
            setLoading(false);
        }).catch(() => {
            if (!cancelled) {
                setLoading(false);
                useStore.getState().setAuthLoading(false);
            }
        });

        const { data: sub } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
            const nextUser = session?.user ?? null;
            setUser(nextUser);
            pushToStore(nextUser);
        });

        return () => {
            cancelled = true;
            sub.subscription.unsubscribe();
        };
    }, [pushToStore]);

    const signOut = useCallback(async () => {
        if (!isSupabaseConfigured) return;
        await supabase.auth.signOut();
        pushToStore(null);
    }, [pushToStore]);

    return (
        <AuthContext.Provider value={{ user, loading, configured: isSupabaseConfigured, signOut }}>
            {children}
        </AuthContext.Provider>
    );
};

export function useAuth(): AuthContextValue {
    return useContext(AuthContext);
}
