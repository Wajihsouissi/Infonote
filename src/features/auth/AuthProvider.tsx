/**
 * Thin auth context around Supabase Auth.
 *
 * Exposes the current user + a loading flag, and a sign-out helper. Sign-in is
 * handled by <SignInPanel /> via email magic link, which is the lowest-friction
 * method that does not require extra provider setup.
 */
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../../services/supabase/client';

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

    useEffect(() => {
        if (!isSupabaseConfigured) {
            setLoading(false);
            return;
        }

        let cancelled = false;

        supabase.auth.getUser().then(({ data }) => {
            if (cancelled) return;
            setUser(data.user ?? null);
            setLoading(false);
        }).catch(() => {
            if (!cancelled) setLoading(false);
        });

        const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user ?? null);
        });

        return () => {
            cancelled = true;
            sub.subscription.unsubscribe();
        };
    }, []);

    const signOut = useCallback(async () => {
        if (!isSupabaseConfigured) return;
        await supabase.auth.signOut();
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
