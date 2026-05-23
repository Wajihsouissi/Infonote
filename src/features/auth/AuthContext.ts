import { createContext } from 'react';
import type { User } from '@supabase/supabase-js';

export type AuthContextValue = {
    user: User | null;
    loading: boolean;
    configured: boolean;
    signOut: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue>({
    user: null,
    loading: true,
    configured: false,
    signOut: async () => {},
});
